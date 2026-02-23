import React from 'react';
import { Box, Text } from 'ink';
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
  getSessionsForDateRange,
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
  const dayOfWeek = today.getDay(); // 0 = Sun
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

function SectionHeader({ title }: { title: string }) {
  return (
    <Box marginBottom={0} marginTop={1}>
      <Text bold color="cyan">{title}</Text>
    </Box>
  );
}

function Divider() {
  return (
    <Box>
      <Text dimColor>{'─'.repeat(40)}</Text>
    </Box>
  );
}

export function StatsView() {
  const today = getTodayString();
  const weekStart = getWeekStartDate();

  const daily = getDailyStats(today);
  const weekly = getWeeklyStats(weekStart);
  const allSessions = loadSessions();
  const deepWork = getDeepWorkRatio(allSessions);
  const taskBreakdown = getTaskBreakdown(allSessions);
  const streaks = getStreaks();

  const trendArrow = deepWork.trend === 'up' ? '↑' : deepWork.trend === 'down' ? '↓' : '→';
  const trendColor = deepWork.trend === 'up' ? 'green' : deepWork.trend === 'down' ? 'red' : 'yellow';

  const projectItems = taskBreakdown.byProject
    .filter(p => p.label !== '(untagged)')
    .slice(0, 6)
    .map(p => ({ label: p.label, value: p.minutes }));

  const tagItems = taskBreakdown.byTag
    .filter(t => t.label !== '(untagged)')
    .slice(0, 6)
    .map(t => ({ label: t.label, value: t.minutes }));

  return (
    <Box flexDirection="column" paddingX={1} paddingY={0}>

      {/* ── Daily Summary ── */}
      <SectionHeader title="Today" />
      <Divider />
      <Box flexDirection="column" marginLeft={2} marginTop={0}>
        <Box>
          <Text dimColor>Focus time   </Text>
          <Text bold color="red">{formatMinutes(daily.focusMinutes)}</Text>
        </Box>
        <Box>
          <Text dimColor>Break time   </Text>
          <Text color="green">{formatMinutes(daily.breakMinutes)}</Text>
        </Box>
        <Box>
          <Text dimColor>Sessions     </Text>
          <Text>{daily.sessionsCompleted}/{daily.sessionsTotal} completed</Text>
          {daily.sessionsTotal > 0 && (
            <Text dimColor>  ({Math.round(daily.completionRate * 100)}%)</Text>
          )}
        </Box>
      </Box>

      {/* ── Weekly Heatmap ── */}
      <SectionHeader title="This Week" />
      <Divider />
      <Box marginLeft={2} marginTop={0} flexDirection="column">
        <Heatmap days={weekly.heatmap} />
        <Box marginTop={1}>
          <Text dimColor>Total  </Text>
          <Text bold>{formatMinutes(weekly.totalFocusMinutes)}</Text>
          <Text dimColor>   Avg session  </Text>
          <Text>{formatMinutes(weekly.avgSessionLength)}</Text>
          <Text dimColor>   Streak  </Text>
          <Text color="yellow">{weekly.longestStreak}d</Text>
        </Box>
      </Box>

      {/* ── Deep Work Ratio ── */}
      <SectionHeader title="Deep Work Ratio" />
      <Divider />
      <Box marginLeft={2} flexDirection="column">
        <Box>
          <Text bold>{Math.round(deepWork.ratio * 100)}%</Text>
          <Text dimColor>  focus of active time  </Text>
          <Text color={trendColor}>{trendArrow}</Text>
          <Text dimColor>  7d trend: </Text>
          <Sparkline values={deepWork.trendValues} color="cyan" showTrend={false} />
        </Box>
        <Box>
          <Text dimColor>{formatMinutes(deepWork.focusMinutes)} focus</Text>
          <Text dimColor>  /  </Text>
          <Text dimColor>{formatMinutes(deepWork.totalActiveMinutes)} total active</Text>
        </Box>
      </Box>

      {/* ── Task Breakdown ── */}
      {(projectItems.length > 0 || tagItems.length > 0) && (
        <>
          <SectionHeader title="Focus Breakdown" />
          <Divider />
          <Box marginLeft={2} flexDirection="column">
            {projectItems.length > 0 && (
              <>
                <Text dimColor>by project</Text>
                <BarChart items={projectItems} unit="min" color="cyan" maxBarWidth={28} />
              </>
            )}
            {tagItems.length > 0 && (
              <Box marginTop={projectItems.length > 0 ? 1 : 0} flexDirection="column">
                <Text dimColor>by tag</Text>
                <BarChart items={tagItems} unit="min" color="blue" maxBarWidth={28} />
              </Box>
            )}
          </Box>
        </>
      )}

      {/* ── Streaks ── */}
      <SectionHeader title="Streaks" />
      <Divider />
      <Box marginLeft={2} flexDirection="column">
        <Box>
          <Text dimColor>Current streak    </Text>
          <Text bold color="yellow">{streaks.currentStreak}</Text>
          <Text dimColor> days</Text>
        </Box>
        <Box>
          <Text dimColor>Personal best     </Text>
          <Text bold>{streaks.personalBest}</Text>
          <Text dimColor> days</Text>
        </Box>
        <Box>
          <Text dimColor>Deep work (week)  </Text>
          <Text bold>{formatMinutes(streaks.deepWorkHoursThisWeek * 60)}</Text>
        </Box>
      </Box>

      {/* ── Achievements ── */}
      <SectionHeader title="Achievements" />
      <Divider />
      <Box marginLeft={2}>
        <Achievements />
      </Box>

    </Box>
  );
}
