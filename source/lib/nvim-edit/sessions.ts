import fs from 'fs';
import { spawnSync } from 'child_process';
import type { Session } from '../../types.js';
import { loadSessions } from '../store.js';
import { updateSession } from '../session-db.js';
import { getSessionsForDateRange } from '../stats.js';
import { tmpFile } from './utils.js';

function formatSessions(): string {
  const today = new Date();
  const pad2 = (n: number) => String(n).padStart(2, '0');
  const todayStr = `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`;

  const sessions = getSessionsForDateRange(todayStr, todayStr);

  const lines: string[] = [];
  lines.push(`# Sessions: ${todayStr}`);
  lines.push('# Read-only: type, status, time, duration. Editable: label, project, tag, energy, distraction.');
  lines.push('');

  for (const s of sessions.filter(s => s.endedAt)) {
    const startTime = s.startedAt.slice(11, 16);
    const endTime = s.endedAt.slice(11, 16);
    const actualMin = Math.round(s.durationActual / 60);
    const plannedMin = Math.round(s.durationPlanned / 60);
    lines.push(`## ${startTime}-${endTime} ${s.type} ${s.status} ${actualMin}m (${plannedMin}m planned)`);
    if (s.label) lines.push(`label: ${s.label}`);
    if (s.project) lines.push(`project: ${s.project}`);
    if (s.tag) lines.push(`tag: ${s.tag}`);
    if (s.energyLevel) lines.push(`energy: ${s.energyLevel}`);
    if (s.distractionScore !== undefined) lines.push(`distraction: ${s.distractionScore}`);
    lines.push(`%id:${s.id}`);
    lines.push('');
  }

  return lines.join('\n');
}

function parseSessions(text: string): void {
  const allSessions = loadSessions();
  const allMap = new Map(allSessions.map(s => [s.id, s]));

  // Split into ## blocks
  const blocks = text.split(/^## .+$/m).slice(1);

  for (let i = 0; i < blocks.length; i++) {
    const blockText = blocks[i] ?? '';
    const idMatch = blockText.match(/^%id:(\S+)/m);
    if (!idMatch) continue;
    const id = idMatch[1]!;

    const existing = allMap.get(id);
    if (!existing) continue;

    // Parse editable key-value lines
    const labelMatch = blockText.match(/^label:\s*(.+)$/m);
    const projectMatch = blockText.match(/^project:\s*(.+)$/m);
    const tagMatch = blockText.match(/^tag:\s*(.+)$/m);
    const energyMatch = blockText.match(/^energy:\s*(.+)$/m);
    const distractionMatch = blockText.match(/^distraction:\s*(\d+(?:\.\d+)?)$/m);

    const updated: Session = {
      ...existing,
      label: labelMatch ? labelMatch[1]!.trim() : undefined,
      project: projectMatch ? projectMatch[1]!.trim() : undefined,
      tag: tagMatch ? tagMatch[1]!.trim() : undefined,
      energyLevel: energyMatch && ['high', 'medium', 'low'].includes(energyMatch[1]!.trim())
        ? (energyMatch[1]!.trim() as Session['energyLevel'])
        : existing.energyLevel,
      distractionScore: distractionMatch
        ? parseFloat(distractionMatch[1]!)
        : undefined,
    };

    updateSession(updated);
  }
}

export function openSessionsInNvim(): void {
  const content = formatSessions();
  const tmpPath = tmpFile('sessions');
  fs.writeFileSync(tmpPath, content);

  const editor = process.env.EDITOR || 'nvim';
  spawnSync(editor, [tmpPath], { stdio: 'inherit' });

  const edited = fs.readFileSync(tmpPath, 'utf8');
  try {
    if (edited !== content) {
      parseSessions(edited);
    }
  } finally {
    try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
  }
}
