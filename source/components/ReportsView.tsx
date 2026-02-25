import React, { useState, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import { Heatmap } from './Heatmap.js';
import { colors } from '../lib/theme.js';
import { BarChart } from './BarChart.js';
import {
  getDailyStats,
  getWeeklyStats,
  getTaskBreakdown,
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

const SECTION_NAMES = ['Today', 'Week', 'Projects', 'Tasks', 'Recent'];

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
      breakdown: getTaskBreakdown(allSessions),
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

  const { daily, weekly, breakdown, recentSessions, taskProjects } = data;

  const renderSection = (): React.ReactNode => {
    switch (selectedSection) {
      case 0: return <TodaySection daily={daily} />;
      case 1: return <WeekSection weekly={weekly} />;
      case 2: return <ProjectsSection breakdown={breakdown} />;
      case 3: return <TaskProjectsSection taskProjects={taskProjects} />;
      case 4: return <RecentSection sessions={recentSessions} />;
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
