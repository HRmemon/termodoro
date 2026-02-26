import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import type { CalendarEvent, Config } from '../types.js';
import { loadEvents, addEvent, updateEvent, deleteEvent, getEventsForMonth, getEventsForDate, expandRecurring } from '../lib/events.js';
import { loadIcsEvents } from '../lib/ics.js';
import { loadSessions } from '../lib/store.js';
import { loadTasks } from '../lib/tasks.js';
import { loadReminders } from '../lib/reminders.js';
import { MonthGrid } from './MonthGrid.js';
import { DayAgenda } from './DayAgenda.js';
import { TasksPanel } from './TasksPanel.js';
import { EventForm } from './EventForm.js';
import { colors } from '../lib/theme.js';
import type { Keymap } from '../lib/keymap.js';

type ViewMode = 'monthly' | 'daily' | 'add' | 'edit';


interface CalendarViewProps {
  setIsTyping: (v: boolean) => void;
  config: Config;
  keymap: Keymap;
}

function getTodayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function CalendarView({ setIsTyping, config, keymap }: CalendarViewProps) {
  const calendarConfig = config.calendar;
  const [viewMode, setViewMode] = useState<ViewMode>(calendarConfig?.defaultView === 'daily' ? 'daily' : 'monthly');
  const prevModeRef = useRef<'monthly' | 'daily'>('monthly');
  const [selectedDate, setSelectedDate] = useState(getTodayStr);
  const [isGlobalPrivacy, setIsGlobalPrivacy] = useState(calendarConfig?.privacyMode ?? false);
  const [eventVersion, setEventVersion] = useState(0);
  const [editTarget, setEditTarget] = useState<CalendarEvent | null>(null);
  const [dailySelectedIdx, setDailySelectedIdx] = useState(0);

  const { stdout } = useStdout();
  const termRows = stdout?.rows ?? 24;
  const termCols = stdout?.columns ?? 80;

  const { year, month } = parseDateParts(selectedDate);

  // Refresh today periodically
  const [today, setToday] = useState(getTodayStr);
  useEffect(() => {
    const interval = setInterval(() => setToday(getTodayStr()), 60_000);
    return () => clearInterval(interval);
  }, []);

  // Load user events
  const allUserEvents = useMemo(() => loadEvents(), [eventVersion]);

  // Load ICS events
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
    return loadTasks().filter((t: { deadline?: string }) => t.deadline === selectedDate);
  }, [selectedDate, eventVersion]);

  const dayReminders = useMemo(() => {
    if (calendarConfig?.showReminders === false) return [];
    const reminders = loadReminders();
    return reminders.filter((r: { enabled: boolean; recurring: boolean }) => r.enabled && (r.recurring || selectedDate === today));
  }, [selectedDate, eventVersion, today]);

  const daySessions = useMemo(() => {
    return loadSessions().filter(
      (s: { startedAt: string; type: string; status: string }) => s.startedAt.startsWith(selectedDate) && s.type === 'work' && s.status === 'completed'
    );
  }, [selectedDate]);

  // All tasks for the right panel
  const allTasks = useMemo(() => loadTasks(), [eventVersion]);

  // Reset cursor when selected date changes (avoids stale index on new day)
  useEffect(() => { setDailySelectedIdx(0); }, [selectedDate]);

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

  const applyToSelected = useCallback((action: (event: CalendarEvent) => void) => {
    if (dailySelectedIdx < dayEvents.length) {
      const event = dayEvents[dailySelectedIdx];
      if (event && event.source === 'user') {
        action(event);
        reloadEvents();
      }
    }
  }, [dailySelectedIdx, dayEvents, reloadEvents]);

  // Navigation: day-by-day (like calcure)
  const navigateDay = useCallback((delta: number) => {
    setSelectedDate(prev => addDays(prev, delta));
  }, []);

  const navigateWeek = useCallback((delta: number) => {
    setSelectedDate(prev => addDays(prev, delta * 7));
  }, []);

  // Input handling
  useInput((input, key) => {
    if (viewMode === 'add' || viewMode === 'edit') return;

    if (keymap.matches('calendar.toggle_global_privacy', input, key)) {
      setIsGlobalPrivacy(prev => !prev);
      return;
    }

    if (keymap.matches('calendar.reload_ics', input, key)) {
      reloadIcs();
      reloadEvents();
      return;
    }

    if (viewMode === 'monthly') {
      // h/l = days, j/k = weeks (like calcure)
      if (keymap.matches('nav.left', input, key)) { navigateDay(-1); return; }
      if (keymap.matches('nav.right', input, key)) { navigateDay(1); return; }
      if (keymap.matches('nav.down', input, key)) { navigateWeek(1); return; }
      if (keymap.matches('nav.up', input, key)) { navigateWeek(-1); return; }

      if (key.return) { setViewMode('daily'); setDailySelectedIdx(0); return; }

      if (keymap.matches('list.add', input, key)) {
        prevModeRef.current = 'monthly';
        setViewMode('add');
        return;
      }

      if (keymap.matches('calendar.goto_today', input, key)) { setSelectedDate(getTodayStr()); return; }
      if (keymap.matches('calendar.toggle_view', input, key)) { setViewMode('daily'); return; }

      return;
    }

    if (viewMode === 'daily') {
      // h/l = days
      if (keymap.matches('nav.left', input, key)) { navigateDay(-1); return; }
      if (keymap.matches('nav.right', input, key)) { navigateDay(1); return; }

      // j/k = scroll event list
      if (keymap.matches('nav.down', input, key)) {
        setDailySelectedIdx(prev => Math.max(0, Math.min(prev + 1, dayEvents.length + dayTasks.length - 1)));
        return;
      }
      if (keymap.matches('nav.up', input, key)) {
        setDailySelectedIdx(prev => Math.max(prev - 1, 0));
        return;
      }

      if (key.escape || keymap.matches('calendar.toggle_view', input, key)) {
        setViewMode('monthly');
        return;
      }

      if (keymap.matches('list.add', input, key)) {
        prevModeRef.current = 'daily';
        setViewMode('add');
        return;
      }

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

      if (keymap.matches('calendar.toggle_done', input, key)) {
        applyToSelected(event => {
          updateEvent(event.id, { status: event.status === 'done' ? 'normal' : 'done' });
        });
        return;
      }

      if (keymap.matches('calendar.toggle_important', input, key)) {
        applyToSelected(event => {
          updateEvent(event.id, { status: event.status === 'important' ? 'normal' : 'important' });
        });
        return;
      }

      if (keymap.matches('calendar.toggle_privacy', input, key)) {
        applyToSelected(event => {
          updateEvent(event.id, { privacy: !event.privacy });
        });
        return;
      }

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

  // Layout calculations
  const sidebarW = config.sidebarWidth ?? 20;
  const totalContentWidth = termCols - sidebarW - 4;
  // Split: calendar ~72%, tasks panel ~28%
  const tasksPanelWidth = Math.max(16, Math.floor(totalContentWidth * 0.28));
  const calendarWidth = totalContentWidth - tasksPanelWidth - 3; // separator + margins
  const maxGridRows = termRows - 8;

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
      <Box>
        <Box flexDirection="column" flexGrow={1}>
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
        </Box>
        <Box width={1} marginX={1}>
          <Text color={colors.dim}>│</Text>
        </Box>
        <TasksPanel
          tasks={allTasks}
          width={tasksPanelWidth}
          maxRows={maxGridRows}
          isGlobalPrivacy={isGlobalPrivacy}
        />
      </Box>
    );
  }

  // Monthly view with split layout: calendar | tasks
  return (
    <Box>
      <Box flexDirection="column" flexGrow={1}>
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
          contentWidth={calendarWidth}
          maxRows={maxGridRows}
        />
      </Box>
      <Box width={1} marginX={1}>
        <Text color={colors.dim}>│</Text>
      </Box>
      <TasksPanel
        tasks={allTasks}
        width={tasksPanelWidth}
        maxRows={maxGridRows}
        isGlobalPrivacy={isGlobalPrivacy}
      />
    </Box>
  );
}
