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
  cumulative?: boolean;
  /** Weekly metrics may feed one monthly metric without sharing definitions. */
  contributesTo?: string;
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
  version: 3;
  weekStartsOn: number;
  weeklyPlans: Record<string, GoalArea[]>;
  monthlyPlans: Record<string, GoalArea[]>;
  entries: Record<string, Record<string, GoalValue>>;
  dayQuality: Record<string, DayQuality>;
  dayNotes: Record<string, string>;
}

interface GoalsDataV2 extends Omit<GoalsData, 'version' | 'weeklyPlans' | 'monthlyPlans'> {
  version: 2;
  areas: GoalArea[];
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
  targets: Pick<GoalMetric, 'target' | 'weeklyTarget' | 'monthlyTarget' | 'max' | 'unit' | 'cumulative'> = {},
): GoalMetric => ({ id, name, input, aggregate, ...targets });

function periodAreas(areas: GoalArea[], period: 'week' | 'month'): GoalArea[] {
  return structuredClone(areas).map(area => ({ ...area, goals: area.goals.map(goal => ({
    ...goal,
    metrics: goal.metrics.map(item => ({
      ...item,
      target: period === 'week' ? item.weeklyTarget ?? item.target : item.monthlyTarget ?? item.target,
      weeklyTarget: undefined,
      monthlyTarget: undefined,
    })),
  })) }));
}

function defaultMonthlyAreas(): GoalArea[] {
  return [
      {
        id: 'ielts', name: 'IELTS', goals: [
          { id: 'ielts-booking', name: 'Test booking', metrics: [
            metric('ielts-test-booked', 'Book IELTS test', 'checkbox', 'any', { target: 1, cumulative: true }),
          ] },
          { id: 'ielts-writing', name: 'Writing', metrics: [
            metric('ielts-writing-attempts', 'Daily attempts', 'count', 'sum', { weeklyTarget: 7 }),
            metric('ielts-writing-feedback', 'Work on feedback', 'checkbox', 'count', { weeklyTarget: 7 }),
            metric('ielts-writing-band', 'Best band', 'rate', 'max', { target: 7, max: 9, unit: 'band' }),
          ] },
          { id: 'ielts-reading', name: 'Reading', metrics: [
            metric('ielts-reading-score', 'Latest score', 'rate', 'latest', { target: 38, max: 40 }),
          ] },
          { id: 'ielts-listening', name: 'Listening', metrics: [
            metric('ielts-listening-score', 'Latest score', 'rate', 'latest', { target: 38, max: 40 }),
          ] },
          { id: 'ielts-speaking', name: 'Speaking', metrics: [
            metric('ielts-speaking-attempts', 'Daily attempts', 'count', 'sum', { weeklyTarget: 7 }),
            metric('ielts-speaking-feedback', 'Work on feedback', 'checkbox', 'count', { weeklyTarget: 7 }),
            metric('ielts-speaking-band', 'Best band', 'rate', 'max', { target: 7, max: 9, unit: 'band' }),
          ] },
        ],
      },
      {
        id: 'masters', name: 'MASTERS', goals: [
          { id: 'masters-planning', name: 'Scholarship preparation', metrics: [
            metric('masters-calendar', 'Create dates calendar', 'checkbox', 'any', { target: 1, cumulative: true }),
            metric('masters-scholarship-list', 'List scholarships', 'checkbox', 'any', { target: 1, cumulative: true }),
            metric('masters-recommendation-letters', 'Recommendation letters', 'checkbox', 'any', { target: 1, cumulative: true }),
            metric('masters-research-lead-time', 'Research 7 days before opening', 'checkbox', 'any', { target: 1, cumulative: true }),
          ] },
        ],
      },
      {
        id: 'revenue', name: 'REVENUE STREAMS', goals: [
          { id: 'revenue-career-path', name: 'Find the best-fit career path', metrics: [
            metric('revenue-stocks', 'Research stocks', 'checkbox', 'count', { weeklyTarget: 1 }),
            metric('revenue-common-streams', 'List common streams', 'checkbox', 'count', { weeklyTarget: 1 }),
            metric('revenue-best-fit-three', 'Best-suited paths chosen', 'count', 'sum', { weeklyTarget: 3, monthlyTarget: 3 }),
          ] },
        ],
      },
      {
        id: 'exercise', name: 'EXERCISE', goals: [
          { id: 'exercise-monthly', name: 'Exercise and weight', metrics: [
            metric('exercise-days', 'Exercise days', 'checkbox', 'count', { weeklyTarget: 5 }),
            metric('exercise-weight-lost', 'Weight lost', 'rate', 'latest', { monthlyTarget: 3, max: 3, unit: ' kg' }),
          ] },
        ],
      },
    ];
}

export function getWeekStart(anchor = getTodayStr(), weekStartsOn = 1): string {
  return getWindowDates('week', anchor, weekStartsOn)[0]!;
}

export function getPlanAreas(data: GoalsData, window: GoalWindow, anchor: string): GoalArea[] {
  return window === 'month'
    ? data.monthlyPlans[anchor.slice(0, 7)] ?? []
    : data.weeklyPlans[getWeekStart(anchor, data.weekStartsOn)] ?? [];
}

