import { EventEmitter } from 'node:events';
import { nanoid } from 'nanoid';
import type { Config, Session, SessionType, SequenceBlock, SessionSequence, WorkInterval } from '../types.js';
import { appendSession, saveTimerState, clearTimerState, saveStickyProject } from '../lib/store.js';
import type { TimerSnapshot } from '../lib/store.js';
import { notifySessionEnd } from '../lib/notify.js';
import { generateAndStoreSuggestions } from '../lib/tracker.js';

export interface EngineFullState {
  // Timer
  secondsLeft: number;
  totalSeconds: number;
  isRunning: boolean;
  isPaused: boolean;
  isComplete: boolean;
  elapsed: number;
  timerMode: 'countdown' | 'stopwatch';
  stopwatchElapsed: number;
  // Engine
  sessionType: SessionType;
  sessionNumber: number;
  totalWorkSessions: number;
  isStrictMode: boolean;
  currentLabel?: string;
  currentProject?: string;
  durationSeconds: number;
  // Sequence
  sequenceName?: string;
  sequenceBlocks?: SequenceBlock[];
  sequenceBlockIndex: number;
  sequenceIsActive: boolean;
  sequenceIsComplete: boolean;
}

export interface EngineRestoreState {
  sessionType?: SessionType;
  sessionNumber?: number;
  totalWorkSessions?: number;
  label?: string;
  project?: string;
  overrideDuration?: number | null;
  // Timer state
  secondsLeft?: number;
  isRunning?: boolean;
  isPaused?: boolean;
  startedAt?: string;
  timerMode?: 'countdown' | 'stopwatch';
  stopwatchElapsed?: number;
  // Sequence state
  sequenceName?: string;
  sequenceBlocks?: SequenceBlock[];
  sequenceBlockIndex?: number;
  // Work intervals
  workIntervals?: WorkInterval[];
}

// Events emitted by the engine
export interface EngineEvents {
  'tick': [state: EngineFullState];
  'state:change': [state: EngineFullState];
  'session:start': [data: { sessionType: SessionType; project?: string; startedAt: string }];
  'session:complete': [data: { session: Session }];
  'session:skip': [data: { session: Session }];
  'session:abandon': [data: { session: Session }];
  'break:start': [data: { sessionType: SessionType; duration: number }];
  'sequence:advance': [data: { block: SequenceBlock; index: number }];
  'sequence:complete': [];
  'timer:pause': [state: EngineFullState];
  'timer:resume': [state: EngineFullState];
}

export class PomodoroEngine extends EventEmitter {
  private config: Config;

  // Timer state
  private secondsLeft: number;
  private totalSeconds: number;
  private isRunning = false;
  private isPaused = false;
  private isComplete = false;
  private interval: ReturnType<typeof setInterval> | null = null;

  // Stopwatch state
  private timerMode: 'countdown' | 'stopwatch' = 'countdown';
  private stopwatchElapsed: number = 0;

  // Session engine state
  private sessionType: SessionType = 'work';
  private sessionNumber = 1;
  private totalWorkSessions = 0;
  private currentLabel?: string;
  private currentProject?: string;
  private overrideDuration: number | null = null;
  private sessionStartedAt: string | null = null;

  // Work interval tracking (for accurate session logging)
  private workIntervals: WorkInterval[] = [];

  // Sequence state
  private sequence: SessionSequence | null = null;
  private sequenceBlockIndex = 0;
  private sequenceComplete = false;

  // Lifecycle
  private disposed = false;

