import path from 'node:path';
import { atomicWriteJSON, readJSON } from './fs-utils.js';
import { addDays, getTodayStr, localDateStr } from './date-utils.js';
import { DATA_DIR } from './paths.js';

export type GoalInput = 'checkbox' | 'count' | 'rate' | 'note';
export type GoalAggregation = 'any' | 'sum' | 'max' | 'latest' | 'count';
export type GoalWindow = 'today' | 'week' | 'month';
export type DayQuality = 'perfect' | 'excused' | 'missed';
export type GoalValue = boolean | number | string;

export interface GoalMetric {
  id: string;
  name: string;
  input: GoalInput;
  aggregate: GoalAggregation;
  target?: number;
  weeklyTarget?: number;
  monthlyTarget?: number;
  max?: number;
  unit?: string;
}

export interface TrackedGoal {
  id: string;
  name: string;
  metrics: GoalMetric[];
  archivedAt?: string;
}

export interface GoalArea {
  id: string;
  name: string;
  goals: TrackedGoal[];
  archivedAt?: string;
}

export interface GoalsData {
  version: 2;
  areas: GoalArea[];
  entries: Record<string, Record<string, GoalValue>>;
  dayQuality: Record<string, DayQuality>;
}

interface LegacyGoalsData {
  goals?: Array<{ id: string; name: string; type: 'manual' | 'auto' | 'rate' | 'note'; rateMax?: number }>;
  completions?: Record<string, string[]>;
  ratings?: Record<string, Record<string, number>>;
  notes?: Record<string, Record<string, string>>;
}

const GOALS_PATH = path.join(DATA_DIR, 'goals.json');

const metric = (
  id: string,
  name: string,
  input: GoalInput,
  aggregate: GoalAggregation,
  targets: Pick<GoalMetric, 'target' | 'weeklyTarget' | 'monthlyTarget' | 'max' | 'unit'> = {},
): GoalMetric => ({ id, name, input, aggregate, ...targets });

export function defaultGoalsData(): GoalsData {
  return {
    version: 2,
    areas: [
      {
        id: 'ielts', name: 'IELTS', goals: [
          { id: 'ielts-writing', name: 'Writing', metrics: [
            metric('ielts-writing-attempts', 'Attempts', 'count', 'sum', { weeklyTarget: 7 }),
            metric('ielts-writing-band', 'Best band', 'rate', 'max', { target: 7, max: 9, unit: 'band' }),
            metric('ielts-writing-lessons', 'Lessons', 'count', 'sum', { weeklyTarget: 3 }),
          ] },
          { id: 'ielts-reading', name: 'Reading', metrics: [
            metric('ielts-reading-attempts', 'Attempts', 'count', 'sum', { weeklyTarget: 3 }),
            metric('ielts-reading-score', 'Best score', 'rate', 'max', { target: 40, max: 40 }),
          ] },
          { id: 'ielts-listening', name: 'Listening', metrics: [
            metric('ielts-listening-attempts', 'Attempts', 'count', 'sum', { weeklyTarget: 3 }),
            metric('ielts-listening-score', 'Best score', 'rate', 'max', { target: 40, max: 40 }),
          ] },
          { id: 'ielts-speaking', name: 'Speaking', metrics: [
            metric('ielts-speaking-attempts', 'Attempts', 'count', 'sum', { weeklyTarget: 7 }),
            metric('ielts-speaking-band', 'Best band', 'rate', 'max', { target: 7.5, max: 9, unit: 'band' }),
            metric('ielts-speaking-lessons', 'Lessons', 'count', 'sum', { weeklyTarget: 3 }),
            metric('ielts-speaking-video', 'Watch speaking video', 'checkbox', 'any', { weeklyTarget: 1 }),
          ] },
        ],
      },
      {
        id: 'reading', name: 'READING', goals: [
          { id: 'book-chapter-4', name: 'Book Chapter 4', metrics: [metric('book-chapter-4-progress', 'Progress', 'rate', 'latest', { target: 100, max: 100, unit: '%' })] },
          { id: 'book-chapter-5', name: 'Book Chapter 5', metrics: [metric('book-chapter-5-progress', 'Progress', 'rate', 'latest', { target: 100, max: 100, unit: '%' })] },
        ],
      },
      {
        id: 'money', name: 'MONEY', goals: [
          { id: 'money-wider', name: 'Wider research', metrics: ['Job', 'Business', 'Stocks', 'Content creation', 'Other'].map((name, i) => metric(`money-wider-${i + 1}`, name, 'checkbox', 'any', { target: 1 })) },
          { id: 'money-deeper', name: 'Deeper research (30m+)', metrics: ['Job', 'Business', 'Stocks', 'Content', 'Other'].map((name, i) => metric(`money-deeper-${i + 1}`, name, 'checkbox', 'any', { target: 1 })) },
          { id: 'money-decisions', name: 'Decide promising streams', metrics: [metric('money-decisions-count', 'Decisions', 'count', 'sum', { target: 2 })] },
        ],
      },
      {
        id: 'masters', name: 'MASTERS', goals: [
          { id: 'masters-universities', name: 'Universities', metrics: [metric('masters-admission-dates', 'Admission dates researched', 'checkbox', 'any', { target: 1 })] },
          { id: 'masters-scholarships', name: 'Scholarships', metrics: [metric('masters-scholarship-dates', 'Scholarship dates researched', 'checkbox', 'any', { target: 1 })] },
          { id: 'masters-ielts', name: 'IELTS', metrics: [
            metric('masters-test-date', 'Decide test date', 'checkbox', 'any', { target: 1 }),
            metric('masters-booking-deadline', 'Decide hard booking deadline', 'checkbox', 'any', { target: 1 }),
          ] },
        ],
      },
    ],
    entries: {},
    dayQuality: {},
  };
}

