import React from 'react';
import { Box, Text } from 'ink';
import type { View } from '../types.js';

interface KeysBarProps {
  view: View;
  isRunning: boolean;
  isPaused: boolean;
  strictMode: boolean;
  isZen: boolean;
}

interface KeyHint {
  key: string;
  label: string;
}

export function KeysBar({ view, isRunning, isPaused, strictMode, isZen }: KeysBarProps) {
  const hints: KeyHint[] = [];

  if (isZen) {
    if (isRunning && !isPaused) {
      hints.push({ key: 'Space', label: 'Pause' });
    } else if (isPaused) {
      hints.push({ key: 'Space', label: 'Resume' });
    } else {
      hints.push({ key: 'Space', label: 'Start' });
    }
    return <HintRow hints={hints} />;
  }

  hints.push({ key: '1-7', label: 'Switch View' });

  if (view === 'timer') {
    if (isRunning && !isPaused && !strictMode) {
      hints.push({ key: 'Space', label: 'Pause' });
    } else if (isPaused) {
      hints.push({ key: 'Space', label: 'Resume' });
    } else if (!isRunning) {
      hints.push({ key: 'Space', label: 'Start' });
    }
    if (isRunning && !strictMode) {
      hints.push({ key: 's', label: 'Skip' });
    }
    hints.push({ key: 'z', label: 'Zen' });
  }

  if (view === 'plan') {
    hints.push({ key: 'j/k', label: 'Navigate' });
    hints.push({ key: 'Enter', label: 'Activate' });
    hints.push({ key: 'c', label: 'Clear' });
    hints.push({ key: 'n', label: 'New' });
    hints.push({ key: 'e/d', label: 'Edit/Del' });
  }

  if (view === 'tasks') {
    hints.push({ key: 'j/k', label: 'Navigate' });
    hints.push({ key: 'Enter', label: 'Active' });
    hints.push({ key: 'x', label: 'Done' });
    hints.push({ key: 'u', label: 'Undo' });
    hints.push({ key: 'e', label: 'Edit' });
    hints.push({ key: 'd', label: 'Del' });
    hints.push({ key: 'a', label: 'Add' });
  }

  if (view === 'reminders') {
    hints.push({ key: 'j/k', label: 'Navigate' });
    hints.push({ key: 'a', label: 'Add' });
    hints.push({ key: 'e/d', label: 'Edit/Del' });
    hints.push({ key: 'Enter', label: 'Toggle' });
  }

  if (view === 'stats') {
    hints.push({ key: 'j/k', label: 'Scroll' });
  }

  if (view === 'config') {
    hints.push({ key: 'j/k', label: 'Navigate' });
    hints.push({ key: 'Enter', label: 'Edit' });
    hints.push({ key: 's', label: 'Save' });
  }

  hints.push({ key: ':', label: 'Command' });
  hints.push({ key: 'q', label: 'Quit' });

  return <HintRow hints={hints} />;
}

function HintRow({ hints }: { hints: KeyHint[] }) {
  return (
    <Box>
      {hints.map((h, i) => (
        <Box key={h.key} marginRight={1}>
          <Text dimColor>{i > 0 ? '' : ''}</Text>
          <Text color="yellow">{h.key}</Text>
          <Text dimColor>: {h.label}</Text>
        </Box>
      ))}
    </Box>
  );
}
