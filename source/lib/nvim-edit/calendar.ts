import { nanoid } from 'nanoid';
import type { CalendarEvent } from '../../types.js';
import { loadEvents, saveEvents } from '../events.js';
import { loadIcsEvents } from '../ics.js';
import { loadConfig } from '../config.js';

export function formatCalendarEvents(calendarSelectedDate: string | undefined): { content: string; cursorLine?: number } {
  const userEvents = loadEvents();
  const config = loadConfig();
  const icsFiles = config.calendar?.icsFiles ?? [];
  const icsEvents = icsFiles.length > 0 ? loadIcsEvents(icsFiles) : [];
  const allEvents = [...userEvents, ...icsEvents];

  // Group events by date, sorted chronologically
  const byDate = new Map<string, CalendarEvent[]>();
  for (const e of allEvents) {
    const list = byDate.get(e.date) ?? [];
    list.push(e);
    byDate.set(e.date, list);
  }
  const sortedDates = [...byDate.keys()].sort();

  const lines: string[] = [];
  lines.push('# Calendar Events');
  lines.push('# User events are editable. ICS events (marked [ics]) are read-only.');
  lines.push('# Format: [status] TITLE  time:HH:MM  end:HH:MM  freq:once  icon:★  %id:xxx');
  lines.push('# Status: [ ] normal, [x] done, [!] important');
  lines.push('# Delete a line to remove. Add under a date heading to create.');
  lines.push('');

  const targetDate = calendarSelectedDate;
  let cursorLine: number | undefined;

  for (const date of sortedDates) {
    const events = byDate.get(date) ?? [];
    // Sort: timed events first (by time), then all-day
    events.sort((a, b) => {
      if (a.time && !b.time) return -1;
      if (!a.time && b.time) return 1;
      if (a.time && b.time) return a.time.localeCompare(b.time);
      return 0;
    });

    // Track cursor position for target date
    if (date === targetDate) {
      cursorLine = lines.length + 1; // +1 because lines are 1-indexed
    }

    lines.push(`## ${date}`);
    for (const e of events) {
      let status = '[ ]';
      if (e.status === 'done') status = '[x]';
      if (e.status === 'important') status = '[!]';

      let line = `${status} ${e.title}`;
      if (e.time) line += `  time:${e.time}`;
      if (e.endTime) line += `  end:${e.endTime}`;
      if (e.endDate && e.endDate !== e.date) line += `  endDate:${e.endDate}`;
      if (e.frequency && e.frequency !== 'once') line += `  freq:${e.frequency}`;
      if (e.repeatCount) line += `  repeat:${e.repeatCount}`;
      if (e.icon) line += `  icon:${e.icon}`;
      if (e.color) line += `  color:${e.color}`;
      if (e.privacy) line += `  private`;
      if (e.source === 'ics') line += `  [ics]`;
      line += `  %id:${e.id}`;
      lines.push(line);
    }
    lines.push('');
  }

  // If target date has no events yet, add an empty heading
  if (targetDate && !byDate.has(targetDate)) {
    cursorLine = lines.length + 1;
    lines.push(`## ${targetDate}`);
    lines.push('');
  }

  return { content: lines.join('\n'), cursorLine };
}

export function parseCalendarEvents(text: string): void {
  const lines = text.split('\n');
  const existing = loadEvents();
  const existingMap = new Map(existing.map(e => [e.id, e]));
  const result: CalendarEvent[] = [];
  const seenIds = new Set<string>();
  let currentDate = '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') && !trimmed.startsWith('##')) continue;

    // Date heading
    const dateMatch = trimmed.match(/^## (\d{4}-\d{2}-\d{2})$/);
    if (dateMatch) {
      currentDate = dateMatch[1]!;
      continue;
    }
    if (!currentDate) continue;

    // Skip ICS events — they're read-only
    if (trimmed.includes('[ics]')) continue;

    // Parse event line
    const statusMatch = trimmed.match(/^\[([x !\u2022])\]\s*/);
    if (!statusMatch) continue;

    let status: 'normal' | 'done' | 'important' = 'normal';
    if (statusMatch[1] === 'x') status = 'done';
    if (statusMatch[1] === '!') status = 'important';

    let rest = trimmed.replace(/^\[[x !\u2022]\]\s*/, '');

    // Parse %id
    const idMatch = rest.match(/%id:(\S+)/);
    const id = idMatch ? idMatch[1]! : nanoid();
    rest = rest.replace(/%id:\S+/, '').trim();

    // Parse key:value pairs from the end
    let time: string | undefined;
    let endTime: string | undefined;
    let endDate: string | undefined;
    let frequency: CalendarEvent['frequency'] = 'once';
    let repeatCount: number | undefined;
    let icon: string | undefined;
    let color: string | undefined;
    let privacy = false;

    // Extract known tags
    const tags = ['time', 'end', 'endDate', 'freq', 'repeat', 'icon', 'color'];
    for (const tag of tags) {
      const re = new RegExp(`\\b${tag}:(\\S+)`);
      const m = rest.match(re);
      if (m) {
        const val = m[1]!;
        rest = rest.replace(re, '').trim();
        switch (tag) {
          case 'time': time = val; break;
          case 'end': endTime = val; break;
          case 'endDate': endDate = val; break;
          case 'freq': frequency = val as CalendarEvent['frequency']; break;
          case 'repeat': repeatCount = parseInt(val, 10) || undefined; break;
          case 'icon': icon = val; break;
          case 'color': color = val; break;
        }
      }
    }
    if (/\bprivate\b/.test(rest)) {
      privacy = true;
      rest = rest.replace(/\bprivate\b/, '').trim();
    }

    const title = rest.trim();
    if (!title) continue;

    seenIds.add(id);
    const old = existingMap.get(id);

    result.push({
      id,
      title,
      date: currentDate,
      endDate,
      time,
      endTime,
      status,
      privacy,
      frequency,
      repeatCount,
      icon,
      color,
      calendarId: old?.calendarId,
      rrule: old?.rrule,
      source: 'user',
    });
  }

  // Preserve ICS events as-is
  const icsEvents = existing.filter(e => e.source === 'ics');

  saveEvents([...result, ...icsEvents]);
}
