import React, { useState, useMemo } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import type { Keymap } from '../lib/keymap.js';
import { openSessionsInNvim } from '../lib/nvim-edit.js';
import { Heatmap } from './Heatmap.js';
import { Sparkline } from './Sparkline.js';
import { colors } from '../lib/theme.js';
import { BarChart } from './BarChart.js';
import {
  getDailyStats,
  getWeeklyStats,
  getTaskBreakdown,
  getDeepWorkRatio,
  getStreaks,
  getSessionsForDateRange,
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

function makeRatioBar(ratio: number, width: number): string {
  const filled = Math.round(ratio * width);
  const empty = width - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

const SECTION_NAMES = ['Today', 'Week', 'Projects', 'Tasks', 'Recent'];

export function ReportsView({ keymap }: { keymap?: Keymap }) {
  const [selectedSection, setSelectedSection] = useState(0);
  const [dataVersion, setDataVersion] = useState(0);
  const totalSections = SECTION_NAMES.length;
  const { stdout } = useStdout();
  const termWidth = stdout?.columns ?? 80;

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

    // Compute per-project recent activity sparkline (last 7 days)
    const projectActivity = new Map<string, number[]>();
    for (const task of tasks) {
      if (!task.project) continue;
      if (!projectActivity.has(task.project)) {
        const vals: number[] = [];
        for (let i = 6; i >= 0; i--) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          const daySessions = getSessionsForDateRange(ds, ds, allSessions)
            .filter(s => s.type === 'work' && s.status === 'completed' && s.project === task.project);
          vals.push(daySessions.length);
        }
        projectActivity.set(task.project, vals);
      }
    }

    const todaySessions = getSessionsForDateRange(today, today, allSessions);

    return {
      daily: getDailyStats(today, allSessions),
      weekly: getWeeklyStats(weekStart, allSessions),
      breakdown: getTaskBreakdown(allSessions),
      recentSessions: allSessions
        .filter(s => s.type === 'work' && s.status === 'completed')
        .slice(-10)
        .reverse(),
      taskProjects: [...projectMap.entries()]
        .filter(([name]) => name !== '(none)')
        .sort((a, b) => b[1].pomodoros - a[1].pomodoros),
      deepWork: getDeepWorkRatio(allSessions),
      streaks: getStreaks(allSessions),
      todaySessions,
      projectActivity,
    };
  }, [dataVersion]);

  useInput((input, key) => {
    const km = keymap;
    if ((km ? km.matches('stats.next_tab', input, key) : input === 'l') || key.rightArrow) {
      setSelectedSection(prev => Math.min(prev + 1, totalSections - 1));
    }
    if ((km ? km.matches('stats.prev_tab', input, key) : input === 'h') || key.leftArrow) {
      setSelectedSection(prev => Math.max(0, prev - 1));
    }
    if ((km ? km.matches('nav.down', input, key) : input === 'j') || key.downArrow) {
      setSelectedSection(prev => Math.min(prev + 1, totalSections - 1));
    }
    if ((km ? km.matches('nav.up', input, key) : input === 'k') || key.upArrow) {
      setSelectedSection(prev => Math.max(0, prev - 1));
    }
    if (input === 'e') {
      openSessionsInNvim();
      setDataVersion(v => v + 1);
    }
  });

  const { daily, weekly, breakdown, recentSessions, taskProjects, deepWork, streaks, todaySessions, projectActivity } = data;

  // Side-by-side layout requires at least ~72 content columns (80 - 20 sidebar - 8 padding/borders)
  const wideLayout = termWidth >= 80;

  const renderSection = (): React.ReactNode => {
    switch (selectedSection) {
      case 0: return (
        <TodaySection
          daily={daily}
          deepWork={deepWork}
          streaks={streaks}
          todaySessions={todaySessions}
          wide={wideLayout}
        />
      );
      case 1: return (
        <WeekSection
          weekly={weekly}
          streaks={streaks}
          wide={wideLayout}
        />
      );
      case 2: return <ProjectsSection breakdown={breakdown} />;
      case 3: return (
        <TaskProjectsSection
          taskProjects={taskProjects}
          projectActivity={projectActivity}
        />
      );
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

type DailyStats = ReturnType<typeof getDailyStats>;
type WeeklyStats = ReturnType<typeof getWeeklyStats>;
type DeepWorkRatio = ReturnType<typeof getDeepWorkRatio>;
type StreakInfo = ReturnType<typeof getStreaks>;

function TodaySection({
  daily,
  deepWork,
  streaks,
  todaySessions,
  wide,
}: {
  daily: DailyStats;
  deepWork: DeepWorkRatio;
  streaks: StreakInfo;
  todaySessions: ReturnType<typeof getSessionsForDateRange>;
  wide: boolean;
}) {
  const completionRate = daily.sessionsTotal > 0
    ? Math.round((daily.sessionsCompleted / daily.sessionsTotal) * 100)
    : 0;

  // Hourly focus bar: group completed work sessions by hour
  const hourlyMinutes = new Array(24).fill(0) as number[];
  for (const s of todaySessions) {
    if (s.type === 'work' && s.status === 'completed') {
      const h = new Date(s.startedAt).getHours();
      hourlyMinutes[h] = (hourlyMinutes[h] ?? 0) + s.durationActual / 60;
    }
  }
  const maxHourMins = Math.max(1, ...hourlyMinutes);
  const firstHour = hourlyMinutes.findIndex(m => m > 0);
  const lastHour = (() => {
    for (let i = 23; i >= 0; i--) { if ((hourlyMinutes[i] ?? 0) > 0) return i; }
    return -1;
  })();

  const leftPanel = (
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
      <Box>
        <Box width={20}>
          <Text dimColor>Completion</Text>
        </Box>
        <Text color={completionRate >= 80 ? 'green' : completionRate >= 50 ? 'yellow' : 'red'}>
          {completionRate}%
        </Text>
      </Box>
    </Box>
  );

  const rightPanel = (
    <Box flexDirection="column">
      <Text dimColor bold>Deep Work Ratio</Text>
      <Box>
        <Text color="cyan">{makeRatioBar(deepWork.ratio, 20)}</Text>
        <Text> {Math.round(deepWork.ratio * 100)}%</Text>
      </Box>
      <Box marginTop={0}>
        <Text dimColor>Last 7d: </Text>
        <Sparkline values={deepWork.trendValues} color="cyan" showTrend />
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text dimColor bold>Streak</Text>
        <Box>
          <Box width={10}><Text dimColor>Current</Text></Box>
          <Text color={streaks.currentStreak > 0 ? 'green' : 'gray'} bold>{streaks.currentStreak}d</Text>
        </Box>
        <Box>
          <Box width={10}><Text dimColor>Best</Text></Box>
          <Text>{streaks.personalBest}d</Text>
        </Box>
        <Box>
          <Box width={10}><Text dimColor>This week</Text></Box>
          <Text color="cyan">{formatMinutes(streaks.deepWorkHoursThisWeek * 60)}</Text>
        </Box>
      </Box>
    </Box>
  );

  const hourlySection = firstHour >= 0 ? (
    <Box flexDirection="column" marginTop={1}>
      <Text dimColor>Focus by hour</Text>
      {hourlyMinutes.slice(firstHour, lastHour + 1).map((mins, i) => {
        const h = firstHour + i;
        const barLen = Math.round((mins / maxHourMins) * 12);
        return (
          <Box key={h}>
            <Box width={4}>
              <Text dimColor>{String(h).padStart(2, '0')}</Text>
            </Box>
            <Text color="cyan">{'█'.repeat(barLen)}</Text>
            {barLen === 0 && <Text dimColor>·</Text>}
            {mins > 0 && <Text dimColor> {formatMinutes(mins)}</Text>}
          </Box>
        );
      })}
    </Box>
  ) : null;

  if (wide) {
    return (
      <Box flexDirection="column">
        <Box flexDirection="row" gap={4}>
          <Box flexDirection="column" width={30}>
            {leftPanel}
          </Box>
          <Box flexDirection="column">
            {rightPanel}
          </Box>
        </Box>
        {hourlySection}
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {leftPanel}
      <Box marginTop={1} flexDirection="column">
        {rightPanel}
      </Box>
      {hourlySection}
    </Box>
  );
}

function WeekSection({
  weekly,
  streaks,
  wide,
}: {
  weekly: WeeklyStats;
  streaks: StreakInfo;
  wide: boolean;
}) {
  const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const maxDay = Math.max(1, ...weekly.heatmap.map(d => d.focusMinutes));

  const bestDayIdx = weekly.heatmap.reduce(
    (best, d, i) => d.focusMinutes > weekly.heatmap[best]!.focusMinutes ? i : best,
    0
  );
  const bestDay = weekly.heatmap[bestDayIdx];

  const dailyValues = weekly.heatmap.map(d => d.focusMinutes);
  const avgPerDay = weekly.heatmap.filter(d => d.focusMinutes > 0).length > 0
    ? weekly.totalFocusMinutes / 7
    : 0;

  const summaryPanel = (
    <Box flexDirection="column">
      <Box>
        <Box width={10}><Text dimColor>Total</Text></Box>
        <Text bold>{formatMinutes(weekly.totalFocusMinutes)}</Text>
      </Box>
      <Box>
        <Box width={10}><Text dimColor>Avg/day</Text></Box>
        <Text>{formatMinutes(avgPerDay)}</Text>
      </Box>
      <Box>
        <Box width={10}><Text dimColor>Avg sess</Text></Box>
        <Text>{formatMinutes(weekly.avgSessionLength)}</Text>
      </Box>
      {bestDay && bestDay.focusMinutes > 0 && (
        <Box>
          <Box width={10}><Text dimColor>Best day</Text></Box>
          <Text color="green">{DAY_LABELS[bestDayIdx]} {formatMinutes(bestDay.focusMinutes)}</Text>
        </Box>
      )}
      <Box>
        <Box width={10}><Text dimColor>Streak</Text></Box>
        <Text color={streaks.currentStreak > 0 ? 'green' : 'gray'}>{streaks.currentStreak}d</Text>
      </Box>
    </Box>
  );

  const leftContent = (
    <Box flexDirection="column">
      <Heatmap days={weekly.heatmap} />
      <Box marginTop={1}>
        <Text dimColor>Focus trend (7d): </Text>
        <Sparkline values={dailyValues} color="cyan" showTrend />
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text dimColor>Daily breakdown</Text>
        {weekly.heatmap.map((day, i) => {
          const barLen = Math.round((day.focusMinutes / maxDay) * 14);
          return (
            <Box key={day.date}>
              <Box width={5}><Text dimColor>{DAY_LABELS[i]}</Text></Box>
              {barLen > 0
                ? <Text color="cyan">{'█'.repeat(barLen)}</Text>
                : <Text dimColor>·</Text>
              }
              {day.focusMinutes > 0 && <Text dimColor> {formatMinutes(day.focusMinutes)}</Text>}
            </Box>
          );
        })}
      </Box>
    </Box>
  );

  if (wide) {
    return (
      <Box flexDirection="row" gap={4}>
        <Box flexDirection="column" flexGrow={1}>
          {leftContent}
        </Box>
        <Box flexDirection="column" width={22}>
          {summaryPanel}
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {leftContent}
      <Box marginTop={1}>
        {summaryPanel}
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

function TaskProjectsSection({
  taskProjects,
  projectActivity,
}: {
  taskProjects: [string, { total: number; completed: number; pomodoros: number }][];
  projectActivity: Map<string, number[]>;
}) {
  if (taskProjects.length === 0) {
    return <Text dimColor>No projects yet. Add #project to tasks.</Text>;
  }

  return (
    <Box flexDirection="column">
      {taskProjects.map(([name, stats]) => {
        const activity = projectActivity.get(name) ?? [];
        return (
          <Box key={name}>
            <Box width={16}>
              <Text color="cyan">#{name}</Text>
            </Box>
            <Box width={14}>
              <Text>{stats.completed}/{stats.total} tasks</Text>
            </Box>
            <Box width={9}>
              <Text dimColor>{stats.pomodoros} pom</Text>
            </Box>
            {activity.length > 0 && (
              <Box>
                <Sparkline values={activity} color="cyan" showTrend />
              </Box>
            )}
          </Box>
        );
      })}
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
