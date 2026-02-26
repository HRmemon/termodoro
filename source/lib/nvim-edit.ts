import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { nanoid } from 'nanoid';
import type { View, Task, TimeBlock, ScheduledNotification, Session, SessionSequence, SequenceBlock } from '../types.js';
import { loadTasks, saveTasks } from './tasks.js';
import { getPlanForDate, savePlanForDate, loadSessions, saveSessions } from './store.js';
import { loadReminders, saveReminders } from './reminders.js';
import { loadGoals, saveGoals } from './goals.js';
import type { TrackedGoal } from './goals.js';
import {
  ALL_SLOTS, DAY_NAMES, getWeekDates, getISOWeekStr, getMondayOfWeek,
  loadWeek, saveWeek, createWeek, getCategories,
} from './tracker.js';
import { loadSequences, saveSequences } from './sequences.js';
import {
  getDailyStats,
  getWeeklyStats,
  getTaskBreakdown,
  getStreaks,
  getSessionsForDateRange,
} from './stats.js';

const CONFIG_PATH = path.join(os.homedir(), '.config', 'pomodorocli', 'config.json');
const SKIPPED_VIEWS: View[] = ['timer', 'web', 'clock'];

// ─── Main Entry ──────────────────────────────────────────────────────────────

export function openInNvim(view: View): boolean {
  if (SKIPPED_VIEWS.includes(view)) return false;

  // Config: open directly
  if (view === 'config') {
    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
    if (!fs.existsSync(CONFIG_PATH)) {
      fs.writeFileSync(CONFIG_PATH, '{}');
    }
    const editor = process.env.EDITOR || 'nvim';
    spawnSync(editor, [CONFIG_PATH], { stdio: 'inherit' });
    return true;
  }

  const { content, tmpPath } = formatView(view);
  fs.writeFileSync(tmpPath, content);

  const editor = process.env.EDITOR || 'nvim';
  spawnSync(editor, [tmpPath], { stdio: 'inherit' });

  const edited = fs.readFileSync(tmpPath, 'utf8');
  try {
    if (edited !== content) {
      parseAndSave(view, edited);
    }
  } finally {
    try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
  }
  return true;
}

function tmpFile(view: string): string {
  const rand = nanoid(8);
  return `/tmp/pomodorocli-${view}-${rand}.md`;
}

// ─── Format ──────────────────────────────────────────────────────────────────

function formatView(view: View): { content: string; tmpPath: string } {
  switch (view) {
    case 'tasks': return { content: formatTasks(), tmpPath: tmpFile('tasks') };
    case 'reminders': return { content: formatReminders(), tmpPath: tmpFile('reminders') };
    case 'tracker': return { content: formatTracker(), tmpPath: tmpFile('tracker') };
    case 'graphs': return { content: formatGoals(), tmpPath: tmpFile('goals') };
    case 'stats': return { content: formatStats(), tmpPath: tmpFile('stats') };
    default: return { content: '', tmpPath: tmpFile(view) };
  }
}

// ─── Tasks ───────────────────────────────────────────────────────────────────

