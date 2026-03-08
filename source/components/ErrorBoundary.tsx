import React from 'react';
import { Box, Text } from 'ink';

export class ErrorBoundary extends React.Component<{children: React.ReactNode}, {hasError: boolean, error?: Error}> {
  state: { hasError: boolean, error?: Error } = { hasError: false };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <Box flexDirection="column" padding={1} borderStyle="round" borderColor="red">
          <Text color="red" bold>Fatal UI Error</Text>
          <Text>{this.state.error?.message}</Text>
          <Text dimColor>Please check your config files and restart pomodorocli.</Text>
        </Box>
      );
    }
    return this.props.children;
  }
}