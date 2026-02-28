import { nanoid } from 'nanoid';
import { loadGoals, saveGoals } from '../goals.js';
import type { TrackedGoal } from '../goals.js';

export function formatGoals(): string {
  const data = loadGoals();
  const lines: string[] = [];

  // Goals section
  lines.push('# Goals');
  for (const g of data.goals) {
    let line = `[${g.color}] ${g.name}`;
    if (g.type === 'manual') line += ' (manual)';
    else if (g.type === 'auto') line += ` (auto:${g.autoProject ?? ''})`;
    else if (g.type === 'rate') line += ` (rate:${g.rateMax ?? 5})`;
    else if (g.type === 'note') line += ' (note)';
    line += `  %id:${g.id}`;
    lines.push(line);
  }

  // Completions section
  const manualGoals = data.goals.filter(g => g.type === 'manual' || g.type === 'auto');
  if (manualGoals.length > 0) {
    lines.push('');
    lines.push('# Completions');
    for (const g of manualGoals) {
      const dates = data.completions[g.id] ?? [];
      if (dates.length > 0) {
        lines.push(`${g.name}: ${dates.sort().join(', ')}`);
      }
    }
  }

  // Ratings section
  const rateGoals = data.goals.filter(g => g.type === 'rate');
  if (rateGoals.length > 0) {
    lines.push('');
    lines.push('# Ratings');
    for (const g of rateGoals) {
      const ratings = data.ratings[g.id] ?? {};
      const entries = Object.entries(ratings).sort(([a], [b]) => a.localeCompare(b));
      if (entries.length > 0) {
        lines.push(`${g.name}: ${entries.map(([d, v]) => `${d}=${v}`).join(', ')}`);
      }
    }
  }

  // Notes section
  const noteGoals = data.goals.filter(g => g.type === 'note');
  if (noteGoals.length > 0) {
    lines.push('');
    lines.push('# Notes');
    for (const g of noteGoals) {
      const notes = data.notes[g.id] ?? {};
      const entries = Object.entries(notes).sort(([a], [b]) => a.localeCompare(b));
      for (const [date, text] of entries) {
        if (text) lines.push(`${g.name}|${date}: ${text}`);
      }
    }
  }

  return lines.join('\n') + '\n';
}

export function parseGoals(text: string): void {
  const lines = text.split('\n');
  const data = loadGoals();
  let section = '';

  const newGoals: TrackedGoal[] = [];
  const goalIdByName = new Map<string, string>();
  const seenIds = new Set<string>();
  const newCompletions: Record<string, string[]> = {};
  const newRatings: Record<string, Record<string, number>> = {};
  const newNotes: Record<string, Record<string, string>> = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed === '# Goals') { section = 'goals'; continue; }
    if (trimmed === '# Completions') { section = 'completions'; continue; }
    if (trimmed === '# Ratings') { section = 'ratings'; continue; }
    if (trimmed === '# Notes') { section = 'notes'; continue; }

    if (section === 'goals') {
      const idMatch = trimmed.match(/%id:(\S+)/);
      const id = idMatch ? idMatch[1]! : nanoid();
      seenIds.add(id);

      let rest = trimmed.replace(/%id:\S+/, '').trim();

      // Parse [color]
      const colorMatch = rest.match(/^\[(\w+)\]\s*/);
      const color = colorMatch ? colorMatch[1]! : 'cyan';
      rest = rest.replace(/^\[\w+\]\s*/, '');

      // Parse type
      let type: 'manual' | 'auto' | 'rate' | 'note' = 'manual';
      let autoProject: string | undefined;
      let rateMax: number | undefined;

      const typeMatch = rest.match(/\((manual|note|auto:([^)]*)|rate:(\d+))\)\s*$/);
      if (typeMatch) {
        if (typeMatch[1] === 'manual') type = 'manual';
        else if (typeMatch[1] === 'note') type = 'note';
        else if (typeMatch[1]!.startsWith('auto:')) {
          type = 'auto';
          autoProject = typeMatch[2] || undefined;
        } else if (typeMatch[1]!.startsWith('rate:')) {
          type = 'rate';
          rateMax = parseInt(typeMatch[3]!, 10);
        }
        rest = rest.replace(/\([^)]+\)\s*$/, '').trim();
      }

      const name = rest;
      newGoals.push({ id, name, color, type, autoProject, rateMax });
      goalIdByName.set(name, id);

      // Preserve existing data
      newCompletions[id] = data.completions[id] ?? [];
      newRatings[id] = data.ratings[id] ?? {};
      newNotes[id] = data.notes[id] ?? {};
    }

    if (section === 'completions') {
      const match = trimmed.match(/^(.+?):\s*(.+)$/);
      if (match) {
        const name = match[1]!.trim();
        const dates = match[2]!.split(',').map(d => d.trim()).filter(Boolean);
        const id = goalIdByName.get(name);
        if (id) newCompletions[id] = dates;
      }
    }

    if (section === 'ratings') {
      const match = trimmed.match(/^(.+?):\s*(.+)$/);
      if (match) {
        const name = match[1]!.trim();
        const entries = match[2]!.split(',').map(e => e.trim()).filter(Boolean);
        const id = goalIdByName.get(name);
        if (id) {
          newRatings[id] = {};
          for (const e of entries) {
            const [date, val] = e.split('=');
            if (date && val) newRatings[id]![date.trim()] = parseInt(val.trim(), 10);
          }
        }
      }
    }

    if (section === 'notes') {
      // Format: GoalName|2026-02-25: note text
      const match = trimmed.match(/^(.+?)\|(\d{4}-\d{2}-\d{2}):\s*(.+)$/);
      if (match) {
        const name = match[1]!.trim();
        const date = match[2]!;
        const noteText = match[3]!;
        const id = goalIdByName.get(name);
        if (id) {
          if (!newNotes[id]) newNotes[id] = {};
          newNotes[id]![date] = noteText;
        }
      }
    }
  }

  // Preserve overrides from existing data
  const overrides: Record<string, string[]> = {};
  for (const g of newGoals) {
    overrides[g.id] = data.overrides[g.id] ?? [];
  }

  saveGoals({
    goals: newGoals,
    completions: newCompletions,
    overrides,
    ratings: newRatings,
    notes: newNotes,
  });
}
