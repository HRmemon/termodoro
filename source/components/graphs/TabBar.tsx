import React from 'react';
import { Box, Text } from 'ink';

interface TabBarProps {
  tabs: string[];
  activeTab: number;
  selDateLabel: string;
}

export function TabBar({ tabs, activeTab, selDateLabel }: TabBarProps) {
  return (
    <Box marginBottom={1}>
      {tabs.map((label, i) => (
        <React.Fragment key={i}>
          {i > 0 && <Text dimColor>  </Text>}
          <Text
            bold={i === activeTab}
            color={i === activeTab ? 'yellow' : 'gray'}
            underline={i === activeTab}
          >
            {label}
          </Text>
        </React.Fragment>
      ))}
      <Text dimColor>{'  |\u2190\u2192'}</Text>
      <Text bold color="cyan">{' '}{selDateLabel}</Text>
    </Box>
  );
}
