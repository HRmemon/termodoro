import React from 'react';
import { Box, Text } from 'ink';
import type { View } from '../types.js';
import { colors } from '../lib/theme.js';

interface KeysBarProps {
  view: View;
  isRunning: boolean;
  isPaused: boolean;
  strictMode: boolean;
  isZen: boolean;
  hasActiveSequence: boolean;
}

interface KeyHint {
  key: string;
  label: string;
}

export function KeysBar({ view, isRunning, isPaused, strictMode, isZen, hasActiveSequence }: KeysBarProps) {
  // Zen mode: minimal
  if (isZen) {
    const hint = isRunning && !isPaused ? 'Pause' : isPaused ? 'Resume' : 'Start';
    return (
      <Box paddingX={1}>
        <Text color={colors.highlight}>Space</Text><Text color={colors.dim}>: {hint}</Text>
      </Box>
    );
  }

  // Build action hints (top row)
  const actionHints: KeyHint[] = [];

  if (view === 'timer') {
    if (!strictMode) {
      if (isRunning && !isPaused) actionHints.push({ key: 'Space', label: 'Pause' });
      else if (isPaused) actionHints.push({ key: 'Space', label: 'Resume' });
      else actionHints.push({ key: 'Space', label: 'Start' });
    } else if (!isRunning) {
      actionHints.push({ key: 'Space', label: 'Start' });
    }
    if (isRunning && !strictMode) actionHints.push({ key: 's', label: 'Skip' });
    actionHints.push({ key: 'z', label: 'Zen' });
    actionHints.push({ key: 't', label: 'Set duration' });
    actionHints.push({ key: 'r', label: 'Reset+log' });
    if (hasActiveSequence) actionHints.push({ key: 'c', label: 'Clear seq' });
  }

  if (view === 'tasks') {
    actionHints.push({ key: 'j/k', label: 'Navigate' });
    actionHints.push({ key: 'Enter', label: 'Toggle active' });
    actionHints.push({ key: 'x', label: 'Done/Undo' });
    actionHints.push({ key: 'a', label: 'Add' });
    actionHints.push({ key: 'e', label: 'Edit' });
    actionHints.push({ key: 'd', label: 'Delete' });
  }

  if (view === 'reminders') {
    actionHints.push({ key: 'j/k', label: 'Navigate' });
    actionHints.push({ key: 'a', label: 'Add' });
    actionHints.push({ key: 'e', label: 'Edit' });
    actionHints.push({ key: 'd', label: 'Delete' });
    actionHints.push({ key: 'Enter', label: 'On/Off' });
    actionHints.push({ key: 'r', label: 'Recurring' });
  }

  if (view === 'clock') {
    actionHints.push({ key: 'z', label: 'Zen' });
  }

  if (view === 'plan') {
    actionHints.push({ key: 'j/k', label: 'Navigate' });
    actionHints.push({ key: 'Enter', label: 'Activate' });
    actionHints.push({ key: 'a', label: 'New' });
    actionHints.push({ key: 'e', label: 'Edit' });
    actionHints.push({ key: 'd', label: 'Delete' });
    if (hasActiveSequence) actionHints.push({ key: 'c', label: 'Clear' });
  }

  if (view === 'stats') {
    actionHints.push({ key: 'j/k', label: 'Scroll' });
  }

  if (view === 'config') {
    actionHints.push({ key: 'j/k', label: 'Navigate' });
    actionHints.push({ key: 'Enter', label: 'Edit/Toggle' });
    actionHints.push({ key: 's', label: 'Save' });
  }

  // Global nav hints (bottom row)
  const globalHints: KeyHint[] = [
    { key: '1-7', label: 'Views' },
    { key: '/', label: 'Search' },
    { key: ':', label: 'Cmd' },
    { key: '?', label: 'Help' },
    { key: 'q', label: 'Quit' },
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
