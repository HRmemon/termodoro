import { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import type { Config } from '../../types.js';
import { saveConfig } from '../../lib/config.js';
import { DEFAULT_KEYBINDINGS } from '../../lib/keymap.js';
import type { KeyAction } from '../../lib/keymap.js';

interface KeybindingsManagerProps {
  config: Config;
  onConfigChange: (config: Config) => void;
  setIsTyping: (v: boolean) => void;
  onBack: () => void;
}

const ACTION_LABELS: Record<KeyAction, string> = {
  'global.quit': 'Quit / Close',
  'global.help': 'Help',
  'global.zen': 'Zen Mode',
  'global.command_palette': 'Command Palette',
  'global.search': 'Search',
  'global.editor': 'Open in Editor',
  'global.toggle_sidebar': 'Toggle Sidebar',
  'timer.toggle': 'Start / Pause',
  'timer.skip': 'Skip Timer',
  'timer.set_duration': 'Set Duration',
  'timer.set_project': 'Set Project',
  'timer.clear_project': 'Clear Project',
  'timer.sequences': 'Sequences',
  'timer.reset': 'Reset Timer',
  'timer.clear_sequence': 'Clear Sequence',
  'nav.up': 'Navigate Up',
  'nav.down': 'Navigate Down',
  'nav.left': 'Navigate Left',
  'nav.right': 'Navigate Right',
  'list.add': 'Add Item',
  'list.edit': 'Edit Item',
  'list.delete': 'Delete Item',
  'list.toggle': 'Toggle / Select',
  'list.filter': 'Filter',
  'tracker.pick': 'Pick Category',
  'tracker.clear': 'Clear Slot',
  'tracker.review': 'Review Pending',
  'tracker.day_summary': 'Day Summary',
  'tracker.week_summary': 'Week Summary',
  'tracker.new_week': 'New Week',
  'tracker.browse': 'Browse Weeks',
  'stats.prev_tab': 'Previous Tab',
  'stats.next_tab': 'Next Tab',
  'config.save': 'Save Config',
  'calendar.toggle_view': 'Toggle Calendar View',
  'calendar.goto_today': 'Go to Today',
  'calendar.toggle_done': 'Toggle Done',
  'calendar.toggle_important': 'Toggle Important',
  'calendar.toggle_privacy': 'Toggle Privacy',
  'calendar.toggle_global_privacy': 'Toggle All Privacy',
  'calendar.reload_ics': 'Reload ICS Files',
};

const ACTIONS = Object.keys(DEFAULT_KEYBINDINGS) as KeyAction[];

// Group actions for visual sections
const GROUPS: { label: string; prefix: string }[] = [
  { label: 'Global', prefix: 'global.' },
  { label: 'Timer', prefix: 'timer.' },
  { label: 'Navigation', prefix: 'nav.' },
  { label: 'List', prefix: 'list.' },
  { label: 'Tracker', prefix: 'tracker.' },
  { label: 'Stats', prefix: 'stats.' },
  { label: 'Config', prefix: 'config.' },
  { label: 'Calendar', prefix: 'calendar.' },
];

function formatBinding(binding: string): string {
  if (binding === 'space') return 'Space';
  if (binding === 'return') return 'Enter';
  if (binding === 'escape') return 'Esc';
  if (binding === 'tab') return 'Tab';
  if (binding.startsWith('ctrl+')) return `Ctrl+${binding.slice(5).toUpperCase()}`;
  return binding;
}

export function KeybindingsManager({ config, onConfigChange, setIsTyping, onBack }: KeybindingsManagerProps) {
  const overrides = config.keybindings ?? {};
  const [cursor, setCursor] = useState(0);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');

  const getBinding = useCallback((action: KeyAction): string => {
    return overrides[action] ?? DEFAULT_KEYBINDINGS[action];
  }, [overrides]);

  const isCustom = useCallback((action: KeyAction): boolean => {
    return overrides[action] != null && overrides[action] !== DEFAULT_KEYBINDINGS[action];
  }, [overrides]);

  const handleSubmit = useCallback((value: string) => {
    const action = ACTIONS[cursor]!;
    const trimmed = value.trim();
    setEditing(false);
    setIsTyping(false);

    if (!trimmed) return; // empty = no change

    // Save full keybinding map so all keys are visible in config.json
    const full = { ...DEFAULT_KEYBINDINGS, ...overrides, [action]: trimmed };
    const newConfig = { ...config, keybindings: full };
    onConfigChange(newConfig);
    saveConfig(newConfig);
  }, [cursor, overrides, config, onConfigChange, setIsTyping]);

  const handleReset = useCallback(() => {
    const action = ACTIONS[cursor]!;
    // Save full map with this action reset to default
    const full = { ...DEFAULT_KEYBINDINGS, ...overrides };
    full[action] = DEFAULT_KEYBINDINGS[action];
    const newConfig = { ...config, keybindings: full };
    onConfigChange(newConfig);
    saveConfig(newConfig);
  }, [cursor, overrides, config, onConfigChange]);

  useInput((input, key) => {
    if (editing) {
      if (key.escape) {
        setEditing(false);
        setIsTyping(false);
      }
      return;
    }

    if (key.escape) { onBack(); return; }
    if (input === 'j' || key.downArrow) setCursor(p => Math.min(p + 1, ACTIONS.length - 1));
    else if (input === 'k' || key.upArrow) setCursor(p => Math.max(0, p - 1));
    else if (key.return || input === 'e') {
      const action = ACTIONS[cursor]!;
      setEditValue(getBinding(action));
      setEditing(true);
      setIsTyping(true);
    } else if (input === 'r') {
      handleReset();
    }
  });

  // Build display rows with group headers
  type Row = { type: 'header'; label: string } | { type: 'action'; action: KeyAction; idx: number };
  const rows: Row[] = [];
  let actionIdx = 0;
  for (const group of GROUPS) {
    const groupActions = ACTIONS.filter(a => a.startsWith(group.prefix));
    if (groupActions.length === 0) continue;
    rows.push({ type: 'header', label: group.label });
    for (const action of groupActions) {
      rows.push({ type: 'action', action, idx: actionIdx });
      actionIdx++;
    }
  }

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Text bold color="cyan">Keybindings</Text>
      <Text dimColor>Enter/e:edit  r:reset to default  Esc:back</Text>
      <Box flexDirection="column" marginTop={1}>
        {rows.map((row, i) => {
          if (row.type === 'header') {
            return (
              <Box key={`h-${row.label}`} marginTop={i > 0 ? 1 : 0}>
                <Text bold dimColor>── {row.label} ──</Text>
              </Box>
            );
          }

          const { action, idx } = row;
          const isSel = idx === cursor;
          const binding = getBinding(action);
          const custom = isCustom(action);

          return (
            <Box key={action}>
              <Text color={isSel ? 'yellow' : 'gray'} bold={isSel}>
                {isSel ? '> ' : '  '}
              </Text>
              <Box width={22}>
                <Text color={isSel ? 'white' : 'gray'}>{ACTION_LABELS[action]}</Text>
              </Box>
              {editing && isSel ? (
                <TextInput
                  value={editValue}
                  onChange={setEditValue}
                  onSubmit={handleSubmit}
                />
              ) : (
                <>
                  <Text color={custom ? 'cyan' : 'white'} bold={isSel}>
                    {formatBinding(binding)}
                  </Text>
                  {custom && <Text dimColor> (custom)</Text>}
                </>
              )}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