  constructor(config: Config, initialState?: EngineRestoreState) {
    super();
    this.config = config;

    // Apply initial state
    if (initialState) {
      this.sessionType = initialState.sessionType ?? 'work';
      this.sessionNumber = initialState.sessionNumber ?? 1;
      this.totalWorkSessions = initialState.totalWorkSessions ?? 0;
      this.currentLabel = initialState.label;
      this.currentProject = initialState.project;
      this.overrideDuration = initialState.overrideDuration ?? null;
      this.sessionStartedAt = initialState.startedAt ?? null;

      // Restore sequence
      if (initialState.sequenceName && initialState.sequenceBlocks) {
        this.sequence = { name: initialState.sequenceName, blocks: initialState.sequenceBlocks };
        this.sequenceBlockIndex = initialState.sequenceBlockIndex ?? 0;
      }

      // Restore stopwatch state
      if (initialState.timerMode) this.timerMode = initialState.timerMode;
      if (initialState.stopwatchElapsed !== undefined) this.stopwatchElapsed = initialState.stopwatchElapsed;
      if (initialState.workIntervals) this.workIntervals = initialState.workIntervals;

      // Restore timer
      if (initialState.isRunning) {
        if (initialState.isPaused) {
          this.isRunning = true;
          this.isPaused = true;
        } else {
          this.isRunning = true;
          this.isPaused = false;
        }
      }
    }

    // Compute duration
    this.totalSeconds = this.computeDuration();
    this.secondsLeft = initialState?.secondsLeft ?? this.totalSeconds;
  }

  private computeDuration(): number {
    if (this.overrideDuration !== null) return this.overrideDuration;
    return this.getDurationForType(this.sessionType);
  }

  getDurationForType(type: SessionType): number {
    switch (type) {
      case 'work': return this.config.workDuration * 60;
      case 'short-break': return this.config.shortBreakDuration * 60;
      case 'long-break': return this.config.longBreakDuration * 60;
    }
  }

  // --- Public API ---

  start(): void {
    if (this.disposed) return;
    if (this.isRunning && !this.isPaused) return;

    if (this.isPaused) {
      // Resume
      this.isPaused = false;
      this.startTickInterval();
      // Recalculate startedAt for accurate wall-clock tracking
      const now = new Date();
      const elapsed = this.timerMode === 'stopwatch'
        ? this.stopwatchElapsed
        : this.totalSeconds - this.secondsLeft;
      this.sessionStartedAt = new Date(now.getTime() - elapsed * 1000).toISOString();
      // Track new work interval
      this.workIntervals.push({ start: now.toISOString(), end: null });
      this.persistState();
      const state = this.getState();
      this.emit('timer:resume', state);
      this.emit('state:change', state);
      return;
    }

    // Fresh start
    const freshNow = new Date().toISOString();
    this.isRunning = true;
    this.isPaused = false;
    this.isComplete = false;
    this.sessionStartedAt = freshNow;
    this.workIntervals = [{ start: freshNow, end: null }];
    this.startTickInterval();
    this.persistState();

    this.emit('session:start', {
      sessionType: this.sessionType,
      project: this.currentProject,
      startedAt: this.sessionStartedAt,
    });
    this.emit('state:change', this.getState());
  }

  pause(): void {
    if (!this.isRunning || this.isPaused) return;
    if (this.config.strictMode) return;

    this.isPaused = true;
    this.stopTickInterval();
    // Close current work interval
    if (this.workIntervals.length > 0) {
      const last = this.workIntervals[this.workIntervals.length - 1]!;
      if (last.end === null) last.end = new Date().toISOString();
    }
    this.persistState();
    const state = this.getState();
    this.emit('timer:pause', state);
    this.emit('state:change', state);
  }

  toggle(): void {
    if (!this.isRunning) {
      this.start();
    } else if (this.isPaused) {
      this.start(); // resumes
    } else {
      this.pause();
    }
  }

  skip(): void {
    if (!this.isRunning && !this.isPaused) return;
    if (this.config.strictMode) return;
    if (this.timerMode === 'stopwatch') return;

    this.stopTickInterval();
    const session = this.saveSession('skipped');
    this.emit('session:skip', { session });

    this.advanceToNext();

    // Handle sequence
    if (this.sequence && !this.sequenceComplete) {
      this.advanceSequence();
    }

    clearTimerState();
    this.emit('state:change', this.getState());
  }

