import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { SessionSequence } from '../types.js';

const DATA_DIR = path.join(os.homedir(), '.local', 'share', 'pomodorocli');
const SEQUENCES_PATH = path.join(DATA_DIR, 'sequences.json');

export function loadCustomSequences(): SessionSequence[] {
  try {
    if (fs.existsSync(SEQUENCES_PATH)) {
      return JSON.parse(fs.readFileSync(SEQUENCES_PATH, 'utf-8')) as SessionSequence[];
    }
  } catch {
    // ignore
  }
  return [];
}

export function saveCustomSequences(sequences: SessionSequence[]): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(SEQUENCES_PATH, JSON.stringify(sequences, null, 2) + '\n', 'utf-8');
}

export function addCustomSequence(seq: SessionSequence): void {
  const sequences = loadCustomSequences();
  const existing = sequences.findIndex(s => s.name === seq.name);
  if (existing >= 0) {
    sequences[existing] = seq;
  } else {
    sequences.push(seq);
  }
  saveCustomSequences(sequences);
}

export function deleteCustomSequence(name: string): void {
  saveCustomSequences(loadCustomSequences().filter(s => s.name !== name));
}
