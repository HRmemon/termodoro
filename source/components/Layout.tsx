import React from 'react';
import { Box, Text } from 'ink';
import type { View } from '../types.js';
import { Sidebar } from './Sidebar.js';
import { colors } from '../lib/theme.js';
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
  web: 'Web Time',
  tracker: 'Time Tracker',
  graphs: 'Graphs',
};

const VIEW_NUMS: Record<View, string> = {
  timer: '1',
  tasks: '2',
  reminders: '3',
  clock: '4',
  plan: '5',
  stats: '6',
  config: '7',
  web: '8',
  tracker: '9',
  graphs: '0',
};

export function Layout({ activeView, statusLine, keysBar, children }: LayoutProps) {
  const { columns, rows } = useFullScreen();

  // Render 1 row less than terminal height to prevent tmux jitter
  const safeRows = Math.max(10, rows - 1);
  const sidebarWidth = 20;
  const contentWidth = columns - sidebarWidth;

  // Manual border strings with proper T-junctions
  const topBorder = '┌' + '─'.repeat(sidebarWidth - 1) + '┬' + '─'.repeat(contentWidth - 2) + '┐';
  const midDivider = '├' + '─'.repeat(sidebarWidth - 1) + '┴' + '─'.repeat(contentWidth - 2) + '┤';
  const simpleDivider = '├' + '─'.repeat(columns - 2) + '┤';

  return (
    <Box flexDirection="column" width={columns} height={safeRows} overflow="hidden">

      {/* ┌──────────┬──────────────────┐ */}
      <Text color="gray">{topBorder}</Text>

      {/* Main area: sidebar │ content with side borders */}
      <Box flexDirection="row" flexGrow={1}>
        <Box
          width={sidebarWidth}
          borderStyle="single"
          borderTop={false}
          borderBottom={false}
          borderRight={false}
          borderColor="gray"
          paddingX={1}
        >
          <Sidebar activeView={activeView} />
        </Box>
        <Box
          flexDirection="column"
          flexGrow={1}
          borderStyle="single"
          borderTop={false}
          borderBottom={false}
          borderColor="gray"
          paddingX={1}
        >
          <Box marginBottom={1}>
            <Text dimColor>[{VIEW_NUMS[activeView]}] </Text>
            <Text bold color={colors.text}>{VIEW_TITLES[activeView]}</Text>
          </Box>
          <Box flexDirection="column" flexGrow={1}>
            {children}
          </Box>
        </Box>
      </Box>

      {/* ├──────────┴──────────────────┤ */}
      <Text color="gray">{midDivider}</Text>

      {/* Status row: │ status │ */}
      <Box
        borderStyle="single"
        borderTop={false}
        borderBottom={false}
        borderColor="gray"
        paddingX={1}
      >
        {statusLine}
      </Box>

      {/* ├─────────────────────────────┤ */}
      <Text color="gray">{simpleDivider}</Text>

      {/* Keys bar: │ keys │ with └──┘ bottom */}
      <Box
        borderStyle="single"
        borderTop={false}
        borderColor="gray"
        paddingX={1}
      >
        {keysBar}
      </Box>

    </Box>
  );
}