  reset(): void {
    this.stopTickInterval();
    this.isRunning = false;
    this.isPaused = false;
    this.isComplete = false;
    this.timerMode = 'countdown';
    this.stopwatchElapsed = 0;
    this.totalSeconds = this.computeDuration();
    this.secondsLeft = this.totalSeconds;
    this.sessionStartedAt = null;
    this.workIntervals = [];
    clearTimerState();
    this.emit('state:change', this.getState());
  }

  resetAndLog(asProductive: boolean): void {
    const elapsed = this.timerMode === 'stopwatch'
      ? this.stopwatchElapsed
      : this.totalSeconds - this.secondsLeft;
    if (elapsed >= 10) {
      if (asProductive) {
        this.completeCurrentSession();
      } else {
        this.abandonCurrentSession();
      }
    }
    this.reset();
  }

  abandon(): void {
    if (this.sessionStartedAt) {
      this.abandonCurrentSession();
    }
    this.stopTickInterval();
    this.isRunning = false;
    this.isPaused = false;
    this.timerMode = 'countdown';
    this.stopwatchElapsed = 0;
    clearTimerState();
    this.emit('state:change', this.getState());
  }

  setProject(project: string): void {
    this.currentProject = project || undefined;
    saveStickyProject(project || undefined);
    this.emit('state:change', this.getState());
  }

  setLabel(label: string): void {
    this.currentLabel = label || undefined;
    this.emit('state:change', this.getState());
  }

  setDuration(minutes: number): void {
    if (minutes <= 0 || minutes > 180) return;
    this.overrideDuration = minutes * 60;
    this.totalSeconds = minutes * 60;
    this.secondsLeft = minutes * 60;
    this.isRunning = false;
    this.isPaused = false;
    this.isComplete = false;
    this.timerMode = 'countdown';
    this.stopwatchElapsed = 0;
    this.stopTickInterval();
    clearTimerState();
    this.emit('state:change', this.getState());
  }

  activateSequence(seq: SessionSequence): void {
    this.sequence = seq;
    this.sequenceBlockIndex = 0;
    this.sequenceComplete = false;

    const firstBlock = seq.blocks[0];
    if (firstBlock) {
      this.applySequenceBlock(firstBlock);
    }
    this.emit('state:change', this.getState());
  }

  clearSequence(): void {
    this.sequence = null;
    this.sequenceBlockIndex = 0;
    this.sequenceComplete = false;
    this.overrideDuration = null;
    this.totalSeconds = this.computeDuration();
    if (!this.isRunning && !this.isPaused) {
      this.secondsLeft = this.totalSeconds;
    }
    this.emit('state:change', this.getState());
  }

  switchToStopwatch(): void {
    if (this.timerMode === 'stopwatch') return;

    // Convert elapsed so far
    const elapsedSoFar = this.isRunning || this.isPaused
      ? this.totalSeconds - this.secondsLeft
      : 0;
    this.timerMode = 'stopwatch';
    this.stopwatchElapsed = elapsedSoFar;

    this.persistState();
    this.emit('state:change', this.getState());
  }

  stopStopwatch(): void {
    if (this.timerMode !== 'stopwatch') return;

    this.stopTickInterval();

    if (this.stopwatchElapsed >= 10 && this.sessionStartedAt) {
      const session = this.saveStopwatchSession();
      this.emit('session:complete', { session });

      if (this.sessionType === 'work') {
        try {
          generateAndStoreSuggestions(session.intervals);
        } catch { /* swallow */ }
      }
    }

    clearTimerState();
    this.advanceToNext();

    this.timerMode = 'countdown';
    this.stopwatchElapsed = 0;

    // Handle sequence
    if (this.sequence && !this.sequenceComplete) {
      this.advanceSequence();
    }

    this.emit('state:change', this.getState());

    // Auto-start logic
    const isBreak = this.sessionType !== 'work';
    if ((isBreak && this.config.autoStartBreaks) || (!isBreak && this.config.autoStartWork)) {
      process.nextTick(() => {
        if (this.disposed) return;
        if (isBreak) {
          this.emit('break:start', { sessionType: this.sessionType, duration: this.totalSeconds });
        }
        this.start();
      });
    }
  }

