import { loadConfig, saveConfig } from '../config.js';
import { DEFAULT_KEYBINDINGS } from '../keymap.js';
import type { KeyAction, KeybindingConfig } from '../keymap.js';
import { tmpFile } from './utils.js';

export function formatKeybindings(): { content: string; tmpPath: string } {
  const config = loadConfig();
  const overrides = config.keybindings ?? {};

  // Group actions by prefix
  const groups: Record<string, KeyAction[]> = {};
  for (const action of Object.keys(DEFAULT_KEYBINDINGS) as KeyAction[]) {
    const prefix = action.split('.')[0]!;
    if (!groups[prefix]) groups[prefix] = [];
    groups[prefix]!.push(action);
  }

  const groupOrder = ['global', 'timer', 'nav', 'list', 'tracker', 'stats', 'config', 'calendar'];
  const groupLabels: Record<string, string> = {
    global: 'Global', timer: 'Timer', nav: 'Navigation', list: 'List Actions',
    tracker: 'Tracker', stats: 'Stats', config: 'Config', calendar: 'Calendar',
  };

  const lines: string[] = [];
  lines.push('# Keybindings');
  lines.push('# Format: action = key');
  lines.push('# Lines starting with # are comments. Delete a line to reset to default.');
  lines.push('# Special keys: space, return, escape, tab, ctrl+x, up, down, left, right');
  lines.push('');

  for (const group of groupOrder) {
    const actions = groups[group];
    if (!actions) continue;
    lines.push(`## ${groupLabels[group] ?? group}`);
    for (const action of actions) {
      const current = overrides[action] ?? DEFAULT_KEYBINDINGS[action];
      const isCustom = action in overrides;
      const defaultVal = DEFAULT_KEYBINDINGS[action];
      let line = `${action} = ${current}`;
      if (isCustom && current !== defaultVal) {
        line += `  # default: ${defaultVal}`;
      }
      lines.push(line);
    }
    lines.push('');
  }

  return { content: lines.join('\n'), tmpPath: tmpFile('keybindings') };
}

export function parseKeybindings(text: string): void {
  const lines = text.split('\n');
  const overrides: KeybindingConfig = {};
  const validActions = new Set(Object.keys(DEFAULT_KEYBINDINGS) as KeyAction[]);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const match = trimmed.match(/^(\S+)\s*=\s*(\S+)/);
    if (!match) continue;

    const action = match[1]! as KeyAction;
    let value = match[2]!;
    // Strip trailing comment
    const commentIdx = value.indexOf('#');
    if (commentIdx > 0) value = value.slice(0, commentIdx).trim();

    if (!validActions.has(action)) continue;

    // Only save if different from default
    if (value !== DEFAULT_KEYBINDINGS[action]) {
      overrides[action] = value;
    }
  }

  const config = loadConfig();
  config.keybindings = Object.keys(overrides).length > 0 ? overrides : undefined;
  saveConfig(config);
}
