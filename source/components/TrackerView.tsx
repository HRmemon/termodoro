import { useState, useCallback, useMemo, useEffect } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import type { Keymap } from '../lib/keymap.js';
import {
  ALL_SLOTS, DAY_NAMES, WeekData,
  getCategoryByCode, getCategories, getISOWeekStr, getMondayOfWeek, getWeekDates,
  dateToString, loadWeek, createWeek, listWeeks, setSlot, computeDayStats,
  expirePending, getPendingCount, acceptPending, rejectPending, acceptAllPending,
  PendingSuggestion, loadTrackerConfigFull, addPendingSuggestions, generateWebSuggestions,
} from '../lib/tracker.js';
import { getSlotDomainBreakdown } from '../lib/browser-stats.js';

const COL_WIDTH = 5; // characters per day column

function getTodayStr() {
  return dateToString(new Date());
}

function getTodayColIndex(weekDates: string[]): number {
  const today = getTodayStr();
  const idx = weekDates.indexOf(today);
  return idx >= 0 ? idx : -1;
}

function formatHours(h: number): string {
  if (h === 0) return '0h';
  if (h < 1) return `${h * 60 | 0}m`;
  const whole = Math.floor(h);
  const mins = Math.round((h - whole) * 60);
  return mins > 0 ? `${whole}h${mins}m` : `${whole}h`;
}