  advanceToNextSession(): void {
    this.advanceToNext();
    this.reset();
  }

  updateConfig(config: Config): void {
    this.config = config;
    if (!this.isRunning && !this.isPaused) {
      this.totalSeconds = this.computeDuration();
      this.secondsLeft = this.totalSeconds;
    }
    this.emit('state:change', this.getState());
  }

  getState(): EngineFullState {
    return {
      secondsLeft: this.secondsLeft,
      totalSeconds: this.totalSeconds,
      isRunning: this.isRunning,
      isPaused: this.isPaused,
      isComplete: this.isComplete,
      elapsed: this.totalSeconds - this.secondsLeft,
      timerMode: this.timerMode,
      stopwatchElapsed: this.stopwatchElapsed,
      sessionType: this.sessionType,
      sessionNumber: this.sessionNumber,
      totalWorkSessions: this.totalWorkSessions,
      isStrictMode: this.config.strictMode,
      currentLabel: this.currentLabel,
      currentProject: this.currentProject,
      durationSeconds: this.totalSeconds,
      sequenceName: this.sequence?.name,
      sequenceBlocks: this.sequence?.blocks,
      sequenceBlockIndex: this.sequenceBlockIndex,
      sequenceIsActive: this.sequence !== null && !this.sequenceComplete,
      sequenceIsComplete: this.sequenceComplete,
    };
  }

  getConfig(): Config {
    return { ...this.config };
  }

  dispose(): void {
    this.disposed = true;
    this.stopTickInterval();
    // Persist state before exit if running
    if (this.isRunning) {
      this.persistState();
    }
    this.removeAllListeners();
  }

  // Called on startup to handle timers that expired while the daemon was down
  restoreAndReconcile(): void {
    if (this.isRunning && !this.isPaused && this.sessionStartedAt) {
      // Reopen the last interval to cover daemon-down time
      if (this.workIntervals.length > 0) {
        const last = this.workIntervals[this.workIntervals.length - 1]!;
        if (last.end !== null) last.end = null;
      }

      if (this.timerMode === 'stopwatch') {
        // Stopwatch was running — reconstruct elapsed from wall clock
        const wallClockTotal = Math.floor((Date.now() - new Date(this.sessionStartedAt).getTime()) / 1000);
        this.stopwatchElapsed = wallClockTotal;
        this.startTickInterval();
        return;
      }

      // Check if the session should have completed
      const elapsed = Math.floor((Date.now() - new Date(this.sessionStartedAt).getTime()) / 1000);
      const remaining = this.totalSeconds - elapsed;
      if (remaining <= 0) {
        // Timer expired while daemon was down
        this.completeExpiredSession();
        return;
      }
      this.secondsLeft = remaining;
      this.startTickInterval();
    } else if (this.isRunning && this.isPaused) {
      // Paused state — just leave it, no interval needed
      // stopwatchElapsed is already correct from snapshot
    }
    // If not running, nothing to do
  }

  // --- Private methods ---

  private startTickInterval(): void {
    this.stopTickInterval();
    this.interval = setInterval(() => {
      this.tick();
    }, 1000);
  }

