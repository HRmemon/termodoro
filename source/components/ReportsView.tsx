import React, { useState, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import { Heatmap } from './Heatmap.js';
import { colors } from '../lib/theme.js';
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
import { loadTasks } from '../lib/tasks.js';
import { useFullScreen } from '../hooks/useFullScreen.js';

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
  const [selectedSection, setSelectedSection] = useState(0);
  const { rows } = useFullScreen();

  const data = useMemo(() => {
    const today = getTodayString();
    const weekStart = getWeekStartDate();
    const allSessions = loadSessions();
    const tasks = loadTasks();

    // Task-based project breakdown
    const projectMap = new Map<string, { total: number; completed: number; pomodoros: number }>();
    for (const task of tasks) {
      const proj = task.project ?? '(none)';
      const entry = projectMap.get(proj) ?? { total: 0, completed: 0, pomodoros: 0 };
      entry.total++;
      if (task.completed) entry.completed++;
      entry.pomodoros += task.completedPomodoros;
      projectMap.set(proj, entry);
    }

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
      taskProjects: [...projectMap.entries()]
        .filter(([name]) => name !== '(none)')
        .sort((a, b) => b[1].pomodoros - a[1].pomodoros),
    };
  }, []);

  const sectionNames = ['Today', 'This Week', 'Deep Work', 'Streaks', 'By Project', 'Task Projects', 'Recent Sessions', 'Achievements'];
  const totalSections = sectionNames.length;
  // Show a window of sections based on terminal height
  const maxVisible = Math.max(3, Math.floor((rows - 4) / 6));

  useInput((input, key) => {
    if (input === 'j' || key.downArrow) {
      setSelectedSection(prev => Math.min(prev + 1, totalSections - 1));
    }
    if (input === 'k' || key.upArrow) {
      setSelectedSection(prev => Math.max(0, prev - 1));
    }
  });

  const { daily, weekly, deepWork, breakdown, streaks, recentSessions, taskProjects } = data;
  const trendArrow = deepWork.trend === 'up' ? '↑' : deepWork.trend === 'down' ? '↓' : '→';
  const trendColor = deepWork.trend === 'up' ? 'green' : deepWork.trend === 'down' ? 'red' : 'yellow';

  const projectItems = breakdown.byProject
    .filter(p => p.label !== '(untagged)')
    .slice(0, 5)
    .map(p => ({ label: p.label, value: p.minutes }));

  // Windowed view
  const windowStart = Math.max(0, Math.min(selectedSection - Math.floor(maxVisible / 2), totalSections - maxVisible));
  const visibleRange = { start: windowStart, end: Math.min(windowStart + maxVisible, totalSections) };

  const renderSectionHeader = (idx: number, title: string) => {
    const isActive = idx === selectedSection;
    return (
      <Box key={`hdr-${idx}`}>
        <Text bold color={isActive ? 'yellow' : 'cyan'}>{isActive ? '▸ ' : '  '}{title}</Text>
      </Box>
    );
  };

  const sections: React.ReactNode[] = [];

  // 0: Today
  if (visibleRange.start <= 0 && visibleRange.end > 0) {
    sections.push(
      <Box key="today" flexDirection="column" marginBottom={1} borderStyle={selectedSection === 0 ? 'single' : undefined} borderColor="gray" paddingX={selectedSection === 0 ? 1 : 0}>
        {renderSectionHeader(0, 'Today')}
        <Box marginLeft={1} flexDirection="column">
          <Box>
            <Text dimColor>Focus    </Text>
            <Text bold color={colors.focus}>{formatMinutes(daily.focusMinutes)}</Text>
            <Text dimColor>  Break  </Text>
            <Text color={colors.break}>{formatMinutes(daily.breakMinutes)}</Text>
            <Text dimColor>  Sessions  </Text>
            <Text>{daily.sessionsCompleted}/{daily.sessionsTotal}</Text>
          </Box>
        </Box>
      </Box>
    );
  }

  // 1: This Week
  if (visibleRange.start <= 1 && visibleRange.end > 1) {
    sections.push(
      <Box key="week" flexDirection="column" marginBottom={1} borderStyle={selectedSection === 1 ? 'single' : undefined} borderColor="gray" paddingX={selectedSection === 1 ? 1 : 0}>
        {renderSectionHeader(1, 'This Week')}
        <Box marginLeft={1} flexDirection="column">
          <Heatmap days={weekly.heatmap} />
          <Box marginTop={1}>
            <Text dimColor>Total </Text>
            <Text bold>{formatMinutes(weekly.totalFocusMinutes)}</Text>
            <Text dimColor>  Avg </Text>
            <Text>{formatMinutes(weekly.avgSessionLength)}</Text>
            <Text dimColor>  Streak </Text>
            <Text color={colors.highlight}>{weekly.longestStreak}d</Text>
          </Box>
        </Box>
      </Box>
    );
  }

  // 2: Deep Work
  if (visibleRange.start <= 2 && visibleRange.end > 2) {
    sections.push(
      <Box key="deep" flexDirection="column" marginBottom={1} borderStyle={selectedSection === 2 ? 'single' : undefined} borderColor="gray" paddingX={selectedSection === 2 ? 1 : 0}>
        {renderSectionHeader(2, 'Deep Work')}
        <Box marginLeft={1}>
          <Text bold>{Math.round(deepWork.ratio * 100)}%</Text>
          <Text dimColor> focus  </Text>
          <Text color={trendColor}>{trendArrow}</Text>
          <Text dimColor>  7d: </Text>
          <Sparkline values={deepWork.trendValues} color="cyan" showTrend={false} />
        </Box>
      </Box>
    );
  }

  // 3: Streaks
  if (visibleRange.start <= 3 && visibleRange.end > 3) {
    sections.push(
      <Box key="streaks" flexDirection="column" marginBottom={1} borderStyle={selectedSection === 3 ? 'single' : undefined} borderColor="gray" paddingX={selectedSection === 3 ? 1 : 0}>
        {renderSectionHeader(3, 'Streaks')}
        <Box marginLeft={1}>
          <Text dimColor>Current </Text>
          <Text bold color={colors.highlight}>{streaks.currentStreak}d</Text>
          <Text dimColor>  Best </Text>
          <Text>{streaks.personalBest}d</Text>
          <Text dimColor>  Deep work/wk </Text>
          <Text>{formatMinutes(streaks.deepWorkHoursThisWeek * 60)}</Text>
        </Box>
      </Box>
    );
  }

  // 4: By Project (session-based)
  if (visibleRange.start <= 4 && visibleRange.end > 4 && projectItems.length > 0) {
    sections.push(
      <Box key="projects" flexDirection="column" marginBottom={1} borderStyle={selectedSection === 4 ? 'single' : undefined} borderColor="gray" paddingX={selectedSection === 4 ? 1 : 0}>
        {renderSectionHeader(4, 'By Project (Sessions)')}
        <Box marginLeft={1}>
          <BarChart items={projectItems} unit="min" color="cyan" maxBarWidth={24} />
        </Box>
      </Box>
    );
  }

  // 5: Task Projects
  if (visibleRange.start <= 5 && visibleRange.end > 5) {
    sections.push(
      <Box key="taskproj" flexDirection="column" marginBottom={1} borderStyle={selectedSection === 5 ? 'single' : undefined} borderColor="gray" paddingX={selectedSection === 5 ? 1 : 0}>
        {renderSectionHeader(5, 'By Project (Tasks)')}
        {taskProjects.length === 0 ? (
          <Box marginLeft={1}><Text dimColor>No projects yet. Add #project to tasks.</Text></Box>
        ) : (
          taskProjects.map(([name, stats]) => (
            <Box key={name} marginLeft={1}>
              <Text color="cyan">#{name}</Text>
              <Text dimColor>  {stats.completed}/{stats.total} tasks  </Text>
              <Text>{stats.pomodoros} pom</Text>
            </Box>
          ))
        )}
      </Box>
    );
  }

  // 6: Recent Sessions
  if (visibleRange.start <= 6 && visibleRange.end > 6) {
    sections.push(
      <Box key="recent" flexDirection="column" marginBottom={1} borderStyle={selectedSection === 6 ? 'single' : undefined} borderColor="gray" paddingX={selectedSection === 6 ? 1 : 0}>
        {renderSectionHeader(6, 'Recent Sessions')}
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
    );
  }

  // 7: Achievements
  if (visibleRange.start <= 7 && visibleRange.end > 7) {
    sections.push(
      <Box key="achieve" flexDirection="column" borderStyle={selectedSection === 7 ? 'single' : undefined} borderColor="gray" paddingX={selectedSection === 7 ? 1 : 0}>
        {renderSectionHeader(7, 'Achievements')}
        <Box marginLeft={1}>
          <Achievements />
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box marginBottom={1}>
        <Text dimColor>j/k to navigate sections ({selectedSection + 1}/{totalSections})</Text>
      </Box>
      {sections}
    </Box>
  );
}
