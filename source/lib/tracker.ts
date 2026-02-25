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
  fs.writeFileSync(TRACKER_CONFIG_PATH, JSON.stringify(config, null, 2));
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

export interface WeekData {
  week: string;   // "2026-W09"
  start: string;  // "2026-02-24" (the Monday)
  slots: Record<string, Record<string, string>>; // date -> time -> code
  notes: Record<string, string>; // date -> note
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
  try { return JSON.parse(fs.readFileSync(fp, 'utf8')); } catch { return null; }
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
  const data: WeekData = { week: weekStr, start, slots: {}, notes: {} };
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
