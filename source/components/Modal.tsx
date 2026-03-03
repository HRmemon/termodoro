import { Box, Text } from 'ink';
import React from 'react';

interface ModalProps {
  title: string;
  step?: { current: number; total: number };
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: number;
}

export function Modal({ title, step, children, footer, width = 60 }: ModalProps) {
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      width={width}
      paddingX={1}
      alignSelf="center"
    >
      <Box justifyContent="space-between" marginBottom={1}>
        <Text bold color="cyan">{title.toUpperCase()}</Text>
        {step && (
          <Text dimColor>
            (Step {step.current}/{step.total})
          </Text>
        )}
      </Box>
      <Box flexDirection="column" marginBottom={1}>
        {children}
      </Box>
      {footer && (
        <Box borderStyle="single" borderTop={true} borderBottom={false} borderLeft={false} borderRight={false} paddingTop={0}>
          <Text dimColor>{footer}</Text>
        </Box>
      )}
    </Box>
  );
}
