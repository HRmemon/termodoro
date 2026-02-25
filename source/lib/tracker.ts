import fs from 'fs';
import path from 'path';
import os from 'os';

export interface SlotCategory {
  code: string;
  label: string;
  color: string;
  key: string | null;  // shortcut key, null for picker-only
}

export const CATEGORIES: SlotCategory[] = [
  { code: 'D',  label: 'Deep Work',      color: 'cyan',       key: 'D' },
  { code: 'hD', label: '\u00bd Deep Work',    color: 'blueBright', key: '/' },
  { code: 'E',  label: 'Exercise',       color: 'green',      key: 'E' },
  { code: 'O',  label: 'Okayish',        color: 'yellow',     key: 'O' },
  { code: 'S',  label: 'Sleep',          color: 'blue',       key: 'S' },
  { code: 'N',  label: 'No Deep Work',   color: 'gray',       key: 'N' },
  { code: 'W',  label: 'Wasted',         color: 'red',        key: 'W' },
  { code: 'SF', label: 'Sched. Failed',  color: 'redBright',  key: null },
  { code: 'WU', label: 'Woke Up',        color: 'magenta',    key: null },
];

// ─── Tracker Config (customizable categories) ─────────────────────────────

export interface TrackerConfig {
  categories: SlotCategory[];
}

const TRACKER_CONFIG_PATH = path.join(os.homedir(), '.local', 'share', 'pomodorocli', 'tracker-config.json');

export function loadTrackerConfig(): TrackerConfig {
  try {
    if (fs.existsSync(TRACKER_CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(TRACKER_CONFIG_PATH, 'utf8'));
    }
  } catch { /* ignore */ }
  return { categories: CATEGORIES };
}

export function saveTrackerConfig(config: TrackerConfig): void {
  fs.mkdirSync(path.dirname(TRACKER_CONFIG_PATH), { recursive: true });
  // Preserve other fields (like domainRules) when saving just categories
  const existing = loadTrackerConfigFull();
  const full = { ...existing, categories: config.categories };
  fs.writeFileSync(TRACKER_CONFIG_PATH, JSON.stringify(full, null, 2));
}

export function getCategories(): SlotCategory[] {
  return loadTrackerConfig().categories;
}

export function getCategoryByCode(code: string): SlotCategory | undefined {
  return getCategories().find(c => c.code === code);
}

// 48 slots: 00:00, 00:30, 01:00, ... 23:30
export const ALL_SLOTS: string[] = [];
for (let h = 0; h < 24; h++) {
  ALL_SLOTS.push(`${String(h).padStart(2, '0')}:00`);
  ALL_SLOTS.push(`${String(h).padStart(2, '0')}:30`);
}

export const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export interface PendingSuggestion {
  suggested: string;       // "D" or "hD"
  source: 'pomodoro' | 'web';
  pomoStart?: string;      // ISO timestamp
  pomoDuration?: number;   // seconds
  createdAt: string;       // for 24h expiry
}

export interface WeekData {
  week: string;   // "2026-W09"
  start: string;  // "2026-02-24" (the Monday)
  slots: Record<string, Record<string, string>>; // date -> time -> code
  notes: Record<string, string>; // date -> note
  pending: Record<string, Record<string, PendingSuggestion>>; // date -> time -> suggestion
}

function getWeeksDir(): string {
  const dir = path.join(os.homedir(), '.local', 'share', 'pomodorocli', 'weeks');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function weekFilePath(weekStr: string): string {
  return path.join(getWeeksDir(), `${weekStr}.json`);
}

export function getMondayOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function getISOWeekStr(date: Date): string {
  const thursday = new Date(date);
  thursday.setDate(date.getDate() - ((date.getDay() + 6) % 7) + 3);
  const jan4 = new Date(thursday.getFullYear(), 0, 4);
  const weekNum = 1 + Math.round((thursday.getTime() - jan4.getTime()) / (7 * 86400000));
  const year = thursday.getFullYear();
  return `${year}-W${String(weekNum).padStart(2, '0')}`;
}

export function dateToString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getWeekDates(mondayStr: string): string[] {
  const monday = new Date(mondayStr + 'T00:00:00');
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return dateToString(d);
  });
}

export function loadWeek(weekStr: string): WeekData | null {
  const fp = weekFilePath(weekStr);
  if (!fs.existsSync(fp)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(fp, 'utf8'));
    if (!raw.pending) raw.pending = {};
    return raw;
  } catch { return null; }
}

export function saveWeek(data: WeekData): void {
  fs.writeFileSync(weekFilePath(data.week), JSON.stringify(data, null, 2));
}

export function listWeeks(): string[] {
  const dir = getWeeksDir();
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => f.replace('.json', ''))
    .sort().reverse();
}

export function createWeek(date: Date): WeekData {
  const monday = getMondayOfWeek(date);
  const weekStr = getISOWeekStr(monday);
  const start = dateToString(monday);
  const data: WeekData = { week: weekStr, start, slots: {}, notes: {}, pending: {} };
  saveWeek(data);
  return data;
}

