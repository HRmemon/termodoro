import * as fs from 'node:fs';
import type { CalendarEvent } from '../types.js';
import { nanoid } from 'nanoid';

/**
 * Minimal .ics (iCalendar) parser — extracts VEVENT components.
 * No external dependencies; handles the most common patterns:
 * - Single events (all-day and timed)
 * - Multi-day events
 * - RRULE recurrence (converted to our frequency model)
 * - EXDATE (ignored for simplicity — full RRULE support via rrule lib can be added later)
 */

interface RawVEvent {
  summary: string;
  dtstart: string;
  dtend?: string;
  rrule?: string;
  uid?: string;
}

function unfoldLines(ics: string): string[] {
  // RFC 5545: long lines are folded with CRLF + whitespace
  return ics.replace(/\r\n[ \t]/g, '').replace(/\r\n/g, '\n').split('\n');
}

function parseVEvents(icsText: string): RawVEvent[] {
  const lines = unfoldLines(icsText);
  const events: RawVEvent[] = [];
  let inEvent = false;
  let current: Partial<RawVEvent> = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === 'BEGIN:VEVENT') {
      inEvent = true;
      current = {};
      continue;
    }
    if (trimmed === 'END:VEVENT') {
      inEvent = false;
      if (current.summary && current.dtstart) {
        events.push(current as RawVEvent);
      }
      continue;
    }
    if (!inEvent) continue;

    // Parse property:value (handle params like DTSTART;VALUE=DATE:20260301)
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx < 0) continue;
    const propPart = trimmed.slice(0, colonIdx).toUpperCase();
    const value = trimmed.slice(colonIdx + 1);

    // Strip parameters (e.g., DTSTART;TZID=... → DTSTART)
    const propName = propPart.split(';')[0]!;

    switch (propName) {
      case 'SUMMARY':
        current.summary = value;
        break;
      case 'DTSTART':
        current.dtstart = value;
        break;
      case 'DTEND':
        current.dtend = value;
        break;
      case 'RRULE':
        current.rrule = value;
        break;
      case 'UID':
        current.uid = value;
        break;
    }
  }

  return events;
}

function parseIcsDate(raw: string): { date: string; time?: string } {
  // Formats: 20260301 (all-day), 20260301T090000, 20260301T090000Z
  const cleaned = raw.replace(/Z$/, '');
  if (cleaned.length === 8) {
    // All-day: YYYYMMDD
    const date = `${cleaned.slice(0, 4)}-${cleaned.slice(4, 6)}-${cleaned.slice(6, 8)}`;
    return { date };
  }
  // Timed: YYYYMMDDTHHMMSS
  const date = `${cleaned.slice(0, 4)}-${cleaned.slice(4, 6)}-${cleaned.slice(6, 8)}`;
  const time = `${cleaned.slice(9, 11)}:${cleaned.slice(11, 13)}`;
  return { date, time };
}

function parseRruleFrequency(rrule: string): CalendarEvent['frequency'] {
  const match = rrule.match(/FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)/i);
  if (!match) return 'once';
  switch (match[1]!.toUpperCase()) {
    case 'DAILY': return 'daily';
    case 'WEEKLY': return 'weekly';
    case 'MONTHLY': return 'monthly';
    case 'YEARLY': return 'yearly';
    default: return 'once';
  }
}

function parseRruleCount(rrule: string): number {
  const match = rrule.match(/COUNT=(\d+)/i);
  return match ? parseInt(match[1]!, 10) : 0; // 0 = infinite
}

function rawToCalendarEvent(raw: RawVEvent, calendarId: string): CalendarEvent {
  const start = parseIcsDate(raw.dtstart);

  let endDate: string | undefined;
  let endTime: string | undefined;
  if (raw.dtend) {
    const end = parseIcsDate(raw.dtend);
    // For all-day events, DTEND is exclusive (next day), so subtract 1
    if (!end.time && end.date > start.date) {
      const d = new Date(end.date + 'T00:00:00');
      d.setDate(d.getDate() - 1);
      const adjusted = d.toISOString().slice(0, 10);
      if (adjusted > start.date) endDate = adjusted;
    } else if (end.date > start.date) {
      endDate = end.date;
    }
    endTime = end.time;
  }

  const frequency = raw.rrule ? parseRruleFrequency(raw.rrule) : 'once';
  const repeatCount = raw.rrule ? parseRruleCount(raw.rrule) : undefined;

  return {
    id: raw.uid ?? nanoid(),
    title: raw.summary,
    date: start.date,
    endDate,
    time: start.time,
    endTime,
    status: 'normal',
    privacy: false,
    frequency,
    repeatCount,
    rrule: raw.rrule,
    calendarId,
    source: 'ics',
  };
}

/** Parse a single .ics file content into CalendarEvents */
export function parseIcsContent(icsText: string, calendarId: string): CalendarEvent[] {
  const rawEvents = parseVEvents(icsText);
  return rawEvents.map(raw => rawToCalendarEvent(raw, calendarId));
}

/** Load events from .ics file paths */
export function loadIcsEvents(filePaths: string[]): CalendarEvent[] {
  const allEvents: CalendarEvent[] = [];

  for (let i = 0; i < filePaths.length; i++) {
    const filePath = filePaths[i]!;
    const calendarId = `ics-${i}`;

    try {
      // Handle directories — scan for .ics files
      if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
        const files = fs.readdirSync(filePath)
          .filter(f => f.endsWith('.ics'))
          .map(f => `${filePath}/${f}`);
        for (const f of files) {
          try {
            const content = fs.readFileSync(f, 'utf-8');
            allEvents.push(...parseIcsContent(content, calendarId));
          } catch { /* skip unreadable files */ }
        }
        continue;
      }

      // Single .ics file
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        allEvents.push(...parseIcsContent(content, calendarId));
      }
    } catch { /* skip on error */ }
  }

  return allEvents;
}
