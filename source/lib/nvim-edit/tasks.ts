import { nanoid } from 'nanoid';
import type { Task } from '../../types.js';
import { loadTasks, saveTasks } from '../tasks.js';

export function formatTasks(): string {
  const tasks = loadTasks();
  return tasks.map(t => {
    const check = t.completed ? '[x]' : '[ ]';
    let line = `${check} ${t.text}`;
    if (t.project) line += ` #${t.project}`;
    line += ` /${t.expectedPomodoros}`;
    if (t.completedPomodoros > 0) line += ` (${t.completedPomodoros}/${t.expectedPomodoros})`;
    line += `  %id:${t.id}`;
    return line;
  }).join('\n') + '\n';
}

export function parseTasks(text: string): void {
  const lines = text.split('\n').filter(l => l.trim());
  const existing = loadTasks();
  const existingMap = new Map(existing.map(t => [t.id, t]));
  const seenIds = new Set<string>();
  const result: Task[] = [];

  for (const line of lines) {
    const idMatch = line.match(/%id:(\S+)/);
    const id = idMatch ? idMatch[1]! : nanoid();
    seenIds.add(id);

    const checkMatch = line.match(/^\[([x ])\]/);
    const completed = checkMatch?.[1] === 'x';

    let rest = line.replace(/%id:\S+/, '').replace(/^\[[x ]\]\s*/, '').trim();

    // Parse (M/N) progress
    let completedPomodoros = 0;
    const progressMatch = rest.match(/\((\d+)\/(\d+)\)\s*$/);
    if (progressMatch) {
      completedPomodoros = parseInt(progressMatch[1]!, 10);
      rest = rest.replace(/\(\d+\/\d+\)\s*$/, '').trim();
    }

    // Parse /N expected pomodoros
    let expectedPomodoros = 1;
    const pomMatch = rest.match(/\/(\d+)\s*$/);
    if (pomMatch) {
      expectedPomodoros = parseInt(pomMatch[1]!, 10);
      rest = rest.replace(/\/\d+\s*$/, '').trim();
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
      text: rest,
      completed,
      description: old?.description,
      project,
      expectedPomodoros,
      completedPomodoros: completedPomodoros || (old?.completedPomodoros ?? 0),
      createdAt: old?.createdAt ?? new Date().toISOString(),
      completedAt: completed ? (old?.completedAt ?? new Date().toISOString()) : undefined,
    });
  }

  saveTasks(result);
}
