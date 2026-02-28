import fs from 'fs';
import { spawnSync } from 'child_process';
import type { SessionSequence, SequenceBlock } from '../../types.js';
import { loadSequences, saveSequences } from '../sequences.js';
import { tmpFile } from './utils.js';
import { clampStr, clampInt, LIMITS } from '../sanitize.js';

function formatSequences(): string {
  const sequences = loadSequences();
  const lines: string[] = [];

  lines.push('# Sequences');
  lines.push('# Format: name: block block block ...');
  lines.push('# Blocks: Nw (work N min), Nb (break N min)');
  lines.push('# >=20m break = long break, <20m = short break');
  lines.push('# Delete a line to remove. Add a line to create.');
  lines.push('');

  for (const seq of sequences) {
    const blocks = seq.blocks.map(b => `${b.durationMinutes}${b.type === 'work' ? 'w' : 'b'}`).join(' ');
    lines.push(`${seq.name}: ${blocks}`);
  }

  return lines.join('\n') + '\n';
}

function parseSequences(text: string): void {
  const lines = text.split('\n');
  const result: SessionSequence[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Format: name: 45w 15b 45w ...
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx < 0) continue;

    const name = clampStr(trimmed.slice(0, colonIdx).trim(), LIMITS.SEQUENCE_NAME);
    const blockStr = trimmed.slice(colonIdx + 1).trim();
    if (!name || !blockStr) continue;

    const blockTokens = blockStr.split(/\s+/).filter(Boolean);
    const blocks: SequenceBlock[] = [];

    for (const token of blockTokens) {
      const match = token.match(/^(\d+)(w|b)$/);
      if (!match) continue;
      const mins = clampInt(parseInt(match[1]!, 10), 1, LIMITS.DURATION_MINUTES);
      if (match[2] === 'w') {
        blocks.push({ type: 'work', durationMinutes: mins });
      } else {
        const breakType: SequenceBlock['type'] = mins >= 20 ? 'long-break' : 'short-break';
        blocks.push({ type: breakType, durationMinutes: mins });
      }
    }

    if (blocks.length > 0) {
      result.push({ name, blocks });
    }
  }

  saveSequences(result);
}

export function openSequencesInNvim(): void {
  const content = formatSequences();
  const tmpPath = tmpFile('sequences');
  fs.writeFileSync(tmpPath, content);

  const editor = process.env.EDITOR || 'nvim';
  spawnSync(editor, [tmpPath], { stdio: 'inherit' });

  const edited = fs.readFileSync(tmpPath, 'utf8');
  try {
    if (edited !== content && edited.length <= LIMITS.MAX_FILE_SIZE) {
      parseSequences(edited);
    }
  } finally {
    try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
  }
}
