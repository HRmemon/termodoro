import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { Session, DayPlan, SessionType, SequenceBlock, WorkInterval } from '../types.js';
import { getAllSessions, insertSession, replaceAllSessions, migrateFromJson, getDbPath } from './session-db.js';

const DATA_DIR = path.join(os.homedir(), '.local', 'share', 'pomodorocli');
const SESSIONS_PATH = path.join(DATA_DIR, 'sessions.json');
const PLANS_PATH = path.join(DATA_DIR, 'plans.json');
const ACHIEVEMENTS_PATH = path.join(DATA_DIR, 'achievements.json');
const TIMER_STATE_PATH = path.join(DATA_DIR, 'timer-state.json');

export interface TimerSnapshot {
  sessionType: SessionType;
  totalSeconds: number;
  startedAt: string;
  pausedSecondsLeft?: number;
  isPaused: boolean;
  sessionNumber: number;
  totalWorkSessions: number;
  label?: string;
  project?: string;
  overrideDuration?: number | null;
  timerMode?: 'countdown' | 'stopwatch';
  stopwatchElapsed?: number;
  accumulatedElapsed?: number;
  sequenceName?: string;
  sequenceBlocks?: SequenceBlock[];
  sequenceBlockIndex?: number;
  workIntervals?: WorkInterval[];
}

function ensureDir(): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function atomicWrite(filePath: string, data: unknown): void {
  ensureDir();
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  fs.renameSync(tmp, filePath);
}

function readJSON<T>(filePath: string, fallback: T): T {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
    }
  } catch {
    // corrupt file, return fallback
  }
  return fallback;
}

// Sessions — delegated to SQLite via session-db
migrateFromJson(); // One-time migration from sessions.json on first load

export function loadSessions(): Session[] {
  return getAllSessions();
}

export function saveSessions(sessions: Session[]): void {
  replaceAllSessions(sessions);
}

export function appendSession(session: Session): void {
  insertSession(session); // Atomic INSERT, no read-modify-write
}

// Plans
export function loadPlans(): DayPlan[] {
  return readJSON<DayPlan[]>(PLANS_PATH, []);
}

export function savePlans(plans: DayPlan[]): void {
  atomicWrite(PLANS_PATH, plans);
}

export function getPlanForDate(date: string): DayPlan | undefined {
  const plans = loadPlans();
  return plans.find(p => p.date === date);
}

export function savePlanForDate(plan: DayPlan): void {
  const plans = loadPlans();
  const idx = plans.findIndex(p => p.date === plan.date);
  if (idx >= 0) {
    plans[idx] = plan;
  } else {
    plans.push(plan);
  }
  savePlans(plans);
}

// Achievements
export function loadUnlockedAchievements(): string[] {
  return readJSON<string[]>(ACHIEVEMENTS_PATH, []);
}

export function saveUnlockedAchievements(ids: string[]): void {
  atomicWrite(ACHIEVEMENTS_PATH, ids);
}

// Timer state persistence
export function saveTimerState(snapshot: TimerSnapshot): void {
  atomicWrite(TIMER_STATE_PATH, snapshot);
}

export function loadTimerState(): TimerSnapshot | null {
  return readJSON<TimerSnapshot | null>(TIMER_STATE_PATH, null);
}

export function clearTimerState(): void {
  try {
    if (fs.existsSync(TIMER_STATE_PATH)) {
      fs.unlinkSync(TIMER_STATE_PATH);
    }
  } catch {
    // ignore errors
  }
}

// Sticky project persistence
const STICKY_PROJECT_PATH = path.join(DATA_DIR, 'sticky-project.json');

export function saveStickyProject(project: string | undefined): void {
  if (project) {
    atomicWrite(STICKY_PROJECT_PATH, { project });
  } else {
    try {
      if (fs.existsSync(STICKY_PROJECT_PATH)) fs.unlinkSync(STICKY_PROJECT_PATH);
    } catch { /* ignore */ }
  }
}

export function loadStickyProject(): string | undefined {
  const data = readJSON<{ project?: string } | null>(STICKY_PROJECT_PATH, null);
  return data?.project;
}

// Data dir path for export/backup
export function getDataDir(): string {
  return DATA_DIR;
}

export function getSessionsPath(): string {
  return SESSIONS_PATH;
}

export function getSessionsDbPath(): string {
  return getDbPath();
}
