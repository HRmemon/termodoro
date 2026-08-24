import { useEffect, useMemo, useState } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import TextInput from 'ink-text-input';
import { spawn, spawnSync } from 'node:child_process';
import type { Keymap } from '../lib/keymap.js';
import {
  adjustCount,
  aggregateMetric,
  computeDayStreak,
  getLatestMetricNote,
  getMetricTarget,
  getMetricValue,
  getRecentDates,
  getWindowDates,
  loadGoals,
  setDayNote,
  setDayQuality,
  setMetricValue,
  type DayQuality,
  type GoalMetric,
  type GoalsData,
  type GoalWindow,
} from '../lib/goals.js';
import { addDays, getTodayStr, MONTH_NAMES_FULL } from '../lib/date-utils.js';
import { writeGoalsHtmlReport } from '../lib/goals-report.js';

const WINDOWS: GoalWindow[] = ['today', 'week', 'month'];
const QUALITY: Record<DayQuality, { glyph: string; color: string; label: string }> = {
  perfect: { glyph: '■', color: 'green', label: 'Perfect' },
  excused: { glyph: '■', color: 'yellow', label: 'Missed (reason)' },
  missed: { glyph: '■', color: 'red', label: 'Missed (no reason)' },
};

type DisplayRow =
  | { key: string; kind: 'goal'; name: string }
  | { key: string; kind: 'metric'; metric: GoalMetric };

function numberLabel(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, '');
}

function progressBar(value: number, target?: number): string {
  if (!target) return '        ';
  const filled = Math.min(8, Math.round((value / target) * 8));
  return `${'█'.repeat(filled)}${'░'.repeat(8 - filled)}`;
}

function windowLabel(window: GoalWindow, anchor: string, weekStartsOn: number): string {
  if (window === 'today') return anchor === getTodayStr() ? 'Today' : anchor;
  const dates = getWindowDates(window, anchor, weekStartsOn);
  if (window === 'week') return `Week of ${new Date(`${dates[0]}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  const [year, month] = anchor.split('-').map(Number);
  return `${MONTH_NAMES_FULL[month! - 1]} ${year}`;
}

function valueLabel(metric: GoalMetric, value: number, target: number | undefined): string {
  if (metric.aggregate === 'any') return value ? '✓' : '·';
  const suffix = metric.unit === '%' ? '%' : '';
  const current = `${numberLabel(value)}${suffix}`;
  if (target === undefined) return current;
  const targetText = `${numberLabel(target)}${suffix}`;
  return `${current} / ${targetText}`;
}

