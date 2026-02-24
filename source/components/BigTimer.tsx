import React from 'react';
import { Box, Text } from 'ink';
import type { SessionType } from '../types.js';
import { renderBigTime } from '../lib/bigDigits.js';
import { SESSION_COLORS, colors } from '../lib/theme.js';

interface BigTimerProps {
  secondsLeft: number;
  totalSeconds: number;
  sessionType: SessionType;
  isPaused: boolean;
  isRunning: boolean;
  timerFormat?: 'mm:ss' | 'hh:mm:ss' | 'minutes';
}

export function BigTimer({ secondsLeft, totalSeconds, sessionType, isPaused, isRunning, timerFormat }: BigTimerProps) {
  const lines = renderBigTime(secondsLeft, timerFormat ?? 'mm:ss');
  const color = SESSION_COLORS[sessionType];
  const progress = totalSeconds > 0 ? (totalSeconds - secondsLeft) / totalSeconds : 0;
  const barWidth = 30;
  const filled = Math.round(progress * barWidth);
  const bar = '█'.repeat(filled) + '░'.repeat(barWidth - filled);

  return (
    <Box flexDirection="column" alignItems="center">
      {lines.map((line, i) => (
        <Text key={i} color={color} bold={!isPaused} dimColor={isPaused}>
          {line}
        </Text>
      ))}
      <Box marginTop={1}>
        <Text color={color}>{bar}</Text>
      </Box>
      {isPaused && (
        <Box marginTop={1}>
          <Text color={colors.break} bold>PAUSED</Text>
        </Box>
      )}
      {!isRunning && !isPaused && secondsLeft === totalSeconds && (
        <Box marginTop={1}>
          <Text color={colors.dim}>Press </Text>
          <Text color={colors.highlight}>Space</Text>
          <Text color={colors.dim}> to start</Text>
        </Box>
      )}
    </Box>
  );
}
