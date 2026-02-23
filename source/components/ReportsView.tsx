import React, { useState, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import { Heatmap } from './Heatmap.js';
import { BarChart } from './BarChart.js';
import { Sparkline } from './Sparkline.js';
import { Achievements } from './Achievements.js';
import {
  getDailyStats,
  getWeeklyStats,
  getDeepWorkRatio,
  getTaskBreakdown,
  getStreaks,
} from '../lib/stats.js';
import { loadSessions } from '../lib/store.js';

function formatMinutes(minutes: number): string {
  if (minutes < 1) return '0m';
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${Math.round(minutes)}m`;
}

function getWeekStartDate(): string {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - daysFromMonday);
  const y = weekStart.getFullYear();
  const m = String(weekStart.getMonth() + 1).padStart(2, '0');
  const d = String(weekStart.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getTodayString(): string {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const d = String(today.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function ReportsView() {
  const [scrollOffset, setScrollOffset] = useState(0);

  useInput((input, key) => {
    if (input === 'j' || key.downArrow) {
      setScrollOffset(prev => prev + 1);
    }
    if (input === 'k' || key.upArrow) {
      setScrollOffset(prev => Math.max(0, prev - 1));
    }
  });

  const data = useMemo(() => {
    const today = getTodayString();
    const weekStart = getWeekStartDate();
    const allSessions = loadSessions();
    return {
      daily: getDailyStats(today),
      weekly: getWeeklyStats(weekStart),
      deepWork: getDeepWorkRatio(allSessions),
      breakdown: getTaskBreakdown(allSessions),
      streaks: getStreaks(),
      recentSessions: allSessions
        .filter(s => s.type === 'work' && s.status === 'completed')
        .slice(-10)
        .reverse(),
    };
  }, []);

  const { daily, weekly, deepWork, breakdown, streaks, recentSessions } = data;
  const trendArrow = deepWork.trend === 'up' ? '↑' : deepWork.trend === 'down' ? '↓' : '→';
  const trendColor = deepWork.trend === 'up' ? 'green' : deepWork.trend === 'down' ? 'red' : 'yellow';

  const projectItems = breakdown.byProject
    .filter(p => p.label !== '(untagged)')
    .slice(0, 5)
    .map(p => ({ label: p.label, value: p.minutes }));

  return (
    <Box flexDirection="column" flexGrow={1}>
      {/* Today */}
      <Box flexDirection="column" marginBottom={1}>
        <Text bold color="cyan">Today</Text>
        <Text dimColor>{'─'.repeat(36)}</Text>
        <Box marginLeft={1} flexDirection="column">
          <Box>
            <Text dimColor>Focus    </Text>
            <Text bold color="red">{formatMinutes(daily.focusMinutes)}</Text>
            <Text dimColor>  Break  </Text>
            <Text color="green">{formatMinutes(daily.breakMinutes)}</Text>
            <Text dimColor>  Sessions  </Text>
            <Text>{daily.sessionsCompleted}/{daily.sessionsTotal}</Text>
          </Box>
        </Box>
      </Box>

      {/* Weekly Heatmap */}
      <Box flexDirection="column" marginBottom={1}>
        <Text bold color="cyan">This Week</Text>
        <Text dimColor>{'─'.repeat(36)}</Text>
        <Box marginLeft={1} flexDirection="column">
          <Heatmap days={weekly.heatmap} />
          <Box marginTop={1}>
            <Text dimColor>Total </Text>
            <Text bold>{formatMinutes(weekly.totalFocusMinutes)}</Text>
            <Text dimColor>  Avg </Text>
            <Text>{formatMinutes(weekly.avgSessionLength)}</Text>
            <Text dimColor>  Streak </Text>
            <Text color="yellow">{weekly.longestStreak}d</Text>
          </Box>
        </Box>
      </Box>

      {/* Deep Work */}
      <Box flexDirection="column" marginBottom={1}>
        <Text bold color="cyan">Deep Work</Text>
        <Text dimColor>{'─'.repeat(36)}</Text>
        <Box marginLeft={1}>
          <Text bold>{Math.round(deepWork.ratio * 100)}%</Text>
          <Text dimColor> focus  </Text>
          <Text color={trendColor}>{trendArrow}</Text>
          <Text dimColor>  7d: </Text>
          <Sparkline values={deepWork.trendValues} color="cyan" showTrend={false} />
        </Box>
      </Box>

      {/* Streaks */}
      <Box flexDirection="column" marginBottom={1}>
        <Text bold color="cyan">Streaks</Text>
        <Text dimColor>{'─'.repeat(36)}</Text>
        <Box marginLeft={1}>
          <Text dimColor>Current </Text>
          <Text bold color="yellow">{streaks.currentStreak}d</Text>
          <Text dimColor>  Best </Text>
          <Text>{streaks.personalBest}d</Text>
          <Text dimColor>  Deep work/wk </Text>
          <Text>{formatMinutes(streaks.deepWorkHoursThisWeek * 60)}</Text>
        </Box>
      </Box>

      {/* Projects */}
      {projectItems.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text bold color="cyan">By Project</Text>
          <Text dimColor>{'─'.repeat(36)}</Text>
          <Box marginLeft={1}>
            <BarChart items={projectItems} unit="min" color="cyan" maxBarWidth={24} />
          </Box>
        </Box>
      )}

      {/* Recent sessions */}
      <Box flexDirection="column" marginBottom={1}>
        <Text bold color="cyan">Recent Sessions</Text>
        <Text dimColor>{'─'.repeat(36)}</Text>
        {recentSessions.length === 0 ? (
          <Box marginLeft={1}><Text dimColor>No sessions yet.</Text></Box>
        ) : (
          recentSessions.map(s => (
            <Box key={s.id} marginLeft={1}>
              <Text dimColor>{s.startedAt.slice(0, 10)} </Text>
              <Text dimColor>{s.startedAt.slice(11, 16)} </Text>
              <Text>{formatMinutes(s.durationActual / 60)}</Text>
              {s.label && <Text color="white"> {s.label}</Text>}
              {s.project && <Text color="cyan"> #{s.project}</Text>}
            </Box>
          ))
        )}
      </Box>

      {/* Achievements */}
      <Box flexDirection="column">
        <Text bold color="cyan">Achievements</Text>
        <Text dimColor>{'─'.repeat(36)}</Text>
        <Box marginLeft={1}>
          <Achievements />
        </Box>
      </Box>
    </Box>
  );
}
