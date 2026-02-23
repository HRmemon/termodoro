import { useState, useCallback, useRef } from 'react';
import { nanoid } from 'nanoid';
import type { Config, Session, SessionType, TagInfo, PostSessionInfo } from '../types.js';
import { appendSession } from '../lib/store.js';
import { notifySessionEnd } from '../lib/notify.js';

export interface EngineState {
  sessionType: SessionType;
  sessionNumber: number;
  totalWorkSessions: number;
  isStrictMode: boolean;
  currentLabel?: string;
  currentProject?: string;
  currentTag?: string;
  currentEnergyLevel?: Session['energyLevel'];
  durationSeconds: number;
  isWaitingForTag: boolean;
  isWaitingForPostSession: boolean;
}

export interface EngineActions {
  startSession: () => void;
  completeSession: () => void;
  skipSession: () => void;
  abandonSession: () => void;
  setTagInfo: (info: TagInfo) => void;
  setPostSessionInfo: (info: PostSessionInfo) => void;
  getDuration: (type: SessionType) => number;
}

export function usePomodoroEngine(config: Config): [EngineState, EngineActions] {
  const [sessionType, setSessionType] = useState<SessionType>('work');
  const [sessionNumber, setSessionNumber] = useState(1);
  const [totalWorkSessions, setTotalWorkSessions] = useState(0);
  const [isWaitingForTag, setIsWaitingForTag] = useState(true);
  const [isWaitingForPostSession, setIsWaitingForPostSession] = useState(false);

  const [currentLabel, setCurrentLabel] = useState<string | undefined>();
  const [currentProject, setCurrentProject] = useState<string | undefined>();
  const [currentTag, setCurrentTag] = useState<string | undefined>();
  const [currentEnergyLevel, setCurrentEnergyLevel] = useState<Session['energyLevel']>();

  const sessionStartRef = useRef<string | null>(null);

  const getDuration = useCallback((type: SessionType): number => {
    switch (type) {
      case 'work': return config.workDuration * 60;
      case 'short-break': return config.shortBreakDuration * 60;
      case 'long-break': return config.longBreakDuration * 60;
    }
  }, [config]);

  const durationSeconds = getDuration(sessionType);

  const setTagInfo = useCallback((info: TagInfo) => {
    setCurrentLabel(info.label);
    setCurrentProject(info.project);
    setCurrentTag(info.tag);
    setCurrentEnergyLevel(info.energyLevel);
    setIsWaitingForTag(false);
  }, []);

  const saveSession = useCallback((status: Session['status'], distractionScore?: number) => {
    const now = new Date().toISOString();
    const session: Session = {
      id: nanoid(),
      type: sessionType,
      status,
      label: currentLabel,
      project: currentProject,
      tag: currentTag,
      energyLevel: currentEnergyLevel,
      distractionScore,
      startedAt: sessionStartRef.current ?? now,
      endedAt: now,
      durationPlanned: getDuration(sessionType),
      durationActual: sessionStartRef.current
        ? Math.floor((Date.now() - new Date(sessionStartRef.current).getTime()) / 1000)
        : 0,
    };
    appendSession(session);
    return session;
  }, [sessionType, currentLabel, currentProject, currentTag, currentEnergyLevel, getDuration]);

  const advanceToNext = useCallback(() => {
    if (sessionType === 'work') {
      const newTotal = totalWorkSessions + 1;
      setTotalWorkSessions(newTotal);
      if (newTotal % config.longBreakInterval === 0) {
        setSessionType('long-break');
      } else {
        setSessionType('short-break');
      }
      if (config.autoStartBreaks) {
        setIsWaitingForTag(false);
      } else {
        setIsWaitingForTag(false);
      }
    } else {
      setSessionNumber(prev => prev + 1);
      setSessionType('work');
      if (!config.autoStartWork) {
        setIsWaitingForTag(true);
      } else {
        setIsWaitingForTag(false);
      }
    }
  }, [sessionType, totalWorkSessions, config]);

  const startSession = useCallback(() => {
    sessionStartRef.current = new Date().toISOString();
  }, []);

  const completeSession = useCallback(() => {
    notifySessionEnd(sessionType, config.sound, config.notifications);
    if (sessionType === 'work') {
      setIsWaitingForPostSession(true);
    } else {
      saveSession('completed');
      advanceToNext();
    }
  }, [sessionType, config, saveSession, advanceToNext]);

  const setPostSessionInfo = useCallback((info: PostSessionInfo) => {
    saveSession('completed', info.distractionScore);
    setIsWaitingForPostSession(false);
    advanceToNext();
  }, [saveSession, advanceToNext]);

  const skipSession = useCallback(() => {
    saveSession('skipped');
    advanceToNext();
  }, [saveSession, advanceToNext]);

  const abandonSession = useCallback(() => {
    if (sessionStartRef.current) {
      saveSession('abandoned');
    }
  }, [saveSession]);

  const state: EngineState = {
    sessionType,
    sessionNumber,
    totalWorkSessions,
    isStrictMode: config.strictMode,
    currentLabel,
    currentProject,
    currentTag,
    currentEnergyLevel,
    durationSeconds,
    isWaitingForTag,
    isWaitingForPostSession,
  };

  return [state, {
    startSession,
    completeSession,
    skipSession,
    abandonSession,
    setTagInfo,
    setPostSessionInfo,
    getDuration,
  }];
}
