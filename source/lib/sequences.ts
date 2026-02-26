import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { SessionSequence } from '../types.js';

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
  try {
    if (fs.existsSync(SEQUENCES_PATH)) {
      return JSON.parse(fs.readFileSync(SEQUENCES_PATH, 'utf-8')) as SessionSequence[];
    }
  } catch {
    // ignore
  }
  return [];
}

export function saveSequences(sequences: SessionSequence[]): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(SEQUENCES_PATH, JSON.stringify(sequences, null, 2) + '\n', 'utf-8');
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
