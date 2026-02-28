import React from 'react';
import { Box, Text } from 'ink';
import type { SessionType } from '../types.js';
import { SESSION_COLORS, colors } from '../lib/theme.js';
import { formatMinutes } from '../lib/format.js';

interface StatusLineProps {
  sessionType: SessionType;
  isRunning: boolean;
  isPaused: boolean;
  timerMode: 'countdown' | 'stopwatch';
  streak: number;
  todaySessions: number;
  todayFocusMinutes: number;
}

const MODE_LABELS: Record<SessionType, string> = {
  'work': 'Focus',
  'short-break': 'Short Break',
  'long-break': 'Long Break',
};

export const StatusLine = React.memo(function StatusLine({ sessionType, isRunning, isPaused, timerMode, streak, todaySessions, todayFocusMinutes }: StatusLineProps) {
  const isStopwatch = timerMode === 'stopwatch';
  const status = isStopwatch && !isPaused ? 'STOPWATCH' : isPaused ? 'PAUSED' : isRunning ? 'RUNNING' : 'READY';
  const statusIcon = isStopwatch && !isPaused ? '⏱ ' : isPaused ? '⏸ ' : isRunning ? '▶ ' : '⏹ ';
  const statusColor = isPaused ? colors.break : isRunning ? colors.focus : colors.dim;

  return (
    <Box flexDirection="row" gap={3}>
      <Box>
        <Text color={statusColor} bold>{statusIcon}</Text>
        <Text color={statusColor} bold>{status}</Text>
      </Box>
      <Box>
        <Text color={colors.dim}>● </Text>
        <Text color={SESSION_COLORS[sessionType]}>{MODE_LABELS[sessionType]}</Text>
      </Box>
      <Box>
        <Text color={colors.text}>{formatMinutes(todayFocusMinutes)}</Text>
      </Box>
      <Box>
        <Text color={colors.text}>{todaySessions} Sessions</Text>
      </Box>
      {streak > 0 && (
        <Box>
          <Text color={colors.highlight}>{streak}d Streak</Text>
        </Box>
      )}
    </Box>
  );
});
