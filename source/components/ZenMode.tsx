import React from 'react';
import { Box, Text } from 'ink';
import type { SessionType } from '../types.js';
import { renderBigTime } from '../lib/bigDigits.js';
import { useFullScreen } from '../hooks/useFullScreen.js';
import { SESSION_COLORS, colors, MODE_LABELS } from '../lib/theme.js';

interface ZenModeProps {
  secondsLeft: number;
  totalSeconds: number;
  sessionType: SessionType;
  isPaused: boolean;
  isRunning: boolean;
  timerFormat?: 'mm:ss' | 'hh:mm:ss' | 'minutes';
  timerMode: 'countdown' | 'stopwatch';
  stopwatchElapsed: number;
}

export const ZenMode = React.memo(function ZenMode({ secondsLeft, totalSeconds, sessionType, isPaused, isRunning, timerFormat, timerMode, stopwatchElapsed }: ZenModeProps) {
  const { columns, rows } = useFullScreen();
  const isStopwatch = timerMode === 'stopwatch';
  const displaySeconds = isStopwatch ? stopwatchElapsed : secondsLeft;
  const lines = renderBigTime(displaySeconds, timerFormat ?? 'mm:ss', isStopwatch);
  const color = SESSION_COLORS[sessionType];

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
          <Text color={colors.break} bold>PAUSED</Text>
        </Box>
      )}
      {isStopwatch && (
        <Box marginTop={1} justifyContent="center">
          <Text color={colors.dim}>⏱ Stopwatch</Text>
        </Box>
      )}
      <Box marginTop={2} justifyContent="center">
        <Text dimColor>
          {!isRunning && !isPaused ? 'Space: Start' : isPaused ? 'Space: Resume' : 'Space: Pause'}
        </Text>
      </Box>
    </Box>
  );
});
