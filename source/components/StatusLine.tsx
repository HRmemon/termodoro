import React from 'react';
import { Box, Text } from 'ink';
import type { SessionType } from '../types.js';
import { SESSION_COLORS, colors } from '../lib/theme.js';

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

function formatDuration(minutes: number): string {
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${minutes}m`;
}

export function StatusLine({ sessionType, isRunning, isPaused, streak, todaySessions, todayFocusMinutes }: StatusLineProps) {
  const status = isPaused ? 'Paused' : isRunning ? 'Running' : 'Ready';
  const statusColor = isPaused ? colors.break : isRunning ? colors.focus : colors.dim;

  return (
    <Box>
      <Text color={statusColor}>{status}</Text>
      <Text color={colors.dim}> | </Text>
      <Text color={SESSION_COLORS[sessionType]}>{MODE_LABELS[sessionType]}</Text>
      <Text color={colors.dim}> | </Text>
      <Text color={colors.dim}>Focus </Text>
      <Text color={colors.text}>{formatDuration(todayFocusMinutes)}</Text>
      <Text color={colors.dim}> | </Text>
      <Text color={colors.dim}>Sessions </Text>
      <Text color={colors.text}>{todaySessions}</Text>
      {streak > 0 && (
        <>
          <Text color={colors.dim}> | </Text>
          <Text color={colors.dim}>Streak </Text>
          <Text color={colors.highlight}>{streak}</Text>
        </>
      )}
    </Box>
  );
}
