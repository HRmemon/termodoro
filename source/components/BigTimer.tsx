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
  timerMode: 'countdown' | 'stopwatch';
  stopwatchElapsed: number;
}

export function BigTimer({ secondsLeft, totalSeconds, sessionType, isPaused, isRunning, timerFormat, timerMode, stopwatchElapsed }: BigTimerProps) {
  const isStopwatch = timerMode === 'stopwatch';
  const displaySeconds = isStopwatch ? stopwatchElapsed : secondsLeft;
  const format = timerFormat ?? 'mm:ss';
  const lines = renderBigTime(displaySeconds, format, isStopwatch);
  const color = SESSION_COLORS[sessionType];

  return (
    <Box flexDirection="column" alignItems="center">
      {lines.map((line, i) => (
        <Text key={i} color={color} bold={!isPaused} dimColor={isPaused}>
          {line}
        </Text>
      ))}
      {isStopwatch ? (
        <Box marginTop={1}>
          <Text color={colors.dim}>⏱ Stopwatch</Text>
          {stopwatchElapsed > totalSeconds && (
            <Text color={colors.break}>  +{formatOvertime(stopwatchElapsed - totalSeconds)} past {Math.floor(totalSeconds / 60)}:00</Text>
          )}
        </Box>
      ) : (
        <Box marginTop={1}>
          <Text color={color}>
            {(() => {
              const progress = totalSeconds > 0 ? (totalSeconds - secondsLeft) / totalSeconds : 0;
              const filled = Math.round(progress * 30);
              return '█'.repeat(filled) + '░'.repeat(30 - filled);
            })()}
          </Text>
        </Box>
      )}
      {isPaused && (
        <Box marginTop={1}>
          <Text color={colors.break} bold>PAUSED</Text>
        </Box>
      )}
      {!isRunning && !isPaused && !isStopwatch && secondsLeft === totalSeconds && (
        <Box marginTop={1}>
          <Text color={colors.dim}>Press </Text>
          <Text color={colors.highlight}>Space</Text>
          <Text color={colors.dim}> to start</Text>
        </Box>
      )}
    </Box>
  );
}

function formatOvertime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
