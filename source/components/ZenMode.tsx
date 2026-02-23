import React from 'react';
import { Box, Text } from 'ink';
import type { SessionType } from '../types.js';
import { renderBigTime } from '../lib/bigDigits.js';
import { useFullScreen } from '../hooks/useFullScreen.js';

interface ZenModeProps {
  secondsLeft: number;
  totalSeconds: number;
  sessionType: SessionType;
  isPaused: boolean;
  isRunning: boolean;
}

const COLORS: Record<SessionType, string> = {
  'work': 'red',
  'short-break': 'green',
  'long-break': 'blue',
};

const MODE_LABELS: Record<SessionType, string> = {
  'work': 'Focus',
  'short-break': 'Short Break',
  'long-break': 'Long Break',
};

export function ZenMode({ secondsLeft, totalSeconds, sessionType, isPaused, isRunning }: ZenModeProps) {
  const { columns, rows } = useFullScreen();
  const lines = renderBigTime(secondsLeft);
  const color = COLORS[sessionType];

  // Center everything vertically
  const contentHeight = 5 + 1 + 3; // digits + mode label + space hint
  const topPad = Math.max(0, Math.floor((rows - contentHeight) / 2));

  return (
    <Box flexDirection="column" width={columns} height={rows} alignItems="center">
      <Box height={topPad} />
      <Box marginBottom={1}>
        <Text color={color} bold>{MODE_LABELS[sessionType]}</Text>
      </Box>
      {lines.map((line, i) => (
        <Box key={i} justifyContent="center">
          <Text color={color} bold={!isPaused} dimColor={isPaused}>
            {line}
          </Text>
        </Box>
      ))}
      {isPaused && (
        <Box marginTop={1} justifyContent="center">
          <Text color="yellow" bold>PAUSED</Text>
        </Box>
      )}
      <Box marginTop={2} justifyContent="center">
        <Text dimColor>
          {!isRunning && !isPaused ? 'Space: Start' : isPaused ? 'Space: Resume' : 'Space: Pause'}
        </Text>
      </Box>
    </Box>
  );
}
