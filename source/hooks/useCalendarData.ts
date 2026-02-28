import { useMemo } from 'react';
import type { CalendarEvent, Config } from '../types.js';
import { loadEvents, expandRecurring } from '../lib/events.js';
import { loadIcsEvents } from '../lib/ics.js';
import { loadSessions } from '../lib/store.js';
import { loadTasks } from '../lib/tasks.js';
import { loadReminders } from '../lib/reminders.js';
import { formatDateStr, getMonthDays, addDays } from '../lib/date-utils.js';

interface CalendarDataInput {
  selectedDate: string;
  year: number;
  month: number;
  eventVersion: number;
  icsVersion: number;
  today: string;
  calendarConfig: Config['calendar'];
}

interface CalendarDataResult {
  allUserEvents: CalendarEvent[];
  icsEvents: CalendarEvent[];
  allEvents: CalendarEvent[];
  eventsByDate: Map<string, CalendarEvent[]>;
  sessionMinutesByDate: Map<string, number>;
  dayEvents: CalendarEvent[];
  dayTasks: ReturnType<typeof loadTasks>;
  dayReminders: ReturnType<typeof loadReminders>;
  daySessions: ReturnType<typeof loadSessions>;
}

export function useCalendarData({
  selectedDate, year, month, eventVersion, icsVersion, today, calendarConfig,
}: CalendarDataInput): CalendarDataResult {
  // Load user events
  const allUserEvents = useMemo(() => loadEvents(), [eventVersion]);

  // Load ICS events
  const icsEvents = useMemo(() => {
    const paths = calendarConfig?.icsFiles ?? [];
    if (paths.length === 0) return [];
    return loadIcsEvents(paths);
  }, [icsVersion, calendarConfig?.icsFiles]);

  const allEvents = useMemo(() => [...allUserEvents, ...icsEvents], [allUserEvents, icsEvents]);

  // Month data — include filler days from adjacent months
  const eventsByDate = useMemo(() => {
    const mondayStart = (calendarConfig?.weekStartsOn ?? 1) === 1;
    const firstDow = (() => {
      const d = new Date(year, month - 1, 1).getDay();
      return mondayStart ? (d + 6) % 7 : d;
    })();
    const totalDays = getMonthDays(year, month);
    const lastDow = (() => {
      const d = new Date(year, month - 1, totalDays).getDay();
      return mondayStart ? (d + 6) % 7 : d;
    })();
    const trailingDays = lastDow < 6 ? 6 - lastDow : 0;

    const visibleStart = firstDow > 0
      ? addDays(formatDateStr(year, month, 1), -firstDow)
      : formatDateStr(year, month, 1);
    const visibleEnd = trailingDays > 0
      ? addDays(formatDateStr(year, month, totalDays), trailingDays)
      : formatDateStr(year, month, totalDays);

    const expanded = expandRecurring(allEvents, visibleStart, visibleEnd);
    const map = new Map<string, CalendarEvent[]>();

    for (let d = 1; d <= totalDays; d++) {
      map.set(formatDateStr(year, month, d), []);
    }

    for (const event of expanded) {
      const start = event.date;
      const end = event.endDate ?? event.date;
      let cur = start;
      while (cur <= end && cur <= visibleEnd) {
        if (cur >= visibleStart) {
          if (!map.has(cur)) map.set(cur, []);
          map.get(cur)!.push(event);
        }
        cur = addDays(cur, 1);
      }
    }

    return map;
  }, [allEvents, year, month, calendarConfig?.weekStartsOn]);

  // Session heatmap
  const sessionMinutesByDate = useMemo(() => {
    if (calendarConfig?.showSessionHeatmap === false) return new Map<string, number>();
    const sessions = loadSessions();
    const map = new Map<string, number>();
    const prefix = `${year}-${String(month).padStart(2, '0')}`;
    for (const s of sessions) {
      if (s.type !== 'work' || s.status !== 'completed') continue;
      if (!s.startedAt.startsWith(prefix)) continue;
      const dateKey = s.startedAt.slice(0, 10);
      map.set(dateKey, (map.get(dateKey) ?? 0) + Math.round(s.durationActual / 60));
    }
    return map;
  }, [year, month, calendarConfig?.showSessionHeatmap]);

  // Daily agenda data
  const dayEvents = useMemo(() => {
    return eventsByDate.get(selectedDate) ?? [];
  }, [eventsByDate, selectedDate]);

  const dayTasks = useMemo(() => {
    if (calendarConfig?.showTaskDeadlines === false) return [];
    return loadTasks().filter((t: { deadline?: string }) => t.deadline === selectedDate);
  }, [selectedDate, eventVersion, calendarConfig?.showTaskDeadlines]);

  const dayReminders = useMemo(() => {
    if (calendarConfig?.showReminders === false) return [];
    const reminders = loadReminders();
    return reminders.filter((r: { enabled: boolean; recurring: boolean }) => r.enabled && (r.recurring || selectedDate === today));
  }, [selectedDate, eventVersion, today, calendarConfig?.showReminders]);

  const daySessions = useMemo(() => {
    return loadSessions().filter(
      (s: { startedAt: string; type: string; status: string }) => s.startedAt.startsWith(selectedDate) && s.type === 'work' && s.status === 'completed'
    );
  }, [selectedDate, eventVersion]);

  return {
    allUserEvents,
    icsEvents,
    allEvents,
    eventsByDate,
    sessionMinutesByDate,
    dayEvents,
    dayTasks,
    dayReminders,
    daySessions,
  };
}
