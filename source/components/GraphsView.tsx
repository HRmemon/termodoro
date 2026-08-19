import { useEffect, useMemo, useState } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import TextInput from 'ink-text-input';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import type { Keymap } from '../lib/keymap.js';
import {
  adjustCount,
  aggregateMetric,
  allMetrics,
  computeDayStreak,
  getMetricTarget,
  getMetricValue,
  getRecentDates,
  getWindowDates,
  loadGoals,
  setDayQuality,
  setMetricValue,
  type DayQuality,
  type GoalMetric,
  type GoalsData,
  type GoalWindow,
} from '../lib/goals.js';
import { addDays, getTodayStr, MONTH_NAMES_FULL } from '../lib/date-utils.js';
import { generateGoalsHtmlReport } from '../lib/goals-report.js';

const WINDOWS: GoalWindow[] = ['today', 'week', 'month'];
const QUALITY: Record<DayQuality, { glyph: string; color: string; label: string }> = {
  perfect: { glyph: '■', color: 'green', label: 'Perfect' },
  excused: { glyph: '■', color: 'yellow', label: 'Missed (reason)' },
  missed: { glyph: '■', color: 'red', label: 'Missed (no reason)' },
};

type DisplayRow =
  | { key: string; kind: 'area'; name: string }
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

function windowLabel(window: GoalWindow, anchor: string): string {
  if (window === 'today') return anchor === getTodayStr() ? 'Today' : anchor;
  const dates = getWindowDates(window, anchor);
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
  const [selected, setSelected] = useState(0);
  const [scroll, setScroll] = useState(0);
  const [editing, setEditing] = useState<GoalMetric | null>(null);
  const [editValue, setEditValue] = useState('');
  const { stdout } = useStdout();

  const metrics = useMemo(() => allMetrics(data), [data]);
  const selectedMetric = metrics[selected];
  const dates = useMemo(() => getWindowDates(window, anchor), [window, anchor]);
  const rows = useMemo<DisplayRow[]>(() => data.areas.filter(area => !area.archivedAt).flatMap(area => [
    { key: area.id, kind: 'area' as const, name: area.name },
    ...area.goals.filter(goal => !goal.archivedAt).flatMap(goal => [
      { key: goal.id, kind: 'goal' as const, name: goal.name },
      ...goal.metrics.map(metric => ({ key: metric.id, kind: 'metric' as const, metric })),
    ]),
  ]), [data]);
  const visibleCount = Math.max(5, (stdout?.rows ?? 24) - 16);
  const selectedRow = selectedMetric ? rows.findIndex(row => row.key === selectedMetric.id) : 0;

  useEffect(() => {
    if (selectedRow < scroll) setScroll(selectedRow);
    else if (selectedRow >= scroll + visibleCount) setScroll(selectedRow - visibleCount + 1);
  }, [selectedRow, scroll, visibleCount]);

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
    if (editing) {
      if (key.escape) {
        setEditing(null);
        setIsTyping(false);
      }
      return;
    }

    if (input === 'h' || key.leftArrow) {
      const index = WINDOWS.indexOf(window);
      setWindow(WINDOWS[Math.max(0, index - 1)]!);
      setAnchor(getTodayStr());
    } else if (input === 'l' || key.rightArrow) {
      const index = WINDOWS.indexOf(window);
      setWindow(WINDOWS[Math.min(WINDOWS.length - 1, index + 1)]!);
      setAnchor(getTodayStr());
    } else if (input === 'n') moveWindow(1);
    else if (input === 'p') moveWindow(-1);
    else if (input === 't') setAnchor(getTodayStr());
    else if (input === 'j' || key.downArrow) setSelected(value => Math.min(metrics.length - 1, value + 1));
    else if (input === 'k' || key.upArrow) setSelected(value => Math.max(0, value - 1));
    else if (input === 'P' || input === 'E' || input === 'M') {
      const quality: DayQuality = input === 'P' ? 'perfect' : input === 'E' ? 'excused' : 'missed';
      const date = window === 'today' ? anchor : getTodayStr();
      setData(setDayQuality(data, date, data.dayQuality[date] === quality ? undefined : quality));
    } else if ((key.backspace || key.delete || input === '0') && selectedMetric && window === 'today') {
      setData(setMetricValue(data, selectedMetric.id, anchor, undefined));
    } else if ((input === '+' || input === '-') && selectedMetric?.input === 'count' && window === 'today') {
      const current = Number(getMetricValue(data, selectedMetric.id, anchor)) || 0;
      setData(setMetricValue(data, selectedMetric.id, anchor, adjustCount(current, input === '+' ? 1 : -1)));
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
      const tmpPath = path.join(os.tmpdir(), `pomodorocli-goals-${Date.now()}.html`);
      fs.writeFileSync(tmpPath, generateGoalsHtmlReport());
      for (const opener of ['xdg-open', 'open', 'sensible-browser']) {
        if (spawnSync('which', [opener], { stdio: 'ignore' }).status === 0) {
          spawn(opener, [tmpPath], { detached: true, stdio: 'ignore' }).unref();
          break;
        }
      }
    }
  });

  const streak = computeDayStreak(data);
  const recentDates = getRecentDates(28);
  const qualityDate = window === 'today' ? anchor : getTodayStr();
  const shownQuality = data.dayQuality[qualityDate];

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box>
        {WINDOWS.map(item => (
          <Text key={item} bold={item === window} color={item === window ? 'cyan' : 'gray'}>
            {item === window ? '▔' : ' '}{item[0]!.toUpperCase() + item.slice(1)}{'  '}
          </Text>
        ))}
        <Box flexGrow={1} />
        <Text dimColor>{windowLabel(window, anchor)}</Text>
      </Box>

      <Box marginTop={1}>
        <Text bold>DAY  </Text>
        <Text color={streak.current ? 'green' : 'gray'}>{streak.current}d</Text>
        <Text dimColor> · Best {streak.best}d  </Text>
        {recentDates.map(date => {
          const quality = data.dayQuality[date];
          return <Text key={date} color={quality ? QUALITY[quality].color : 'gray'}>{quality ? QUALITY[quality].glyph : '·'}</Text>;
        })}
      </Box>
      <Text dimColor>
        {qualityDate === getTodayStr() ? 'Today' : qualityDate}: {shownQuality ? QUALITY[shownQuality].label : 'unchecked'} · P:Perfect E:Reason M:Missed
      </Text>

      <Box flexDirection="column" marginTop={1}>
        {rows.slice(scroll, scroll + visibleCount).map(row => {
          if (row.kind === 'area') return <Text key={row.key} bold color="cyan">{row.name}</Text>;
          if (row.kind === 'goal') return <Text key={row.key} bold>  {row.name}</Text>;

          const isSelected = row.metric.id === selectedMetric?.id;
          if (window === 'today') {
            const raw = getMetricValue(data, row.metric.id, anchor);
            const shown = raw === undefined ? '·' : raw === true ? '✓' : String(raw);
            const hint = isSelected && row.metric.input === 'count' ? '  (+/-)' : '';
            return (
              <Text key={row.key} color={isSelected ? 'cyan' : undefined} bold={isSelected}>
                {isSelected ? '  › ' : '    '}{row.metric.name.slice(0, 24).padEnd(24)} {shown}{hint}
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

      {rows.length > visibleCount && <Text dimColor>Showing {scroll + 1}-{Math.min(rows.length, scroll + visibleCount)} of {rows.length}</Text>}

      {editing && (
        <Box marginTop={1}>
          <Text color="cyan">{editing.name}: </Text>
          <TextInput value={editValue} onChange={setEditValue} onSubmit={value => saveValue(editing, value)} />
          <Text dimColor>  Enter save · Esc cancel</Text>
        </Box>
      )}
    </Box>
  );
}
