import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { ScheduledNotification } from '../types.js';

const DATA_DIR = path.join(os.homedir(), '.local', 'share', 'pomodorocli');
const REMINDERS_PATH = path.join(DATA_DIR, 'reminders.json');

export function loadReminders(): ScheduledNotification[] {
  try {
    if (fs.existsSync(REMINDERS_PATH)) {
      return JSON.parse(fs.readFileSync(REMINDERS_PATH, 'utf-8')) as ScheduledNotification[];
    }
  } catch {
    // ignore
  }
  return [];
}

export function saveReminders(reminders: ScheduledNotification[]): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(REMINDERS_PATH, JSON.stringify(reminders, null, 2) + '\n', 'utf-8');
}

export function addReminder(reminder: ScheduledNotification): void {
  const reminders = loadReminders();
  reminders.push(reminder);
  saveReminders(reminders);
}

export function deleteReminder(id: string): void {
  saveReminders(loadReminders().filter(r => r.id !== id));
}

export function updateReminder(id: string, updates: Partial<ScheduledNotification>): void {
  const reminders = loadReminders().map(r => r.id === id ? { ...r, ...updates } : r);
  saveReminders(reminders);
}