export function setSlot(data: WeekData, date: string, time: string, code: string | null): WeekData {
  const updated = { ...data, slots: { ...data.slots, [date]: { ...(data.slots[date] ?? {}) } } };
  if (code === null) {
    delete updated.slots[date]![time];
  } else {
    updated.slots[date]![time] = code;
  }
  saveWeek(updated);
  return updated;
}

export interface DayStats { [code: string]: number }

export function computeDayStats(slots: Record<string, string> = {}): DayStats {
  const stats: DayStats = {};
  for (const code of Object.values(slots)) {
    stats[code] = (stats[code] ?? 0) + 0.5;
  }
  return stats;
}

// For GraphsView: build a map of date -> {deepHours, exerciseHours}
export interface DayEntry {
  date: string;
  deepHours: number;
  exerciseHours: number;
}

export function buildDailyEntries(weeks: WeekData[]): Map<string, DayEntry> {
  const map = new Map<string, DayEntry>();
  for (const week of weeks) {
    const dates = getWeekDates(week.start);
    for (const date of dates) {
      const daySlots = week.slots[date] ?? {};
      let deepHours = 0, exerciseHours = 0;
      for (const code of Object.values(daySlots)) {
        if (code === 'D') deepHours += 0.5;
        else if (code === 'hD') deepHours += 0.25;
        else if (code === 'E') exerciseHours += 0.5;
      }
      map.set(date, { date, deepHours, exerciseHours });
    }
  }
  return map;
}

// ─── Pending Suggestions ─────────────────────────────────────────────────────

export function generatePomodoroSuggestions(
  startedAt: string,
  durationActual: number
): { date: string; time: string; code: string }[] {
  const start = new Date(startedAt);
  const endMs = start.getTime() + durationActual * 1000;
  const suggestions: { date: string; time: string; code: string }[] = [];

  // Find first 30-min slot boundary at or before start
  const startSlot = new Date(start);
  startSlot.setMinutes(start.getMinutes() < 30 ? 0 : 30, 0, 0);

  for (let slotMs = startSlot.getTime(); slotMs < endMs; slotMs += 30 * 60 * 1000) {
    const slotStart = Math.max(slotMs, start.getTime());
    const slotEnd = Math.min(slotMs + 30 * 60 * 1000, endMs);
    const overlapMinutes = (slotEnd - slotStart) / 60000;

    if (overlapMinutes < 1) continue;

    const slotDate = new Date(slotMs);
    const date = dateToString(slotDate);
    const h = String(slotDate.getHours()).padStart(2, '0');
    const m = slotDate.getMinutes() < 30 ? '00' : '30';
    const time = `${h}:${m}`;
    const code = overlapMinutes >= 15 ? 'D' : 'hD';

    suggestions.push({ date, time, code });
  }

  return suggestions;
}

export function addPendingSuggestions(
  weekData: WeekData,
  suggestions: { date: string; time: string; code: string }[],
  source: 'pomodoro' | 'web' = 'pomodoro',
  pomoStart?: string,
  pomoDuration?: number,
): WeekData {
  const updated = { ...weekData, pending: { ...weekData.pending } };
  const now = new Date().toISOString();

  for (const s of suggestions) {
    // Skip slots with existing confirmed entries
    if (updated.slots[s.date]?.[s.time]) continue;
    // Skip if already pending
    if (updated.pending[s.date]?.[s.time]) continue;

    if (!updated.pending[s.date]) updated.pending[s.date] = {};
    updated.pending[s.date]![s.time] = {
      suggested: s.code,
      source,
      ...(pomoStart ? { pomoStart } : {}),
      ...(pomoDuration ? { pomoDuration } : {}),
      createdAt: now,
    };
  }

  saveWeek(updated);
  return updated;
}

export function acceptPending(weekData: WeekData, date: string, time: string): WeekData {
  const pending = weekData.pending[date]?.[time];
  if (!pending) return weekData;

  const updated = { ...weekData, slots: { ...weekData.slots }, pending: { ...weekData.pending } };
  // Move pending → slot
  if (!updated.slots[date]) updated.slots[date] = {};
  updated.slots[date]![time] = pending.suggested;

  // Remove from pending
  updated.pending[date] = { ...updated.pending[date] };
  delete updated.pending[date]![time];
  if (Object.keys(updated.pending[date]!).length === 0) delete updated.pending[date];

  saveWeek(updated);
  return updated;
}

export function rejectPending(weekData: WeekData, date: string, time: string): WeekData {
  if (!weekData.pending[date]?.[time]) return weekData;

  const updated = { ...weekData, pending: { ...weekData.pending } };
  updated.pending[date] = { ...updated.pending[date] };
  delete updated.pending[date]![time];
  if (Object.keys(updated.pending[date]!).length === 0) delete updated.pending[date];

  saveWeek(updated);
  return updated;
}

export function acceptAllPending(weekData: WeekData, date?: string): WeekData {
  let updated = { ...weekData };
  const dates = date ? [date] : Object.keys(updated.pending);
  for (const d of dates) {
    const times = Object.keys(updated.pending[d] ?? {});
    for (const t of times) {
      updated = acceptPending(updated, d, t);
    }
  }
  return updated;
}

