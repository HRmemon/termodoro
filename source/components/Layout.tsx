import React from 'react';
import { Box, Text } from 'ink';
import type { View, Config, LayoutConfig } from '../types.js';
import { Sidebar } from './Sidebar.js';
import { colors } from '../lib/theme.js';
import { useFullScreen } from '../hooks/useFullScreen.js';
import { getViewLabel, getViewNum } from '../lib/views.js';

interface LayoutProps {
  activeView: View;
  statusLine: React.ReactNode;
  keysBar: React.ReactNode;
  children: React.ReactNode;
  sidebarWidth?: number;
  layout?: LayoutConfig;
  config?: Config;
  overlayTitle?: string;
}

export function Layout({ activeView, statusLine, keysBar, children, sidebarWidth: sidebarWidthProp, layout, config, overlayTitle }: LayoutProps) {
  const { columns, rows } = useFullScreen();

  // Render 1 row less than terminal height to prevent tmux jitter
  const safeRows = Math.max(10, rows - 1);
  const sidebarWidth = Math.max(8, Math.min(sidebarWidthProp ?? 20, 30));

  // Determine sidebar visibility from layout config
  const sidebarSetting = layout?.sidebar ?? 'visible';
  const showSidebar = sidebarSetting === 'visible'
    ? true
    : sidebarSetting === 'hidden'
      ? false
      : columns >= 80; // 'auto'

  const compact = layout?.compact ?? false;
  const paddingX = compact ? 0 : 1;

  const contentWidth = columns - (showSidebar ? sidebarWidth : 0);

  // Manual border strings with proper T-junctions
  const topBorder = showSidebar
    ? '┌' + '─'.repeat(sidebarWidth - 1) + '┬' + '─'.repeat(contentWidth - 2) + '┐'
    : '┌' + '─'.repeat(columns - 2) + '┐';
  const midDivider = showSidebar
    ? '├' + '─'.repeat(sidebarWidth - 1) + '┴' + '─'.repeat(contentWidth - 2) + '┤'
    : '├' + '─'.repeat(columns - 2) + '┤';
  const simpleDivider = '├' + '─'.repeat(columns - 2) + '┤';

  // Resolve label and number for active view
  const viewNum = config ? getViewNum(config, activeView) : '';
  const viewTitle = config ? getViewLabel(config, activeView) : activeView;

  return (
    <Box flexDirection="column" width={columns} height={safeRows} overflow="hidden">

      {/* ┌──────────┬──────────────────┐ */}
      <Text color="gray">{topBorder}</Text>

      {/* Main area: sidebar │ content with side borders */}
      <Box flexDirection="row" flexGrow={1}>
        {showSidebar && (
          <Box
            width={sidebarWidth}
            borderStyle="single"
            borderTop={false}
            borderBottom={false}
            borderRight={false}
            borderColor="gray"
            paddingX={paddingX}
          >
            <Sidebar activeView={activeView} config={config} />
          </Box>
        )}
        <Box
          flexDirection="column"
          flexGrow={1}
          borderStyle="single"
          borderTop={false}
          borderBottom={false}
          borderColor="gray"
          paddingX={paddingX}
        >
          {!compact && !overlayTitle && (
            <Box marginBottom={1}>
              <Text dimColor>{viewNum ? `[${viewNum}] ` : ''}</Text>
              <Text bold color={colors.text}>{viewTitle}</Text>
            </Box>
          )}
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
        paddingX={paddingX}
      >
        {statusLine}
      </Box>

      {/* Keys bar section — only rendered when showKeysBar is true (keysBar prop non-null) */}
      {keysBar !== null && (
        <>
          {/* ├─────────────────────────────┤ */}
          <Text color="gray">{simpleDivider}</Text>

          {/* Keys bar: │ keys │ with └──┘ bottom */}
          <Box
            borderStyle="single"
            borderTop={false}
            borderColor="gray"
            paddingX={paddingX}
          >
            {keysBar}
          </Box>
        </>
      )}

      {/* When keys bar is hidden, the status row's box already has bottom border from borderStyle="single" */}
      {keysBar === null && (
        <Box
          borderStyle="single"
          borderTop={false}
          borderLeft={false}
          borderRight={false}
          borderColor="gray"
        />
      )}

    </Box>
  );
}
