import React from 'react';
import { Box, Text } from 'ink';
import type { View } from '../types.js';

interface SidebarProps {
  activeView: View;
  height: number;
}

const VIEWS: { key: View; num: string; label: string }[] = [
  { key: 'timer', num: '1', label: 'Timer' },
  { key: 'plan', num: '2', label: 'Sequences' },
  { key: 'stats', num: '3', label: 'Stats' },
  { key: 'config', num: '4', label: 'Config' },
  { key: 'clock', num: '5', label: 'Clock' },
  { key: 'reminders', num: '6', label: 'Reminders' },
  { key: 'tasks', num: '7', label: 'Tasks' },
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
        <Text bold color="white">Views</Text>
      </Box>
      {VIEWS.map(v => {
        const active = v.key === activeView;
        return (
          <Box key={v.key}>
            <Text color={active ? 'white' : 'gray'} bold={active}>
              {active ? '> ' : '  '}[{v.num}] {v.label}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}
