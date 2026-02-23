import React from 'react';
import { Box, Text } from 'ink';
import type { SessionType } from '../types.js';

interface TimerProps {
  secondsLeft: number;
  totalSeconds: number;
  sessionType: SessionType;
  isPaused: boolean;
}

const TYPE_COLORS: Record<SessionType, string> = {
  'work': 'red',
  'short-break': 'green',
  'long-break': 'blue',
};

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function renderProgressBar(progress: number, width: number): string {
  const filled = Math.round(progress * width);
  const empty = width - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

export function Timer({ secondsLeft, totalSeconds, sessionType, isPaused }: TimerProps) {
  const color = TYPE_COLORS[sessionType];
  const progress = totalSeconds > 0 ? 1 - secondsLeft / totalSeconds : 0;
  const barWidth = 30;

  return (
    <Box flexDirection="column" alignItems="center" marginY={1}>
      <Text color={color} bold>
        {formatTime(secondsLeft)}
      </Text>
      <Box marginY={1}>
        <Text color={color}>{renderProgressBar(progress, barWidth)}</Text>
      </Box>
      {isPaused && (
        <Text color="yellow" bold>
          PAUSED
        </Text>
      )}
    </Box>
  );
}
