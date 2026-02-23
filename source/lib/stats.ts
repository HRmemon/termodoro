import { loadSessions } from './store.js';
import type { Session } from '../types.js';

export interface DailyStats {
  date: string;
  focusMinutes: number;
  breakMinutes: number;
  sessionsCompleted: number;
  sessionsTotal: number;
  completionRate: number;
}

export interface HeatmapDay {
  date: string;
  focusMinutes: number;
  sessions: number;
}

export interface WeeklyStats {
  heatmap: HeatmapDay[];
  longestStreak: number;
  avgSessionLength: number;
  totalFocusMinutes: number;
}

export interface DeepWorkRatio {
  ratio: number;
  focusMinutes: number;
  totalActiveMinutes: number;
  trend: 'up' | 'down' | 'flat';
  trendValues: number[];
}

export interface ProjectBreakdown {
  label: string;
  minutes: number;
}

export interface TaskBreakdown {
  byProject: ProjectBreakdown[];
  byTag: ProjectBreakdown[];
}

export interface StreakInfo {
  currentStreak: number;
  personalBest: number;
  recordStreak: number;
  deepWorkHoursThisWeek: number;
}

// ISO date string helpers: YYYY-MM-DD
function toDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseDate(dateStr: string): Date {
  // Parse YYYY-MM-DD as local date, not UTC
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y!, (m! - 1), d!);
}

export function getSessionsForDateRange(start: string, end: string): Session[] {
  const sessions = loadSessions();
  const startMs = parseDate(start).getTime();
  // end is inclusive: advance to end of day
  const endDate = parseDate(end);
  endDate.setHours(23, 59, 59, 999);
  const endMs = endDate.getTime();

  return sessions.filter(s => {
    const t = new Date(s.startedAt).getTime();
    return t >= startMs && t <= endMs;
  });
}

export function getTodaySessions(): Session[] {
  const today = toDateString(new Date());
  return getSessionsForDateRange(today, today);
}

export function getDailyStats(date: string): DailyStats {
  const sessions = getSessionsForDateRange(date, date);

  let focusMinutes = 0;
  let breakMinutes = 0;
  let sessionsCompleted = 0;

  for (const s of sessions) {
    const minutes = s.durationActual / 60;
    if (s.type === 'work') {
      if (s.status === 'completed') {
        focusMinutes += minutes;
        sessionsCompleted++;
      }
    } else {
      if (s.status === 'completed') {
        breakMinutes += minutes;
      }
    }
  }

  const workSessions = sessions.filter(s => s.type === 'work');
  const sessionsTotal = workSessions.length;
  const completionRate = sessionsTotal > 0 ? sessionsCompleted / sessionsTotal : 0;

  return {
    date,
    focusMinutes,
    breakMinutes,
    sessionsCompleted,
    sessionsTotal,
    completionRate,
  };
}

export function getWeeklyStats(weekStartDate: string): WeeklyStats {
  const start = parseDate(weekStartDate);
  const heatmap: HeatmapDay[] = [];

  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const dateStr = toDateString(d);
    const sessions = getSessionsForDateRange(dateStr, dateStr);

    const focusMinutes = sessions
      .filter(s => s.type === 'work' && s.status === 'completed')
      .reduce((sum, s) => sum + s.durationActual / 60, 0);

    const sessionCount = sessions.filter(s => s.type === 'work' && s.status === 'completed').length;

    heatmap.push({ date: dateStr, focusMinutes, sessions: sessionCount });
  }

  // Longest streak of days with at least one completed session within this week
  let longestStreak = 0;
  let currentRun = 0;
  for (const day of heatmap) {
    if (day.sessions > 0) {
      currentRun++;
      if (currentRun > longestStreak) longestStreak = currentRun;
    } else {
      currentRun = 0;
    }
  }

  const totalFocusMinutes = heatmap.reduce((sum, d) => sum + d.focusMinutes, 0);
  const totalSessions = heatmap.reduce((sum, d) => sum + d.sessions, 0);
  const avgSessionLength = totalSessions > 0 ? totalFocusMinutes / totalSessions : 0;

  return { heatmap, longestStreak, avgSessionLength, totalFocusMinutes };
}

