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
import { TasksPanel, getDayItemCount, getTasksItemCount } from './TasksPanel.js';
import type { PaneId } from './TasksPanel.js';
import { EventForm } from './EventForm.js';
import type { Keymap } from '../lib/keymap.js';

type ViewMode = 'monthly' | 'daily' | 'add' | 'edit';

const PANES: PaneId[] = ['calendar', 'today', 'tasks'];

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
  const [focusedPane, setFocusedPane] = useState<PaneId>('calendar');
  const [todayCollapsed, setTodayCollapsed] = useState(false);
  const [tasksCollapsed, setTasksCollapsed] = useState(false);
  const [todayScrollOffset, setTodayScrollOffset] = useState(0);
  const [tasksScrollOffset, setTasksScrollOffset] = useState(0);
  const [showHeatmap, setShowHeatmap] = useState(calendarConfig?.showSessionHeatmap !== false);

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

  // Month data — include filler days from adjacent months
  const eventsByDate = useMemo(() => {
    const map = getEventsForMonth(allEvents, year, month);

    // Compute filler date range
    const mondayStart = (calendarConfig?.weekStartsOn ?? 1) === 1;
    const firstDow = (() => {
      const d = new Date(year, month - 1, 1).getDay();
      return mondayStart ? (d + 6) % 7 : d;
    })();

    // Previous month filler days
    if (firstDow > 0) {
      const prevMonth = month === 1 ? 12 : month - 1;
      const prevYear = month === 1 ? year - 1 : year;
      const prevMonthDays = new Date(prevYear, prevMonth, 0).getDate();
      const prevStart = `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(prevMonthDays - firstDow + 1).padStart(2, '0')}`;
      const prevEnd = `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(prevMonthDays).padStart(2, '0')}`;
      const prevExpanded = expandRecurring(allEvents, prevStart, prevEnd);
      for (const e of prevExpanded) {
        if (e.date >= prevStart && e.date <= prevEnd) {
          if (!map.has(e.date)) map.set(e.date, []);
          map.get(e.date)!.push(e);
        }
      }
    }

    // Next month filler days
    const totalDays = new Date(year, month, 0).getDate();
    const lastDow = (() => {
      const d = new Date(year, month - 1, totalDays).getDay();
      return mondayStart ? (d + 6) % 7 : d;
    })();
    const trailingDays = lastDow < 6 ? 6 - lastDow : 0;
    if (trailingDays > 0) {
      const nextMonth = month === 12 ? 1 : month + 1;
      const nextYear = month === 12 ? year + 1 : year;
      const nextStart = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;
      const nextEnd = `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(trailingDays).padStart(2, '0')}`;
      const nextExpanded = expandRecurring(allEvents, nextStart, nextEnd);
      for (const e of nextExpanded) {
        if (e.date >= nextStart && e.date <= nextEnd) {
          if (!map.has(e.date)) map.set(e.date, []);
          map.get(e.date)!.push(e);
        }
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

  // Reset cursor and day-panel scroll when selected date changes
  useEffect(() => { setDailySelectedIdx(0); setTodayScrollOffset(0); }, [selectedDate]);

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

  // Navigation
  const navigateDay = useCallback((delta: number) => {
    setSelectedDate(prev => addDays(prev, delta));
  }, []);

  const navigateWeek = useCallback((delta: number) => {
    setSelectedDate(prev => addDays(prev, delta * 7));
  }, []);

  // Tab cycling between panes
  const cyclePane = useCallback((direction: 1 | -1) => {
    setFocusedPane(prev => {
      const idx = PANES.indexOf(prev);
      const next = (idx + direction + PANES.length) % PANES.length;
      return PANES[next]!;
    });
  }, []);

  // Input handling
  useInput((input, key) => {
    if (viewMode === 'add' || viewMode === 'edit') return;

    // Tab / Shift-Tab to switch panes
    if (key.tab) {
      cyclePane(key.shift ? -1 : 1);
      return;
    }

    // Global: privacy toggle, ICS reload
    if (keymap.matches('calendar.toggle_global_privacy', input, key)) {
      setIsGlobalPrivacy(prev => !prev);
      return;
    }
    if (keymap.matches('calendar.reload_ics', input, key)) {
      reloadIcs();
      reloadEvents();
      return;
    }

    // Go to today (works in any pane)
    if (keymap.matches('calendar.goto_today', input, key)) {
      setSelectedDate(getTodayStr());
      return;
    }
    if (keymap.matches('calendar.toggle_heatmap', input, key)) {
      setShowHeatmap(prev => !prev);
      return;
    }

    // Toggle collapse on focused right-side pane with Enter
    if (focusedPane === 'today' && key.return) {
      setTodayCollapsed(prev => !prev);
      return;
    }
    if (focusedPane === 'tasks' && key.return) {
      setTasksCollapsed(prev => !prev);
      return;
    }

    // Calendar pane focused
    if (focusedPane === 'calendar') {
      if (viewMode === 'monthly') {
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

        if (keymap.matches('calendar.toggle_view', input, key)) { setViewMode('daily'); return; }
        return;
      }

      if (viewMode === 'daily') {
        if (keymap.matches('nav.left', input, key)) { navigateDay(-1); return; }
        if (keymap.matches('nav.right', input, key)) { navigateDay(1); return; }

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

        // x = toggle done
        if (keymap.matches('calendar.toggle_done', input, key)) {
          applyToSelected(event => {
            updateEvent(event.id, { status: event.status === 'done' ? 'normal' : 'done' });
          });
          return;
        }

        // d = delete
        if (keymap.matches('calendar.delete', input, key)) {
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

        return;
      }
    }

    // Today/Tasks panes: j/k to scroll
    if (focusedPane === 'today') {
      const totalItems = getDayItemCount(dayEvents, dayTasks);
      if (keymap.matches('nav.down', input, key)) {
        setTodayScrollOffset(prev => Math.min(prev + 1, Math.max(0, totalItems - 1)));
        return;
      }
      if (keymap.matches('nav.up', input, key)) {
        setTodayScrollOffset(prev => Math.max(prev - 1, 0));
        return;
      }
    }

    if (focusedPane === 'tasks') {
      const totalItems = getTasksItemCount(allTasks);
      if (keymap.matches('nav.down', input, key)) {
        setTasksScrollOffset(prev => Math.min(prev + 1, Math.max(0, totalItems - 1)));
        return;
      }
      if (keymap.matches('nav.up', input, key)) {
        setTasksScrollOffset(prev => Math.max(prev - 1, 0));
        return;
      }
    }
  });

  // Layout calculations
  const sidebarW = config.sidebarWidth ?? 20;
  const totalContentWidth = termCols - sidebarW - 4;
  const tasksPanelWidth = Math.max(16, Math.floor(totalContentWidth * 0.28));
  const calendarWidth = totalContentWidth - tasksPanelWidth - 3;
  // Layout overhead: 1 top border + 2 view header + 1 mid divider + 1 status
  // + 1 simpleDivider + 3 keysBar (2 content + 1 bottom border) + 1 safeRows adjustment = 10
  const maxGridRows = termRows - 10;

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

  const rightPanel = (
    <TasksPanel
      selectedDate={selectedDate}
      selectedEvents={dayEvents}
      selectedTasks={dayTasks}
      allTasks={allTasks}
      width={tasksPanelWidth}
      maxRows={maxGridRows}
      isGlobalPrivacy={isGlobalPrivacy}
      focusedPane={focusedPane}
      todayCollapsed={todayCollapsed}
      tasksCollapsed={tasksCollapsed}
      todayScrollOffset={todayScrollOffset}
      tasksScrollOffset={tasksScrollOffset}
      calendarConfig={calendarConfig}
    />
  );

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
        <Box width={1} />

        {rightPanel}
      </Box>
    );
  }

  // Monthly view with split layout
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
          showHeatmap={showHeatmap}
        />
      </Box>
      <Box width={1} />
      {rightPanel}
    </Box>
  );
}
