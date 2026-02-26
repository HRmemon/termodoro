import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useInput, useStdout } from 'ink';
import type { CalendarEvent, Config } from '../types.js';
import { loadEvents, addEvent, updateEvent, deleteEvent, getEventsForMonth, getEventsForDate, expandRecurring } from '../lib/events.js';
import { loadIcsEvents } from '../lib/ics.js';
import { loadSessions } from '../lib/store.js';
import { loadTasks } from '../lib/tasks.js';
import { loadReminders } from '../lib/reminders.js';
import { MonthGrid } from './MonthGrid.js';
import { DayAgenda } from './DayAgenda.js';
import { EventForm } from './EventForm.js';
import type { Keymap } from '../lib/keymap.js';

type ViewMode = 'monthly' | 'daily' | 'add' | 'edit';


interface CalendarViewProps {
  setIsTyping: (v: boolean) => void;
  config: Config;
  keymap: Keymap;
}

function getTodayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function parseDateParts(dateStr: string): { year: number; month: number; day: number } {
  const [y, m, d] = dateStr.split('-').map(Number);
  return { year: y!, month: m!, day: d! };
}

function formatDateStr(year: number, month: number, day?: number): string {
  const d = day ?? 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function getMonthDays(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function addMonths(year: number, month: number, delta: number): { year: number; month: number } {
  let m = month + delta;
  let y = year;
  while (m > 12) { m -= 12; y++; }
  while (m < 1) { m += 12; y--; }
  return { year: y, month: m };
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function CalendarView({ setIsTyping, config, keymap }: CalendarViewProps) {
  const calendarConfig = config.calendar;
  const [viewMode, setViewMode] = useState<ViewMode>(calendarConfig?.defaultView === 'daily' ? 'daily' : 'monthly');
  // Track what mode to return to when cancelling add form
  const prevModeRef = useRef<'monthly' | 'daily'>('monthly');
  const [selectedDate, setSelectedDate] = useState(getTodayStr);
  const [isGlobalPrivacy, setIsGlobalPrivacy] = useState(calendarConfig?.privacyMode ?? false);
  const [eventVersion, setEventVersion] = useState(0);
  const [editTarget, setEditTarget] = useState<CalendarEvent | null>(null);
  const [dailySelectedIdx, setDailySelectedIdx] = useState(0);

  const { stdout } = useStdout();
  const termRows = stdout?.rows ?? 24;

  const { year, month, day } = parseDateParts(selectedDate);

  // Refresh today string periodically (handles midnight rollover)
  const [today, setToday] = useState(getTodayStr);
  useEffect(() => {
    const interval = setInterval(() => setToday(getTodayStr()), 60_000);
    return () => clearInterval(interval);
  }, []);

  // Load user events (re-read on event changes only)
  const allUserEvents = useMemo(() => loadEvents(), [eventVersion]);

  // Load ICS events separately (not affected by local event edits)
  const [icsVersion, setIcsVersion] = useState(0);
  const icsEvents = useMemo(() => {
    const paths = calendarConfig?.icsFiles ?? [];
    if (paths.length === 0) return [];
    return loadIcsEvents(paths);
  }, [icsVersion, calendarConfig?.icsFiles]);

  const allEvents = useMemo(() => [...allUserEvents, ...icsEvents], [allUserEvents, icsEvents]);

  // Month data
  const eventsByDate = useMemo(
    () => getEventsForMonth(allEvents, year, month),
    [allEvents, year, month],
  );

  // Session heatmap data for month (no dependency on eventVersion — sessions don't change when events do)
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
  }, [year, month]);

  // Daily agenda data
  const dayEvents = useMemo(() => {
    const rangeStart = formatDateStr(year, month, 1);
    const lastDay = getMonthDays(year, month);
    const rangeEnd = formatDateStr(year, month, lastDay);
    const expanded = expandRecurring(allEvents, rangeStart, rangeEnd);
    return getEventsForDate(expanded, selectedDate);
  }, [allEvents, selectedDate, year, month]);

  const dayTasks = useMemo(() => {
    if (calendarConfig?.showTaskDeadlines === false) return [];
    return loadTasks().filter(t => t.deadline === selectedDate);
  }, [selectedDate, eventVersion]);

  const dayReminders = useMemo(() => {
    if (calendarConfig?.showReminders === false) return [];
    const reminders = loadReminders();
    return reminders.filter(r => r.enabled && (r.recurring || selectedDate === today));
  }, [selectedDate, eventVersion, today]);

  const daySessions = useMemo(() => {
    return loadSessions().filter(
      s => s.startedAt.startsWith(selectedDate) && s.type === 'work' && s.status === 'completed'
    );
  }, [selectedDate]);

  const reloadEvents = useCallback(() => setEventVersion(v => v + 1), []);
  const reloadIcs = useCallback(() => setIcsVersion(v => v + 1), []);

  // Event action helpers
  const handleAddEvent = useCallback((data: Omit<CalendarEvent, 'id' | 'source'>) => {
    addEvent({ ...data, source: 'user' });
    setViewMode(prevModeRef.current);
    reloadEvents();
  }, [reloadEvents]);

  const handleEditEvent = useCallback((data: Omit<CalendarEvent, 'id' | 'source'>) => {
    if (editTarget) {
      updateEvent(editTarget.id, data);
      setEditTarget(null);
      setViewMode('daily');
      reloadEvents();
    }
  }, [editTarget, reloadEvents]);

  // Helper to apply an action to the currently selected event in daily view
  const applyToSelected = useCallback((action: (event: CalendarEvent) => void) => {
    if (dailySelectedIdx < dayEvents.length) {
      const event = dayEvents[dailySelectedIdx];
      if (event && event.source === 'user') {
        action(event);
        reloadEvents();
      }
    }
  }, [dailySelectedIdx, dayEvents, reloadEvents]);

  // Navigation helpers
  const navigateMonth = useCallback((delta: number) => {
    const { year: ny, month: nm } = addMonths(year, month, delta);
    const maxDay = getMonthDays(ny, nm);
    const newDay = Math.min(day, maxDay);
    setSelectedDate(formatDateStr(ny, nm, newDay));
  }, [year, month, day]);

  const navigateWeek = useCallback((delta: number) => {
    const newDate = addDays(selectedDate, delta * 7);
    setSelectedDate(newDate);
  }, [selectedDate]);

  const navigateDay = useCallback((delta: number) => {
    setSelectedDate(addDays(selectedDate, delta));
  }, [selectedDate]);

  // Input handling — all keys go through keymap
  useInput((input, key) => {
    // Form modes handle their own input
    if (viewMode === 'add' || viewMode === 'edit') return;

    // Global privacy toggle
    if (keymap.matches('calendar.toggle_global_privacy', input, key)) {
      setIsGlobalPrivacy(prev => !prev);
      return;
    }

    // Reload ICS
    if (keymap.matches('calendar.reload_ics', input, key)) {
      reloadIcs();
      reloadEvents();
      return;
    }

    if (viewMode === 'monthly') {
      // Month navigation
      if (keymap.matches('nav.left', input, key)) { navigateMonth(-1); return; }
      if (keymap.matches('nav.right', input, key)) { navigateMonth(1); return; }
      if (keymap.matches('nav.down', input, key)) { navigateWeek(1); return; }
      if (keymap.matches('nav.up', input, key)) { navigateWeek(-1); return; }

      // Enter daily view
      if (key.return) { setViewMode('daily'); setDailySelectedIdx(0); return; }

      // Add event
      if (keymap.matches('list.add', input, key)) {
        prevModeRef.current = 'monthly';
        setViewMode('add');
        return;
      }

      // Go to today
      if (keymap.matches('calendar.goto_today', input, key)) { setSelectedDate(getTodayStr()); return; }

      // Toggle view
      if (keymap.matches('calendar.toggle_view', input, key)) { setViewMode('daily'); return; }

      return;
    }

    if (viewMode === 'daily') {
      // Day navigation
      if (keymap.matches('nav.left', input, key)) { navigateDay(-1); return; }
      if (keymap.matches('nav.right', input, key)) { navigateDay(1); return; }

      // Scroll event list
      if (keymap.matches('nav.down', input, key)) {
        setDailySelectedIdx(prev => Math.min(prev + 1, dayEvents.length + dayTasks.length - 1));
        return;
      }
      if (keymap.matches('nav.up', input, key)) {
        setDailySelectedIdx(prev => Math.max(prev - 1, 0));
        return;
      }

      // Back to monthly
      if (key.escape || keymap.matches('calendar.toggle_view', input, key)) {
        setViewMode('monthly');
        return;
      }

      // Add event
      if (keymap.matches('list.add', input, key)) {
        prevModeRef.current = 'daily';
        setViewMode('add');
        return;
      }

      // Edit selected event
      if (keymap.matches('list.edit', input, key)) {
        if (dailySelectedIdx < dayEvents.length) {
          const event = dayEvents[dailySelectedIdx];
          if (event && event.source === 'user') {
            setEditTarget(event);
            setViewMode('edit');
          }
        }
        return;
      }

      // Toggle done (must come BEFORE list.delete since 'd' is shared default)
      if (keymap.matches('calendar.toggle_done', input, key)) {
        applyToSelected(event => {
          updateEvent(event.id, { status: event.status === 'done' ? 'normal' : 'done' });
        });
        return;
      }

      // Toggle important
      if (keymap.matches('calendar.toggle_important', input, key)) {
        applyToSelected(event => {
          updateEvent(event.id, { status: event.status === 'important' ? 'normal' : 'important' });
        });
        return;
      }

      // Toggle privacy
      if (keymap.matches('calendar.toggle_privacy', input, key)) {
        applyToSelected(event => {
          updateEvent(event.id, { privacy: !event.privacy });
        });
        return;
      }

      // Delete event — use 'x' to avoid conflict with 'd' for done
      if (input === 'x') {
        if (dailySelectedIdx < dayEvents.length) {
          const event = dayEvents[dailySelectedIdx];
          if (event && event.source === 'user') {
            deleteEvent(event.id);
            reloadEvents();
            setDailySelectedIdx(prev => Math.max(0, prev - 1));
          }
        }
        return;
      }

      return;
    }
  });

  // Available content width/height (rough estimate matching Layout)
  const contentWidth = (stdout?.columns ?? 80) - (config.sidebarWidth ?? 20) - 4;
  const maxGridRows = termRows - 8; // status + keys + borders

  if (viewMode === 'add') {
    return (
      <EventForm
        initialDate={selectedDate}
        onSubmit={handleAddEvent}
        onCancel={() => setViewMode(prevModeRef.current)}
        setIsTyping={setIsTyping}
      />
    );
  }

  if (viewMode === 'edit' && editTarget) {
    return (
      <EventForm
        editEvent={editTarget}
        onSubmit={handleEditEvent}
        onCancel={() => { setEditTarget(null); setViewMode('daily'); }}
        setIsTyping={setIsTyping}
      />
    );
  }

  if (viewMode === 'daily') {
    return (
      <DayAgenda
        date={selectedDate}
        events={dayEvents}
        tasks={dayTasks}
        reminders={dayReminders}
        sessions={daySessions}
        calendarConfig={calendarConfig}
        isGlobalPrivacy={isGlobalPrivacy}
        selectedIdx={dailySelectedIdx}
      />
    );
  }

  // Monthly view
  return (
    <MonthGrid
      year={year}
      month={month}
      eventsByDate={eventsByDate}
      sessionMinutesByDate={sessionMinutesByDate}
      selectedDate={selectedDate}
      today={today}
      showWeekNumbers={calendarConfig?.showWeekNumbers}
      calendarConfig={calendarConfig}
      isGlobalPrivacy={isGlobalPrivacy}
      contentWidth={contentWidth}
      maxRows={maxGridRows}
    />
  );
}
