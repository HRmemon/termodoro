import * as path from 'node:path';
import * as os from 'node:os';
import type { SequenceBlock, SessionSequence } from '../types.js';
import { atomicWriteJSON, readJSON } from './fs-utils.js';

const DATA_DIR = path.join(os.homedir(), '.local', 'share', 'pomodorocli');
const SEQUENCES_PATH = path.join(DATA_DIR, 'sequences.json');

export const DEFAULT_SEQUENCES: SessionSequence[] = [
  {
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
  {
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
  {
    name: 'sprint',
    blocks: [
      { type: 'work', durationMinutes: 50 },
      { type: 'short-break', durationMinutes: 10 },
      { type: 'work', durationMinutes: 50 },
      { type: 'long-break', durationMinutes: 30 },
    ],
  },
];

export function loadSequences(): SessionSequence[] {
  return readJSON<SessionSequence[]>(SEQUENCES_PATH, []);
}

export function saveSequences(sequences: SessionSequence[]): void {
  atomicWriteJSON(SEQUENCES_PATH, sequences);
}

export function saveSequence(seq: SessionSequence): void {
  const sequences = loadSequences();
  const existing = sequences.findIndex(s => s.name === seq.name);
  if (existing >= 0) {
    sequences[existing] = seq;
  } else {
    sequences.push(seq);
  }
  saveSequences(sequences);
}

export function deleteSequence(name: string): void {
  saveSequences(loadSequences().filter(s => s.name !== name));
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

export function importDefaultSequences(): void {
  const sequences = loadSequences();
  const existingNames = new Set(sequences.map(s => s.name));
  let added = false;
  for (const def of DEFAULT_SEQUENCES) {
    if (!existingNames.has(def.name)) {
      sequences.push(def);
      added = true;
    }
  }
  if (added) {
    saveSequences(sequences);
  }
}
