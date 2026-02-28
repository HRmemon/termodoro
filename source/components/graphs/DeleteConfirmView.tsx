import { Box, Text } from 'ink';
import type { TrackedGoal } from '../../lib/goals.js';

interface DeleteConfirmViewProps {
  goal: TrackedGoal | undefined;
}

export function DeleteConfirmView({ goal }: DeleteConfirmViewProps) {
  return (
    <Box flexDirection="column" flexGrow={1}>
      <Text bold color="red">Delete Goal</Text>
      <Box marginTop={1}>
        <Text>Delete <Text bold color={goal?.color as any}>{goal?.name}</Text> and all its data? </Text>
        <Text color="yellow">[y/n]</Text>
      </Box>
    </Box>
  );
}
