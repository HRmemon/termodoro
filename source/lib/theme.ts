import type { SessionType } from '../types.js';

// Classic Terminal palette
export const colors = {
  focus: '#00C853',
  break: '#FFB300',
  highlight: '#00BCD4',
  text: '#E0E0E0',
  dim: '#444444',
  bg: '#111111',
} as const;

export const SESSION_COLORS: Record<SessionType, string> = {
  'work': colors.focus,
  'short-break': colors.break,
  'long-break': colors.break,
};
