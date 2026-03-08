import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import type { View } from '../../types.js';
import { tmpFile, spawnEditorSafe } from './utils.js';
import { LIMITS } from '../sanitize.js';
import { formatTasks, parseTasks } from './tasks.js';
import { formatReminders, parseReminders } from './reminders.js';
import { formatTracker, parseTracker } from './tracker.js';
import { formatGoals, parseGoals } from './goals.js';
import { formatStats } from './stats.js';
import { formatKeybindings, parseKeybindings } from './keybindings.js';
import { CONFIG_DIR } from '../paths.js';

export { openSessionsInNvim } from './sessions.js';
export { openSequencesInNvim } from './sequences.js';

const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');
const SKIPPED_VIEWS: View[] = ['timer', 'web', 'clock'];

// Shared state: ConfigView sets this so Ctrl+G knows which sub-view is active
let configSubMode: string = 'main';
let trackerWeekContext: string | null = null;

export function setConfigSubMode(mode: string): void {
  configSubMode = mode;
}

export function setTrackerWeekContext(weekStr: string | null): void {
  trackerWeekContext = weekStr;
}

// ─── Main Entry ──────────────────────────────────────────────────────────────

export function openInNvim(view: View): boolean {
  if (SKIPPED_VIEWS.includes(view)) return false;

  // Config: keybindings sub-mode gets formatted editor, otherwise open config.json
  if (view === 'config') {
    if (configSubMode === 'keybindings') {
      const { content, tmpPath } = formatKeybindings();
      fs.writeFileSync(tmpPath, content);

      spawnEditorSafe([tmpPath]);

      const edited = fs.readFileSync(tmpPath, 'utf8');
      try {
        if (edited !== content) {
          parseKeybindings(edited);
        }
      } finally {
        try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
      }
      return true;
    }

    // Default: open config.json directly
    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
    if (!fs.existsSync(CONFIG_PATH)) {
      fs.writeFileSync(CONFIG_PATH, '{}');
    }
    spawnEditorSafe([CONFIG_PATH]);
    return true;
  }

  const { content, tmpPath, cursorLine } = formatView(view);
  fs.writeFileSync(tmpPath, content);

  const args = cursorLine ? [`+${cursorLine}`, tmpPath] : [tmpPath];
  spawnEditorSafe(args);

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

// ─── Format ──────────────────────────────────────────────────────────────────

function formatView(view: View): { content: string; tmpPath: string; cursorLine?: number } {
  switch (view) {
    case 'tasks': return { content: formatTasks(), tmpPath: tmpFile('tasks') };
    case 'reminders': return { content: formatReminders(), tmpPath: tmpFile('reminders') };
    case 'tracker': return { content: formatTracker(trackerWeekContext ?? undefined), tmpPath: tmpFile('tracker') };
    case 'graphs': return { content: formatGoals(), tmpPath: tmpFile('goals') };
    case 'stats': return { content: formatStats(), tmpPath: tmpFile('stats') };
    default: return { content: '', tmpPath: tmpFile(view) };
  }
}

// ─── Parse & Save Router ────────────────────────────────────────────────────

function parseAndSave(view: View, text: string): void {
  // Reject excessively large input to prevent data corruption / OOM
  if (text.length > LIMITS.MAX_FILE_SIZE) return;

  switch (view) {
    case 'tasks': parseTasks(text); break;
    case 'reminders': parseReminders(text); break;
    case 'tracker': parseTracker(text); break;
    case 'graphs': parseGoals(text); break;
    // 'stats' is read-only: no case needed, default does nothing
  }
}
