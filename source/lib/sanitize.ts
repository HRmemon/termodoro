// Input validation helpers for nvim-edit parsers.
// Caps string lengths and numeric ranges to prevent data corruption
// from malformed editor output.

export const LIMITS = {
  SHORT_TEXT: 500,    // task text, title, goal name, reminder title
  LONG_TEXT: 10_000,  // session label, note body
  ID: 64,
  PROJECT: 100,
  TAG: 100,
  POMODOROS: 200,
  RATING: 10,
  DISTRACTION: 10,
  SEQUENCE_NAME: 100,
  DURATION_MINUTES: 1440, // 24 hours
  MAX_FILE_SIZE: 500_000,
} as const;

export function clampStr(s: string, max: number): string;
export function clampStr(s: string | undefined, max: number): string | undefined;
export function clampStr(s: string | undefined, max: number): string | undefined {
  if (s === undefined) return undefined;
  return s.slice(0, max);
}

export function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n) || isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}

// Valid ID: alphanumeric, underscore, hyphen, 1-64 chars
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function isValidId(id: string): boolean {
  return ID_RE.test(id);
}
