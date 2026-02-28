import { Box, Text } from 'ink';
import type { Task } from '../../types.js';

interface TaskDetailOverlayProps {
  task: Task;
}

export function TaskDetailOverlay({ task }: TaskDetailOverlayProps) {
  const pomLabel = `[${task.completedPomodoros}/${task.expectedPomodoros}]`;
  return (
    <Box flexDirection="column" flexGrow={1} padding={1}>
      <Box borderStyle="round" flexDirection="column" paddingX={2} paddingY={1}>
        <Text bold color="white">Task: {task.text}</Text>
        <Box>
          {task.project && <Text color="cyan">#{task.project}</Text>}
          {task.project && <Text dimColor>{'   '}</Text>}
          <Text dimColor>Pom: {pomLabel}</Text>
        </Box>
        <Box marginTop={1}>
          {task.description
            ? <Text>{task.description}</Text>
            : <Text dimColor italic>No description</Text>
          }
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Enter/Esc:close  e:edit</Text>
        </Box>
      </Box>
    </Box>
  );
}
