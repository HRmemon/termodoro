import { nanoid } from 'nanoid';
import type { Task } from '../../types.js';
import { loadTasks, saveTasks } from '../tasks.js';
import { clampStr, clampInt, isValidId, LIMITS } from '../sanitize.js';

export function formatTasks(): string {
  const tasks = loadTasks();
  const header = `// ─── TASKS & TIMEBLOCKING ───────────────────────────────────────────────────
// Syntax: [ ] Task text #project date:YYYY-MM-DD time:HH:MM end:HH:MM %id:...
// Example: [ ] Write API endpoints #coding date:2026-03-03 time:14:00 end:16:00
// ────────────────────────────────────────────────────────────────────────────\n\n`;

  return header + tasks.map(t => {
    const check = t.completed ? '[x]' : '[ ]';
    let line = `${check} ${t.text}`;
    if (t.project) line += ` #${t.project}`;
    if (t.date) line += ` date:${t.date}`;
    if (t.time) line += ` time:${t.time}`;
    if (t.endTime) line += ` end:${t.endTime}`;
    line += `  %id:${t.id}`;
    return line;
  }).join('\n') + '\n';
}

export function parseTasks(text: string): void {
  const lines = text.split('\n').filter(l => l.trim() && !l.trim().startsWith('//'));
  const existing = loadTasks();
  const existingMap = new Map(existing.map(t => [t.id, t]));
  const seenIds = new Set<string>();
  const result: Task[] = [];

  for (const line of lines) {
    const idMatch = line.match(/%id:(\S+)/);
    const id = idMatch && isValidId(idMatch[1]!) ? idMatch[1]! : nanoid();
    seenIds.add(id);

    const checkMatch = line.match(/^\[([x ])\]/);
    const completed = checkMatch?.[1] === 'x';

    let rest = line.replace(/%id:\S+/, '').replace(/^\[[x ]\]\s*/, '').trim();

    // Parse date:YYYY-MM-DD
    let date: string | undefined;
    const dateMatch = rest.match(/date:(\d{4}-\d{2}-\d{2})/);
    if (dateMatch) {
      date = dateMatch[1];
      rest = rest.replace(/date:\d{4}-\d{2}-\d{2}/, '').trim();
    }

    // Parse time:HH:MM
    let time: string | undefined;
    const timeMatch = rest.match(/time:(\d{2}:\d{2})/);
    if (timeMatch) {
      time = timeMatch[1];
      rest = rest.replace(/time:\d{2}:\d{2}/, '').trim();
    }

    // Parse end:HH:MM
    let endTime: string | undefined;
    const endMatch = rest.match(/end:(\d{2}:\d{2})/);
    if (endMatch) {
      endTime = endMatch[1];
      rest = rest.replace(/end:\d{2}:\d{2}/, '').trim();
    }

    // Parse #project
    let project: string | undefined;
    const projMatch = rest.match(/#(\S+)\s*$/);
    if (projMatch) {
      project = projMatch[1]!;
      rest = rest.replace(/#\S+\s*$/, '').trim();
    }

    const old = existingMap.get(id);
    result.push({
      id,
      text: clampStr(rest, LIMITS.SHORT_TEXT),
      completed,
      description: old?.description,
      project: clampStr(project, LIMITS.PROJECT),
      date,
      time,
      endTime,
      createdAt: old?.createdAt ?? new Date().toISOString(),
      completedAt: completed ? (old?.completedAt ?? new Date().toISOString()) : undefined,
    });
  }

  saveTasks(result);
}
