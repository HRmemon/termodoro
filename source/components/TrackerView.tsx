import { useState, useCallback, useMemo, useEffect } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import { type Keymap, kmMatches } from '../lib/keymap.js';
import {
  ALL_SLOTS, DAY_NAMES, WeekData,
  getCategoryByCode, getCategories, getISOWeekStr, getMondayOfWeek, getWeekDates,
  dateToString, loadWeek, createWeek, listWeeks, setSlot, computeDayStats,
  expirePending, getPendingCount, acceptPending, rejectPending, acceptAllPending,
  PendingSuggestion, loadTrackerConfigFull, addPendingSuggestions, generateWebSuggestions,
} from '../lib/tracker.js';
import { getSlotDomainBreakdown } from '../lib/browser-stats.js';
import { formatHours } from '../lib/format.js';
import { COL_WIDTH } from './tracker/SlotCell.js';
import { TrackerGridView } from './tracker/TrackerGridView.js';
import { TrackerPickerOverlay } from './tracker/TrackerPickerOverlay.js';
import { DaySummaryPanel, WeekSummaryPanel } from './tracker/TrackerSummaryPanel.js';

function getTodayStr() {
  return dateToString(new Date());
}

function getTodayColIndex(weekDates: string[]): number {
  const today = getTodayStr();
  const idx = weekDates.indexOf(today);
  return idx >= 0 ? idx : -1;
}

type Mode = 'grid' | 'pick' | 'day' | 'week' | 'browse' | 'review';

