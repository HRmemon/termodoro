import React from 'react';
import { Box, Text } from 'ink';
import type { View, Config } from '../types.js';
import { colors } from '../lib/theme.js';
import { getVisibleViews, DEFAULT_VIEWS } from '../lib/views.js';

interface SidebarProps {
  activeView: View;
  config?: Config;
}

export const Sidebar = React.memo(function Sidebar({ activeView, config }: SidebarProps) {
  const views = config ? getVisibleViews(config) : DEFAULT_VIEWS;

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color={colors.text}>VIEWS</Text>
      </Box>
      {views.map(v => {
        const active = v.id === activeView;
        return (
          <Box key={v.id}>
            <Text color={active ? colors.highlight : colors.dim} bold={active}>
              {active ? '█ ' : '  '}{v.shortcut ?? ' '} {v.label}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
});