function migrateLegacy(raw: LegacyGoalsData): GoalsData {
  const data = defaultGoalsData();
  const imported: TrackedGoal[] = [];

  for (const old of raw.goals ?? []) {
    if (old.name.trim().toLowerCase() === 'productive') {
      for (const date of raw.completions?.[old.id] ?? []) data.dayQuality[date] = 'perfect';
      continue;
    }

    const input: GoalInput = old.type === 'rate' ? 'rate' : old.type === 'note' ? 'note' : 'checkbox';
    const aggregate: GoalAggregation = old.type === 'rate' ? 'max' : old.type === 'note' ? 'count' : 'any';
    const metricId = `imported-${old.id}`;
    imported.push({
      id: `imported-goal-${old.id}`,
      name: old.name,
      metrics: [metric(metricId, old.name, input, aggregate, old.type === 'rate' ? { max: old.rateMax ?? 5 } : { target: 1 })],
    });
    const values: Record<string, GoalValue> = {};
    for (const date of raw.completions?.[old.id] ?? []) values[date] = true;
    Object.assign(values, raw.ratings?.[old.id] ?? {}, raw.notes?.[old.id] ?? {});
    if (Object.keys(values).length) data.entries[metricId] = values;
  }

  if (imported.length) data.areas.push({ id: 'imported', name: 'IMPORTED', goals: imported });
  return data;
}

export function loadGoals(): GoalsData {
  const raw = readJSON<GoalsData | LegacyGoalsData | null>(GOALS_PATH, null);
  if (!raw) return defaultGoalsData();
  return 'version' in raw && raw.version === 2 ? raw : migrateLegacy(raw as LegacyGoalsData);
}

export function saveGoals(data: GoalsData): GoalsData {
  atomicWriteJSON(GOALS_PATH, data);
  return data;
}

