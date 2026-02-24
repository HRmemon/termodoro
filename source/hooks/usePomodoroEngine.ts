import { useState, useCallback, useRef } from 'react';
import { nanoid } from 'nanoid';
import type { Config, Session, SessionType, SequenceBlock } from '../types.js';
import { appendSession } from '../lib/store.js';
import { notifySessionEnd } from '../lib/notify.js';

export interface EngineState {
  sessionType: SessionType;
  sessionNumber: number;
  totalWorkSessions: number;
  isStrictMode: boolean;
  currentLabel?: string;
  currentProject?: string;
  durationSeconds: number;
}

export interface EngineActions {
  startSession: () => void;
  completeSession: () => void;
  skipSession: () => void;
  abandonSession: () => void;
  setSessionInfo: (info: { label?: string; project?: string }) => void;
  applySequenceBlock: (block: SequenceBlock) => void;
  getDuration: (type: SessionType) => number;
  resetOverride: () => void;
  setDurationOverride: (seconds: number) => void;
  advanceToNext: () => void;
}

export interface EngineInitialState {
  sessionType?: SessionType;
  sessionNumber?: number;
  totalWorkSessions?: number;
  label?: string;
  project?: string;
  overrideDuration?: number | null;
  startedAt?: string;
}

export function usePomodoroEngine(config: Config, initialState?: EngineInitialState): [EngineState, EngineActions] {
  const [sessionType, setSessionType] = useState<SessionType>(initialState?.sessionType ?? 'work');
  const [sessionNumber, setSessionNumber] = useState(initialState?.sessionNumber ?? 1);
  const [totalWorkSessions, setTotalWorkSessions] = useState(initialState?.totalWorkSessions ?? 0);
  const [currentLabel, setCurrentLabel] = useState<string | undefined>(initialState?.label);
  const [currentProject, setCurrentProject] = useState<string | undefined>(initialState?.project);
  const [overrideDuration, setOverrideDuration] = useState<number | null>(initialState?.overrideDuration ?? null);

  const sessionStartRef = useRef<string | null>(initialState?.startedAt ?? null);

  const getDuration = useCallback((type: SessionType): number => {
    switch (type) {
      case 'work': return config.workDuration * 60;
      case 'short-break': return config.shortBreakDuration * 60;
      case 'long-break': return config.longBreakDuration * 60;
    }
  }, [config]);

  const durationSeconds = overrideDuration ?? getDuration(sessionType);

  const setSessionInfo = useCallback((info: { label?: string; project?: string }) => {
    if (info.label !== undefined) setCurrentLabel(info.label);
    if (info.project !== undefined) setCurrentProject(info.project);
  }, []);

  const saveSession = useCallback((status: Session['status']) => {
    const now = new Date().toISOString();
    const session: Session = {
      id: nanoid(),
      type: sessionType,
      status,
      label: currentLabel,
      project: currentProject,
      startedAt: sessionStartRef.current ?? now,
      endedAt: now,
      durationPlanned: durationSeconds,
      durationActual: sessionStartRef.current
        ? Math.floor((Date.now() - new Date(sessionStartRef.current).getTime()) / 1000)
        : 0,
    };
    appendSession(session);
    return session;
  }, [sessionType, currentLabel, currentProject, durationSeconds]);

  const advanceToNext = useCallback(() => {
    setOverrideDuration(null);
    if (sessionType === 'work') {
      const newTotal = totalWorkSessions + 1;
      setTotalWorkSessions(newTotal);
      if (newTotal % config.longBreakInterval === 0) {
        setSessionType('long-break');
      } else {
        setSessionType('short-break');
      }
    } else {
      setSessionNumber(prev => prev + 1);
      setSessionType('work');
    }
  }, [sessionType, totalWorkSessions, config]);

  const startSession = useCallback(() => {
    sessionStartRef.current = new Date().toISOString();
  }, []);

  const completeSession = useCallback(() => {
    notifySessionEnd(sessionType, config.sound, config.notifications, config.notificationDuration);
    saveSession('completed');
    advanceToNext();
  }, [sessionType, config, saveSession, advanceToNext]);

  const skipSession = useCallback(() => {
    saveSession('skipped');
    advanceToNext();
  }, [saveSession, advanceToNext]);

  const abandonSession = useCallback(() => {
    if (sessionStartRef.current) {
      saveSession('abandoned');
    }
  }, [saveSession]);

  const applySequenceBlock = useCallback((block: SequenceBlock) => {
    setSessionType(block.type);
    setOverrideDuration(block.durationMinutes * 60);
  }, []);

  const resetOverride = useCallback(() => {
    setOverrideDuration(null);
  }, []);

  const setDurationOverride = useCallback((seconds: number) => {
    setOverrideDuration(seconds);
  }, []);

  const state: EngineState = {
    sessionType,
    sessionNumber,
    totalWorkSessions,
    isStrictMode: config.strictMode,
    currentLabel,
    currentProject,
    durationSeconds,
  };

  return [state, {
    startSession,
    completeSession,
    skipSession,
    abandonSession,
    setSessionInfo,
    applySequenceBlock,
    getDuration,
    resetOverride,
    setDurationOverride,
    advanceToNext,
  }];
}