  private stopTickInterval(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  private tick(): void {
    if (this.disposed) return;
    if (!this.isRunning || this.isPaused) return;

    if (this.timerMode === 'stopwatch') {
      this.stopwatchElapsed += 1;
      this.emit('tick', this.getState());
      return;
    }

    this.secondsLeft -= 1;

    if (this.secondsLeft <= 0) {
      this.secondsLeft = 0;
      // Emit final tick before completion events
      this.emit('tick', this.getState());
      this.stopTickInterval();
      this.isRunning = false;
      this.isComplete = true;
      this.onSessionComplete();
      return;
    }

    this.emit('tick', this.getState());
  }

  private onSessionComplete(): void {
    // Notify
    notifySessionEnd(
      this.sessionType,
      this.config.sound,
      this.config.notifications,
      this.config.notificationDuration,
      this.config.sounds,
    );

    // Save session
    const session = this.saveSession('completed');
    this.emit('session:complete', { session });

    // Generate tracker suggestions for completed work sessions
    if (this.sessionType === 'work') {
      try {
        generateAndStoreSuggestions(session.intervals);
      } catch { /* don't let tracker errors break the engine */ }
    }

    clearTimerState();

    // Advance to next session
    this.advanceToNext();

    // Handle sequence
    if (this.sequence && !this.sequenceComplete) {
      this.advanceSequence();
    }

    this.emit('state:change', this.getState());

    // Auto-start breaks/work (after state:change so clients see the idle state first)
    const isBreak = this.sessionType !== 'work';
    if ((isBreak && this.config.autoStartBreaks) || (!isBreak && this.config.autoStartWork)) {
      // Use nextTick to let current event processing finish before starting
      process.nextTick(() => {
        if (this.disposed) return;
        if (isBreak) {
          this.emit('break:start', { sessionType: this.sessionType, duration: this.totalSeconds });
        }
        this.start();
      });
    }
  }

  private closeOpenInterval(now?: string): void {
    if (this.workIntervals.length > 0) {
      const last = this.workIntervals[this.workIntervals.length - 1]!;
      if (last.end === null) last.end = now ?? new Date().toISOString();
    }
  }

  private intervalsActualDuration(): number {
    let total = 0;
    for (const iv of this.workIntervals) {
      if (iv.start && iv.end !== null) {
        total += Math.floor((new Date(iv.end).getTime() - new Date(iv.start).getTime()) / 1000);
      }
    }
    return total;
  }

  private completeExpiredSession(): void {
    // Session completed while daemon was down — save it with correct timestamps
    const startedAt = this.sessionStartedAt!;
    const endedAt = new Date(new Date(startedAt).getTime() + this.totalSeconds * 1000).toISOString();
    this.closeOpenInterval(endedAt);
    const intervals = [...this.workIntervals];

    const session: Session = {
      id: nanoid(),
      type: this.sessionType,
      status: 'completed',
      label: this.currentLabel,
      project: this.currentProject,
      startedAt: intervals.length > 0 ? intervals[0]!.start : startedAt,
      endedAt,
      durationPlanned: this.totalSeconds,
      durationActual: intervals.length > 0 ? this.intervalsActualDuration() : this.totalSeconds,
      intervals,
    };
    appendSession(session);
    this.emit('session:complete', { session });

    if (this.sessionType === 'work') {
      try {
        generateAndStoreSuggestions(intervals);
      } catch { /* ignore */ }
    }

    clearTimerState();
    this.advanceToNext();

    // Handle sequence
    if (this.sequence && !this.sequenceComplete) {
      this.advanceSequence();
    }

    this.emit('state:change', this.getState());
  }

  private completeCurrentSession(): void {
    notifySessionEnd(
      this.sessionType,
      this.config.sound,
      this.config.notifications,
      this.config.notificationDuration,
      this.config.sounds,
    );
    const session = this.saveSession('completed');
    this.emit('session:complete', { session });

    if (this.sessionType === 'work') {
      try {
        generateAndStoreSuggestions(session.intervals);
      } catch { /* ignore */ }
    }
  }

  private abandonCurrentSession(): void {
    if (!this.sessionStartedAt) return;
    const session = this.saveSession('abandoned');
    this.emit('session:abandon', { session });
  }

  private saveStopwatchSession(): Session {
    const now = new Date().toISOString();
    this.closeOpenInterval(now);
    const intervals = [...this.workIntervals];
    const session: Session = {
      id: nanoid(),
      type: this.sessionType,
      status: 'completed',
      label: this.currentLabel,
      project: this.currentProject,
      startedAt: intervals.length > 0 ? intervals[0]!.start : (this.sessionStartedAt ?? now),
      endedAt: now,
      durationPlanned: this.totalSeconds,
      durationActual: intervals.length > 0 ? this.intervalsActualDuration() : this.stopwatchElapsed,
      intervals,
    };
    appendSession(session);
    return session;
  }

  private saveSession(status: Session['status']): Session {
    const now = new Date().toISOString();
    this.closeOpenInterval(now);
    const intervals = [...this.workIntervals];
    const durationActual = intervals.length > 0
      ? this.intervalsActualDuration()
      : (this.timerMode === 'stopwatch'
        ? this.stopwatchElapsed
        : (this.sessionStartedAt
          ? Math.floor((Date.now() - new Date(this.sessionStartedAt).getTime()) / 1000)
          : 0));
    const session: Session = {
      id: nanoid(),
      type: this.sessionType,
      status,
      label: this.currentLabel,
      project: this.currentProject,
      startedAt: intervals.length > 0 ? intervals[0]!.start : (this.sessionStartedAt ?? now),
      endedAt: now,
      durationPlanned: this.totalSeconds,
      durationActual,
      intervals,
    };
    appendSession(session);
    return session;
  }

  private advanceToNext(): void {
    this.overrideDuration = null;
    this.sessionStartedAt = null;
    this.workIntervals = [];

    if (this.sessionType === 'work') {
      this.totalWorkSessions += 1;
      if (this.totalWorkSessions % this.config.longBreakInterval === 0) {
        this.sessionType = 'long-break';
      } else {
        this.sessionType = 'short-break';
      }
    } else {
      this.sessionNumber += 1;
      this.sessionType = 'work';
    }

    this.totalSeconds = this.computeDuration();
    this.secondsLeft = this.totalSeconds;
    this.isRunning = false;
    this.isPaused = false;
    this.isComplete = false;
  }

  private applySequenceBlock(block: SequenceBlock): void {
    this.sessionType = block.type;
    this.overrideDuration = block.durationMinutes * 60;
    this.totalSeconds = block.durationMinutes * 60;
    this.secondsLeft = block.durationMinutes * 60;
    this.isRunning = false;
    this.isPaused = false;
    this.isComplete = false;
    this.stopTickInterval();
  }

  private advanceSequence(): void {
    if (!this.sequence) return;
    const nextIndex = this.sequenceBlockIndex + 1;
    if (nextIndex >= this.sequence.blocks.length) {
      this.sequenceComplete = true;
      this.emit('sequence:complete');
      return;
    }
    this.sequenceBlockIndex = nextIndex;
    const nextBlock = this.sequence.blocks[nextIndex]!;
    this.applySequenceBlock(nextBlock);
    this.emit('sequence:advance', { block: nextBlock, index: nextIndex });
  }

  private persistState(): void {
    try {
      const defaultDuration = this.getDurationForType(this.sessionType);
      const snapshot: TimerSnapshot = {
        sessionType: this.sessionType,
        totalSeconds: this.totalSeconds,
        startedAt: this.sessionStartedAt ?? new Date().toISOString(),
        isPaused: this.isPaused,
        pausedSecondsLeft: this.isPaused ? this.secondsLeft : undefined,
        sessionNumber: this.sessionNumber,
        totalWorkSessions: this.totalWorkSessions,
        label: this.currentLabel,
        project: this.currentProject,
        overrideDuration: this.totalSeconds !== defaultDuration ? this.totalSeconds : null,
        timerMode: this.timerMode !== 'countdown' ? this.timerMode : undefined,
        stopwatchElapsed: this.timerMode === 'stopwatch' ? this.stopwatchElapsed : undefined,
        sequenceName: this.sequence?.name,
        sequenceBlocks: this.sequence?.blocks,
        sequenceBlockIndex: this.sequence && !this.sequenceComplete ? this.sequenceBlockIndex : undefined,
        workIntervals: this.workIntervals.length > 0 ? this.workIntervals : undefined,
      };
      saveTimerState(snapshot);
    } catch {
      // Don't let persistence errors break the engine
    }
  }
}
