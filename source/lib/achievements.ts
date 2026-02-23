import { loadSessions } from './store.js';
import { loadUnlockedAchievements, saveUnlockedAchievements } from './store.js';
import type { Achievement, Session } from '../types.js';

export interface AchievementDefinition extends Achievement {
  check: (sessions: Session[], unlockedIds: Set<string>) => boolean;
  progressCurrent?: (sessions: Session[]) => number;
  progressTarget?: number;
}

function totalFocusMinutes(sessions: Session[]): number {
  return sessions
    .filter(s => s.type === 'work' && s.status === 'completed')
    .reduce((sum, s) => sum + s.durationActual / 60, 0);
}

function completedWorkSessions(sessions: Session[]): number {
  return sessions.filter(s => s.type === 'work' && s.status === 'completed').length;
}

function computeCurrentStreak(sessions: Session[]): number {
  const activeDates = new Set<string>();
  for (const s of sessions) {
    if (s.type === 'work' && s.status === 'completed') {
      const d = new Date(s.startedAt);
      const str = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      activeDates.add(str);
    }
  }

  const today = new Date();

  function dateStr(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function streakFrom(d: Date): number {
    let streak = 0;
    const cursor = new Date(d);
    while (activeDates.has(dateStr(cursor))) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
  }

  const todayStr = dateStr(today);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (activeDates.has(todayStr)) {
    return streakFrom(today);
  }
  return streakFrom(yesterday);
}

function focusMinutesOnDate(sessions: Session[], dateStr: string): number {
  return sessions
    .filter(s => {
      if (s.type !== 'work' || s.status !== 'completed') return false;
      const d = new Date(s.startedAt);
      const str = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return str === dateStr;
    })
    .reduce((sum, s) => sum + s.durationActual / 60, 0);
}

function maxFocusInOneDay(sessions: Session[]): number {
  const byDate = new Map<string, number>();
  for (const s of sessions) {
    if (s.type !== 'work' || s.status !== 'completed') continue;
    const d = new Date(s.startedAt);
    const str = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    byDate.set(str, (byDate.get(str) ?? 0) + s.durationActual / 60);
  }
  let max = 0;
  for (const v of byDate.values()) {
    if (v > max) max = v;
  }
  return max;
}

export const ACHIEVEMENT_DEFINITIONS: AchievementDefinition[] = [
  {
    id: 'first_session',
    name: 'First Session',
    description: 'Complete your first focus session.',
    check: (sessions) => completedWorkSessions(sessions) >= 1,
    progressCurrent: completedWorkSessions,
    progressTarget: 1,
  },
  {
    id: 'focus_10h',
    name: '10 Hours Focused',
    description: 'Accumulate 10 hours of focused work.',
    check: (sessions) => totalFocusMinutes(sessions) >= 600,
    progressCurrent: totalFocusMinutes,
    progressTarget: 600,
  },
  {
    id: 'focus_25h',
    name: '25 Hours Focused',
    description: 'Accumulate 25 hours of focused work.',
    check: (sessions) => totalFocusMinutes(sessions) >= 1500,
    progressCurrent: totalFocusMinutes,
    progressTarget: 1500,
  },
  {
    id: 'focus_50h',
    name: '50 Hours Focused',
    description: 'Accumulate 50 hours of focused work.',
    check: (sessions) => totalFocusMinutes(sessions) >= 3000,
    progressCurrent: totalFocusMinutes,
    progressTarget: 3000,
  },
  {
    id: 'focus_100h',
    name: '100 Hours Focused',
    description: 'Accumulate 100 hours of focused work.',
    check: (sessions) => totalFocusMinutes(sessions) >= 6000,
    progressCurrent: totalFocusMinutes,
    progressTarget: 6000,
  },
  {
    id: 'streak_7',
    name: '7-Day Streak',
    description: 'Maintain a focus streak for 7 consecutive days.',
    check: (sessions) => computeCurrentStreak(sessions) >= 7,
    progressCurrent: computeCurrentStreak,
    progressTarget: 7,
  },
  {
    id: 'streak_14',
    name: '14-Day Streak',
    description: 'Maintain a focus streak for 14 consecutive days.',
    check: (sessions) => computeCurrentStreak(sessions) >= 14,
    progressCurrent: computeCurrentStreak,
    progressTarget: 14,
  },
  {
    id: 'streak_30',
    name: '30-Day Streak',
    description: 'Maintain a focus streak for 30 consecutive days.',
    check: (sessions) => computeCurrentStreak(sessions) >= 30,
    progressCurrent: computeCurrentStreak,
    progressTarget: 30,
  },
  {
    id: 'sessions_100',
    name: '100 Sessions',
    description: 'Complete 100 focus sessions.',
    check: (sessions) => completedWorkSessions(sessions) >= 100,
    progressCurrent: completedWorkSessions,
    progressTarget: 100,
  },
  {
    id: 'sessions_500',
    name: '500 Sessions',
    description: 'Complete 500 focus sessions.',
    check: (sessions) => completedWorkSessions(sessions) >= 500,
    progressCurrent: completedWorkSessions,
    progressTarget: 500,
  },
  {
    id: 'five_hours_one_day',
    name: 'Deep Day',
    description: 'Log 5 hours of focus in a single day.',
    check: (sessions) => maxFocusInOneDay(sessions) >= 300,
    progressCurrent: (sessions) => maxFocusInOneDay(sessions),
    progressTarget: 300,
  },
];

export interface CheckResult {
  newlyUnlocked: string[];
  allUnlocked: string[];
}

export function checkAchievements(): CheckResult {
  const sessions = loadSessions();
  const unlockedIds = new Set(loadUnlockedAchievements());
  const newlyUnlocked: string[] = [];

  for (const def of ACHIEVEMENT_DEFINITIONS) {
    if (!unlockedIds.has(def.id) && def.check(sessions, unlockedIds)) {
      newlyUnlocked.push(def.id);
      unlockedIds.add(def.id);
    }
  }

  if (newlyUnlocked.length > 0) {
    saveUnlockedAchievements(Array.from(unlockedIds));
  }

  return {
    newlyUnlocked,
    allUnlocked: Array.from(unlockedIds),
  };
}

export function getAchievementProgress(): Array<{
  definition: AchievementDefinition;
  unlocked: boolean;
  progress: number;
  target: number;
}> {
  const sessions = loadSessions();
  const unlockedIds = new Set(loadUnlockedAchievements());

  return ACHIEVEMENT_DEFINITIONS.map(def => {
    const current = def.progressCurrent ? def.progressCurrent(sessions) : 0;
    const target = def.progressTarget ?? 1;
    return {
      definition: def,
      unlocked: unlockedIds.has(def.id),
      progress: Math.min(current, target),
      target,
    };
  });
}