export function getDeepWorkRatio(sessions: Session[]): DeepWorkRatio {
  const workSessions = sessions.filter(s => s.type === 'work' && s.status === 'completed');
  const breakSessions = sessions.filter(s => s.type !== 'work' && s.status === 'completed');

  const focusMinutes = workSessions.reduce((sum, s) => sum + s.durationActual / 60, 0);
  const breakMinutes = breakSessions.reduce((sum, s) => sum + s.durationActual / 60, 0);
  const totalActiveMinutes = focusMinutes + breakMinutes;
  const ratio = totalActiveMinutes > 0 ? focusMinutes / totalActiveMinutes : 0;

  // Trend: compare focus ratio of last 7 days vs previous 7 days
  const allSessions = loadSessions();
  const today = new Date();

  function getRatioForRange(daysBack: number, span: number): number {
    const endDate = new Date(today);
    endDate.setDate(today.getDate() - daysBack);
    const startDate = new Date(endDate);
    startDate.setDate(endDate.getDate() - span + 1);

    const rangeStart = toDateString(startDate);
    const rangeEnd = toDateString(endDate);
    const rangeSessions = allSessions.filter(s => {
      const t = new Date(s.startedAt).getTime();
      const sMs = parseDate(rangeStart).getTime();
      const eDate = parseDate(rangeEnd);
      eDate.setHours(23, 59, 59, 999);
      return t >= sMs && t <= eDate.getTime();
    });

    const focus = rangeSessions
      .filter(s => s.type === 'work' && s.status === 'completed')
      .reduce((sum, s) => sum + s.durationActual / 60, 0);
    const total = rangeSessions
      .filter(s => s.status === 'completed')
      .reduce((sum, s) => sum + s.durationActual / 60, 0);
    return total > 0 ? focus / total : 0;
  }

  // Build 7-day trend values (day -6 to today)
  const trendValues: number[] = [];
  for (let i = 6; i >= 0; i--) {
    trendValues.push(getRatioForRange(i, 1));
  }

  const recentAvg = getRatioForRange(0, 7);
  const prevAvg = getRatioForRange(7, 7);
  const diff = recentAvg - prevAvg;
  const trend: 'up' | 'down' | 'flat' = diff > 0.03 ? 'up' : diff < -0.03 ? 'down' : 'flat';

  return { ratio, focusMinutes, totalActiveMinutes, trend, trendValues };
}

export function getTaskBreakdown(sessions: Session[]): TaskBreakdown {
  const projectMap = new Map<string, number>();
  const tagMap = new Map<string, number>();

  for (const s of sessions) {
    if (s.type !== 'work' || s.status !== 'completed') continue;
    const minutes = s.durationActual / 60;

    const project = s.project ?? '(untagged)';
    projectMap.set(project, (projectMap.get(project) ?? 0) + minutes);

    const tag = s.tag ?? '(untagged)';
    tagMap.set(tag, (tagMap.get(tag) ?? 0) + minutes);
  }

  const sortDesc = (map: Map<string, number>): ProjectBreakdown[] =>
    Array.from(map.entries())
      .map(([label, minutes]) => ({ label, minutes }))
      .sort((a, b) => b.minutes - a.minutes);

  return {
    byProject: sortDesc(projectMap),
    byTag: sortDesc(tagMap),
  };
}

export function getStreaks(): StreakInfo {
  const allSessions = loadSessions();
  const today = new Date();

  // Build a set of dates that had at least one completed work session
  const activeDates = new Set<string>();
  for (const s of allSessions) {
    if (s.type === 'work' && s.status === 'completed') {
      activeDates.add(toDateString(new Date(s.startedAt)));
    }
  }

  // Current streak: consecutive days ending today (or yesterday if today has no session yet)
  function computeStreak(fromDate: Date): number {
    let streak = 0;
    const cursor = new Date(fromDate);
    while (activeDates.has(toDateString(cursor))) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
  }

  const todayStr = toDateString(today);
  const yesterdayDate = new Date(today);
  yesterdayDate.setDate(today.getDate() - 1);

  let currentStreak = 0;
  if (activeDates.has(todayStr)) {
    currentStreak = computeStreak(today);
  } else {
    currentStreak = computeStreak(yesterdayDate);
  }

  // Record streak: find the longest consecutive run across all history
  let recordStreak = 0;
  let runLength = 0;
  let recordCursor = new Date(today);

  // Find the earliest date we have data for
  const sortedDates = Array.from(activeDates).sort();
  if (sortedDates.length > 0) {
    const firstDate = parseDate(sortedDates[0]!);
    const cursor2 = new Date(firstDate);
    while (cursor2 <= today) {
      if (activeDates.has(toDateString(cursor2))) {
        runLength++;
        if (runLength > recordStreak) {
          recordStreak = runLength;
        }
      } else {
        runLength = 0;
      }
      cursor2.setDate(cursor2.getDate() + 1);
    }
  }

  // Deep work hours this week (Mon-Sun)
  const dayOfWeek = today.getDay(); // 0 = Sun
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - daysFromMonday);
  const weekStartStr = toDateString(weekStart);
  const weekEndStr = toDateString(today);

  const weekSessions = getSessionsForDateRange(weekStartStr, weekEndStr);
  const deepWorkMinutes = weekSessions
    .filter(s => s.type === 'work' && s.status === 'completed')
    .reduce((sum, s) => sum + s.durationActual / 60, 0);

  return {
    currentStreak,
    personalBest: recordStreak,
    recordStreak,
    deepWorkHoursThisWeek: deepWorkMinutes / 60,
  };
}
