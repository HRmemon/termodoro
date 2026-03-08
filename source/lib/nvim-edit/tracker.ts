import {
  ALL_SLOTS, DAY_NAMES, getWeekDates, getISOWeekStr, getMondayOfWeek,
  loadWeek, saveWeek, createWeek, getCategories,
} from '../tracker.js';
import { clampStr, LIMITS } from '../sanitize.js';

export function formatTracker(): string {
  const now = new Date();
  const monday = getMondayOfWeek(now);
  const weekStr = getISOWeekStr(monday);
  const weekData = loadWeek(weekStr) ?? createWeek(now);
  const dates = getWeekDates(weekData.start);

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
      if (code) {
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
  const existingSlotCount = Object.values(weekData.slots).reduce((sum, day) => sum + Object.keys(day).length, 0);

  // Parse grid
  const newSlots: Record<string, Record<string, string>> = {};
  const notes: Record<string, string> = {};
  let inNotes = false;
  let parsedSlotRows = 0;

  for (const line of lines) {
    if (line.startsWith('--- Notes ---')) {
      inNotes = true;
      continue;
    }

    if (inNotes) {
      const noteMatch = line.match(/^(\d{4}-\d{2}-\d{2}):\s*(.+)/);
      if (noteMatch) {
        notes[noteMatch[1]!] = clampStr(noteMatch[2]!.trim(), LIMITS.LONG_TEXT);
      }
      continue;
    }

    // Match slot lines like "06:00     -     S     ..."
    const slotMatch = line.match(/^(\d{2}:\d{2})\s+(.+)/);
    if (!slotMatch) continue;
    const slot = slotMatch[1]!;
    if (!ALL_SLOTS.includes(slot)) continue;
    parsedSlotRows++;

    const values = slotMatch[2]!.trim().split(/\s+/);
    for (let i = 0; i < dates.length && i < values.length; i++) {
      const val = values[i]!;
      const date = dates[i]!;
      if (val === '-' || val.startsWith('?')) continue; // skip empty and pending suggestions
      const normalized = clampStr(val, 8);
      // Accept known category codes and preserve unknown legacy/custom codes.
      if (!/^[A-Za-z0-9_-]+$/.test(normalized)) continue;
      if (!newSlots[date]) newSlots[date] = {};
      newSlots[date]![slot] = normalized;
    }
  }

  const newSlotCount = Object.values(newSlots).reduce((sum, day) => sum + Object.keys(day).length, 0);
  // Safety: avoid destructive wipe when an editor save strips/changes content unexpectedly.
  if (parsedSlotRows === 0) return;
  if (newSlotCount === 0 && existingSlotCount > 0) return;

  // Merge: replace slots but preserve pending
  weekData.slots = {};
  for (const [date, slots] of Object.entries(newSlots)) {
    weekData.slots[date] = slots;
  }
  weekData.notes = notes;
  saveWeek(weekData);
}
