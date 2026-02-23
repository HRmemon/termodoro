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
  plan: 'Plan',
  stats: 'Stats',
  config: 'Config',
  clock: 'Clock',
};

const VIEW_NUMS: Record<View, string> = {
  timer: '1',
  plan: '2',
  stats: '3',
  config: '4',
  clock: '5',
};

export function Layout({ activeView, statusLine, keysBar, children }: LayoutProps) {
  const { columns, rows } = useFullScreen();
  const sidebarWidth = 18;
  const mainWidth = columns - sidebarWidth - 2;
  // Reserve 2 lines for status + keys at bottom
  const contentHeight = rows - 4;

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
