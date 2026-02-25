import React, { useState, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import { listWeeks, loadWeek, buildDailyEntries, getWeekDates, DAY_NAMES } from '../lib/tracker.js';

type GraphType = 'deepwork' | 'exercise' | 'all';

const GRAPH_TABS: { key: GraphType; label: string }[] = [
  { key: 'deepwork', label: 'Deep Work' },
  { key: 'exercise', label: 'Exercise' },
  { key: 'all',      label: 'All' },
];

function deepWorkIntensity(hours: number): string {
  if (hours === 0) return '░';
  if (hours < 1)   return '▒';
  if (hours < 3)   return '▓';
  return '█';
}

function exerciseIntensity(hours: number): string {
  return hours > 0 ? '█' : '░';
}

function HeatmapGrid({
  weekStrs,
  dayEntries,
  type,
}: {
  weekStrs: string[];
  dayEntries: Map<string, { deepHours: number; exerciseHours: number }>;
  type: 'deepwork' | 'exercise';
}) {
  // Build columns (each week = one column)
  // Rows = Mon..Sun (0..6)
  const weeksToShow = weekStrs.slice(0, 26).reverse(); // oldest first, max 26 weeks

  // Group each week's dates
  const weekDateGroups = weeksToShow.map(ws => {
    const w = loadWeek(ws);
    return w ? getWeekDates(w.start) : [];
  });

  return (
    <Box flexDirection="column">
      {DAY_NAMES.map((dayName, dayIdx) => (
        <Box key={dayName}>
          <Box width={5}><Text dimColor>{dayName}</Text></Box>
          {weekDateGroups.map((dates, wi) => {
            const date = dates[dayIdx];
            if (!date) return <Text key={wi} dimColor>{'· '}</Text>;
            const entry = dayEntries.get(date);
            if (!entry) return <Text key={wi} dimColor>{'· '}</Text>;
            const hours = type === 'deepwork' ? entry.deepHours : entry.exerciseHours;
            const char = type === 'deepwork' ? deepWorkIntensity(hours) : exerciseIntensity(hours);
            const color = type === 'deepwork'
              ? (hours === 0 ? 'gray' : hours < 1 ? 'cyan' : hours < 3 ? 'cyan' : 'cyanBright')
              : (hours > 0 ? 'green' : 'gray');
            return <Text key={wi} color={color as any} bold={hours >= 3}>{char}{' '}</Text>;
          })}
        </Box>
      ))}
    </Box>
  );
}

export function GraphsView() {
  const [activeGraph, setActiveGraph] = useState<GraphType>('deepwork');

  const { weekStrs, dayEntries, totals } = useMemo(() => {
    const weekStrs = listWeeks();
    const weeks = weekStrs.map(ws => loadWeek(ws)).filter(Boolean) as any[];
    const dayEntries = buildDailyEntries(weeks);

    let totalDeep = 0, totalExercise = 0;
    for (const e of dayEntries.values()) {
      totalDeep += e.deepHours;
      totalExercise += e.exerciseHours;
    }
    return { weekStrs, dayEntries, totals: { deep: totalDeep, exercise: totalExercise } };
  }, []);

  useInput((_input, key) => {
    if (key.tab) {
      setActiveGraph(prev => {
        const idx = GRAPH_TABS.findIndex(t => t.key === prev);
        return GRAPH_TABS[(idx + 1) % GRAPH_TABS.length]!.key;
      });
    }
  });

  if (weekStrs.length === 0) {
    return (
      <Box flexDirection="column" flexGrow={1}>
        <Text dimColor>No tracker data yet.</Text>
        <Box marginTop={1}>
          <Text>Go to <Text bold color="cyan">Tracker (9)</Text> and press <Text bold color="cyan">n</Text> to start a week.</Text>
        </Box>
      </Box>
    );
  }

  const renderGraph = () => {
    if (activeGraph === 'all') {
      return (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text bold color="cyan">Deep Work</Text>
            <Text dimColor>  {totals.deep.toFixed(1)}h total</Text>
          </Box>
          <HeatmapGrid weekStrs={weekStrs} dayEntries={dayEntries} type="deepwork" />
          <Box marginTop={1} marginBottom={1}>
            <Text bold color="green">Exercise</Text>
            <Text dimColor>  {totals.exercise.toFixed(1)}h total</Text>
          </Box>
          <HeatmapGrid weekStrs={weekStrs} dayEntries={dayEntries} type="exercise" />
        </Box>
      );
    }
    return (
      <Box flexDirection="column">
        <HeatmapGrid
          weekStrs={weekStrs}
          dayEntries={dayEntries}
          type={activeGraph}
        />
        <Box marginTop={1}>
          <Text dimColor>less </Text>
          <Text color="gray">░ </Text>
          <Text color="cyan">▒ ▓ </Text>
          <Text color="cyanBright" bold>█ </Text>
          <Text dimColor> more</Text>
          {activeGraph === 'deepwork' && (
            <Text dimColor>{'  '}0h  1h  3h  5h+{'  '}Total: {totals.deep.toFixed(1)}h</Text>
          )}
          {activeGraph === 'exercise' && (
            <Text dimColor>{'  '}Total: {totals.exercise.toFixed(1)}h  Weeks tracked: {weekStrs.length}</Text>
          )}
        </Box>
      </Box>
    );
  };

  return (
    <Box flexDirection="column" flexGrow={1}>
      {/* Tab bar */}
      <Box marginBottom={1}>
        {GRAPH_TABS.map((tab, i) => (
          <React.Fragment key={tab.key}>
            {i > 0 && <Text dimColor>  </Text>}
            <Text
              bold={tab.key === activeGraph}
              color={tab.key === activeGraph ? 'yellow' : 'gray'}
              underline={tab.key === activeGraph}
            >
              {tab.label}
            </Text>
          </React.Fragment>
        ))}
      </Box>

      {renderGraph()}
    </Box>
  );
}