export function TrackerView({ keymap }: { keymap?: Keymap }) {
  const { stdout } = useStdout();
  const termHeight = stdout?.rows ?? 24;
  const VISIBLE_ROWS = Math.max(6, termHeight - 16);

  const categories = useMemo(() => getCategories(), []);

  const todayStr = getTodayStr();
  const monday = getMondayOfWeek(new Date());
  const currentWeekStr = getISOWeekStr(monday);

  const [weekStr, setWeekStr] = useState<string | null>(() => {
    const w = loadWeek(currentWeekStr);
    if (w) return currentWeekStr;
    const all = listWeeks();
    return all[0] ?? null;
  });
  const [week, setWeek] = useState<WeekData | null>(() =>
    weekStr ? loadWeek(weekStr) : null
  );
  const weekDates = week ? getWeekDates(week.start) : [];
  const todayCol = weekDates.length > 0 ? getTodayColIndex(weekDates) : -1;

  const defaultRow = (() => {
    const h = new Date().getHours();
    const idx = h * 2;
    return Math.max(0, Math.min(idx - 3, ALL_SLOTS.length - VISIBLE_ROWS));
  })();

  const [scrollOffset, setScrollOffset] = useState(defaultRow);
  const [cursorRow, setCursorRow] = useState(() => {
    const h = new Date().getHours();
    return Math.min(h * 2, ALL_SLOTS.length - 1);
  });
  const [cursorCol, setCursorCol] = useState(() => Math.max(0, todayCol >= 0 ? todayCol : 0));
  const [mode, setMode] = useState<Mode>('grid');
  const [pickerCursor, setPickerCursor] = useState(0);
  const [browseList] = useState<string[]>(() => listWeeks());
  const [browseCursor, setBrowseCursor] = useState(0);

  // Expire stale pending suggestions on mount, then generate web suggestions
  useEffect(() => {
    let current = week;
    if (current && getPendingCount(current) > 0) {
      current = expirePending(current);
      if (current !== week) setWeek(current);
    }

    // Generate web domain suggestions if rules exist
    try {
      const fullConfig = loadTrackerConfigFull();
      if (fullConfig.domainRules.length > 0 && current) {
        const breakdown = getSlotDomainBreakdown(todayStr);
        if (breakdown.length > 0) {
          const webSugs = generateWebSuggestions(breakdown, fullConfig.domainRules);
          if (webSugs.length > 0) {
            const withDate = webSugs.map(s => ({ ...s, date: todayStr }));
            const updated = addPendingSuggestions(current, withDate, 'web');
            setWeek(updated);
          }
        }
      }
    } catch { /* browser DB may not exist */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const pendingCount = week ? getPendingCount(week) : 0;

  // Get sorted list of pending slot positions for review navigation
  const pendingSlots = useMemo(() => {
    if (!week) return [];
    const slots: { date: string; time: string; suggestion: PendingSuggestion }[] = [];
    for (const date of Object.keys(week.pending)) {
      for (const time of Object.keys(week.pending[date]!)) {
        slots.push({ date, time, suggestion: week.pending[date]![time]! });
      }
    }
    return slots.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
  }, [week]);

  const [reviewIdx, setReviewIdx] = useState(0);

  const currentDate = weekDates[cursorCol] ?? null;
  const currentTime = ALL_SLOTS[cursorRow] ?? null;
  const handleSetSlot = useCallback((code: string | null) => {
    if (!week || !currentDate || !currentTime) return;
    setWeek(prev => prev ? setSlot(prev, currentDate, currentTime, code) : prev);
    setMode('grid');
    // Ensure cursor is visible after picker closes
    setScrollOffset(prev => {
      if (cursorRow < prev) return cursorRow;
      if (cursorRow >= prev + VISIBLE_ROWS) return cursorRow - VISIBLE_ROWS + 1;
      return prev;
    });
  }, [week, currentDate, currentTime, cursorRow, VISIBLE_ROWS]);

  useInput((input, key) => {
    const km = keymap;

    if (mode === 'browse') {
      if ((kmMatches(km, 'nav.down', input, key)) || key.downArrow) setBrowseCursor(p => Math.min(p + 1, browseList.length - 1));
      else if ((kmMatches(km, 'nav.up', input, key)) || key.upArrow) setBrowseCursor(p => Math.max(0, p - 1));
      else if (key.return && browseList[browseCursor]) {
        const ws = browseList[browseCursor]!;
        const w = loadWeek(ws);
        if (w) { setWeek(w); setWeekStr(ws); }
        setMode('grid');
      } else if (key.escape) setMode('grid');
      return;
    }

    if (mode === 'review') {
      if (key.escape) { setMode('grid'); return; }
      const ps = pendingSlots[reviewIdx];
      if (!ps || !week) { setMode('grid'); return; }

      if (input === 'y' || input === 'Y') {
        setWeek(prev => prev ? acceptPending(prev, ps.date, ps.time) : prev);
        if (reviewIdx >= pendingSlots.length - 1) setMode('grid');
      } else if (input === 'n' || input === 'N') {
        setWeek(prev => prev ? rejectPending(prev, ps.date, ps.time) : prev);
        if (reviewIdx >= pendingSlots.length - 1) setMode('grid');
      } else if (input === 'A') {
        setWeek(prev => prev ? acceptAllPending(prev) : prev);
        setMode('grid');
      } else if (key.tab) {
        setReviewIdx(i => Math.min(i + 1, pendingSlots.length - 1));
      } else {
        const cat = categories.find(c => c.key && c.key === input);
        if (cat && week) {
          const updated = { ...week, pending: { ...week.pending } };
          if (updated.pending[ps.date]) {
            updated.pending[ps.date] = { ...updated.pending[ps.date] };
            updated.pending[ps.date]![ps.time] = { ...ps.suggestion, suggested: cat.code };
          }
          setWeek(acceptPending(updated, ps.date, ps.time));
          if (reviewIdx >= pendingSlots.length - 1) setMode('grid');
        }
      }
      return;
    }

    if (mode === 'pick') {
      if ((kmMatches(km, 'nav.down', input, key)) || key.downArrow) setPickerCursor(p => Math.min(p + 1, categories.length - 1));
      else if ((kmMatches(km, 'nav.up', input, key)) || key.upArrow) setPickerCursor(p => Math.max(0, p - 1));
      else if (key.return) handleSetSlot(categories[pickerCursor]!.code);
      else if (key.escape) {
        setMode('grid');
        setScrollOffset(prev => {
          if (cursorRow < prev) return cursorRow;
          if (cursorRow >= prev + VISIBLE_ROWS) return cursorRow - VISIBLE_ROWS + 1;
          return prev;
        });
      }
      else if (input === '.') handleSetSlot(null);
      else {
        const cat = categories.find(c => c.key && c.key === input);
        if (cat) { handleSetSlot(cat.code); }
      }
      return;
    }

    if (mode === 'day' || mode === 'week') {
      if (key.escape || input === 'q'
        || kmMatches(km, 'tracker.day_summary', input, key)
        || kmMatches(km, 'tracker.week_summary', input, key)
      ) setMode('grid');
      return;
    }

    // Grid mode
    if ((kmMatches(km, 'nav.down', input, key)) || key.downArrow) {
      const next = Math.min(cursorRow + 1, ALL_SLOTS.length - 1);
      setCursorRow(next);
      if (next >= scrollOffset + VISIBLE_ROWS) setScrollOffset(next - VISIBLE_ROWS + 1);
    } else if ((kmMatches(km, 'nav.up', input, key)) || key.upArrow) {
      const next = Math.max(0, cursorRow - 1);
      setCursorRow(next);
      if (next < scrollOffset) setScrollOffset(next);
    } else if ((kmMatches(km, 'nav.left', input, key)) || key.leftArrow) {
      setCursorCol(p => Math.max(0, p - 1));
    } else if ((kmMatches(km, 'nav.right', input, key)) || key.rightArrow) {
      setCursorCol(p => Math.min(6, p + 1));
    } else if (key.tab) {
      setCursorCol(p => (p + 1) % 7);
    } else if ((kmMatches(km, 'tracker.pick', input, key)) || key.return) {
      if (week) { setPickerCursor(0); setMode('pick'); }
    } else if (kmMatches(km, 'tracker.clear', input, key)) {
      handleSetSlot(null);
    }
    else {
      const cat = categories.find(c => c.key && c.key === input);
      if (cat) handleSetSlot(cat.code);
      else if (kmMatches(km, 'tracker.review', input, key) && pendingCount > 0) {
        setReviewIdx(0);
        setMode('review');
      } else if (input === 'A' && pendingCount > 0) {
        setWeek(prev => prev ? acceptAllPending(prev) : prev);
      } else if (kmMatches(km, 'tracker.new_week', input, key)) {
        const existing = loadWeek(currentWeekStr);
        if (existing) {
          setWeek(existing);
          setWeekStr(currentWeekStr);
        } else {
          const w = createWeek(new Date());
          setWeek(w);
          setWeekStr(w.week);
        }
        setMode('grid');
      } else if (kmMatches(km, 'tracker.browse', input, key)) {
        setMode('browse');
        setBrowseCursor(0);
      } else if (kmMatches(km, 'tracker.day_summary', input, key)) {
        setMode(m => m === 'day' ? 'grid' : 'day');
      } else if (kmMatches(km, 'tracker.week_summary', input, key)) {
        setMode(m => m === 'week' ? 'grid' : 'week');
      }
    }
  });

  // ─── Render ────────────────────────────────────────────────────────────────

  if (!week) {
    return (
      <Box flexDirection="column" flexGrow={1}>
        <Text dimColor>No active week.</Text>
        <Box marginTop={1}>
          <Text>Press <Text bold color="cyan">n</Text> to start tracking this week</Text>
        </Box>
        {browseList.length > 0 && (
          <Box marginTop={1}>
            <Text>Press <Text bold color="cyan">b</Text> to browse past weeks</Text>
          </Box>
        )}
      </Box>
    );
  }

  if (mode === 'browse') {
    return (
      <Box flexDirection="column" flexGrow={1}>
        <Text bold color="cyan">Browse Weeks</Text>
        <Text dimColor>Enter to open  Esc to cancel</Text>
        <Box flexDirection="column" marginTop={1}>
          {browseList.map((ws, i) => (
            <Box key={ws}>
              <Text color={i === browseCursor ? 'cyan' : undefined} bold={i === browseCursor}>
                {i === browseCursor ? '> ' : '  '}{ws}
                {ws === weekStr ? <Text dimColor> (current)</Text> : null}
              </Text>
            </Box>
          ))}
          {browseList.length === 0 && <Text dimColor>No past weeks.</Text>}
        </Box>
      </Box>
    );
  }

  // Week header info
  const weekLabel = `Week of ${week.start.slice(5).replace('-', '/')}`;
  const todayDayName = (() => {
    const idx = weekDates.indexOf(todayStr);
    return idx >= 0 ? DAY_NAMES[idx] : null;
  })();
  const dayNum = cursorCol + 1;

  // Day summary for current cursor day
  const dayStats = computeDayStats(week.slots[currentDate ?? ''] ?? {});
  const dayTotal = Object.values(dayStats).reduce((s, h) => s + h, 0);

  // Visible rows
  const visibleSlots = ALL_SLOTS.slice(scrollOffset, scrollOffset + VISIBLE_ROWS);

  // When picker is open, show only rows up to cursor then picker below
  if (mode === 'pick') {
    const pickerHeight = categories.length + 3;
    const maxGridRows = Math.max(3, VISIBLE_ROWS - pickerHeight);
    const pickScrollEnd = Math.min(cursorRow + 1, ALL_SLOTS.length);
    const pickScrollStart = Math.max(0, pickScrollEnd - maxGridRows);
    const pickVisibleSlots = ALL_SLOTS.slice(pickScrollStart, pickScrollEnd);

    return (
      <Box flexDirection="column" flexGrow={1}>
        {/* Header */}
        <Box>
          <Text bold>{weekLabel}</Text>
          {todayDayName && <Text dimColor>{'  '}[Today: {todayDayName}]</Text>}
          <Text dimColor>{'  '}Day {dayNum}/7</Text>
        </Box>
        {/* Column headers + divider */}
        <Box marginTop={1} flexDirection="column">
          <Text>
            <Text dimColor>{'Time  '}</Text>
            {DAY_NAMES.map((name, i) => (
              <Text
                key={name}
                color={i === cursorCol ? 'cyan' : i === todayCol ? 'yellow' : 'gray'}
                bold={i === cursorCol}
              >
                {name.padEnd(COL_WIDTH)}
              </Text>
            ))}
          </Text>
          <Text dimColor>{'      ' + DAY_NAMES.map(() => '\u2500'.repeat(COL_WIDTH)).join('')}</Text>
        </Box>

        {/* Grid rows up to and including cursor row */}
        <TrackerGridView
          week={week}
          weekDates={weekDates}
          visibleSlots={pickVisibleSlots}
          scrollOffset={pickScrollStart}
          cursorRow={cursorRow}
          cursorCol={cursorCol}
        />

        {/* Inline picker */}
        <TrackerPickerOverlay
          categories={categories}
          pickerCursor={pickerCursor}
          currentDate={currentDate}
          currentTime={currentTime}
        />
      </Box>
    );
  }

  return (
    <Box flexDirection="column" flexGrow={1}>
      {/* Header */}
      <Box>
        <Text bold>{weekLabel}</Text>
        {todayDayName && <Text dimColor>{'  '}[Today: {todayDayName}]</Text>}
        <Text dimColor>{'  '}Day {dayNum}/7</Text>
      </Box>

      {/* Grid */}
      <TrackerGridView
        week={week}
        weekDates={weekDates}
        visibleSlots={visibleSlots}
        scrollOffset={scrollOffset}
        cursorRow={cursorRow}
        cursorCol={cursorCol}
      />

      {/* Day summary panel */}
      {mode === 'day' && currentDate && (
        <DaySummaryPanel
          currentDate={currentDate}
          cursorCol={cursorCol}
          dayStats={dayStats}
          dayTotal={dayTotal}
        />
      )}

      {/* Week summary panel */}
      {mode === 'week' && (
        <WeekSummaryPanel week={week} weekDates={weekDates} />
      )}

      {/* Pending banner */}
      {pendingCount > 0 && mode === 'grid' && (
        <Box marginTop={1}>
          <Text color="yellow" bold>{pendingCount} pending</Text>
          <Text dimColor>{'  '}r:Review  A:Accept all</Text>
        </Box>
      )}

      {/* Review mode panel */}
      {mode === 'review' && pendingSlots[reviewIdx] && (
        <Box flexDirection="column" borderStyle="single" borderColor="yellow" paddingX={1} marginTop={1}>
          <Text bold color="yellow">Review Pending ({reviewIdx + 1}/{pendingSlots.length})</Text>
          <Text>
            Slot: <Text bold>{pendingSlots[reviewIdx]!.date} {pendingSlots[reviewIdx]!.time}</Text>
            {'  '}Suggested: <Text bold color="cyan">{pendingSlots[reviewIdx]!.suggestion.suggested}</Text>
            {'  '}Source: <Text dimColor>{pendingSlots[reviewIdx]!.suggestion.source}</Text>
          </Text>
          <Text dimColor>y:accept  n:reject  A:accept all  Tab:next  category key:change & accept  Esc:exit</Text>
        </Box>
      )}

      {/* Status bar (only in grid mode) */}
      {mode === 'grid' && (
        <Box marginTop={1} flexWrap="wrap">
          {Object.entries(dayStats).map(([code, hours]) => {
            const cat = getCategoryByCode(code);
            return (
              <Box key={code} marginRight={2}>
                <Text color={cat?.color}>{code}</Text>
                <Text dimColor>:{formatHours(hours)}  </Text>
              </Box>
            );
          })}
          {Object.keys(dayStats).length === 0 && <Text dimColor>No data for {DAY_NAMES[cursorCol]}</Text>}
          {pendingCount > 0 && (
            <Box marginLeft={2}>
              <Text dimColor>[{pendingCount} pending]</Text>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}
