import type { SessionType } from '../types.js';
import type { Config, ThemeColors } from '../types.js';

// ─── Presets ─────────────────────────────────────────────────────────────────

export const PRESETS: Record<string, ThemeColors> = {
  default: {
    focus: '#00C853',
    break: '#FFB300',
    highlight: '#00BCD4',
    text: '#E0E0E0',
    dim: '#444444',
    bg: '#111111',
  },
  gruvbox: {
    focus: '#98971A',
    break: '#D79921',
    highlight: '#458588',
    text: '#EBDBB2',
    dim: '#504945',
    bg: '#282828',
  },
  nord: {
    focus: '#A3BE8C',
    break: '#EBCB8B',
    highlight: '#88C0D0',
    text: '#ECEFF4',
    dim: '#4C566A',
    bg: '#2E3440',
  },
  dracula: {
    focus: '#50FA7B',
    break: '#F1FA8C',
    highlight: '#8BE9FD',
    text: '#F8F8F2',
    dim: '#44475A',
    bg: '#282A36',
  },
};

// ─── Mutable module-level state ───────────────────────────────────────────────
// WARNING: Mutated by initTheme() as a side-effect inside useMemo in App.
// This violates React's purity rule but is safe because Ink does not use
// concurrent rendering. Prefer context/props for new theming code.

// Classic Terminal palette (default)
export let colors: ThemeColors = { ...PRESETS.default! };

export let SESSION_COLORS: Record<SessionType, string> = {
  'work': colors.focus,
  'short-break': colors.break,
  'long-break': colors.break,
};

// ─── initTheme ────────────────────────────────────────────────────────────────

export function initTheme(config: Config): void {
  const preset = config.theme?.preset ?? 'default';
  const base = config.customThemes?.[preset] ?? PRESETS[preset] ?? PRESETS.default!;

  // Apply user color overrides on top of preset
  const resolved: ThemeColors = {
    ...base,
    ...(config.theme?.colors ?? {}),
  };

  colors = resolved;
  SESSION_COLORS = {
    'work': colors.focus,
    'short-break': colors.break,
    'long-break': colors.break,
  };
}
