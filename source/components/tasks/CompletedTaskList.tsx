import { Box, Text } from 'ink';
import type { Task } from '../../types.js';

interface CompletedTaskListProps {
  tasks: Task[];
  selectedIdx: number;
  offset: number;
}

export function CompletedTaskList({ tasks, selectedIdx, offset }: CompletedTaskListProps) {
  if (tasks.length === 0) return null;

  return (
    <>
      <Box marginTop={1} marginBottom={0}>
        <Text dimColor>{'── Completed ('}{tasks.length}{') ──  x: undo'}</Text>
      </Box>
      {tasks.map((task, i) => {
        const absIdx = offset + i;
        const isSelected = absIdx === selectedIdx;
        return (
          <Box key={task.id}>
            <Text color={isSelected ? 'yellow' : 'gray'} bold={isSelected}>{isSelected ? '> ' : '  '}</Text>
            <Text color="gray" strikethrough dimColor={!isSelected}>[x] {task.text}</Text>
          </Box>
        );
      })}
    </>
  );
}