export function GraphsView({ setIsTyping }: { setIsTyping: (v: boolean) => void; keymap?: Keymap }) {
  const [data, setData] = useState<GoalsData>(() => loadGoals());
  const [window, setWindow] = useState<GoalWindow>('today');
  const [anchor, setAnchor] = useState(getTodayStr);
  const [activeAreaIndex, setActiveAreaIndex] = useState(0);
  const [selected, setSelected] = useState(0);
  const [scroll, setScroll] = useState(0);
  const [editing, setEditing] = useState<GoalMetric | null>(null);
  const [editingDayNote, setEditingDayNote] = useState(false);
  const [editValue, setEditValue] = useState('');
  const { stdout } = useStdout();

  const areas = useMemo(() => data.areas.filter(area => !area.archivedAt), [data]);
  const activeArea = areas[activeAreaIndex];
  const metrics = useMemo(() => activeArea?.goals.filter(goal => !goal.archivedAt).flatMap(goal => goal.metrics) ?? [], [activeArea]);
  const selectedMetric = metrics[selected];
  const dates = useMemo(() => getWindowDates(window, anchor, data.weekStartsOn), [window, anchor, data.weekStartsOn]);
  const rows = useMemo<DisplayRow[]>(() => activeArea?.goals.filter(goal => !goal.archivedAt).flatMap(goal => [
      { key: goal.id, kind: 'goal' as const, name: goal.name },
      ...goal.metrics.map(metric => ({ key: metric.id, kind: 'metric' as const, metric })),
    ]) ?? [], [activeArea]);
  const visibleCount = Math.max(5, (stdout?.rows ?? 24) - (window === 'today' ? 18 : 17));
  const selectedRow = selectedMetric ? rows.findIndex(row => row.key === selectedMetric.id) : 0;

  useEffect(() => {
    if (selectedRow < scroll) setScroll(selectedRow);
    else if (selectedRow >= scroll + visibleCount) {
      let next = selectedRow - visibleCount + 1;
      while (next > 0 && rows[next]?.kind === 'metric') next--;
      setScroll(next);
    }
  }, [selectedRow, scroll, visibleCount, rows]);

  useEffect(() => {
    writeGoalsHtmlReport(data);
  }, [data]);

  const saveValue = (metric: GoalMetric, raw: string) => {
    const value = metric.input === 'note' ? raw.trim() : Number(raw);
    if (metric.input === 'note' || Number.isFinite(value)) setData(setMetricValue(data, metric.id, anchor, value || undefined));
    setEditing(null);
    setIsTyping(false);
  };

  const moveWindow = (direction: number) => {
    if (window === 'today') setAnchor(date => {
      const next = addDays(date, direction);
      return next <= getTodayStr() ? next : date;
    });
    else if (window === 'week') setAnchor(date => addDays(date, direction * 7));
    else {
      const date = new Date(`${anchor}T00:00:00`);
      date.setMonth(date.getMonth() + direction);
      setAnchor(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`);
    }
  };

  useInput((input, key) => {
    if (editing || editingDayNote) {
      if (key.escape) {
        setEditing(null);
        setEditingDayNote(false);
        setIsTyping(false);
      }
      return;
    }

    if (key.tab) {
      const index = WINDOWS.indexOf(window);
      setWindow(WINDOWS[(index + (key.shift ? -1 : 1) + WINDOWS.length) % WINDOWS.length]!);
      setAnchor(getTodayStr());
    } else if (input === 'h' || key.leftArrow) {
      if (areas.length) setActiveAreaIndex(value => (value - 1 + areas.length) % areas.length);
      setSelected(0);
      setScroll(0);
    } else if (input === 'l' || key.rightArrow) {
      if (areas.length) setActiveAreaIndex(value => (value + 1) % areas.length);
      setSelected(0);
      setScroll(0);
    } else if (input === 'n') moveWindow(1);
    else if (input === 'p') moveWindow(-1);
    else if (input === 't') setAnchor(getTodayStr());
    else if (input === 'N' && window === 'today') {
      setEditingDayNote(true);
      setEditValue(data.dayNotes[anchor] ?? '');
      setIsTyping(true);
    }
    else if (input === 'j' || key.downArrow) setSelected(value => Math.min(metrics.length - 1, value + 1));
    else if (input === 'k' || key.upArrow) setSelected(value => Math.max(0, value - 1));
    else if (input === 'P' || input === 'E' || input === 'M') {
      const quality: DayQuality = input === 'P' ? 'perfect' : input === 'E' ? 'excused' : 'missed';
      const date = window === 'today' ? anchor : getTodayStr();
      setData(setDayQuality(data, date, data.dayQuality[date] === quality ? undefined : quality));
    } else if ((key.backspace || key.delete || input === '0') && selectedMetric && window === 'today') {
      setData(setMetricValue(data, selectedMetric.id, anchor, undefined));
    } else if (key.ctrl && (input === 'a' || input === 'x') && selectedMetric?.input === 'count' && window === 'today') {
      const current = Number(getMetricValue(data, selectedMetric.id, anchor)) || 0;
      setData(setMetricValue(data, selectedMetric.id, anchor, adjustCount(current, input === 'a' ? 1 : -1)));
    } else if ((key.return || input === 'x') && selectedMetric && window === 'today') {
      const current = getMetricValue(data, selectedMetric.id, anchor);
      if (selectedMetric.input === 'checkbox') {
        setData(setMetricValue(data, selectedMetric.id, anchor, current ? undefined : true));
      } else if (selectedMetric.input === 'count') {
        setData(setMetricValue(data, selectedMetric.id, anchor, adjustCount(current, 1)));
      } else {
        setEditing(selectedMetric);
        setEditValue(current === undefined ? '' : String(current));
        setIsTyping(true);
      }
    } else if (input === 'R') {
      const reportPath = writeGoalsHtmlReport(data);
      for (const opener of ['xdg-open', 'open', 'sensible-browser']) {
        if (spawnSync('which', [opener], { stdio: 'ignore' }).status === 0) {
          spawn(opener, [reportPath], { detached: true, stdio: 'ignore' }).unref();
          break;
        }
      }
    }
  });

  const streak = computeDayStreak(data);
  const recentDates = getRecentDates(28);
  const selectedDayIndex = window === 'today' ? recentDates.indexOf(anchor) : -1;
  const streakIndent = `DAY  ${streak.current}d · Best ${streak.best}d  `.length;

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box>
        {WINDOWS.map(item => (
          <Text key={item} bold={item === window} color={item === window ? 'cyan' : 'gray'}>
            {item === window ? '▔' : ' '}{item[0]!.toUpperCase() + item.slice(1)}{'  '}
          </Text>
        ))}
        <Box flexGrow={1} />
        <Text dimColor>{windowLabel(window, anchor, data.weekStartsOn)}{window === 'today' && data.dayNotes[anchor] ? ' · note' : ''}</Text>
      </Box>

      <Box marginTop={1}>
        <Text bold>DAY  </Text>
        <Text color={streak.current ? 'green' : 'gray'}>{streak.current}d</Text>
        <Text dimColor> · Best {streak.best}d  </Text>
        {recentDates.map(date => {
          const quality = data.dayQuality[date];
          return <Text key={date} color={quality ? QUALITY[quality].color : 'gray'} underline={window === 'today' && date === anchor}>{quality ? QUALITY[quality].glyph : '·'}</Text>;
        })}
      </Box>

      {window === 'today' && (
        <Box>
          <Text>{' '.repeat(streakIndent)}</Text>
          {selectedDayIndex >= 0 ? <Text color="cyan">{' '.repeat(selectedDayIndex)}▲</Text> : <Text color="cyan">↳</Text>}
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>AREAS  </Text>
        {areas.map((area, index) => (
          <Text key={area.id} bold={index === activeAreaIndex} color={index === activeAreaIndex ? 'cyan' : 'gray'}>
            {index === activeAreaIndex ? `[${area.name}]` : area.name}{'  '}
          </Text>
        ))}
        <Box flexGrow={1} />
        <Text dimColor>h/l · {activeAreaIndex + 1}/{areas.length}</Text>
      </Box>

      <Box flexDirection="column" marginTop={1}>
        {rows.slice(scroll, scroll + visibleCount).map(row => {
          if (row.kind === 'goal') return <Text key={row.key} bold color="white">◆ {row.name}</Text>;

          const isSelected = row.metric.id === selectedMetric?.id;
          if (window === 'today') {
            const raw = getMetricValue(data, row.metric.id, anchor);
            const shown = raw === undefined ? '·' : raw === true ? '✓' : String(raw);
            const hint = isSelected && row.metric.input === 'count' ? '  (C-a/C-x)' : '';
            return (
              <Text key={row.key} color={isSelected ? 'cyan' : undefined} bold={isSelected}>
                {isSelected ? '  › ' : '    '}{row.metric.name.slice(0, 24).padEnd(24)} {shown}{hint}
              </Text>
            );
          }

          if (row.metric.input === 'note') {
            const note = getLatestMetricNote(data, row.metric.id, dates.at(-1)!);
            return (
              <Text key={row.key} color={isSelected ? 'cyan' : undefined} bold={isSelected}>
                {isSelected ? '  › ' : '    '}{row.metric.name.slice(0, 20).padEnd(20)} {note ? `📝 ${note.slice(0, 22)}` : '·'}
              </Text>
            );
          }

          const value = aggregateMetric(row.metric, data, dates);
          const target = getMetricTarget(row.metric, window, dates.length);
          return (
            <Text key={row.key} color={isSelected ? 'cyan' : undefined} bold={isSelected}>
              {isSelected ? '  › ' : '    '}{row.metric.name.slice(0, 20).padEnd(20)} {valueLabel(row.metric, value, target).padEnd(11)} {progressBar(value, target)}
            </Text>
          );
        })}
      </Box>

      {rows.length > visibleCount && <Text dimColor>{activeArea?.name} · rows {scroll + 1}-{Math.min(rows.length, scroll + visibleCount)} of {rows.length}</Text>}

      {editing && (
        <Box marginTop={1}>
          <Text color="cyan">{editing.name}: </Text>
          <TextInput value={editValue} onChange={setEditValue} onSubmit={value => saveValue(editing, value)} />
          <Text dimColor>  Enter save · Esc cancel</Text>
        </Box>
      )}

      {editingDayNote && (
        <Box marginTop={1}>
          <Text color="cyan">Note {anchor}: </Text>
          <TextInput
            value={editValue}
            onChange={setEditValue}
            onSubmit={value => {
              setData(setDayNote(data, anchor, value));
              setEditingDayNote(false);
              setIsTyping(false);
            }}
          />
          <Text dimColor>  Enter save · empty clears · Esc cancel</Text>
        </Box>
      )}
    </Box>
  );
}
