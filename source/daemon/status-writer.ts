import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execFile } from 'node:child_process';
import type { EngineFullState } from '../engine/timer-engine.js';
import { loadSessions } from '../lib/store.js';
import { getTodayStr } from '../lib/date-utils.js';
import { formatSeconds } from '../lib/format.js';
import { dateToString, getMondayOfWeek, getTrackerTimeSummary } from '../lib/tracker.js';

const STATUS_PATH = path.join(os.tmpdir(), 'pomodorocli-status.json');

// Cached today stats — only recomputed on session events, not every tick
let cachedTodayStats = { count: 0, focusMinutes: 0 };
let cachedStatsDate = '';
let cachedLastFocusEndedAt: number | null = null;

function recomputeTodayStats(today: string = getTodayStr()): void {
  cachedStatsDate = today;
  try {
    const sessions = loadSessions().filter(s => s.type === 'work' && s.status === 'completed');
    const todaySessions = sessions.filter(s => dateToString(new Date(s.startedAt)) === today);
    cachedTodayStats = {
      count: todaySessions.length,
      focusMinutes: Math.round(todaySessions.reduce((sum, s) => sum + s.durationActual, 0) / 60),
    };
    cachedLastFocusEndedAt = sessions.reduce<number | null>((latest, session) => {
      const endedAt = Date.parse(session.endedAt);
      return Number.isNaN(endedAt) || (latest !== null && endedAt <= latest) ? latest : endedAt;
    }, null);
  } catch {
    // Keep stale cache on error
  }
}

// Call this when a session completes/skips/abandons to refresh the cache
export function invalidateTodayStats(): void {
  recomputeTodayStats();
}

function getTodayStats(today: string = getTodayStr()) {
  if (cachedStatsDate !== today) {
    recomputeTodayStats(today);
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

function formatHours(hours: number): string {
  const minutes = Math.round(hours * 60);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h${m ? ` ${m}m` : ''}` : `${m}m`;
}

function formatTrackerSummary(summary: { deepHours: number; wastedHours: number }): string {
  return `${formatHours(summary.deepHours)} | ${formatHours(summary.wastedHours)}`;
}

function formatWaybarTrackerSummary(summary: { deepHours: number; wastedHours: number }): string {
  return `${formatHours(summary.deepHours)} | <span foreground="#ef4444">${formatHours(summary.wastedHours)}</span>`;
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
    // Use one clock snapshot so a write at midnight cannot mix two dates.
    const now = new Date();
    const today = dateToString(now);
    const todayStats = getTodayStats(today);
    const lastFocusSecondsAgo = cachedLastFocusEndedAt === null
      ? null
      : Math.max(0, Math.floor((now.getTime() - cachedLastFocusEndedAt) / 1000));
    const todayTracker = getTrackerTimeSummary(now);
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayTracker = getTrackerTimeSummary(yesterday);
    const monday = getMondayOfWeek(now);
    const daysSinceMonday = (now.getDay() + 6) % 7;
    const weekTracker = Array.from({ length: daysSinceMonday + 1 }, (_, i) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + i);
      return getTrackerTimeSummary(date);
    }).reduce((total, day) => ({
      deepHours: total.deepHours + day.deepHours,
      wastedHours: total.wastedHours + day.wastedHours,
    }), { deepHours: 0, wastedHours: 0 });
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
    const trackerText = formatWaybarTrackerSummary(todayTracker);
    if (!state.isRunning && !state.isPaused) {
      text = trackerText;
    } else if (isStopwatch) {
      text = `${label} ${time} ⏱  ${trackerText}`;
      if (state.isPaused) text += ' ||';
    } else {
      text = `${label} ${time}  ${trackerText}`;
      if (state.isPaused) text += ' ||';
    }

    const tooltipParts: string[] = [];
    if (todayStats.focusMinutes > 0) {
      const h = Math.floor(todayStats.focusMinutes / 60);
      const m = todayStats.focusMinutes % 60;
      tooltipParts.push(h > 0 ? `${h}h ${m}m today` : `${m}m today`);
    }
    tooltipParts.push(lastFocusSecondsAgo === null
      ? 'Last focus: none yet'
      : `Last focus: ${formatSeconds(lastFocusSecondsAgo)} ago`);
    tooltipParts.push(`Today: ${formatTrackerSummary(todayTracker)}`);
    tooltipParts.push(`Yesterday: ${formatTrackerSummary(yesterdayTracker)}`);
    tooltipParts.push(`This week: ${formatTrackerSummary(weekTracker)}`);

    const statusData = {
      updatedAt: now.toISOString(),
      localDate: today,
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
      lastFocusEndedAt: cachedLastFocusEndedAt === null ? null : new Date(cachedLastFocusEndedAt).toISOString(),
      lastFocusSecondsAgo,
      tracker: {
        today: todayTracker,
        yesterday: yesterdayTracker,
        week: weekTracker,
      },
      waybar: {
        text,
        tooltip: tooltipParts.join('\n'),
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
