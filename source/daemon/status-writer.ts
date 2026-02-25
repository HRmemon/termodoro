import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execSync } from 'node:child_process';
import type { EngineFullState } from '../engine/timer-engine.js';
import { loadSessions } from '../lib/store.js';

const STATUS_PATH = path.join(os.tmpdir(), 'pomodorocli-status.json');

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function getSessionIcon(type: string): string {
  return type === 'work' ? '\u{1F345}' : '\u2615'; // tomato or coffee
}

function getWaybarClass(state: EngineFullState): string {
  if (!state.isRunning && !state.isPaused) return 'idle';
  if (state.sessionType === 'work') {
    return state.isPaused ? 'work-paused' : 'work-running';
  }
  return 'break';
}

function getTodayStats() {
  const today = new Date().toISOString().slice(0, 10);
  const sessions = loadSessions().filter(s =>
    s.startedAt.startsWith(today) && s.type === 'work' && s.status === 'completed'
  );
  return {
    count: sessions.length,
    focusMinutes: Math.round(sessions.reduce((sum, s) => sum + s.durationActual, 0) / 60),
  };
}

export function writeStatusFile(state: EngineFullState): void {
  try {
    const todayStats = getTodayStats();
    const icon = getSessionIcon(state.sessionType);
    const time = formatTime(state.secondsLeft);
    const percentage = state.totalSeconds > 0
      ? Math.round((state.secondsLeft / state.totalSeconds) * 100)
      : 0;

    let text = `${icon} ${time}`;
    if (state.currentProject) text += ` #${state.currentProject}`;
    if (!state.isRunning && !state.isPaused) text = `${icon} idle`;
    if (state.isPaused) text += ' [paused]';

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
    fs.writeFileSync(tmp, JSON.stringify(statusData, null, 2) + '\n');
    fs.renameSync(tmp, STATUS_PATH);

    // Signal waybar to refresh (SIGRTMIN+8 = 42 on Linux)
    signalWaybar();
  } catch {
    // Don't crash if status write fails
  }
}

export function clearStatusFile(): void {
  try {
    if (fs.existsSync(STATUS_PATH)) fs.unlinkSync(STATUS_PATH);
  } catch { /* ignore */ }
}

function signalWaybar(): void {
  try {
    // SIGRTMIN is 34 on Linux, so SIGRTMIN+8 = 42
    execSync('pkill -RTMIN+8 waybar 2>/dev/null', { stdio: 'ignore', timeout: 1000 });
  } catch {
    // waybar not running, that's fine
  }
}
