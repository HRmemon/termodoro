import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { nanoid } from 'nanoid';
import type { CalendarEvent } from '../types.js';

const DATA_DIR = path.join(os.homedir(), '.local', 'share', 'pomodorocli');
const EVENTS_PATH = path.join(DATA_DIR, 'events.json');

function ensureDir(): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function atomicWrite(filePath: string, data: unknown): void {
  ensureDir();
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  fs.renameSync(tmp, filePath);
}

export function loadEvents(): CalendarEvent[] {
  try {
    if (fs.existsSync(EVENTS_PATH)) {
      return JSON.parse(fs.readFileSync(EVENTS_PATH, 'utf-8')) as CalendarEvent[];
    }
  } catch { /* corrupt file */ }
  return [];
}

export function saveEvents(events: CalendarEvent[]): void {
  atomicWrite(EVENTS_PATH, events);
}

export function addEvent(event: Omit<CalendarEvent, 'id'>): CalendarEvent {
  const events = loadEvents();
  const newEvent: CalendarEvent = { ...event, id: nanoid() };
  events.push(newEvent);
  saveEvents(events);
  return newEvent;
}

export function updateEvent(id: string, updates: Partial<CalendarEvent>): void {
  const events = loadEvents();
  const idx = events.findIndex(e => e.id === id);
  if (idx >= 0) {
    events[idx] = { ...events[idx]!, ...updates };
    saveEvents(events);
  }
}

export function deleteEvent(id: string): void {
  const events = loadEvents();
  saveEvents(events.filter(e => e.id !== id));
}

// Date helpers
function dateToNum(d: string): number {
  return parseInt(d.replace(/-/g, ''), 10);
}

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDaysToDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return localDateStr(d);
}

function getMonthEnd(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** Expand recurring events into individual instances for a date range */
export function expandRecurring(
  events: CalendarEvent[],
  rangeStart: string,
  rangeEnd: string,
): CalendarEvent[] {
  const result: CalendarEvent[] = [];
  const startNum = dateToNum(rangeStart);
  const endNum = dateToNum(rangeEnd);

  for (const event of events) {
    const freq = event.frequency ?? 'once';

    if (freq === 'once') {
      // Single event — check if any day falls in range
      const evStart = dateToNum(event.date);
      const evEnd = event.endDate ? dateToNum(event.endDate) : evStart;
      if (evEnd >= startNum && evStart <= endNum) {
        result.push(event);
      }
      continue;
    }

    // Recurring: generate instances
    // For infinite recurrence, derive cap from distance to range end
    const maxInstances = event.repeatCount && event.repeatCount > 0
      ? event.repeatCount
      : Math.max(365, Math.ceil((new Date(rangeEnd + 'T00:00:00').getTime() - new Date(event.date + 'T00:00:00').getTime()) / 86400000) + 1);
    let count = 0;
    let current = event.date;

    // Skip ahead for daily events that start far before the visible range
    if (freq === 'daily' && dateToNum(current) < startNum) {
      const daysBetween = Math.floor(
        (new Date(rangeStart + 'T00:00:00').getTime() - new Date(current + 'T00:00:00').getTime()) / 86400000
      );
      if (daysBetween > 0 && daysBetween < maxInstances) {
        current = addDaysToDate(current, daysBetween);
        count = daysBetween;
      }
    }

    while (count < maxInstances) {
      const curNum = dateToNum(current);
      if (curNum > endNum) break;

      if (curNum >= startNum) {
        // Create instance (same id + date suffix for uniqueness)
        const duration = event.endDate
          ? Math.round((new Date(event.endDate).getTime() - new Date(event.date).getTime()) / 86400000)
          : 0;
        result.push({
          ...event,
          id: count === 0 ? event.id : `${event.id}__${current}`,
          date: current,
          endDate: duration > 0 ? addDaysToDate(current, duration) : undefined,
        });
      }

      count++;
      // Advance to next occurrence
      const d = new Date(current + 'T00:00:00');
      switch (freq) {
        case 'daily':
          d.setDate(d.getDate() + 1);
          break;
        case 'weekly':
          d.setDate(d.getDate() + 7);
          break;
        case 'monthly': {
          const origDay = new Date(event.date + 'T00:00:00').getDate();
          d.setMonth(d.getMonth() + 1);
          const maxDay = getMonthEnd(d.getFullYear(), d.getMonth() + 1);
          d.setDate(Math.min(origDay, maxDay));
          break;
        }
        case 'yearly':
          d.setFullYear(d.getFullYear() + 1);
          break;
      }
      current = localDateStr(d);
    }
  }

  return result;
}

/** Get events for a specific date (including multi-day spans) */
export function getEventsForDate(events: CalendarEvent[], date: string): CalendarEvent[] {
  const d = dateToNum(date);
  return events.filter(e => {
    const start = dateToNum(e.date);
    const end = e.endDate ? dateToNum(e.endDate) : start;
    return d >= start && d <= end;
  });
}

/** Get events grouped by date for a month (1-indexed month) */
export function getEventsForMonth(
  events: CalendarEvent[],
  year: number,
  month: number,
): Map<string, CalendarEvent[]> {
  const rangeStart = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = getMonthEnd(year, month);
  const rangeEnd = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  const expanded = expandRecurring(events, rangeStart, rangeEnd);
  const map = new Map<string, CalendarEvent[]>();

  // Initialize all days
  for (let d = 1; d <= lastDay; d++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    map.set(dateStr, []);
  }

  for (const event of expanded) {
    // For multi-day events, add to each day
    const start = event.date;
    const end = event.endDate ?? event.date;
    let cur = start;
    while (cur <= end && cur <= rangeEnd) {
      if (cur >= rangeStart) {
        const arr = map.get(cur);
        if (arr) arr.push(event);
        else map.set(cur, [event]);
      }
      cur = addDaysToDate(cur, 1);
    }
  }

  return map;
}
