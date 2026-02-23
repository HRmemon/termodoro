import React from 'react';
import { Box, Text } from 'ink';

interface ControlsProps {
  isRunning: boolean;
  isPaused: boolean;
  strictMode: boolean;
  vimKeys: boolean;
}

export function Controls({ isRunning, isPaused, strictMode, vimKeys }: ControlsProps) {
  const hints: string[] = [];

  if (!isRunning && !isPaused) {
    hints.push('[space] start');
  } else if (isPaused) {
    hints.push('[space] resume');
  } else if (!strictMode) {
    hints.push('[space] pause');
  }

  if (!strictMode && isRunning) {
    hints.push('[s] skip');
  }

  hints.push('[t] stats');
  hints.push('[p] plan');
  hints.push('[:] command');
  hints.push('[q] quit');

  return (
    <Box marginTop={1} justifyContent="center">
      <Text dimColor>{hints.join('  ')}</Text>
    </Box>
  );
}