export function setMetricValue(data: GoalsData, metricId: string, date: string, value: GoalValue | undefined): GoalsData {
  const next = structuredClone(data);
  next.entries[metricId] ??= {};
  if (value === undefined || value === false || value === '' || value === 0) delete next.entries[metricId]![date];
  else next.entries[metricId]![date] = value;
  if (!Object.keys(next.entries[metricId]!).length) delete next.entries[metricId];
  return saveGoals(next);
}

export function setDayQuality(data: GoalsData, date: string, quality?: DayQuality): GoalsData {
  const next = structuredClone(data);
  if (quality) next.dayQuality[date] = quality;
  else delete next.dayQuality[date];
  return saveGoals(next);
}

export function getMetricValue(data: GoalsData, metricId: string, date: string): GoalValue | undefined {
  return data.entries[metricId]?.[date];
}

export function getWindowDates(window: GoalWindow, anchor = getTodayStr()): string[] {
  if (window === 'today') return [anchor];
  if (window === 'month') {
    const [year, month] = anchor.split('-').map(Number);
    const count = new Date(year!, month!, 0).getDate();
    return Array.from({ length: count }, (_, i) => `${year}-${String(month).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`);
  }
  const d = new Date(`${anchor}T00:00:00`);
  const mondayOffset = d.getDay() === 0 ? -6 : 1 - d.getDay();
  const monday = localDateStr(new Date(d.getFullYear(), d.getMonth(), d.getDate() + mondayOffset));
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

export function aggregateMetric(metric: GoalMetric, data: GoalsData, dates: string[]): number {
  const cumulative = metric.target !== undefined && metric.weeklyTarget === undefined && metric.monthlyTarget === undefined;
  const includedDates = cumulative
    ? Object.keys(data.entries[metric.id] ?? {}).filter(date => date <= dates.at(-1)!)
    : dates;
  const entries = includedDates
    .map(date => ({ date, value: data.entries[metric.id]?.[date] }))
    .filter((entry): entry is { date: string; value: GoalValue } => entry.value !== undefined && entry.value !== '' && entry.value !== false);

  if (metric.aggregate === 'any') return entries.length ? 1 : 0;
  if (metric.aggregate === 'count') return entries.length;
  if (!entries.length) return 0;
  if (metric.aggregate === 'latest') return Number(entries.at(-1)!.value) || 0;
  const values = entries.map(entry => typeof entry.value === 'number' ? entry.value : entry.value === true ? 1 : Number(entry.value) || 0);
  if (metric.aggregate === 'max') return Math.max(...values);
  return values.reduce((sum, value) => sum + value, 0);
}

export function getMetricTarget(metric: GoalMetric, window: GoalWindow, daysInWindow = 30): number | undefined {
  if (window === 'week') return metric.weeklyTarget ?? metric.target;
  if (window === 'month') return metric.monthlyTarget ?? (metric.weeklyTarget === undefined ? metric.target : Math.round(metric.weeklyTarget * daysInWindow / 7));
  return metric.target;
}

export function computeDayStreak(data: GoalsData, anchor = getTodayStr()): { current: number; best: number } {
  const perfectDates = Object.entries(data.dayQuality).filter(([, value]) => value === 'perfect').map(([date]) => date).sort();
  let best = 0;
  let run = 0;
  let previous = '';
  for (const date of perfectDates) {
    run = previous && addDays(previous, 1) === date ? run + 1 : 1;
    best = Math.max(best, run);
    previous = date;
  }

  let current = 0;
  let cursor = data.dayQuality[anchor] === 'perfect' ? anchor : addDays(anchor, -1);
  while (data.dayQuality[cursor] === 'perfect') {
    current++;
    cursor = addDays(cursor, -1);
  }
  return { current, best };
}

export function getRecentDates(count: number, anchor = getTodayStr()): string[] {
  return Array.from({ length: count }, (_, i) => addDays(anchor, i - count + 1));
}

export function allMetrics(data: GoalsData): GoalMetric[] {
  return data.areas.filter(area => !area.archivedAt).flatMap(area => area.goals.filter(goal => !goal.archivedAt).flatMap(goal => goal.metrics));
}
