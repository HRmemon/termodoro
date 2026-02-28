import { nanoid } from 'nanoid';
import type { ScheduledNotification } from '../../types.js';
import { loadReminders, saveReminders } from '../reminders.js';
import { clampStr, isValidId, LIMITS } from '../sanitize.js';

export function formatReminders(): string {
  const reminders = loadReminders();
  return reminders.map(r => {
    const check = r.enabled ? '[x]' : '[ ]';
    let line = `${check} ${r.time} ${r.title}`;
    if (r.recurring) line += ' (r)';
    line += `  %id:${r.id}`;
    return line;
  }).join('\n') + '\n';
}

export function parseReminders(text: string): void {
  const lines = text.split('\n').filter(l => l.trim());
  const existing = loadReminders();
  const existingMap = new Map(existing.map(r => [r.id, r]));
  const result: ScheduledNotification[] = [];

  for (const line of lines) {
    const idMatch = line.match(/%id:(\S+)/);
    const id = idMatch && isValidId(idMatch[1]!) ? idMatch[1]! : nanoid();

    const checkMatch = line.match(/^\[([x ])\]/);
    const enabled = checkMatch?.[1] === 'x';

    let rest = line.replace(/%id:\S+/, '').replace(/^\[[x ]\]\s*/, '').trim();

    // Parse recurring flag
    const recurring = /\(r\)\s*$/.test(rest);
    rest = rest.replace(/\(r\)\s*$/, '').trim();

    // Parse time HH:MM
    const timeMatch = rest.match(/^(\d{1,2}:\d{2})\s+/);
    if (!timeMatch) continue;
    const time = timeMatch[1]!;
    const title = rest.replace(/^\d{1,2}:\d{2}\s+/, '').trim();
    if (!title) continue;

    const old = existingMap.get(id);
    result.push({
      id,
      time,
      title: clampStr(title, LIMITS.SHORT_TEXT),
      enabled,
      recurring,
      taskId: old?.taskId,
    });
  }

  saveReminders(result);
}
