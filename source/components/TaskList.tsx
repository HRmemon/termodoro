import React from 'react';
import { Box, Text } from 'ink';
import type { Task } from '../types.js';

interface TaskListProps {
  tasks: Task[];
  selectedIndex?: number;
  compact?: boolean;
}

export function TaskList({ tasks, selectedIndex, compact }: TaskListProps) {
  if (tasks.length === 0) {
    return (
      <Box>
        <Text dimColor>No tasks. Press </Text>
        <Text color="yellow">a</Text>
        <Text dimColor> to add one.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {tasks.map((task, i) => {
        const isSelected = selectedIndex === i;
        const check = task.completed ? 'x' : ' ';
        const progress = `[${task.completedPomodoros}/${task.expectedPomodoros}]`;

        return (
          <Box key={task.id}>
            <Text color={isSelected ? 'yellow' : undefined} bold={isSelected}>
              {isSelected ? '> ' : '  '}
            </Text>
            <Text
              color={task.completed ? 'gray' : 'white'}
              strikethrough={task.completed}
              dimColor={task.completed}
            >
              [{check}] {task.text}
            </Text>
            {!compact && (
              <>
                <Text dimColor> {progress}</Text>
                {task.project && <Text color="cyan"> #{task.project}</Text>}
              </>
            )}
          </Box>
        );
      })}
    </Box>
  );
}
