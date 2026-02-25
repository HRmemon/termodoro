import fs from 'fs';
import path from 'path';
import os from 'os';
import { loadSessions } from './store.js';

export interface TrackedGoal {
  id: string;
  name: string;
  color: string;
  type: 'manual' | 'auto';
  autoProject?: string;
}

export interface GoalsData {
  goals: TrackedGoal[];
  completions: Record<string, string[]>;  // goalId -> ["2026-02-25", ...]
  overrides: Record<string, string[]>;    // goalId -> dates toggled OFF despite auto
}

const GOALS_PATH = path.join(os.homedir(), '.local', 'share', 'pomodorocli', 'goals.json');

function ensureDir() {
  fs.mkdirSync(path.dirname(GOALS_PATH), { recursive: true });
}

export function loadGoals(): GoalsData {
  try {
    if (fs.existsSync(GOALS_PATH)) {
      return JSON.parse(fs.readFileSync(GOALS_PATH, 'utf8'));
    }
  } catch { /* ignore */ }
  return { goals: [], completions: {}, overrides: {} };
}

export function saveGoals(data: GoalsData): void {
  ensureDir();
  fs.writeFileSync(GOALS_PATH, JSON.stringify(data, null, 2));
}

export function addGoal(goal: TrackedGoal): GoalsData {
  const data = loadGoals();
  data.goals.push(goal);
  data.completions[goal.id] = [];
  data.overrides[goal.id] = [];
  saveGoals(data);
  return data;
}

export function removeGoal(id: string): GoalsData {
  const data = loadGoals();
  data.goals = data.goals.filter(g => g.id !== id);
  delete data.completions[id];
  delete data.overrides[id];
  saveGoals(data);
  return data;
}

export function toggleCompletion(goalId: string, date: string, data: GoalsData): GoalsData {
  const goal = data.goals.find(g => g.id === goalId);
  if (!goal) return data;

  if (goal.type === 'auto') {
    // For auto goals, toggle the override (mark as NOT done even if auto-detected)
    const overrides = data.overrides[goalId] ?? [];
    if (overrides.includes(date)) {
      data.overrides[goalId] = overrides.filter(d => d !== date);
    } else {
      // Check if it was auto-completed; if so, override it off
      // If it wasn't auto-completed, add it to completions (manual override on)
      const autoComplete = checkAutoComplete(goal, date);
      if (autoComplete) {
        data.overrides[goalId] = [...overrides, date];
      } else {
        // Not auto-completed, toggle in completions
        const completions = data.completions[goalId] ?? [];
        if (completions.includes(date)) {
          data.completions[goalId] = completions.filter(d => d !== date);
        } else {
          data.completions[goalId] = [...completions, date];
        }
      }
    }
  } else {
    // Manual: toggle in completions
    const completions = data.completions[goalId] ?? [];
    if (completions.includes(date)) {
      data.completions[goalId] = completions.filter(d => d !== date);
    } else {
      data.completions[goalId] = [...completions, date];
    }
  }

  saveGoals(data);
  return data;
}

let _sessionsCache: ReturnType<typeof loadSessions> | null = null;
let _sessionsCacheTime = 0;

function getCachedSessions() {
  const now = Date.now();
  if (!_sessionsCache || now - _sessionsCacheTime > 5000) {
    _sessionsCache = loadSessions();
    _sessionsCacheTime = now;
  }
  return _sessionsCache;
}

function checkAutoComplete(goal: TrackedGoal, date: string): boolean {
  if (goal.type !== 'auto' || !goal.autoProject) return false;
  const sessions = getCachedSessions();
  return sessions.some(s =>
    s.type === 'work' &&
    s.status === 'completed' &&
    s.project === goal.autoProject &&
    s.startedAt.startsWith(date)
  );
}

export function isGoalComplete(goal: TrackedGoal, date: string, data: GoalsData): boolean {
  if (goal.type === 'auto') {
    const overrides = data.overrides[goal.id] ?? [];
    if (overrides.includes(date)) return false;
    // Check manual completions first (manual override on)
    const completions = data.completions[goal.id] ?? [];
    if (completions.includes(date)) return true;
    return checkAutoComplete(goal, date);
  }
  // Manual
  const completions = data.completions[goal.id] ?? [];
  return completions.includes(date);
}

export function computeStreak(goalId: string, data: GoalsData): { current: number; best: number } {
  const goal = data.goals.find(g => g.id === goalId);
  if (!goal) return { current: 0, best: 0 };

  // Collect all dates where goal was complete, going backwards from today
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let current = 0;
  let best = 0;
  let streak = 0;
  let foundFirst = false;

  // Check up to 365 days back
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = formatDate(d);
    const complete = isGoalComplete(goal, dateStr, data);

    if (complete) {
      streak++;
      foundFirst = true;
    } else {
      if (foundFirst) {
        if (current === 0) current = streak;
        best = Math.max(best, streak);
        streak = 0;
      } else if (i > 0) {
        // Allow today to be incomplete (streak counts from yesterday)
        if (i === 1 && streak === 0) {
          // day 0 (today) was not complete, day 1 also not — no current streak
        }
      }
    }
  }
  // Final streak
  if (current === 0) current = streak;
  best = Math.max(best, streak);

  return { current, best };
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function getTodayStr(): string {
  return formatDate(new Date());
}

export function getRecentWeeks(count: number): string[][] {
  // Returns arrays of date strings grouped by week (Mon-Sun), most recent first
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // Find this Monday
  const day = today.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const thisMonday = new Date(today);
  thisMonday.setDate(today.getDate() + diff);

  const weeks: string[][] = [];
  for (let w = 0; w < count; w++) {
    const monday = new Date(thisMonday);
    monday.setDate(thisMonday.getDate() - w * 7);
    const weekDates: string[] = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(monday);
      date.setDate(monday.getDate() + d);
      weekDates.push(formatDate(date));
    }
    weeks.push(weekDates);
  }
  return weeks.reverse(); // oldest first
}

export const GOAL_COLORS = ['cyan', 'green', 'yellow', 'magenta', 'red', 'blue', 'white'];
