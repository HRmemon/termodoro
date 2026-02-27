import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Box, useInput, useStdout } from 'ink';
import type { CalendarEvent, Config } from '../types.js';
import { loadEvents, addEvent, updateEvent, deleteEvent, expandRecurring } from '../lib/events.js';
import { loadIcsEvents } from '../lib/ics.js';
import { loadSessions } from '../lib/store.js';
import { loadTasks } from '../lib/tasks.js';
import { loadReminders } from '../lib/reminders.js';
import { MonthGrid } from './MonthGrid.js';
import { DayAgenda } from './DayAgenda.js';
import { DayPanel, getDayItemCount } from './TasksPanel.js';
import { EventForm } from './EventForm.js';
import type { Keymap } from '../lib/keymap.js';
import { getTodayStr, parseDateParts, formatDateStr, getMonthDays, addDays } from '../lib/date-utils.js';
import { saveConfig, loadConfig } from '../lib/config.js';

type ViewMode = 'monthly' | 'daily' | 'add' | 'edit';

type PaneId = 'calendar' | 'today';
const PANES: PaneId[] = ['calendar', 'today'];

// Layout overhead from Layout.tsx: top border(1) + view header+margin(2) + mid divider(1)
// + status row(1) + simpleDivider(1) + keysBar content+border(3) + safeRows -1 adjustment(1) = 10
const LAYOUT_OVERHEAD_ROWS = 10;
const TASKS_PANEL_RATIO = 0.28;

interface CalendarViewProps {
  setIsTyping: (v: boolean) => void;
  config: Config;
  keymap: Keymap;
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
  const [todayScrollOffset, setTodayScrollOffset] = useState(0);
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
  // Single expandRecurring call covering the full visible range (filler + month + filler)
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

    // Compute the full visible range including filler days
    const visibleStart = firstDow > 0
      ? addDays(formatDateStr(year, month, 1), -firstDow)
      : formatDateStr(year, month, 1);
    const visibleEnd = trailingDays > 0
      ? addDays(formatDateStr(year, month, totalDays), trailingDays)
      : formatDateStr(year, month, totalDays);

    const expanded = expandRecurring(allEvents, visibleStart, visibleEnd);
    const map = new Map<string, CalendarEvent[]>();

    // Initialize all days in the current month
    for (let d = 1; d <= totalDays; d++) {
      map.set(formatDateStr(year, month, d), []);
    }

    // Distribute events across their date ranges
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

  // Daily agenda data — reuse eventsByDate which already includes filler days
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
      setShowHeatmap(prev => {
        const next = !prev;
        // Persist to config
        const cfg = loadConfig();
        if (!cfg.calendar) cfg.calendar = {};
        cfg.calendar.showSessionHeatmap = next;
        saveConfig(cfg);
        return next;
      });
      return;
    }

    // Toggle collapse on focused right-side pane with Enter
    if (focusedPane === 'today' && key.return) {
      setTodayCollapsed(prev => !prev);
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

  });

  // Layout calculations
  const sidebarW = config.sidebarWidth ?? 20;
  const totalContentWidth = termCols - sidebarW - 4;
  const tasksPanelWidth = Math.max(16, Math.floor(totalContentWidth * TASKS_PANEL_RATIO));
  const calendarWidth = totalContentWidth - tasksPanelWidth - 3;
  const maxGridRows = termRows - LAYOUT_OVERHEAD_ROWS;

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
    <DayPanel
      selectedDate={selectedDate}
      selectedEvents={dayEvents}
      selectedTasks={dayTasks}
      width={tasksPanelWidth}
      maxRows={maxGridRows}
      isGlobalPrivacy={isGlobalPrivacy}
      isFocused={focusedPane === 'today'}
      collapsed={todayCollapsed}
      scrollOffset={todayScrollOffset}
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
