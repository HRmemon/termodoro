import { Box, Text } from 'ink';
import type { Task } from '../../types.js';

interface IncompleteTaskListProps {
  tasks: Task[];
  selectedIdx: number;
}

export function IncompleteTaskList({ tasks, selectedIdx }: IncompleteTaskListProps) {
  return (
    <>
      {tasks.map((task, i) => {
        const isSelected = i === selectedIdx;
        return (
          <Box key={task.id} flexDirection="column">
            <Box>
              <Text color={isSelected ? 'yellow' : 'gray'} bold={isSelected}>{isSelected ? '> ' : '  '}</Text>
              <Text color={isSelected ? 'white' : 'gray'} bold={isSelected}>{task.text}</Text>
              <Text dimColor>{'  '}[{task.completedPomodoros}/{task.expectedPomodoros}]</Text>
              {task.project && <Text color="cyan"> #{task.project}</Text>}
            </Box>
            {task.description && (
              <Box>
                <Text dimColor>{'    '}{task.description.split('\n')[0]!.length > 50 ? task.description.split('\n')[0]!.slice(0, 50) + '...' : task.description.split('\n')[0]}</Text>
              </Box>
            )}
          </Box>
        );
      })}
    </>
  );
}