function SlotCell({
  code, isActive, isCursor, pending
}: { code: string | undefined; isActive: boolean; isCursor: boolean; pending?: PendingSuggestion }) {
  // Show pending suggestion if no confirmed code
  // Always produce exactly COL_WIDTH (5) visual chars
  if (!code && pending) {
    // pending display: space + up to 3 chars + space = 5 chars total
    const raw = pending.suggested === 'hD' ? '?½D' : `?${pending.suggested}`;
    const capped = raw.slice(0, 3).padEnd(3);
    if (isCursor) {
      return <Text backgroundColor="white" color="black">{` ${capped} `}</Text>;
    }
    return <Text dimColor color="yellow">{` ${capped} `}</Text>;
  }

  const cat = code ? getCategoryByCode(code) : undefined;
  // Filled: space + 2-char code + space + space = 5 chars
  const display = code ? (code === 'hD' ? '\u00bdD' : code.slice(0, 2).padEnd(2)) : ' \u00b7';
  const color = cat?.color as any ?? 'gray';

  if (isCursor) {
    return <Text backgroundColor={isActive ? color : 'white'} color="black">{` ${display.trim().padEnd(2)} `}</Text>;
  }
  if (code) {
    return <Text color={color}>{` ${display.trim().padEnd(2)} `}</Text>;
  }
  return <Text dimColor>{`  \u00b7  `}</Text>;
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
      if ((km ? km.matches('nav.down', input, key) : input === 'j') || key.downArrow) setBrowseCursor(p => Math.min(p + 1, browseList.length - 1));
      else if ((km ? km.matches('nav.up', input, key) : input === 'k') || key.upArrow) setBrowseCursor(p => Math.max(0, p - 1));
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
        // Move to next or exit if done
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
        // Category key: change suggestion category & accept
        const cat = categories.find(c => c.key && c.key === input);
        if (cat && week) {
          // Change the suggestion's code before accepting
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
      if ((km ? km.matches('nav.down', input, key) : input === 'j') || key.downArrow) setPickerCursor(p => Math.min(p + 1, categories.length - 1));
      else if ((km ? km.matches('nav.up', input, key) : input === 'k') || key.upArrow) setPickerCursor(p => Math.max(0, p - 1));
      else if (key.return) handleSetSlot(categories[pickerCursor]!.code);
      else if (key.escape) {
        setMode('grid');
        // Ensure cursor is visible after closing picker
        setScrollOffset(prev => {
          if (cursorRow < prev) return cursorRow;
          if (cursorRow >= prev + VISIBLE_ROWS) return cursorRow - VISIBLE_ROWS + 1;
          return prev;
        });
      }
      else if (input === '.') handleSetSlot(null);
      else {
        // Quick type by shortcut key
        const cat = categories.find(c => c.key && c.key === input);
        if (cat) { handleSetSlot(cat.code); }
      }
      return;
    }

    if (mode === 'day' || mode === 'week') {
      if (key.escape || input === 'q'
        || (km ? km.matches('tracker.day_summary', input, key) : input === 'D')
        || (km ? km.matches('tracker.week_summary', input, key) : input === 'w')
      ) setMode('grid');
      return;
    }

    // Grid mode
    if ((km ? km.matches('nav.down', input, key) : input === 'j') || key.downArrow) {
      const next = Math.min(cursorRow + 1, ALL_SLOTS.length - 1);
      setCursorRow(next);
      if (next >= scrollOffset + VISIBLE_ROWS) setScrollOffset(next - VISIBLE_ROWS + 1);
    } else if ((km ? km.matches('nav.up', input, key) : input === 'k') || key.upArrow) {
      const next = Math.max(0, cursorRow - 1);
      setCursorRow(next);
      if (next < scrollOffset) setScrollOffset(next);
    } else if ((km ? km.matches('nav.left', input, key) : input === 'h') || key.leftArrow) {
      setCursorCol(p => Math.max(0, p - 1));
    } else if ((km ? km.matches('nav.right', input, key) : input === 'l') || key.rightArrow) {
      setCursorCol(p => Math.min(6, p + 1));
    } else if (key.tab) {
      setCursorCol(p => (p + 1) % 7);
    } else if ((km ? km.matches('tracker.pick', input, key) : input === 'e') || key.return) {
      if (week) { setPickerCursor(0); setMode('pick'); }
    } else if (km ? km.matches('tracker.clear', input, key) : input === '.') {
      handleSetSlot(null);
    }
    // Dynamic quick-set by shortcut key
    else {
      const cat = categories.find(c => c.key && c.key === input);
      if (cat) handleSetSlot(cat.code);
      else if ((km ? km.matches('tracker.review', input, key) : input === 'r') && pendingCount > 0) {
        setReviewIdx(0);
        setMode('review');
      } else if (input === 'A' && pendingCount > 0) {
        setWeek(prev => prev ? acceptAllPending(prev) : prev);
      } else if (km ? km.matches('tracker.new_week', input, key) : input === 'n') {
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
      } else if (km ? km.matches('tracker.browse', input, key) : input === 'b') {
        setMode('browse');
        setBrowseCursor(0);
      } else if (km ? km.matches('tracker.day_summary', input, key) : input === 'D') {
        setMode(m => m === 'day' ? 'grid' : 'day');
      } else if (km ? km.matches('tracker.week_summary', input, key) : input === 'w') {
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

  // When picker is open, show only rows up to cursor then picker below (no rowsBelow shift)
  if (mode === 'pick') {
    const pickerHeight = categories.length + 3;
    const maxGridRows = Math.max(3, VISIBLE_ROWS - pickerHeight);
    const pickScrollEnd = Math.min(cursorRow + 1, ALL_SLOTS.length);
    const pickScrollStart = Math.max(0, pickScrollEnd - maxGridRows);
    const pickVisibleSlots = ALL_SLOTS.slice(pickScrollStart, pickScrollEnd);

    const renderGridRow = (time: string, visIdx: number, baseOffset: number) => {
      const rowIdx = baseOffset + visIdx;
      return (
        <Box key={time}>
          <Text dimColor>{time}  </Text>
          {weekDates.map((date, colIdx) => {
            const slotCode = week.slots[date]?.[time];
            const isCursor = rowIdx === cursorRow && colIdx === cursorCol;
            const pend = week.pending[date]?.[time];
            return (
              <Box key={date} width={COL_WIDTH}>
                <SlotCell code={slotCode} isActive={!!slotCode} isCursor={isCursor} pending={pend} />
              </Box>
            );
          })}
        </Box>
      );
    };

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
        <Box flexDirection="column">
          {pickVisibleSlots.map((time, vi) => renderGridRow(time, vi, pickScrollStart))}
        </Box>

        {/* Inline picker with [key] indicators */}
        <Box flexDirection="column" borderStyle="single" borderColor="cyan" paddingX={1}>
          <Text bold color="cyan">Set slot: {currentDate} {currentTime}</Text>
          {categories.map((cat, i) => (
            <Box key={cat.code}>
              <Text color={i === pickerCursor ? 'cyan' : undefined} bold={i === pickerCursor}>
                {i === pickerCursor ? '> ' : '  '}
              </Text>
              <Text dimColor>[</Text>
              <Text color={cat.key ? 'white' : 'gray'} bold={!!cat.key}>
                {cat.key ?? ' '}
              </Text>
              <Text dimColor>] </Text>
              <Text color={cat.color as any} bold={i === pickerCursor}>
                {cat.code.padEnd(4)}
              </Text>
              <Text color={i === pickerCursor ? 'cyan' : undefined}>
                {cat.label}
              </Text>
            </Box>
          ))}
          <Text dimColor>Enter:set  j/k:nav  [.]:clear  Esc:cancel</Text>
        </Box>
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

      {/* Column headers + divider */}
      <Text>{' '}</Text>
      <Text dimColor>{'Time  ' + DAY_NAMES.map(n => n.padEnd(COL_WIDTH)).join('')}</Text>
      <Text dimColor>{'      ' + DAY_NAMES.map(() => '\u2500'.repeat(COL_WIDTH)).join('')}</Text>

      {/* Grid rows */}
      <Box flexDirection="column">
        {visibleSlots.map((time, visIdx) => {
          const rowIdx = scrollOffset + visIdx;
          return (
            <Box key={time}>
              <Text dimColor>{time}  </Text>
              {weekDates.map((date, colIdx) => {
                const slotCode = week.slots[date]?.[time];
                const isCursor = rowIdx === cursorRow && colIdx === cursorCol;
                const pend = week.pending[date]?.[time];
                return (
                  <Box key={date} width={COL_WIDTH}>
                    <SlotCell code={slotCode} isActive={!!slotCode} isCursor={isCursor} pending={pend} />
                  </Box>
                );
              })}
            </Box>
          );
        })}
      </Box>

      {/* Day summary panel */}
      {mode === 'day' && currentDate && (
        <Box flexDirection="column" borderStyle="single" borderColor="yellow" paddingX={1} marginTop={1}>
          <Text bold color="yellow">{DAY_NAMES[cursorCol]} {currentDate}</Text>
          {Object.entries(dayStats).length === 0 && <Text dimColor>No slots filled yet.</Text>}
          {Object.entries(dayStats).map(([code, hours]) => {
            const cat = getCategoryByCode(code);
            return (
              <Box key={code}>
                <Box width={6}><Text color={cat?.color as any}>{code}</Text></Box>
                <Text>{formatHours(hours)}</Text>
              </Box>
            );
          })}
          <Box marginTop={1}>
            <Text dimColor>Total tracked: {formatHours(dayTotal)}</Text>
          </Box>
          <Text dimColor>Esc or d to close</Text>
        </Box>
      )}

      {/* Week summary panel */}
      {mode === 'week' && (
        <Box flexDirection="column" borderStyle="single" borderColor="yellow" paddingX={1} marginTop={1}>
          <Text bold color="yellow">Week of {week.start}</Text>
          <Box>
            <Box width={6}><Text dimColor> </Text></Box>
            {DAY_NAMES.map(d => <Box key={d} width={6}><Text dimColor>{d}</Text></Box>)}
            <Box width={7}><Text dimColor>Total</Text></Box>
          </Box>
          {categories.map(cat => {
            const perDay = weekDates.map(date => (week.slots[date] ?? {}));
            const dayCounts = perDay.map(daySlots =>
              Object.values(daySlots).filter(c => c === cat.code).length * 0.5
            );
            const total = dayCounts.reduce((s, h) => s + h, 0);
            if (total === 0) return null;
            return (
              <Box key={cat.code}>
                <Box width={6}><Text color={cat.color as any}>{cat.code}</Text></Box>
                {dayCounts.map((h, i) => (
                  <Box key={i} width={6}>
                    <Text color={cat.color as any}>{h > 0 ? formatHours(h) : '\u00b7'}</Text>
                  </Box>
                ))}
                <Box width={7}><Text bold>{formatHours(total)}</Text></Box>
              </Box>
            );
          })}
          <Text dimColor>Esc or w to close</Text>
        </Box>
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
                <Text color={cat?.color as any}>{code}</Text>
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
