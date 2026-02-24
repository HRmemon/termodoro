import React from 'react';
import { Box, Text } from 'ink';
import type { View } from '../types.js';
import { colors } from '../lib/theme.js';

interface SidebarProps {
  activeView: View;
  height: number;
}

const VIEWS: { key: View; num: string; label: string }[] = [
  { key: 'timer',     num: '1', label: 'Timer' },
  { key: 'tasks',     num: '2', label: 'Tasks' },
  { key: 'reminders', num: '3', label: 'Reminders' },
  { key: 'clock',     num: '4', label: 'Clock' },
  { key: 'plan',      num: '5', label: 'Sequences' },
  { key: 'stats',     num: '6', label: 'Stats' },
  { key: 'config',    num: '7', label: 'Config' },
];

export function Sidebar({ activeView, height }: SidebarProps) {
  return (
    <Box
      flexDirection="column"
      width={20}
      height={height}
      borderStyle="single"
      borderColor="gray"
      paddingX={1}
    >
      <Box marginBottom={1}>
        <Text bold color={colors.text}>Views</Text>
      </Box>
      {VIEWS.map(v => {
        const active = v.key === activeView;
        return (
          <Box key={v.key}>
            <Text color={active ? colors.highlight : colors.dim} bold={active}>
              {active ? '> ' : '  '}[{v.num}] {v.label}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}
