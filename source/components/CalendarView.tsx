import { useState, useCallback, useEffect, useRef } from 'react';
import { Box, useInput, useStdout } from 'ink';
import type { CalendarEvent, Config } from '../types.js';
import { addEvent, updateEvent, deleteEvent } from '../lib/events.js';
import { MonthGrid } from './MonthGrid.js';
import { DayAgenda } from './DayAgenda.js';
import { DayPanel, getDayItemCount } from './TasksPanel.js';
import { EventForm } from './EventForm.js';
import type { Keymap } from '../lib/keymap.js';
import { getTodayStr, parseDateParts, addDays } from '../lib/date-utils.js';
import { saveConfig, loadConfig } from '../lib/config.js';
import { setCalendarSelectedDate } from '../lib/nvim-edit/index.js';
import { useCalendarData } from '../hooks/useCalendarData.js';

type ViewMode = 'monthly' | 'daily' | 'add' | 'edit';

type PaneId = 'calendar' | 'today';
const PANES: PaneId[] = ['calendar', 'today'];

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

  // Keep nvim-edit in sync with selected date for cursor positioning
  useEffect(() => {
    setCalendarSelectedDate(selectedDate);
  }, [selectedDate]);

  // ICS version for reloading
  const [icsVersion, setIcsVersion] = useState(0);

  // All data loading consolidated into one hook
  const {
    eventsByDate,
    sessionMinutesByDate,
    dayEvents,
    dayTasks,
    dayReminders,
    daySessions,
  } = useCalendarData({
    selectedDate, year, month, eventVersion, icsVersion, today, calendarConfig,
  });

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

    if (key.tab) {
      cyclePane(key.shift ? -1 : 1);
      return;
    }

    if (keymap.matches('calendar.toggle_global_privacy', input, key)) {
      setIsGlobalPrivacy(prev => !prev);
      return;
    }
    if (keymap.matches('calendar.reload_ics', input, key)) {
      reloadIcs();
      reloadEvents();
      return;
    }

    if (keymap.matches('calendar.goto_today', input, key)) {
      setSelectedDate(getTodayStr());
      return;
    }
    if (keymap.matches('calendar.toggle_heatmap', input, key)) {
      setShowHeatmap(prev => {
        const next = !prev;
        const cfg = loadConfig();
        if (!cfg.calendar) cfg.calendar = {};
        cfg.calendar.showSessionHeatmap = next;
        saveConfig(cfg);
        return next;
      });
      return;
    }

    if (focusedPane === 'today' && key.return) {
      setTodayCollapsed(prev => !prev);
      return;
    }

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

        if (keymap.matches('calendar.toggle_done', input, key)) {
          applyToSelected(event => {
            updateEvent(event.id, { status: event.status === 'done' ? 'normal' : 'done' });
          });
          return;
        }

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
