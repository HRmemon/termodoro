import * as path from 'node:path';
import type { ScheduledNotification } from '../types.js';
import { atomicWriteJSON, readJSON } from './fs-utils.js';

import { DATA_DIR } from './paths.js';
const REMINDERS_PATH = path.join(DATA_DIR, 'reminders.json');

function normalizeTime(value: string): string {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return value.trim();
  const h = Math.max(0, Math.min(23, Number(match[1])));
  const m = Math.max(0, Math.min(59, Number(match[2])));
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function normalizeReminder(reminder: ScheduledNotification): ScheduledNotification {
  return {
    ...reminder,
    time: normalizeTime(reminder.time),
  };
}

export function loadReminders(): ScheduledNotification[] {
  const reminders = readJSON<ScheduledNotification[]>(REMINDERS_PATH, []);
  const normalized = reminders.map(normalizeReminder);
  if (JSON.stringify(reminders) !== JSON.stringify(normalized)) {
    saveReminders(normalized);
  }
  return normalized;
}

export function saveReminders(reminders: ScheduledNotification[]): void {
  atomicWriteJSON(REMINDERS_PATH, reminders);
}

export function addReminder(reminder: ScheduledNotification): void {
  const reminders = loadReminders();
  reminders.push(normalizeReminder(reminder));
  saveReminders(reminders);
}

export function deleteReminder(id: string): void {
  saveReminders(loadReminders().filter(r => r.id !== id));
}

export function updateReminder(id: string, updates: Partial<ScheduledNotification>): void {
  const reminders = loadReminders().map(r => r.id === id ? normalizeReminder({ ...r, ...updates }) : r);
  saveReminders(reminders);
}