export function getPendingCount(weekData: WeekData, date?: string): number {
  let count = 0;
  const dates = date ? [date] : Object.keys(weekData.pending);
  for (const d of dates) {
    count += Object.keys(weekData.pending[d] ?? {}).length;
  }
  return count;
}

export function expirePending(weekData: WeekData): WeekData {
  const now = Date.now();
  const maxAge = 24 * 60 * 60 * 1000; // 24h
  let changed = false;
  const updated = { ...weekData, pending: { ...weekData.pending } };

  for (const date of Object.keys(updated.pending)) {
    updated.pending[date] = { ...updated.pending[date] };
    for (const time of Object.keys(updated.pending[date]!)) {
      const p = updated.pending[date]![time]!;
      if (now - new Date(p.createdAt).getTime() > maxAge) {
        delete updated.pending[date]![time];
        changed = true;
      }
    }
    if (Object.keys(updated.pending[date]!).length === 0) {
      delete updated.pending[date];
    }
  }

  if (changed) saveWeek(updated);
  return changed ? updated : weekData;
}

export function generateAndStoreSuggestions(startedAt: string, durationActual: number): void {
  const suggestions = generatePomodoroSuggestions(startedAt, durationActual);
  if (suggestions.length === 0) return;

  // Group by week
  const byWeek = new Map<string, typeof suggestions>();
  for (const s of suggestions) {
    const d = new Date(s.date + 'T00:00:00');
    const ws = getISOWeekStr(getMondayOfWeek(d));
    if (!byWeek.has(ws)) byWeek.set(ws, []);
    byWeek.get(ws)!.push(s);
  }

  for (const [ws, weekSuggestions] of byWeek) {
    let week = loadWeek(ws);
    if (!week) {
      const monday = new Date(weekSuggestions[0]!.date + 'T00:00:00');
      week = createWeek(monday);
    }
    addPendingSuggestions(week, weekSuggestions, 'pomodoro', startedAt, durationActual);
  }
}

// ─── Domain Rules ────────────────────────────────────────────────────────────

export interface DomainRule {
  pattern: string;    // "youtube.com", "9anime.*"
  category: string;   // "W", "D"
}

export interface TrackerConfigFull {
  categories: SlotCategory[];
  domainRules: DomainRule[];
}

export function loadTrackerConfigFull(): TrackerConfigFull {
  try {
    if (fs.existsSync(TRACKER_CONFIG_PATH)) {
      const raw = JSON.parse(fs.readFileSync(TRACKER_CONFIG_PATH, 'utf8'));
      return {
        categories: raw.categories ?? CATEGORIES,
        domainRules: raw.domainRules ?? [],
      };
    }
  } catch { /* ignore */ }
  return { categories: CATEGORIES, domainRules: [] };
}

export function saveTrackerConfigFull(config: TrackerConfigFull): void {
  fs.mkdirSync(path.dirname(TRACKER_CONFIG_PATH), { recursive: true });
  fs.writeFileSync(TRACKER_CONFIG_PATH, JSON.stringify(config, null, 2));
}

export function matchDomain(domain: string, rules: DomainRule[]): string | null {
  for (const rule of rules) {
    if (rule.pattern.includes('/')) continue; // skip path rules for domain-only matching
    // Convert glob pattern to regex
    const escaped = rule.pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    const regex = new RegExp(`^${escaped}$`, 'i');
    if (regex.test(domain)) return rule.category;
  }
  return null;
}

export function matchUrl(domain: string, urlPath: string, rules: DomainRule[]): string | null {
  for (const rule of rules) {
    if (rule.pattern.includes('/')) {
      // Path-aware rule: split on first /
      const slashIdx = rule.pattern.indexOf('/');
      const domainPattern = rule.pattern.slice(0, slashIdx);
      const pathPattern = rule.pattern.slice(slashIdx);
      const domainEscaped = domainPattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
      const pathEscaped = pathPattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
      const domainRegex = new RegExp(`^${domainEscaped}$`, 'i');
      const pathRegex = new RegExp(`^${pathEscaped}`, 'i'); // prefix match on path
      if (domainRegex.test(domain) && pathRegex.test(urlPath)) return rule.category;
    } else {
      const escaped = rule.pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
      const regex = new RegExp(`^${escaped}$`, 'i');
      if (regex.test(domain)) return rule.category;
    }
  }
  return null;
}

export function generateWebSuggestions(
  slotBreakdown: { time: string; domain: string; path?: string; activeMinutes: number }[],
  rules: DomainRule[],
): { time: string; code: string }[] {
  const suggestions: { time: string; code: string }[] = [];
  for (const slot of slotBreakdown) {
    if (slot.activeMinutes < 15) continue;
    const cat = slot.path
      ? matchUrl(slot.domain, slot.path, rules)
      : matchDomain(slot.domain, rules);
    if (cat) suggestions.push({ time: slot.time, code: cat });
  }
  return suggestions;
}
