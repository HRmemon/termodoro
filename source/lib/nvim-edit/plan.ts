import { nanoid } from 'nanoid';
import type { TimeBlock } from '../../types.js';
import { getPlanForDate, savePlanForDate } from '../store.js';

export function formatPlan(): string {
  const today = new Date().toISOString().slice(0, 10);
  const plan = getPlanForDate(today);
  const lines: string[] = [];

  if (plan?.theme) {
    lines.push(`# Theme: ${plan.theme}`);
  }

  if (plan?.blocks) {
    for (const b of plan.blocks) {
      let line = '';
      if (b.startTime && b.endTime) {
        line += `${b.startTime}-${b.endTime} `;
      }
      line += `${b.label} ${b.priority}`;
      if (b.project) line += ` #${b.project}`;
      line += `  %id:${b.id}`;
      lines.push(line);
    }
  }

  return lines.join('\n') + '\n';
}

export function parsePlan(text: string): void {
  const today = new Date().toISOString().slice(0, 10);
  const lines = text.split('\n').filter(l => l.trim());
  let theme: string | undefined;
  const blocks: TimeBlock[] = [];

  for (const line of lines) {
    const themeMatch = line.match(/^#\s*Theme:\s*(.+)$/);
    if (themeMatch) {
      theme = themeMatch[1]!.trim();
      continue;
    }

    const idMatch = line.match(/%id:(\S+)/);
    const id = idMatch ? idMatch[1]! : nanoid();

    let rest = line.replace(/%id:\S+/, '').trim();

    // Parse time range
    let startTime: string | undefined;
    let endTime: string | undefined;
    const timeMatch = rest.match(/^(\d{1,2}:\d{2})-(\d{1,2}:\d{2})\s+/);
    if (timeMatch) {
      startTime = timeMatch[1]!;
      endTime = timeMatch[2]!;
      rest = rest.replace(/^\d{1,2}:\d{2}-\d{1,2}:\d{2}\s+/, '');
    }

    // Parse #project
    let project: string | undefined;
    const projMatch = rest.match(/#(\S+)\s*$/);
    if (projMatch) {
      project = projMatch[1]!;
      rest = rest.replace(/#\S+\s*$/, '').trim();
    }

    // Parse priority P1/P2/P3
    let priority: 'P1' | 'P2' | 'P3' = 'P2';
    const prioMatch = rest.match(/\b(P[123])\s*$/);
    if (prioMatch) {
      priority = prioMatch[1] as 'P1' | 'P2' | 'P3';
      rest = rest.replace(/\bP[123]\s*$/, '').trim();
    }

    // Parse expected sessions (number at end)
    let expectedSessions = 1;
    const sessMatch = rest.match(/\b(\d+)\s*$/);
    if (sessMatch) {
      expectedSessions = parseInt(sessMatch[1]!, 10);
      rest = rest.replace(/\b\d+\s*$/, '').trim();
    }

    if (!rest) continue;

    blocks.push({ id, startTime, endTime, label: rest, expectedSessions, priority, project });
  }

  savePlanForDate({ date: today, theme, blocks });
}
