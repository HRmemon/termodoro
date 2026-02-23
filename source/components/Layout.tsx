import React from 'react';
import { Box, Text } from 'ink';
import type { View } from '../types.js';
import { Sidebar } from './Sidebar.js';
import { useFullScreen } from '../hooks/useFullScreen.js';

interface LayoutProps {
  activeView: View;
  statusLine: React.ReactNode;
  keysBar: React.ReactNode;
  children: React.ReactNode;
}

const VIEW_TITLES: Record<View, string> = {
  timer: 'Timer & Tasks',
  plan: 'Sequences',
  stats: 'Stats',
  config: 'Config',
  clock: 'Clock',
  reminders: 'Reminders',
  tasks: 'Tasks',
};

const VIEW_NUMS: Record<View, string> = {
  timer: '1',
  tasks: '2',
  reminders: '3',
  clock: '4',
  plan: '5',
  stats: '6',
  config: '7',
};

export function Layout({ activeView, statusLine, keysBar, children }: LayoutProps) {
  const { columns, rows } = useFullScreen();
  const sidebarWidth = 22;
  const mainWidth = columns - sidebarWidth - 2;
  // Reserve 3 lines for status + 2-row keys at bottom
  const contentHeight = rows - 5;

  return (
    <Box flexDirection="column" width={columns} height={rows}>
      <Box flexDirection="row" height={contentHeight}>
        <Sidebar activeView={activeView} height={contentHeight} />
        <Box
          flexDirection="column"
          width={mainWidth}
          height={contentHeight}
          borderStyle="single"
          borderColor="gray"
          paddingX={1}
        >
          <Box marginBottom={1}>
            <Text dimColor>[</Text>
            <Text color="yellow">{VIEW_NUMS[activeView]}</Text>
            <Text dimColor>] </Text>
            <Text bold color="white">{VIEW_TITLES[activeView]}</Text>
          </Box>
          <Box flexDirection="column" flexGrow={1}>
            {children}
          </Box>
        </Box>
      </Box>
      <Box paddingX={1}>
        {statusLine}
      </Box>
      <Box paddingX={1}>
        {keysBar}
      </Box>
    </Box>
  );
}
