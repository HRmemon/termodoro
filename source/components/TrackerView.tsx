import { useState, useCallback, useMemo, useEffect } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
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
  if (!code && pending) {
    const pDisplay = pending.suggested === 'hD' ? '?½D' : `?${pending.suggested}`;
    if (isCursor) {
      return <Text backgroundColor="white" color="black">{` ${pDisplay.padEnd(3)}`}</Text>;
    }
    return <Text dimColor color="yellow">{` ${pDisplay.padEnd(3)}`}</Text>;
  }

  const cat = code ? getCategoryByCode(code) : undefined;
  const display = code ? (code === 'hD' ? '\u00bdD' : code.padEnd(2)) : ' \u00b7';
  const color = cat?.color as any ?? 'gray';

  if (isCursor) {
    return <Text backgroundColor={isActive ? color : 'white'} color={isActive ? 'black' : 'black'}>{` ${display.trim().padEnd(2)} `}</Text>;
  }
  if (code) {
    return <Text color={color}>{` ${display.trim().padEnd(2)} `}</Text>;
  }
  return <Text dimColor>{`  \u00b7  `}</Text>;
}

type Mode = 'grid' | 'pick' | 'day' | 'week' | 'browse' | 'review';

export function TrackerView() {
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
  }, [week, currentDate, currentTime]);

  useInput((input, key) => {
    if (mode === 'browse') {
      if (input === 'j' || key.downArrow) setBrowseCursor(p => Math.min(p + 1, browseList.length - 1));
      else if (input === 'k' || key.upArrow) setBrowseCursor(p => Math.max(0, p - 1));
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
        const cat = categories.find(c => c.key && (c.key === input || c.key === input.toUpperCase()));
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
      if (input === 'j' || key.downArrow) setPickerCursor(p => Math.min(p + 1, categories.length - 1));
      else if (input === 'k' || key.upArrow) setPickerCursor(p => Math.max(0, p - 1));
      else if (key.return) handleSetSlot(categories[pickerCursor]!.code);
      else if (key.escape) setMode('grid');
      else if (input === '.') handleSetSlot(null);
      else {
        // Quick type by shortcut key
        const cat = categories.find(c => c.key && (c.key === input || c.key === input.toUpperCase()));
        if (cat) { handleSetSlot(cat.code); }
      }
      return;
    }

    if (mode === 'day' || mode === 'week') {
      if (key.escape || input === 'd' || input === 'w') setMode('grid');
      return;
    }

    // Grid mode
    if (input === 'j' || key.downArrow) {
      const next = Math.min(cursorRow + 1, ALL_SLOTS.length - 1);
      setCursorRow(next);
      if (next >= scrollOffset + VISIBLE_ROWS) setScrollOffset(next - VISIBLE_ROWS + 1);
    } else if (input === 'k' || key.upArrow) {
      const next = Math.max(0, cursorRow - 1);
      setCursorRow(next);
      if (next < scrollOffset) setScrollOffset(next);
    } else if (input === 'h' || key.leftArrow) {
      setCursorCol(p => Math.max(0, p - 1));
    } else if (input === 'l' || key.rightArrow) {
      setCursorCol(p => Math.min(6, p + 1));
    } else if (key.tab) {
      setCursorCol(p => (p + 1) % 7);
    } else if (input === 'e' || key.return) {
      if (week) { setPickerCursor(0); setMode('pick'); }
    } else if (input === '.') {
      handleSetSlot(null);
    }
    // Dynamic quick-set by shortcut key
    else {
      const cat = categories.find(c => c.key && (c.key === input || c.key === input.toUpperCase()));
      if (cat) handleSetSlot(cat.code);
      else if (input === 'r' && pendingCount > 0) {
        setReviewIdx(0);
        setMode('review');
      } else if (input === 'A' && pendingCount > 0) {
        setWeek(prev => prev ? acceptAllPending(prev) : prev);
      } else if (input === 'n') {
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
      } else if (input === 'b') {
        setMode('browse');
        setBrowseCursor(0);
      } else if (input === 'd') {
        setMode(m => m === 'day' ? 'grid' : 'day');
      } else if (input === 'w') {
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

  // When picker is open, split grid rows around cursor for inline picker
  if (mode === 'pick') {
    const cursorVisIdx = cursorRow - scrollOffset;
    const rowsAbove = visibleSlots.slice(0, Math.min(cursorVisIdx + 1, visibleSlots.length));
    const pickerHeight = categories.length + 3;
    const rowsBelowCount = Math.max(0, VISIBLE_ROWS - rowsAbove.length - pickerHeight);
    const rowsBelow = visibleSlots.slice(cursorVisIdx + 1, cursorVisIdx + 1 + rowsBelowCount);

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
        <Box marginTop={1}>
          <Text dimColor>{'Time  '}</Text>
          {DAY_NAMES.map((name, i) => (
            <Text key={name} color={i === cursorCol ? 'cyan' : i === todayCol ? 'yellow' : undefined} bold={i === cursorCol}>
              {name.padEnd(COL_WIDTH)}
            </Text>
          ))}
        </Box>
        <Text dimColor>{'\u2500\u2500\u2500\u2500\u2500  \u2500\u2500\u2500\u2500  \u2500\u2500\u2500\u2500  \u2500\u2500\u2500\u2500  \u2500\u2500\u2500\u2500  \u2500\u2500\u2500\u2500  \u2500\u2500\u2500\u2500  \u2500\u2500\u2500\u2500'}</Text>

        {/* Grid rows above cursor */}
        <Box flexDirection="column">
          {rowsAbove.map((time, vi) => renderGridRow(time, vi, scrollOffset))}
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

        {/* Grid rows below picker */}
        {rowsBelow.length > 0 && (
          <Box flexDirection="column">
            {rowsBelow.map((time, vi) => renderGridRow(time, vi + cursorVisIdx + 1, scrollOffset))}
          </Box>
        )}
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

      {/* Column headers */}
      <Box marginTop={1}>
        <Text dimColor>{'Time  '}</Text>
        {DAY_NAMES.map((name, i) => (
          <Text
            key={name}
            color={i === cursorCol ? 'cyan' : i === todayCol ? 'yellow' : undefined}
            bold={i === cursorCol}
          >
            {name.padEnd(COL_WIDTH)}
          </Text>
        ))}
      </Box>
      <Text dimColor>{'\u2500\u2500\u2500\u2500\u2500  \u2500\u2500\u2500\u2500  \u2500\u2500\u2500\u2500  \u2500\u2500\u2500\u2500  \u2500\u2500\u2500\u2500  \u2500\u2500\u2500\u2500  \u2500\u2500\u2500\u2500  \u2500\u2500\u2500\u2500'}</Text>

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
