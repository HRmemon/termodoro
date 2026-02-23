import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { Session, DayPlan } from '../types.js';

const DATA_DIR = path.join(os.homedir(), '.local', 'share', 'pomodorocli');
const SESSIONS_PATH = path.join(DATA_DIR, 'sessions.json');
const PLANS_PATH = path.join(DATA_DIR, 'plans.json');
const ACHIEVEMENTS_PATH = path.join(DATA_DIR, 'achievements.json');

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

// Sessions
export function loadSessions(): Session[] {
  return readJSON<Session[]>(SESSIONS_PATH, []);
}

export function saveSessions(sessions: Session[]): void {
  atomicWrite(SESSIONS_PATH, sessions);
}

export function appendSession(session: Session): void {
  const sessions = loadSessions();
  sessions.push(session);
  saveSessions(sessions);
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

// Data dir path for export/backup
export function getDataDir(): string {
  return DATA_DIR;
}

export function getSessionsPath(): string {
  return SESSIONS_PATH;
}
