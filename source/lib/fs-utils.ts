import * as fs from 'node:fs';
import { promises as fsPromises } from 'node:fs';
import * as path from 'node:path';

/**
 * Ensure a directory exists, creating it and all parents if needed.
 */
export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

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

export async function atomicWriteJSONAsync(filePath: string, data: unknown): Promise<void> {
  await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = filePath + '.tmp';
  await fsPromises.writeFile(tmp, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  await fsPromises.rename(tmp, filePath);
}

/**
 * Read and parse a JSON file, returning a fallback value on any error
 * (file not found, parse error, permission error).
 */
export function readJSON<T>(filePath: string, fallback: T): T {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
    }
  } catch {
    // file missing, corrupt, or unreadable — return fallback
  }
  return fallback;
}
