import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execFile } from 'node:child_process';
import type { EngineFullState } from '../engine/timer-engine.js';
import { loadSessions } from '../lib/store.js';

const STATUS_PATH = path.join(os.tmpdir(), 'pomodorocli-status.json');

// Cached today stats — only recomputed on session events, not every tick
let cachedTodayStats = { count: 0, focusMinutes: 0 };
let cachedStatsDate = '';

function recomputeTodayStats(): void {
  const today = new Date().toISOString().slice(0, 10);
  cachedStatsDate = today;
  try {
    const sessions = loadSessions().filter(s =>
      s.startedAt.startsWith(today) && s.type === 'work' && s.status === 'completed'
    );
    cachedTodayStats = {
      count: sessions.length,
      focusMinutes: Math.round(sessions.reduce((sum, s) => sum + s.durationActual, 0) / 60),
    };
  } catch {
    // Keep stale cache on error
  }
}

// Call this when a session completes/skips/abandons to refresh the cache
export function invalidateTodayStats(): void {
  recomputeTodayStats();
}

function getTodayStats() {
  // Recompute if date changed (midnight rollover)
  const today = new Date().toISOString().slice(0, 10);
  if (cachedStatsDate !== today) {
    recomputeTodayStats();
  }
  return cachedTodayStats;
}

// Initialize cache on module load
recomputeTodayStats();

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function getSessionLabel(type: string): string {
  return type === 'work' ? 'F' : 'B';
}

function getWaybarClass(state: EngineFullState): string {
  if (!state.isRunning && !state.isPaused) return 'idle';
  if (state.sessionType === 'work') {
    return state.isPaused ? 'work-paused' : 'work-running';
  }
  return 'break';
}

// Throttle waybar signal to at most once every 5 seconds
let lastWaybarSignal = 0;

function signalWaybar(): void {
  const now = Date.now();
  if (now - lastWaybarSignal < 5000) return;
  lastWaybarSignal = now;

  // Async: does not block the event loop
  execFile('pkill', ['-RTMIN+8', 'waybar'], { timeout: 2000 }, () => {
    // Ignore errors — waybar may not be running
  });
}

export function writeStatusFile(state: EngineFullState): void {
  try {
    const todayStats = getTodayStats();
    const isStopwatch = state.timerMode === 'stopwatch';
    const label = getSessionLabel(state.sessionType);
    const time = isStopwatch
      ? formatTime(state.stopwatchElapsed)
      : formatTime(state.secondsLeft);
    const percentage = isStopwatch ? 0
      : (state.totalSeconds > 0
        ? Math.round((state.secondsLeft / state.totalSeconds) * 100)
        : 0);

    let text: string;
    if (!state.isRunning && !state.isPaused) {
      text = 'idle';
    } else if (isStopwatch) {
      text = `${label} ${time} ⏱`;
      if (state.isPaused) text += ' ||';
    } else {
      text = `${label} ${time}`;
      if (state.isPaused) text += ' ||';
    }

    const tooltipParts: string[] = [];
    if (state.currentProject) tooltipParts.push(`#${state.currentProject}`);
    tooltipParts.push(`Session ${state.sessionNumber}`);
    if (todayStats.focusMinutes > 0) {
      const h = Math.floor(todayStats.focusMinutes / 60);
      const m = todayStats.focusMinutes % 60;
      tooltipParts.push(h > 0 ? `${h}h ${m}m today` : `${m}m today`);
    }

    const statusData = {
      sessionType: state.sessionType,
      secondsLeft: state.secondsLeft,
      totalSeconds: state.totalSeconds,
      isRunning: state.isRunning,
      isPaused: state.isPaused,
      timerMode: state.timerMode,
      stopwatchElapsed: state.stopwatchElapsed,
      project: state.currentProject ?? null,
      sessionNumber: state.sessionNumber,
      totalWorkSessions: state.totalWorkSessions,
      sequenceName: state.sequenceName ?? null,
      sequenceBlockIndex: state.sequenceBlockIndex,
      todayFocusMinutes: todayStats.focusMinutes,
      todaySessions: todayStats.count,
      waybar: {
        text,
        tooltip: tooltipParts.join(' \u2022 '),
        class: getWaybarClass(state),
        percentage,
      },
    };

    const tmp = STATUS_PATH + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(statusData, null, 2) + '\n', { mode: 0o600 });
    fs.renameSync(tmp, STATUS_PATH);

    signalWaybar();
  } catch {
    // Don't crash if status write fails
  }
}

export function initStatusFile(): void {
  try {
    if (fs.existsSync(STATUS_PATH)) {
      fs.chmodSync(STATUS_PATH, 0o600);
    }
  } catch { /* ignore */ }
}

export function clearStatusFile(): void {
  try {
    if (fs.existsSync(STATUS_PATH)) fs.unlinkSync(STATUS_PATH);
  } catch { /* ignore */ }
}
