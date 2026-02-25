import { useState, useEffect, useCallback, useRef } from 'react';
import { DaemonSubscription, sendCommand } from '../daemon/client.js';
import type { DaemonCommand } from '../daemon/protocol.js';
import type { EngineFullState } from '../engine/timer-engine.js';
import type { SessionType } from '../types.js';

const DEFAULT_STATE: EngineFullState = {
  secondsLeft: 0,
  totalSeconds: 0,
  isRunning: false,
  isPaused: false,
  isComplete: false,
  elapsed: 0,
  sessionType: 'work',
  sessionNumber: 1,
  totalWorkSessions: 0,
  isStrictMode: false,
  currentLabel: undefined,
  currentProject: undefined,
  durationSeconds: 0,
  sequenceName: undefined,
  sequenceBlocks: undefined,
  sequenceBlockIndex: 0,
  sequenceIsActive: false,
  sequenceIsComplete: false,
};

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

export interface DaemonTimerState {
  secondsLeft: number;
  totalSeconds: number;
  isRunning: boolean;
  isPaused: boolean;
  isComplete: boolean;
  elapsed: number;
}

export interface DaemonEngineState {
  sessionType: SessionType;
  sessionNumber: number;
  totalWorkSessions: number;
  isStrictMode: boolean;
  currentLabel?: string;
  currentProject?: string;
  durationSeconds: number;
}

export interface DaemonSequenceState {
  sequenceName?: string;
  sequenceBlocks?: import('../types.js').SequenceBlock[];
  sequenceBlockIndex: number;
  sequenceIsActive: boolean;
  sequenceIsComplete: boolean;
}

export interface DaemonActions {
  start: () => void;
  pause: () => void;
  resume: () => void;
  toggle: () => void;
  skip: () => void;
  reset: (newDuration?: number) => void;
  resetAndLog: (productive: boolean) => void;
  abandon: () => void;
  setProject: (project: string) => void;
  setLabel: (label: string) => void;
  setDuration: (minutes: number) => void;
  activateSequence: (name: string) => void;
  activateSequenceInline: (definition: string) => void;
  clearSequence: () => void;
  advanceSession: () => void;
  updateConfig: () => void;
}

export function useDaemonConnection(): {
  state: EngineFullState;
  timer: DaemonTimerState;
  engine: DaemonEngineState;
  sequence: DaemonSequenceState;
  actions: DaemonActions;
  connectionStatus: ConnectionStatus;
} {
  const [state, setState] = useState<EngineFullState>(DEFAULT_STATE);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const subscriptionRef = useRef<DaemonSubscription | null>(null);

  useEffect(() => {
    const sub = new DaemonSubscription({
      onState: (newState) => {
        setState(newState);
        setConnectionStatus('connected');
      },
      onEvent: () => {
        // Events are handled through state updates
      },
      onError: () => {
        setConnectionStatus('disconnected');
      },
      onClose: () => {
        setConnectionStatus('disconnected');
      },
    });

    subscriptionRef.current = sub;
    sub.connect();

    return () => {
      sub.dispose();
      subscriptionRef.current = null;
    };
  }, []);

  const send = useCallback((cmd: DaemonCommand) => {
    // Use sendCommand for fire-and-forget (response comes via subscription)
    sendCommand(cmd).catch(() => {
      // Connection error — subscription reconnect will handle it
    });
  }, []);

  const actions: DaemonActions = {
    start: useCallback(() => send({ cmd: 'start' }), [send]),
    pause: useCallback(() => send({ cmd: 'pause' }), [send]),
    resume: useCallback(() => send({ cmd: 'resume' }), [send]),
    toggle: useCallback(() => send({ cmd: 'toggle' }), [send]),
    skip: useCallback(() => send({ cmd: 'skip' }), [send]),
    reset: useCallback((newDuration?: number) => {
      if (newDuration) {
        send({ cmd: 'set-duration', minutes: Math.round(newDuration / 60) });
      } else {
        send({ cmd: 'reset' });
      }
    }, [send]),
    resetAndLog: useCallback((productive: boolean) => send({ cmd: 'reset-log', productive }), [send]),
    abandon: useCallback(() => send({ cmd: 'abandon' }), [send]),
    setProject: useCallback((project: string) => send({ cmd: 'set-project', project }), [send]),
    setLabel: useCallback((label: string) => send({ cmd: 'set-label', label }), [send]),
    setDuration: useCallback((minutes: number) => send({ cmd: 'set-duration', minutes }), [send]),
    activateSequence: useCallback((name: string) => send({ cmd: 'activate-sequence', name }), [send]),
    activateSequenceInline: useCallback((definition: string) => send({ cmd: 'activate-sequence-inline', definition }), [send]),
    clearSequence: useCallback(() => send({ cmd: 'clear-sequence' }), [send]),
    advanceSession: useCallback(() => send({ cmd: 'advance-session' }), [send]),
    updateConfig: useCallback(() => send({ cmd: 'update-config' }), [send]),
  };

  // Provide sliced views for backward compatibility
  const timer: DaemonTimerState = {
    secondsLeft: state.secondsLeft,
    totalSeconds: state.totalSeconds,
    isRunning: state.isRunning,
    isPaused: state.isPaused,
    isComplete: state.isComplete,
    elapsed: state.elapsed,
  };

  const engine: DaemonEngineState = {
    sessionType: state.sessionType,
    sessionNumber: state.sessionNumber,
    totalWorkSessions: state.totalWorkSessions,
    isStrictMode: state.isStrictMode,
    currentLabel: state.currentLabel,
    currentProject: state.currentProject,
    durationSeconds: state.durationSeconds,
  };

  const sequence: DaemonSequenceState = {
    sequenceName: state.sequenceName,
    sequenceBlocks: state.sequenceBlocks,
    sequenceBlockIndex: state.sequenceBlockIndex,
    sequenceIsActive: state.sequenceIsActive,
    sequenceIsComplete: state.sequenceIsComplete,
  };

  return { state, timer, engine, sequence, actions, connectionStatus };
}
