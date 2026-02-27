import React from 'react';
import { Box, Text } from 'ink';
import type { View, Config } from '../types.js';
import { colors } from '../lib/theme.js';
import { getCategories } from '../lib/tracker.js';
import type { Keymap } from '../lib/keymap.js';
import { getVisibleViews, DEFAULT_VIEWS } from '../lib/views.js';

interface KeysBarProps {
  view: View;
  isRunning: boolean;
  isPaused: boolean;
  strictMode: boolean;
  isZen: boolean;
  hasActiveSequence: boolean;
  hasActiveProject: boolean;
  config?: Config;
  keymap?: Keymap;
}

interface KeyHint {
  key: string;
  label: string;
}

export function KeysBar({ view, isRunning, isPaused, strictMode, isZen, hasActiveSequence, hasActiveProject, config, keymap }: KeysBarProps) {
  // Zen mode: minimal
  if (isZen) {
    const hint = isRunning && !isPaused ? 'Pause' : isPaused ? 'Resume' : 'Start';
    const toggleLabel = keymap ? keymap.label('timer.toggle') : 'Space';
    return (
      <Box paddingX={1}>
        <Text color={colors.highlight}>{toggleLabel}</Text><Text color={colors.dim}>: {hint}</Text>
      </Box>
    );
  }

  const km = keymap;

  // Build action hints (top row)
  const actionHints: KeyHint[] = [];

  if (view === 'timer') {
    if (!strictMode) {
      const toggleLabel = km ? km.label('timer.toggle') : 'Space';
      if (isRunning && !isPaused) actionHints.push({ key: toggleLabel, label: 'Pause' });
      else if (isPaused) actionHints.push({ key: toggleLabel, label: 'Resume' });
      else actionHints.push({ key: toggleLabel, label: 'Start' });
    } else if (!isRunning) {
      actionHints.push({ key: km ? km.label('timer.toggle') : 'Space', label: 'Start' });
    }
    if (isRunning && !strictMode) actionHints.push({ key: km ? km.label('timer.skip') : 's', label: 'Skip' });
    actionHints.push({ key: km ? km.label('global.zen') : 'z', label: 'Zen' });
    actionHints.push({ key: km ? km.label('timer.set_duration') : 't', label: 'Set duration' });
    actionHints.push({ key: km ? km.label('timer.set_project') : 'p', label: 'Project' });
    if (hasActiveProject) actionHints.push({ key: km ? km.label('timer.clear_project') : 'P', label: 'Clear project' });
    actionHints.push({ key: km ? km.label('timer.sequences') : 'S', label: 'Sequences' });
    actionHints.push({ key: km ? km.label('timer.reset') : 'r', label: 'Reset+log' });
    if (hasActiveSequence) actionHints.push({ key: km ? km.label('timer.clear_sequence') : 'c', label: 'Clear seq' });
  }

  if (view === 'tasks') {
    const navLabel = km ? `${km.label('nav.down')}/${km.label('nav.up')}` : 'j/k';
    actionHints.push({ key: navLabel, label: 'Navigate' });
    actionHints.push({ key: 'Enter', label: 'View' });
    actionHints.push({ key: 'x', label: 'Done/Undo' });
    actionHints.push({ key: km ? km.label('list.add') : 'a', label: 'Add' });
    actionHints.push({ key: km ? km.label('list.edit') : 'e', label: 'Edit' });
    actionHints.push({ key: km ? km.label('list.delete') : 'd', label: 'Delete' });
    actionHints.push({ key: 'P', label: 'Projects' });
  }

  if (view === 'reminders') {
    const navLabel = km ? `${km.label('nav.down')}/${km.label('nav.up')}` : 'j/k';
    actionHints.push({ key: navLabel, label: 'Navigate' });
    actionHints.push({ key: km ? km.label('list.add') : 'a', label: 'Add' });
    actionHints.push({ key: km ? km.label('list.edit') : 'e', label: 'Edit' });
    actionHints.push({ key: km ? km.label('list.delete') : 'd', label: 'Delete' });
    actionHints.push({ key: 'Enter', label: 'On/Off' });
    actionHints.push({ key: 'r', label: 'Recurring' });
  }

  if (view === 'clock') {
    actionHints.push({ key: km ? km.label('global.zen') : 'z', label: 'Zen' });
  }

  if (view === 'stats') {
    const hlLabel = km ? `${km.label('stats.prev_tab')}/${km.label('stats.next_tab')}` : 'h/l';
    actionHints.push({ key: hlLabel, label: 'Sections' });
  }

  if (view === 'web') {
    const navLabel = km ? `${km.label('nav.down')}/${km.label('nav.up')}` : 'j/k';
    actionHints.push({ key: navLabel, label: 'Scroll' });
    actionHints.push({ key: 'Tab', label: 'Domains/Pages' });
  }

  if (view === 'tracker') {
    const navLabel = km ? `${km.label('nav.down')}/${km.label('nav.up')}` : 'j/k';
    const hlLabel = km ? `${km.label('nav.left')}/${km.label('nav.right')}` : 'h/l';
    actionHints.push({ key: navLabel, label: 'Scroll' });
    actionHints.push({ key: hlLabel, label: 'Days' });
    actionHints.push({ key: km ? km.label('tracker.pick') : 'e', label: 'Picker' });
    const quickKeys = getCategories().filter(c => c.key).map(c => c.key).join('/');
    if (quickKeys) actionHints.push({ key: quickKeys, label: 'Quick set' });
    actionHints.push({ key: km ? km.label('tracker.clear') : '.', label: 'Clear' });
    actionHints.push({ key: km ? km.label('tracker.review') : 'r', label: 'Review' });
    const daySummaryLabel = km ? km.label('tracker.day_summary') : 'D';
    const weekSummaryLabel = km ? km.label('tracker.week_summary') : 'w';
    actionHints.push({ key: `${daySummaryLabel}/${weekSummaryLabel}`, label: 'Summary' });
    actionHints.push({ key: km ? km.label('tracker.new_week') : 'n', label: 'New week' });
    actionHints.push({ key: km ? km.label('tracker.browse') : 'b', label: 'Browse' });
  }

  if (view === 'graphs') {
    const hlLabel = km ? `${km.label('nav.left')}/${km.label('nav.right')}` : 'h/l';
    actionHints.push({ key: hlLabel, label: 'Switch' });
    actionHints.push({ key: '\u2190\u2192', label: 'Select date' });
    actionHints.push({ key: 'Enter', label: 'Toggle/Rate' });
    actionHints.push({ key: km ? km.label('list.add') : 'a', label: 'Add' });
    actionHints.push({ key: km ? km.label('list.edit') : 'e', label: 'Edit' });
    actionHints.push({ key: km ? km.label('list.delete') : 'd', label: 'Delete' });
    const jkLabel = km ? `${km.label('nav.down')}/${km.label('nav.up')}` : 'j/k';
    actionHints.push({ key: jkLabel, label: 'Scroll weeks' });
  }

  if (view === 'calendar') {
    const hlLabel = km ? `${km.label('nav.left')}/${km.label('nav.right')}` : 'h/l';
    const jkLabel = km ? `${km.label('nav.down')}/${km.label('nav.up')}` : 'j/k';
    actionHints.push({ key: hlLabel, label: 'Days' });
    actionHints.push({ key: jkLabel, label: 'Weeks' });
    actionHints.push({ key: 'Tab', label: 'Pane' });
    actionHints.push({ key: km ? km.label('calendar.goto_today') : 't', label: 'Today' });
    actionHints.push({ key: km ? km.label('list.add') : 'a', label: 'Add' });
    actionHints.push({ key: km ? km.label('calendar.delete') : 'd', label: 'Del' });
    actionHints.push({ key: km ? km.label('calendar.toggle_done') : 'x', label: 'Done' });
    actionHints.push({ key: km ? km.label('calendar.toggle_view') : 'v', label: 'View' });
    actionHints.push({ key: km ? km.label('calendar.toggle_heatmap') : 'f', label: 'Focus' });
  }

  if (view === 'config') {
    const navLabel = km ? `${km.label('nav.down')}/${km.label('nav.up')}` : 'j/k';
    actionHints.push({ key: navLabel, label: 'Navigate' });
    actionHints.push({ key: 'Enter', label: 'Edit/Toggle' });
    actionHints.push({ key: km ? km.label('config.save') : 's', label: 'Save' });
  }

  // Global nav hints (bottom row) — build shortcut range dynamically
  const visibleViews = config ? getVisibleViews(config) : DEFAULT_VIEWS;
  const shortcuts = visibleViews.map(v => v.shortcut).filter(Boolean) as string[];
  let viewsHint = '1-9';
  if (shortcuts.length > 0) {
    if (shortcuts.length === 1) {
      viewsHint = shortcuts[0]!;
    } else {
      viewsHint = `${shortcuts[0]}-${shortcuts[shortcuts.length - 1]}`;
    }
  }

  const globalHints: KeyHint[] = [
    { key: viewsHint, label: 'Views' },
    { key: km ? km.label('global.search') : '/', label: 'Search' },
    { key: km ? km.label('global.command_palette') : ':', label: 'Cmd' },
    { key: km ? km.label('global.help') : '?', label: 'Help' },
    { key: km ? km.label('global.quit') : 'q', label: 'Quit' },
  ];

  return (
    <Box flexDirection="column" height={2}>
      {actionHints.length > 0 ? <HintRow hints={actionHints} /> : <Text> </Text>}
      <HintRow hints={globalHints} dim />
    </Box>
  );
}

function HintRow({ hints, dim }: { hints: KeyHint[]; dim?: boolean }) {
  return (
    <Box>
      {hints.map((h, i) => (
        <Box key={`${h.key}-${i}`} marginRight={2}>
          <Text color={dim ? colors.dim : colors.highlight}>{h.key}</Text>
          <Text color={colors.dim}>:{h.label}</Text>
        </Box>
      ))}
    </Box>
  );
}
