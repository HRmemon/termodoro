import {
  ALL_SLOTS, DAY_NAMES, getWeekDates, getISOWeekStr, getMondayOfWeek,
  loadWeek, saveWeek, createWeek, getCategories,
} from '../tracker.js';

export function formatTracker(): string {
  const now = new Date();
  const monday = getMondayOfWeek(now);
  const weekStr = getISOWeekStr(monday);
  const weekData = loadWeek(weekStr) ?? createWeek(now);
  const dates = getWeekDates(weekData.start);
  const categories = getCategories();
  const codeSet = new Set(categories.map(c => c.code));

  const lines: string[] = [];
  lines.push(`Week: ${weekStr}`);
  lines.push('');

  // Header
  const header = '          ' + DAY_NAMES.map(d => d.padStart(6)).join('');
  lines.push(header);

  // Grid (confirmed slots + pending suggestions shown as ?CODE)
  for (const slot of ALL_SLOTS) {
    let row = slot.padEnd(10);
    for (const date of dates) {
      const code = weekData.slots[date]?.[slot];
      if (code && codeSet.has(code)) {
        row += code.padStart(6);
      } else {
        const pending = weekData.pending[date]?.[slot];
        if (pending) {
          row += `?${pending.suggested}`.padStart(6);
        } else {
          row += '-'.padStart(6);
        }
      }
    }
    lines.push(row);
  }

  // Notes
  const noteDates = dates.filter(d => weekData.notes[d]);
  if (noteDates.length > 0) {
    lines.push('');
    lines.push('--- Notes ---');
    for (const d of noteDates) {
      lines.push(`${d}: ${weekData.notes[d]}`);
    }
  }

  return lines.join('\n') + '\n';
}

export function parseTracker(text: string): void {
  const lines = text.split('\n');
  let weekStr = '';
  const categories = getCategories();
  const codeSet = new Set(categories.map(c => c.code));

  // Parse week header
  for (const line of lines) {
    const wm = line.match(/^Week:\s*(\S+)/);
    if (wm) { weekStr = wm[1]!; break; }
  }
  if (!weekStr) return;

  const now = new Date();
  const weekData = loadWeek(weekStr) ?? createWeek(now);
  const dates = getWeekDates(weekData.start);

  // Parse grid
  const newSlots: Record<string, Record<string, string>> = {};
  const notes: Record<string, string> = {};
  let inNotes = false;

  for (const line of lines) {
    if (line.startsWith('--- Notes ---')) {
      inNotes = true;
      continue;
    }

    if (inNotes) {
      const noteMatch = line.match(/^(\d{4}-\d{2}-\d{2}):\s*(.+)/);
      if (noteMatch) {
        notes[noteMatch[1]!] = noteMatch[2]!.trim();
      }
      continue;
    }

    // Match slot lines like "06:00     -     S     ..."
    const slotMatch = line.match(/^(\d{2}:\d{2})\s+(.+)/);
    if (!slotMatch) continue;
    const slot = slotMatch[1]!;
    if (!ALL_SLOTS.includes(slot)) continue;

    const values = slotMatch[2]!.trim().split(/\s+/);
    for (let i = 0; i < dates.length && i < values.length; i++) {
      const val = values[i]!;
      const date = dates[i]!;
      if (val === '-' || val.startsWith('?')) continue; // skip empty and pending suggestions
      if (codeSet.has(val)) {
        if (!newSlots[date]) newSlots[date] = {};
        newSlots[date]![slot] = val;
      }
    }
  }

  // Merge: replace slots but preserve pending
  weekData.slots = {};
  for (const [date, slots] of Object.entries(newSlots)) {
    weekData.slots[date] = slots;
  }
  weekData.notes = notes;
  saveWeek(weekData);
}