function formatTasks(): string {
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

function parseTasks(text: string): void {
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

// ─── Plan ────────────────────────────────────────────────────────────────────

function formatPlan(): string {
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

function parsePlan(text: string): void {
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

// ─── Reminders ───────────────────────────────────────────────────────────────

function formatReminders(): string {
  const reminders = loadReminders();
  return reminders.map(r => {
    const check = r.enabled ? '[x]' : '[ ]';
    let line = `${check} ${r.time} ${r.title}`;
    if (r.recurring) line += ' (r)';
    line += `  %id:${r.id}`;
    return line;
  }).join('\n') + '\n';
}

function parseReminders(text: string): void {
  const lines = text.split('\n').filter(l => l.trim());
  const existing = loadReminders();
  const existingMap = new Map(existing.map(r => [r.id, r]));
  const result: ScheduledNotification[] = [];

  for (const line of lines) {
    const idMatch = line.match(/%id:(\S+)/);
    const id = idMatch ? idMatch[1]! : nanoid();

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
      title,
      enabled,
      recurring,
      taskId: old?.taskId,
    });
  }

  saveReminders(result);
}

// ─── Tracker ─────────────────────────────────────────────────────────────────

function formatTracker(): string {
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

function parseTracker(text: string): void {
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

// ─── Goals/Graphs ────────────────────────────────────────────────────────────

function formatGoals(): string {
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

function parseGoals(text: string): void {
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

// ─── Parse & Save Router ────────────────────────────────────────────────────

function parseAndSave(view: View, text: string): void {
  switch (view) {
    case 'tasks': parseTasks(text); break;
    case 'reminders': parseReminders(text); break;
    case 'tracker': parseTracker(text); break;
    case 'graphs': parseGoals(text); break;
    // 'stats' is read-only: no case needed, default does nothing
  }
}

// ─── Stats (Read-only) ───────────────────────────────────────────────────────

function fmtMin(minutes: number): string {
  if (minutes < 1) return '0m';
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${Math.round(minutes)}m`;
}

function barChart(value: number, max: number, width = 16): string {
  if (max <= 0) return '';
  const filled = Math.round((value / max) * width);
  return '█'.repeat(Math.min(filled, width));
}

function formatStats(): string {
  const now = new Date();
  const pad2 = (n: number) => String(n).padStart(2, '0');
  const todayStr = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  const generated = `${todayStr} ${pad2(now.getHours())}:${pad2(now.getMinutes())}`;

  // Week range (Mon-Sun)
  const dayOfWeek = now.getDay();
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - daysFromMonday);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  const weekStartStr = `${weekStart.getFullYear()}-${pad2(weekStart.getMonth() + 1)}-${pad2(weekStart.getDate())}`;
  const daily = getDailyStats(todayStr);
  const weekly = getWeeklyStats(weekStartStr);
  const allSessions = loadSessions();
  const breakdown = getTaskBreakdown(allSessions);
  const streaks = getStreaks();

  const completionPct = daily.sessionsTotal > 0
    ? Math.round((daily.sessionsCompleted / daily.sessionsTotal) * 100)
    : 0;

  const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const maxDayMin = Math.max(1, ...weekly.heatmap.map(d => d.focusMinutes));

  const maxProjectMin = Math.max(1, ...breakdown.byProject.map(p => p.minutes));
  const maxTagMin = Math.max(1, ...breakdown.byTag.map(t => t.minutes));

  const recentSessions = allSessions
    .filter(s => s.type === 'work' && s.status === 'completed')
    .slice(-10)
    .reverse();

  const lines: string[] = [];

  lines.push('# Pomodoro Stats Report');
  lines.push(`# Generated: ${generated}`);
  lines.push('# This report is read-only. Edits are not saved.');
  lines.push('');

  lines.push(`## Today (${todayStr})`);
  lines.push(`Focus:      ${fmtMin(daily.focusMinutes)}`);
  lines.push(`Break:      ${fmtMin(daily.breakMinutes)}`);
  lines.push(`Sessions:   ${daily.sessionsCompleted}/${daily.sessionsTotal} (${completionPct}% completion)`);
  lines.push('');

  const weekMonLabel = weekStart.toLocaleDateString('en-US', { weekday: 'short', month: '2-digit', day: '2-digit' }).replace(',', '');
  const weekSunLabel = weekEnd.toLocaleDateString('en-US', { weekday: 'short', month: '2-digit', day: '2-digit' }).replace(',', '');
  lines.push(`## This Week (${weekMonLabel} to ${weekSunLabel})`);
  lines.push(`Total focus: ${fmtMin(weekly.totalFocusMinutes)}`);
  lines.push(`Avg session: ${fmtMin(weekly.avgSessionLength)}`);
  lines.push(`Longest streak: ${weekly.longestStreak} days`);
  lines.push('');
  lines.push('  Day        Focus     Sessions');
  for (let i = 0; i < weekly.heatmap.length; i++) {
    const day = weekly.heatmap[i]!;
    const label = DAY_LABELS[i]!;
    const dateLabel = day.date.slice(5); // MM-DD
    const bar = barChart(day.focusMinutes, maxDayMin, 12);
    const focusCol = fmtMin(day.focusMinutes).padEnd(9);
    lines.push(`  ${label} ${dateLabel}  ${focusCol} ${day.sessions}  ${bar}`);
  }
  lines.push('');

  if (breakdown.byProject.length > 0) {
    lines.push('## Projects (all time)');
    for (const p of breakdown.byProject.slice(0, 10)) {
      const bar = barChart(p.minutes, maxProjectMin);
      const nameCol = p.label.padEnd(16);
      lines.push(`  ${nameCol} ${fmtMin(p.minutes).padEnd(8)} ${bar}`);
    }
    lines.push('');
  }

  if (breakdown.byTag.length > 0) {
    lines.push('## Tags (all time)');
    for (const t of breakdown.byTag.slice(0, 10)) {
      const bar = barChart(t.minutes, maxTagMin);
      const nameCol = t.label.padEnd(16);
      lines.push(`  ${nameCol} ${fmtMin(t.minutes).padEnd(8)} ${bar}`);
    }
    lines.push('');
  }

  lines.push('## Streaks');
  lines.push(`Current streak:    ${streaks.currentStreak} days`);
  lines.push(`Personal best:     ${streaks.personalBest} days`);
  lines.push(`Deep work (week):  ${streaks.deepWorkHoursThisWeek.toFixed(1)}h`);
  lines.push('');

  if (recentSessions.length > 0) {
    lines.push('## Recent Sessions (last 10)');
    for (const s of recentSessions) {
      const date = s.startedAt.slice(0, 10);
      const time = s.startedAt.slice(11, 16);
      const dur = fmtMin(s.durationActual / 60);
      let line = `  ${date}  ${time}  ${dur}`;
      if (s.label) line += `  ${s.label}`;
      if (s.project) line += `  #${s.project}`;
      lines.push(line);
    }
  }

  return lines.join('\n') + '\n';
}

// ─── Sessions Editing ────────────────────────────────────────────────────────

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

    allMap.set(id, updated);
  }

  saveSessions([...allMap.values()]);
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

// ─── Sequences Editing ───────────────────────────────────────────────────────

function formatSequences(): string {
  const sequences = loadSequences();
  const lines: string[] = [];

  lines.push('# Sequences');
  lines.push('# Format: name: block block block ...');
  lines.push('# Blocks: Nw (work N min), Nb (break N min)');
  lines.push('# >=20m break = long break, <20m = short break');
  lines.push('# Delete a line to remove. Add a line to create.');
  lines.push('');

  for (const seq of sequences) {
    const blocks = seq.blocks.map(b => `${b.durationMinutes}${b.type === 'work' ? 'w' : 'b'}`).join(' ');
    lines.push(`${seq.name}: ${blocks}`);
  }

  return lines.join('\n') + '\n';
}

function parseSequences(text: string): void {
  const lines = text.split('\n');
  const result: SessionSequence[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Format: name: 45w 15b 45w ...
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx < 0) continue;

    const name = trimmed.slice(0, colonIdx).trim();
    const blockStr = trimmed.slice(colonIdx + 1).trim();
    if (!name || !blockStr) continue;

    const blockTokens = blockStr.split(/\s+/).filter(Boolean);
    const blocks: SequenceBlock[] = [];

    for (const token of blockTokens) {
      const match = token.match(/^(\d+)(w|b)$/);
      if (!match) continue;
      const mins = parseInt(match[1]!, 10);
      if (match[2] === 'w') {
        blocks.push({ type: 'work', durationMinutes: mins });
      } else {
        const breakType: SequenceBlock['type'] = mins >= 20 ? 'long-break' : 'short-break';
        blocks.push({ type: breakType, durationMinutes: mins });
      }
    }

    if (blocks.length > 0) {
      result.push({ name, blocks });
    }
  }

  saveSequences(result);
}

export function openSequencesInNvim(): void {
  const content = formatSequences();
  const tmpPath = tmpFile('sequences');
  fs.writeFileSync(tmpPath, content);

  const editor = process.env.EDITOR || 'nvim';
  spawnSync(editor, [tmpPath], { stdio: 'inherit' });

  const edited = fs.readFileSync(tmpPath, 'utf8');
  try {
    if (edited !== content) {
      parseSequences(edited);
    }
  } finally {
    try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
  }
}
