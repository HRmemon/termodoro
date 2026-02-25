import { EventEmitter } from 'node:events';
import { nanoid } from 'nanoid';
import type { Config, Session, SessionType, SequenceBlock, SessionSequence } from '../types.js';
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
  // Sequence state
  sequenceName?: string;
  sequenceBlocks?: SequenceBlock[];
  sequenceBlockIndex?: number;
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

  // Session engine state
  private sessionType: SessionType = 'work';
  private sessionNumber = 1;
  private totalWorkSessions = 0;
  private currentLabel?: string;
  private currentProject?: string;
  private overrideDuration: number | null = null;
  private sessionStartedAt: string | null = null;

  // Sequence state
  private sequence: SessionSequence | null = null;
  private sequenceBlockIndex = 0;
  private sequenceComplete = false;

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
    if (this.isRunning && !this.isPaused) return;

    if (this.isPaused) {
      // Resume
      this.isPaused = false;
      this.startTickInterval();
      // Recalculate startedAt for accurate wall-clock tracking
      const now = new Date();
      const elapsed = this.totalSeconds - this.secondsLeft;
      this.sessionStartedAt = new Date(now.getTime() - elapsed * 1000).toISOString();
      this.persistState();
      const state = this.getState();
      this.emit('timer:resume', state);
      this.emit('state:change', state);
      return;
    }

    // Fresh start
    this.isRunning = true;
    this.isPaused = false;
    this.isComplete = false;
    this.sessionStartedAt = new Date().toISOString();
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
    this.totalSeconds = this.computeDuration();
    this.secondsLeft = this.totalSeconds;
    this.sessionStartedAt = null;
    clearTimerState();
    this.emit('state:change', this.getState());
  }

  resetAndLog(asProductive: boolean): void {
    const elapsed = this.totalSeconds - this.secondsLeft;
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
    if (!this.isRunning || this.isPaused) return;

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
    if (this.sessionType === 'work' && this.sessionStartedAt) {
      try {
        generateAndStoreSuggestions(this.sessionStartedAt, session.durationActual);
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
        if (isBreak) {
          this.emit('break:start', { sessionType: this.sessionType, duration: this.totalSeconds });
        }
        this.start();
      });
    }
  }

  private completeExpiredSession(): void {
    // Session completed while daemon was down — save it with correct timestamps
    const startedAt = this.sessionStartedAt!;
    const endedAt = new Date(new Date(startedAt).getTime() + this.totalSeconds * 1000).toISOString();

    const session: Session = {
      id: nanoid(),
      type: this.sessionType,
      status: 'completed',
      label: this.currentLabel,
      project: this.currentProject,
      startedAt,
      endedAt,
      durationPlanned: this.totalSeconds,
      durationActual: this.totalSeconds,
    };
    appendSession(session);
    this.emit('session:complete', { session });

    if (this.sessionType === 'work') {
      try {
        generateAndStoreSuggestions(startedAt, this.totalSeconds);
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

    if (this.sessionType === 'work' && this.sessionStartedAt) {
      try {
        generateAndStoreSuggestions(this.sessionStartedAt, session.durationActual);
      } catch { /* ignore */ }
    }
  }

  private abandonCurrentSession(): void {
    if (!this.sessionStartedAt) return;
    const session = this.saveSession('abandoned');
    this.emit('session:abandon', { session });
  }

  private saveSession(status: Session['status']): Session {
    const now = new Date().toISOString();
    const session: Session = {
      id: nanoid(),
      type: this.sessionType,
      status,
      label: this.currentLabel,
      project: this.currentProject,
      startedAt: this.sessionStartedAt ?? now,
      endedAt: now,
      durationPlanned: this.totalSeconds,
      durationActual: this.sessionStartedAt
        ? Math.floor((Date.now() - new Date(this.sessionStartedAt).getTime()) / 1000)
        : 0,
    };
    appendSession(session);
    return session;
  }

  private advanceToNext(): void {
    this.overrideDuration = null;
    this.sessionStartedAt = null;

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
        sequenceName: this.sequence?.name,
        sequenceBlocks: this.sequence?.blocks,
        sequenceBlockIndex: this.sequence && !this.sequenceComplete ? this.sequenceBlockIndex : undefined,
      };
      saveTimerState(snapshot);
    } catch {
      // Don't let persistence errors break the engine
    }
  }
}