export function defaultGoalsData(): GoalsData {
  const today = getTodayStr();
  return {
    version: 3,
    weekStartsOn: 1,
    weeklyPlans: {},
    monthlyPlans: { [today.slice(0, 7)]: periodAreas(defaultMonthlyAreas(), 'month') },
    entries: {},
    dayQuality: {},
    dayNotes: {},
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

  if (imported.length) data.weeklyPlans[getWeekStart()] = [{ id: 'imported', name: 'IMPORTED', goals: imported }];
  return data;
}

export function normalizeGoals(raw: GoalsData | GoalsDataV2 | LegacyGoalsData | null): GoalsData {
  if (!raw) return defaultGoalsData();
  if ('version' in raw && raw.version === 3) return raw;
  if ('version' in raw && raw.version === 2) {
    const defaults = defaultGoalsData();
    return {
      ...defaults,
      weeklyPlans: { [getWeekStart(getTodayStr(), raw.weekStartsOn ?? 1)]: periodAreas(raw.areas, 'week') },
      entries: raw.entries,
      dayQuality: raw.dayQuality,
      dayNotes: raw.dayNotes ?? {},
      weekStartsOn: raw.weekStartsOn ?? 1,
    };
  }
  return migrateLegacy(raw as LegacyGoalsData);
}

export function loadGoals(): GoalsData {
  return normalizeGoals(readJSON<GoalsData | GoalsDataV2 | LegacyGoalsData | null>(GOALS_PATH, null));
}

export function saveGoals(data: GoalsData): GoalsData {
  validateGoals(data);
  atomicWriteJSON(GOALS_PATH, data);
  return data;
}

export function validateGoals(data: GoalsData): void {
  if (data.version !== 3 || !data.weeklyPlans || !data.monthlyPlans) throw new Error('Invalid Goals v3 data');
  const monthly = new Map(Object.values(data.monthlyPlans).flatMap(areas => areas.flatMap(area => area.goals.flatMap(goal => goal.metrics))).map(item => [item.id, item]));
  for (const areas of Object.values(data.weeklyPlans)) for (const area of areas) for (const goal of area.goals) for (const source of goal.metrics) {
    if (!source.contributesTo) continue;
    const target = monthly.get(source.contributesTo);
    if (!target || target.id === source.id) throw new Error(`Invalid monthly link for ${source.name}`);
    const compatible = source.input === target.input || (source.input === 'checkbox' && target.input === 'count');
    if (!compatible || (source.input === 'note') !== (target.input === 'note')) throw new Error(`Incompatible monthly link for ${source.name}`);
  }
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

export function setDayNote(data: GoalsData, date: string, note?: string): GoalsData {
  const next = structuredClone(data);
  const value = note?.trim();
  if (value) next.dayNotes[date] = value;
  else delete next.dayNotes[date];
  return saveGoals(next);
}

export function getMetricValue(data: GoalsData, metricId: string, date: string): GoalValue | undefined {
  return data.entries[metricId]?.[date];
}

export function getLatestMetricNote(data: GoalsData, metricId: string, throughDate: string): string | undefined {
  return Object.entries(data.entries[metricId] ?? {})
    .filter(([date, value]) => date <= throughDate && typeof value === 'string' && value.trim())
    .sort(([a], [b]) => a.localeCompare(b))
    .at(-1)?.[1] as string | undefined;
}

export function adjustCount(value: GoalValue | undefined, delta: 1 | -1): number | undefined {
  return Math.max(0, (Number(value) || 0) + delta) || undefined;
}

export function getWindowDates(window: GoalWindow, anchor = getTodayStr(), weekStartsOn = 1): string[] {
  if (window === 'today') return [anchor];
  if (window === 'month') {
    const [year, month] = anchor.split('-').map(Number);
    const count = new Date(year!, month!, 0).getDate();
    return Array.from({ length: count }, (_, i) => `${year}-${String(month).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`);
  }
  const d = new Date(`${anchor}T00:00:00`);
  const startDay = Number.isInteger(weekStartsOn) && weekStartsOn >= 0 && weekStartsOn <= 6 ? weekStartsOn : 1;
  const offset = (d.getDay() - startDay + 7) % 7;
  const start = localDateStr(new Date(d.getFullYear(), d.getMonth(), d.getDate() - offset));
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function aggregateMetric(metric: GoalMetric, data: GoalsData, dates: string[]): number {
  const sourceIds = new Set([metric.id]);
  if (dates.length > 7) {
    for (const date of dates) {
      for (const area of getPlanAreas(data, 'week', date)) for (const goal of area.goals) for (const source of goal.metrics) {
        if (source.contributesTo === metric.id) sourceIds.add(source.id);
      }
    }
  }
  const includedDates = metric.cumulative
    ? [...new Set([...sourceIds].flatMap(id => Object.keys(data.entries[id] ?? {})))].filter(date => date <= dates.at(-1)!)
    : dates;
  const entries = includedDates
    .flatMap(date => [...sourceIds].map(id => ({ date, value: data.entries[id]?.[date] })))
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
  const plans = [...Object.values(data.weeklyPlans), ...Object.values(data.monthlyPlans)];
  return plans.flatMap(areas => areas.filter(area => !area.archivedAt).flatMap(area => area.goals.filter(goal => !goal.archivedAt).flatMap(goal => goal.metrics)));
}
