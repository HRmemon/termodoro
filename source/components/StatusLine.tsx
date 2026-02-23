import React from 'react';
import { Box, Text } from 'ink';
import type { SessionType } from '../types.js';

interface StatusLineProps {
  sessionType: SessionType;
  isRunning: boolean;
  isPaused: boolean;
  streak: number;
  todaySessions: number;
  todayFocusMinutes: number;
}

const MODE_LABELS: Record<SessionType, string> = {
  'work': 'Focus',
  'short-break': 'Short Break',
  'long-break': 'Long Break',
};

const MODE_COLORS: Record<SessionType, string> = {
  'work': 'red',
  'short-break': 'green',
  'long-break': 'blue',
};

export function StatusLine({ sessionType, isRunning, isPaused, streak, todaySessions, todayFocusMinutes }: StatusLineProps) {
  const status = isPaused ? 'Paused' : isRunning ? 'Running' : 'Ready';
  const statusColor = isPaused ? 'yellow' : isRunning ? 'green' : 'gray';

  return (
    <Box>
      <Text dimColor>[</Text>
      <Text color={statusColor}>{status}</Text>
      <Text dimColor>] </Text>
      <Text dimColor>Mode: </Text>
      <Text color={MODE_COLORS[sessionType]}>{MODE_LABELS[sessionType]}</Text>
      <Text dimColor> | </Text>
      <Text dimColor>Streak: </Text>
      <Text color="yellow">{streak}</Text>
      <Text dimColor> | </Text>
      <Text dimColor>Today: </Text>
      <Text>{todaySessions}</Text>
      <Text dimColor> sessions, </Text>
      <Text>{todayFocusMinutes}</Text>
      <Text dimColor>m focus</Text>
    </Box>
  );
}
