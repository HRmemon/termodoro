import React from 'react';
import { Box, Text } from 'ink';
import type { SessionType } from '../types.js';

interface HeaderProps {
  sessionType: SessionType;
  sessionNumber: number;
  totalWorkSessions: number;
  longBreakInterval: number;
  label?: string;
  project?: string;
}

const TYPE_LABELS: Record<SessionType, string> = {
  'work': 'Focus',
  'short-break': 'Short Break',
  'long-break': 'Long Break',
};

const TYPE_COLORS: Record<SessionType, string> = {
  'work': 'red',
  'short-break': 'green',
  'long-break': 'blue',
};

export function Header({ sessionType, sessionNumber, totalWorkSessions, longBreakInterval, label, project }: HeaderProps) {
  const cyclePosition = (totalWorkSessions % longBreakInterval) + (sessionType === 'work' ? 1 : 0);

  return (
    <Box flexDirection="column" alignItems="center">
      <Box>
        <Text bold color={TYPE_COLORS[sessionType]}>
          Pomodoro {sessionNumber}
        </Text>
        <Text dimColor> ({cyclePosition}/{longBreakInterval}) </Text>
        <Text color={TYPE_COLORS[sessionType]}>[{TYPE_LABELS[sessionType]}]</Text>
      </Box>
      {(label || project) && (
        <Box>
          {project && <Text color="cyan">{project}</Text>}
          {project && label && <Text dimColor> — </Text>}
          {label && <Text>{label}</Text>}
        </Box>
      )}
    </Box>
  );
}
