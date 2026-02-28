import type { Config } from '../types.js';

export type KeyAction =
  // Global
  | 'global.quit' | 'global.help' | 'global.zen'
  | 'global.command_palette' | 'global.search' | 'global.editor'
  | 'global.toggle_sidebar'
  // Timer
  | 'timer.toggle' | 'timer.skip' | 'timer.set_duration'
  | 'timer.set_project' | 'timer.clear_project'
  | 'timer.sequences' | 'timer.reset' | 'timer.clear_sequence'
  // Navigation
  | 'nav.up' | 'nav.down' | 'nav.left' | 'nav.right'
  // List actions
  | 'list.add' | 'list.edit' | 'list.delete' | 'list.toggle' | 'list.filter'
  // Tracker
  | 'tracker.pick' | 'tracker.clear' | 'tracker.review'
  | 'tracker.day_summary' | 'tracker.week_summary'
  | 'tracker.new_week' | 'tracker.browse'
  // Stats
  | 'stats.prev_tab' | 'stats.next_tab'
  // Config
  | 'config.save'
  // Calendar
  | 'calendar.toggle_view' | 'calendar.goto_today'
  | 'calendar.toggle_done' | 'calendar.toggle_important'
  | 'calendar.toggle_privacy' | 'calendar.toggle_global_privacy'
  | 'calendar.reload_ics' | 'calendar.delete'
  | 'calendar.toggle_heatmap';

export type KeybindingConfig = Partial<Record<KeyAction, string>>;

export const DEFAULT_KEYBINDINGS: Record<KeyAction, string> = {
  'global.quit': 'q',
  'global.help': '?',
  'global.zen': 'z',
  'global.command_palette': ':',
  'global.search': '/',
  'global.editor': 'ctrl+g',
  'global.toggle_sidebar': '=',
  'timer.toggle': 'space',
  'timer.skip': 's',
  'timer.set_duration': 't',
  'timer.set_project': 'p',
  'timer.clear_project': 'P',
  'timer.sequences': 'S',
  'timer.reset': 'r',
  'timer.clear_sequence': 'c',
  'nav.up': 'k',
  'nav.down': 'j',
  'nav.left': 'h',
  'nav.right': 'l',
  'list.add': 'a',
  'list.edit': 'e',
  'list.delete': 'd',
  'list.toggle': 'return',
  'list.filter': '/',
  'tracker.pick': 'e',
  'tracker.clear': '.',
  'tracker.review': 'r',
  'tracker.day_summary': 'D',
  'tracker.week_summary': 'w',
  'tracker.new_week': 'n',
  'tracker.browse': 'b',
  'stats.prev_tab': 'h',
  'stats.next_tab': 'l',
  'config.save': 's',
  'calendar.toggle_view': 'v',
  'calendar.goto_today': 't',
  'calendar.toggle_done': 'x',
  'calendar.delete': 'd',
  'calendar.toggle_important': 'i',
  'calendar.toggle_privacy': '.',
  'calendar.toggle_global_privacy': '*',
  'calendar.reload_ics': 'Q',
  'calendar.toggle_heatmap': 'f',
};

export class Keymap {
  private bindings: Record<KeyAction, string>;

  constructor(overrides?: KeybindingConfig) {
    this.bindings = { ...DEFAULT_KEYBINDINGS, ...overrides };
  }

  matches(
    action: KeyAction,
    input: string,
    key: {
      return?: boolean;
      escape?: boolean;
      tab?: boolean;
      upArrow?: boolean;
      downArrow?: boolean;
      leftArrow?: boolean;
      rightArrow?: boolean;
      ctrl?: boolean;
    }
  ): boolean {
    const binding = this.bindings[action];
    if (!binding) return false;

    // Handle special keys
    if (binding === 'space') return input === ' ';
    if (binding === 'return') return !!key.return;
    if (binding === 'escape') return !!key.escape;
    if (binding === 'tab') return !!key.tab;
    if (binding === 'up') return !!key.upArrow;
    if (binding === 'down') return !!key.downArrow;
    if (binding === 'left') return !!key.leftArrow;
    if (binding === 'right') return !!key.rightArrow;

    // Handle ctrl+key
    if (binding.startsWith('ctrl+')) {
      const char = binding.slice(5);
      if (!char) return false; // malformed binding like "ctrl+"
      return !!key.ctrl && input === char;
    }

    // Simple character match
    return input === binding;
  }

  label(action: KeyAction): string {
    const binding = this.bindings[action];
    if (!binding) return '';
    if (binding === 'space') return 'Space';
    if (binding === 'return') return 'Enter';
    if (binding === 'escape') return 'Esc';
    if (binding === 'tab') return 'Tab';
    if (binding.startsWith('ctrl+')) return `Ctrl+${binding.slice(5).toUpperCase()}`;
    return binding;
  }

  get(action: KeyAction): string {
    return this.bindings[action] ?? '';
  }
}

export type KeyObject = Parameters<Keymap['matches']>[2];

export function kmMatches(
  km: Keymap | undefined,
  action: KeyAction,
  input: string,
  key: KeyObject,
): boolean {
  return km ? km.matches(action, input, key) : input === DEFAULT_KEYBINDINGS[action];
}

export function createKeymap(config: Config): Keymap {
  return new Keymap(config.keybindings);
}
