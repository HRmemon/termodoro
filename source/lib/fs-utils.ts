import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Write `data` as formatted JSON to `filePath` atomically.
 * Uses a sibling `.tmp` file + rename to prevent partial writes on crash.
 * Creates parent directories if they do not exist.
 */
export function atomicWriteJSON(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  fs.renameSync(tmp, filePath);
}
