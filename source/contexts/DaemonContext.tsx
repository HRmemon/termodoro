import { createContext, useContext } from 'react';
import type { DaemonTimerState, DaemonEngineState, DaemonSequenceState, DaemonActions } from '../hooks/useDaemonConnection.js';
import type { EngineFullState } from '../engine/timer-engine.js';

export interface DaemonContextType {
  state: EngineFullState;
  timer: DaemonTimerState;
  engine: DaemonEngineState;
  sequence: DaemonSequenceState;
  actions: DaemonActions;
}

export const DaemonContext = createContext<DaemonContextType | null>(null);

export function useDaemon() {
  const ctx = useContext(DaemonContext);
  if (!ctx) {
    throw new Error('useDaemon must be used within a DaemonProvider');
  }
  return ctx;
}
