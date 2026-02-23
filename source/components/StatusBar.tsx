import React from 'react';
import { Box, Text } from 'ink';
import type { SessionType } from '../types.js';

interface StatusBarProps {
  sessionType: SessionType;
  secondsLeft: number;
  todaySessionCount: number;
  todayFocusMinutes: number;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function StatusBar({ sessionType, secondsLeft, todaySessionCount, todayFocusMinutes }: StatusBarProps) {
  return (
    <Box borderStyle="single" paddingX={1} justifyContent="space-between" width="100%">
      <Text>
        <Text dimColor>Session: </Text>
        <Text bold>{sessionType === 'work' ? 'Focus' : sessionType === 'short-break' ? 'Break' : 'Long Break'}</Text>
      </Text>
      <Text>
        <Text dimColor>Left: </Text>
        <Text bold>{formatTime(secondsLeft)}</Text>
      </Text>
      <Text>
        <Text dimColor>Today: </Text>
        <Text bold>{todaySessionCount}</Text>
        <Text dimColor> sessions, </Text>
        <Text bold>{todayFocusMinutes}</Text>
        <Text dimColor>min focused</Text>
      </Text>
    </Box>
  );
}
