import { logBrowserEvent, upsertDomainUsage, getTodayDomainUsage } from '../lib/browser-stats.js';
import type { NotificationRule } from '../types.js';
import { loadConfig } from '../lib/config.js';
import type { EngineFullState } from '../engine/timer-engine.js';
import { sendReminderNotification } from '../lib/notify.js';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';

interface TabInfo {
  url: string;
  domain: string;
  path?: string;
  title?: string;
}

interface BrowserState {
  windowFocused: boolean;
  activeTab: TabInfo | null;
  audibleTabs: TabInfo[];
}

export class BrowserTracker {
  private lastEventState: BrowserState | null = null;
  private lastEventTimestamp: number = 0;
  private timeoutIds: Record<string, NodeJS.Timeout> = {};
  private activeWarnings: Set<string> = new Set();
  private lastWarningTimes: Record<string, number> = {};
  private currentPomodoroState: EngineFullState | null = null;
  private continuousDomainStart: number = Date.now();
  
  constructor() {}

  public handlePomodoroStateChange(state: EngineFullState) {
    this.currentPomodoroState = state;
    this.scheduleRules();
  }

  public handleEvent(payload: any) {
    logBrowserEvent(payload.trigger, payload);

    const now = Date.now();
    const newState: BrowserState = {
      windowFocused: payload.windowFocused,
      activeTab: payload.activeTab,
      audibleTabs: payload.audibleTabs || [],
    };

    if (this.lastEventState && this.lastEventTimestamp > 0) {
      const deltaMs = now - this.lastEventTimestamp;
      if (deltaMs > 0 && deltaMs <= 5 * 60 * 1000) { // Discard if > 5 minutes (sleep)
        this.attributeTime(this.lastEventState, Math.round(deltaMs / 1000));
      }
    }

    // Reset continuous tracking if active tab changed or window blurred
    if (!this.lastEventState || 
        newState.activeTab?.domain !== this.lastEventState.activeTab?.domain || 
        !newState.windowFocused) {
      
      this.continuousDomainStart = now;

      // Re-evaluate continuous tracking from scratch
      for (const id of Object.keys(this.timeoutIds)) {
        clearTimeout(this.timeoutIds[id]);
        delete this.timeoutIds[id];
      }
    }

    this.lastEventState = newState;
    this.lastEventTimestamp = now;

    this.scheduleRules();
  }

  private attributeTime(state: BrowserState, deltaSec: number) {
    const activeUrl = (state.windowFocused && state.activeTab) ? state.activeTab.url : null;
    let activeTabIsAudible = false;

    if (activeUrl) {
      activeTabIsAudible = state.audibleTabs.some(t => t.url === activeUrl);
      upsertDomainUsage(state.activeTab!, deltaSec, activeTabIsAudible ? deltaSec : 0);
    }
    
    // Dedup by exact URL so we track every distinct page
    const handledUrls = new Set<string>();
    if (activeUrl) handledUrls.add(activeUrl);

    for (const tab of state.audibleTabs) {
      if (!handledUrls.has(tab.url)) {
        handledUrls.add(tab.url);
        upsertDomainUsage(tab, 0, deltaSec);
      }
    }
  }

  private scheduleRules() {
    // Clear all pending notification timeouts
    for (const id of Object.keys(this.timeoutIds)) {
      clearTimeout(this.timeoutIds[id]);
      delete this.timeoutIds[id];
    }

    if (!this.lastEventState) return;

    const config = loadConfig();
    const rules: NotificationRule[] = config.browserRules || [];
    const domainRules = config.domainRules || [];

    const activeDomain = this.lastEventState.windowFocused ? this.lastEventState.activeTab?.domain : null;
    const audibleDomains = this.lastEventState.audibleTabs.map(t => t.domain);

    const isWork = this.currentPomodoroState?.isRunning && 
                   !this.currentPomodoroState?.isPaused && 
                   this.currentPomodoroState?.sessionType === 'work';
                   
    const isBreak = this.currentPomodoroState?.isRunning && 
                   !this.currentPomodoroState?.isPaused && 
                   this.currentPomodoroState?.sessionType !== 'work';

    for (const rule of rules) {
      // Check session type
      if (rule.sessionType === 'work' && !isWork) continue;
      if (rule.sessionType === 'break' && !isBreak) continue;

      let domainsToEvaluate: { domain: string, state: 'active' | 'audible' }[] = [];
      
      if (rule.state === 'active' || rule.state === 'both') {
        if (activeDomain) domainsToEvaluate.push({ domain: activeDomain, state: 'active' });
      }
      if (rule.state === 'audible' || rule.state === 'both') {
        for (const d of audibleDomains) domainsToEvaluate.push({ domain: d, state: 'audible' });
      }

      for (const { domain, state } of domainsToEvaluate) {
        // Check categories if specified
        if (rule.categories && rule.categories.length > 0) {
          const category = this.getDomainCategory(domain, domainRules);
          if (!category || !rule.categories.includes(category)) continue;
        }

        // Calculate target time
        let targetTimeMs = 0;

        if (rule.minTodayMinutes !== undefined) {
          const usage = getTodayDomainUsage(domain);
          const minutesSpent = ((state === 'active' ? usage.active_seconds : usage.audible_seconds) / 60) || 0;
          if (minutesSpent >= rule.minTodayMinutes) {
            targetTimeMs = 0; // Fire now
          } else {
            targetTimeMs = (rule.minTodayMinutes - minutesSpent) * 60 * 1000;
          }
        } else if (rule.minContinuousMinutes !== undefined) {
          const msAlreadySpent = Date.now() - this.continuousDomainStart;
          const targetMs = (rule.minContinuousMinutes * 60 * 1000) - msAlreadySpent;
          targetTimeMs = Math.max(0, targetMs);
        }

        if (targetTimeMs <= 0) {
          this.triggerNotification(rule, domain, 0); // Fire immediately
        } else {
          this.timeoutIds[rule.id + '_' + domain] = setTimeout(() => {
            this.triggerNotification(rule, domain, rule.minContinuousMinutes || rule.minTodayMinutes || 0);
          }, targetTimeMs);
        }
      }
    }
  }

  private getDomainCategory(domain: string, domainRules: any[]): string | null {
    for (const rule of domainRules) {
      if (rule.pattern.includes('/')) continue;
      const regex = new RegExp('^' + rule.pattern.replace(/[.+?^${}()|[\\]\\\\]/g, '\\\\$&').replace(/\\*/g, '.*') + '$', 'i');
      if (regex.test(domain)) return rule.category;
    }
    return null;
  }

  private triggerNotification(rule: NotificationRule, domain: string, value: number) {
    const now = Date.now();
    const lastWarn = this.lastWarningTimes[rule.id + '_' + domain] || 0;
    const throttleMs = (rule.throttleMinutes || 1) * 60 * 1000;

    if (now - lastWarn < throttleMs) return;

    this.lastWarningTimes[rule.id + '_' + domain] = now;

    let msg = rule.message
      .replace(/\$\{domain\}/g, domain)
      .replace(/\$\{time_today\}/g, value + 'm')
      .replace(/\$\{time_continuous\}/g, value + 'm');

    try {
      sendReminderNotification("Pomodoro CLI", msg, 5);
    } catch (e) {
      console.error('Failed to send notification', e);
    }
  }
}
