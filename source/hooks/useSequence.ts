import { useState, useCallback } from 'react';
import type { SequenceBlock, SessionSequence } from '../types.js';

export interface SequenceState {
  sequence: SessionSequence | null;
  currentBlockIndex: number;
  currentBlock: SequenceBlock | null;
  isActive: boolean;
  isComplete: boolean;
}

export interface SequenceActions {
  setSequence: (seq: SessionSequence) => void;
  advance: () => SequenceBlock | null;
  reset: () => void;
  clear: () => void;
}

export function parseSequenceString(input: string): SessionSequence | null {
  // Format: "45w 15b 45w 15b 30b" or "session 45w 15b 45w"
  const cleaned = input.replace(/^session\s+/i, '').trim();
  if (!cleaned) return null;

  const parts = cleaned.split(/\s+/);
  const blocks: SequenceBlock[] = [];

  for (const part of parts) {
    const match = part.match(/^(\d+)(w|b)$/i);
    if (!match) return null;
    const minutes = parseInt(match[1]!, 10);
    const typeChar = match[2]!.toLowerCase();
    blocks.push({
      type: typeChar === 'w' ? 'work' : minutes >= 20 ? 'long-break' : 'short-break',
      durationMinutes: minutes,
    });
  }

  if (blocks.length === 0) return null;
  return { name: 'custom', blocks };
}

export const PRESET_SEQUENCES: Record<string, SessionSequence> = {
  'deep-work': {
    name: 'deep-work',
    blocks: [
      { type: 'work', durationMinutes: 45 },
      { type: 'short-break', durationMinutes: 15 },
      { type: 'work', durationMinutes: 45 },
      { type: 'short-break', durationMinutes: 15 },
      { type: 'work', durationMinutes: 45 },
      { type: 'long-break', durationMinutes: 30 },
    ],
  },
  'standard': {
    name: 'standard',
    blocks: [
      { type: 'work', durationMinutes: 25 },
      { type: 'short-break', durationMinutes: 5 },
      { type: 'work', durationMinutes: 25 },
      { type: 'short-break', durationMinutes: 5 },
      { type: 'work', durationMinutes: 25 },
      { type: 'short-break', durationMinutes: 5 },
      { type: 'work', durationMinutes: 25 },
      { type: 'long-break', durationMinutes: 15 },
    ],
  },
  'sprint': {
    name: 'sprint',
    blocks: [
      { type: 'work', durationMinutes: 50 },
      { type: 'short-break', durationMinutes: 10 },
      { type: 'work', durationMinutes: 50 },
      { type: 'long-break', durationMinutes: 30 },
    ],
  },
};

export function useSequence(): [SequenceState, SequenceActions] {
  const [sequence, setSequenceState] = useState<SessionSequence | null>(null);
  const [currentBlockIndex, setCurrentBlockIndex] = useState(0);
  const [isComplete, setIsComplete] = useState(false);

  const currentBlock = sequence && currentBlockIndex < sequence.blocks.length
    ? sequence.blocks[currentBlockIndex]!
    : null;

  const setSequence = useCallback((seq: SessionSequence) => {
    setSequenceState(seq);
    setCurrentBlockIndex(0);
    setIsComplete(false);
  }, []);

  const advance = useCallback((): SequenceBlock | null => {
    if (!sequence) return null;
    const nextIndex = currentBlockIndex + 1;
    if (nextIndex >= sequence.blocks.length) {
      setIsComplete(true);
      return null;
    }
    setCurrentBlockIndex(nextIndex);
    return sequence.blocks[nextIndex]!;
  }, [sequence, currentBlockIndex]);

  const reset = useCallback(() => {
    setCurrentBlockIndex(0);
    setIsComplete(false);
  }, []);

  const clear = useCallback(() => {
    setSequenceState(null);
    setCurrentBlockIndex(0);
    setIsComplete(false);
  }, []);

  const state: SequenceState = {
    sequence,
    currentBlockIndex,
    currentBlock,
    isActive: sequence !== null && !isComplete,
    isComplete,
  };

  return [state, { setSequence, advance, reset, clear }];
}
