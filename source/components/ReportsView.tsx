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

const SECTION_NAMES = ['Today', 'Week', 'Deep Work', 'Streaks', 'Projects', 'Tasks', 'Recent', 'Achievements'];

export function ReportsView() {
  const [selectedSection, setSelectedSection] = useState(0);
  const totalSections = SECTION_NAMES.length;

  const data = useMemo(() => {
    const today = getTodayString();
    const weekStart = getWeekStartDate();
    const allSessions = loadSessions();
    const tasks = loadTasks();

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

  useInput((input, key) => {
    if (input === 'l' || key.rightArrow) {
      setSelectedSection(prev => Math.min(prev + 1, totalSections - 1));
    }
    if (input === 'h' || key.leftArrow) {
      setSelectedSection(prev => Math.max(0, prev - 1));
    }
    if (input === 'j' || key.downArrow) {
      setSelectedSection(prev => Math.min(prev + 1, totalSections - 1));
    }
    if (input === 'k' || key.upArrow) {
      setSelectedSection(prev => Math.max(0, prev - 1));
    }
  });

  const { daily, weekly, deepWork, breakdown, streaks, recentSessions, taskProjects } = data;

  const renderSection = (): React.ReactNode => {
    switch (selectedSection) {
      case 0: return <TodaySection daily={daily} />;
      case 1: return <WeekSection weekly={weekly} />;
      case 2: return <DeepWorkSection deepWork={deepWork} />;
      case 3: return <StreaksSection streaks={streaks} />;
      case 4: return <ProjectsSection breakdown={breakdown} />;
      case 5: return <TaskProjectsSection taskProjects={taskProjects} />;
      case 6: return <RecentSection sessions={recentSessions} />;
      case 7: return <Achievements />;
      default: return null;
    }
  };

  return (
    <Box flexDirection="column" flexGrow={1}>
      {/* Tab bar */}
      <Box marginBottom={1}>
        {SECTION_NAMES.map((name, i) => (
          <React.Fragment key={name}>
            {i > 0 && <Text dimColor> </Text>}
            <Text
              bold={i === selectedSection}
              color={i === selectedSection ? 'yellow' : 'gray'}
              underline={i === selectedSection}
            >
              {name}
            </Text>
          </React.Fragment>
        ))}
      </Box>

      {/* Active section content */}
      <Box flexDirection="column" flexGrow={1} paddingLeft={1}>
        {renderSection()}
      </Box>
    </Box>
  );
}

// --- Section components ---

function TodaySection({ daily }: { daily: ReturnType<typeof getDailyStats> }) {
  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color={colors.focus}>{formatMinutes(daily.focusMinutes)}</Text>
        <Text dimColor> focus</Text>
      </Box>
      <Box>
        <Box width={20}>
          <Text dimColor>Break time</Text>
        </Box>
        <Text color={colors.break}>{formatMinutes(daily.breakMinutes)}</Text>
      </Box>
      <Box>
        <Box width={20}>
          <Text dimColor>Sessions</Text>
        </Box>
        <Text>{daily.sessionsCompleted}</Text>
        <Text dimColor>/{daily.sessionsTotal}</Text>
      </Box>
    </Box>
  );
}

function WeekSection({ weekly }: { weekly: ReturnType<typeof getWeeklyStats> }) {
  return (
    <Box flexDirection="column">
      <Heatmap days={weekly.heatmap} />
      <Box marginTop={1}>
        <Box width={20}>
          <Text dimColor>Total focus</Text>
        </Box>
        <Text bold>{formatMinutes(weekly.totalFocusMinutes)}</Text>
      </Box>
      <Box>
        <Box width={20}>
          <Text dimColor>Avg session</Text>
        </Box>
        <Text>{formatMinutes(weekly.avgSessionLength)}</Text>
      </Box>
      <Box>
        <Box width={20}>
          <Text dimColor>Longest streak</Text>
        </Box>
        <Text color={colors.highlight}>{weekly.longestStreak}d</Text>
      </Box>
    </Box>
  );
}

function DeepWorkSection({ deepWork }: { deepWork: ReturnType<typeof getDeepWorkRatio> }) {
  const trendArrow = deepWork.trend === 'up' ? '↑' : deepWork.trend === 'down' ? '↓' : '→';
  const trendColor = deepWork.trend === 'up' ? 'green' : deepWork.trend === 'down' ? 'red' : 'yellow';

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold>{Math.round(deepWork.ratio * 100)}%</Text>
        <Text dimColor> focus ratio </Text>
        <Text color={trendColor}>{trendArrow}</Text>
      </Box>
      <Box>
        <Text dimColor>7-day trend  </Text>
        <Sparkline values={deepWork.trendValues} color="cyan" showTrend={false} />
      </Box>
    </Box>
  );
}

function StreaksSection({ streaks }: { streaks: ReturnType<typeof getStreaks> }) {
  return (
    <Box flexDirection="column">
      <Box>
        <Box width={20}>
          <Text dimColor>Current streak</Text>
        </Box>
        <Text bold color={colors.highlight}>{streaks.currentStreak}d</Text>
      </Box>
      <Box>
        <Box width={20}>
          <Text dimColor>Personal best</Text>
        </Box>
        <Text>{streaks.personalBest}d</Text>
      </Box>
      <Box>
        <Box width={20}>
          <Text dimColor>Deep work/wk</Text>
        </Box>
        <Text>{formatMinutes(streaks.deepWorkHoursThisWeek * 60)}</Text>
      </Box>
    </Box>
  );
}

function ProjectsSection({ breakdown }: { breakdown: ReturnType<typeof getTaskBreakdown> }) {
  const projectItems = breakdown.byProject
    .filter(p => p.label !== '(untagged)')
    .slice(0, 8)
    .map(p => ({ label: p.label, value: p.minutes }));

  if (projectItems.length === 0) {
    return <Text dimColor>No project data yet. Tag sessions with #project.</Text>;
  }

  return <BarChart items={projectItems} unit="min" color="cyan" maxBarWidth={24} />;
}

function TaskProjectsSection({ taskProjects }: { taskProjects: [string, { total: number; completed: number; pomodoros: number }][] }) {
  if (taskProjects.length === 0) {
    return <Text dimColor>No projects yet. Add #project to tasks.</Text>;
  }

  return (
    <Box flexDirection="column">
      {taskProjects.map(([name, stats]) => (
        <Box key={name}>
          <Box width={16}>
            <Text color="cyan">#{name}</Text>
          </Box>
          <Box width={14}>
            <Text>{stats.completed}/{stats.total} tasks</Text>
          </Box>
          <Text dimColor>{stats.pomodoros} pom</Text>
        </Box>
      ))}
    </Box>
  );
}

function RecentSection({ sessions }: { sessions: ReturnType<typeof loadSessions> }) {
  if (sessions.length === 0) {
    return <Text dimColor>No sessions yet.</Text>;
  }

  return (
    <Box flexDirection="column">
      {sessions.map(s => (
        <Box key={s.id}>
          <Box width={12}>
            <Text dimColor>{s.startedAt.slice(0, 10)}</Text>
          </Box>
          <Box width={7}>
            <Text dimColor>{s.startedAt.slice(11, 16)}</Text>
          </Box>
          <Box width={7}>
            <Text bold>{formatMinutes(s.durationActual / 60)}</Text>
          </Box>
          {s.label && <Text> {s.label}</Text>}
          {s.project && <Text color="cyan"> #{s.project}</Text>}
        </Box>
      ))}
    </Box>
  );
}
