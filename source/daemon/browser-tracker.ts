import { logBrowserEvent, upsertDomainUsage, getTodayDomainUsage, getYesterdayDomainUsage, getThisWeekDomainUsage } from '../lib/browser-stats.js';
import type { NotificationRule } from '../types.js';
import { loadConfig } from '../lib/config.js';
import type { EngineFullState } from '../engine/timer-engine.js';
import { sendReminderNotification } from '../lib/notify.js';

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
  
  constructor() {}

  public handlePomodoroStateChange(state: EngineFullState) {
    this.currentPomodoroState = state;
    // We can evaluate immediately when pomodoro state changes (e.g. from pause to work)
    if (this.lastEventState?.windowFocused && this.lastEventState.activeTab?.domain) {
      this.shouldSendTrackingNotification(this.lastEventState.activeTab.domain);
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

    if (newState.windowFocused && currentDomain && (domainChanged || becameActive)) {
      this.shouldSendTrackingNotification(currentDomain);
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

  private shouldSendTrackingNotification(domain: string) {
    // Extract base domain to properly group subdomains like www.youtube.com
    const baseDomain = domain.replace(/^www\./, '');

    const todayUsage = getTodayDomainUsage(baseDomain);
    const yesterdayUsage = getYesterdayDomainUsage(baseDomain);
    const weekUsage = getThisWeekDomainUsage(baseDomain);

    const stats = {
      today: todayUsage.active_seconds || 0,
      yesterday: yesterdayUsage.active_seconds || 0,
      week: weekUsage.active_seconds || 0,
    };

    this.triggerNotification(baseDomain, stats);
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

  private triggerNotification(domain: string, stats: { today: number, yesterday: number, week: number }) {
    const now = Date.now();
    const lastWarn = this.lastWarningTimes[domain] || 0;
    
    // Throttle temporarily disabled for testing, but typically we want to avoid spamming on every tiny rapid tab switch.
    // if (now - lastWarn < 5000) return; 

    this.lastWarningTimes[domain] = now;

    const formatMins = (sec: number) => {
      if (sec < 60) return `${sec}s`;
      const m = Math.floor(sec / 60);
      return `${m}m ${sec % 60}s`;
    };

    let title = `${domain} Usage`;
    let msg = `Today: ${formatMins(stats.today)}\nYesterday: ${formatMins(stats.yesterday)}\nThis week (Mon- ): ${formatMins(stats.week)}`;

    try {
      sendReminderNotification(title, msg, 5);
    } catch (e) {
      console.error('Failed to send notification', e);
    }
  }
}
