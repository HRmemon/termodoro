import { logBrowserEvent, upsertDomainUsage, getTodayDomainUsage, getYesterdayDomainUsage, getThisWeekDomainUsage } from '../lib/browser-stats.js';
import type { NotificationRule } from '../types.js';
import { loadConfig } from '../lib/config.js';
import type { EngineFullState } from '../engine/timer-engine.js';
import { sendReminderNotification } from '../lib/notify.js';
import jexl from 'jexl';

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
  private lastWarningTimes: Record<string, number> = {};
  private currentPomodoroState: EngineFullState | null = null;
  
  // Track continuous time per domain
  private continuousTimes: Record<string, { start: number, active: boolean, audible: boolean }> = {};
  
  constructor() {}

  public handlePomodoroStateChange(state: EngineFullState) {
    this.currentPomodoroState = state;
    if (this.lastEventState?.windowFocused && this.lastEventState.activeTab?.domain) {
      this.evaluateRules(this.lastEventState.activeTab.domain, this.lastEventState);
    }
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

    const prevDomain = this.lastEventState?.activeTab?.domain;
    const currentDomain = newState.activeTab?.domain;
    const becameActive = newState.windowFocused && (!this.lastEventState || !this.lastEventState.windowFocused);
    const domainChanged = currentDomain !== prevDomain;

    if (domainChanged && prevDomain) {
      // Domain changed, reset continuous time for previous
      delete this.continuousTimes[prevDomain];
    }

    if (newState.windowFocused && currentDomain) {
      // Initialize continuous time tracking
      if (!this.continuousTimes[currentDomain]) {
        this.continuousTimes[currentDomain] = {
          start: now,
          active: true,
          audible: newState.audibleTabs.some(t => t.url === newState.activeTab?.url)
        };
      } else {
        this.continuousTimes[currentDomain].active = true;
        this.continuousTimes[currentDomain].audible = newState.audibleTabs.some(t => t.url === newState.activeTab?.url);
      }
      
      this.evaluateRules(currentDomain, newState);
    } else if (currentDomain && this.continuousTimes[currentDomain]) {
      // Not focused anymore, pause continuous? Let's just track strictly continuous active time for now.
      delete this.continuousTimes[currentDomain];
    }

    this.lastEventState = newState;
    this.lastEventTimestamp = now;
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

  private async evaluateRules(domain: string, state: BrowserState) {
    const config = loadConfig();
    const rules = config.browserRules;
    if (!rules || rules.length === 0) return;

    // Extract base domain
    const baseDomain = domain.replace(/^www\./, '');
    const category = this.getDomainCategory(domain, config.domainRules || []) || 'Unknown';
    
    let currentMode = 'idle';
    if (this.currentPomodoroState && this.currentPomodoroState.isRunning) {
      currentMode = this.currentPomodoroState.sessionType === 'work' ? 'work' : 'break';
    }

    const todayUsage = getTodayDomainUsage(baseDomain);
    const continuousMs = this.continuousTimes[domain] ? Date.now() - this.continuousTimes[domain]!.start : 0;
    
    const is_active = state.windowFocused && state.activeTab?.domain === domain;
    const is_audible = state.audibleTabs.some(t => t.domain === domain);

    const is_paused = this.currentPomodoroState ? this.currentPomodoroState.isPaused : false;

    const context = {
      mode: currentMode,
      domain_flagged: category,
      domain: baseDomain,
      past_time_today: Math.floor(todayUsage.active_seconds / 60), // in minutes
      past_time_continuous: Math.floor(continuousMs / 60000), // in minutes
      is_active,
      is_audible,
      is_paused
    };

    const formatMins = (mins: number) => {
      if (mins < 60) return `${mins}m`;
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      return `${h}h ${m}m`;
    };

    for (const rule of rules) {
      try {
        const result = await jexl.eval(rule.condition, context);
        if (result) {
          // Rule triggered
          const now = Date.now();
          const throttleKey = `${rule.id}_${baseDomain}`;
          const lastWarn = this.lastWarningTimes[throttleKey] || 0;
          
          if (now - lastWarn < rule.throttleMinutes * 60 * 1000) {
            continue; // Throttled
          }

          this.lastWarningTimes[throttleKey] = now;

          // Replace variables in message
          let msg = rule.message;
          msg = msg.replace(/\$\{domain\}/g, baseDomain);
          msg = msg.replace(/\$\{past_time_today\}/g, context.past_time_today.toString());
          msg = msg.replace(/\$\{past_time_today_formatted\}/g, formatMins(context.past_time_today));
          msg = msg.replace(/\$\{past_time_continuous\}/g, context.past_time_continuous.toString());
          msg = msg.replace(/\$\{mode\}/g, currentMode);

          try {
            sendReminderNotification('Web Tracker', msg, 5);
          } catch (e) {
            console.error('Failed to send notification', e);
          }
        }
      } catch (e) {
        console.error(`Failed to evaluate rule ${rule.id}:`, e);
      }
    }
    
    this.pruneOldWarnings(Date.now());
  }

  private getDomainCategory(domain: string, domainRules: any[]): string | null {
    for (const rule of domainRules) {
      if (rule.pattern.includes('/')) continue;
      
      let pattern = rule.pattern;
      if (!pattern.startsWith('*')) {
        if (domain.toLowerCase() === pattern.toLowerCase() || domain.toLowerCase().endsWith('.' + pattern.toLowerCase())) {
          return rule.category;
        }
      } else {
        const regex = new RegExp('^' + pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '.*') + '$', 'i');
        if (regex.test(domain)) return rule.category;
      }
    }
    return null;
  }

  private pruneOldWarnings(now: number) {
    if (Object.keys(this.lastWarningTimes).length > 1000) {
      for (const [key, timestamp] of Object.entries(this.lastWarningTimes)) {
        if (now - timestamp > 24 * 60 * 60 * 1000) {
          delete this.lastWarningTimes[key];
        }
      }
    }
  }
}
