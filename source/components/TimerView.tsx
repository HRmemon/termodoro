import React, { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import type { Task, SessionType, SequenceBlock } from '../types.js';
import { BigTimer } from './BigTimer.js';
import { TaskList } from './TaskList.js';
import { loadTasks, addTask, completeTask, deleteTask, setActiveTask } from '../lib/tasks.js';

interface TimerViewProps {
  secondsLeft: number;
  totalSeconds: number;
  sessionType: SessionType;
  isPaused: boolean;
  isRunning: boolean;
  sessionNumber: number;
  totalWorkSessions: number;
  sequenceBlocks?: SequenceBlock[];
  currentBlockIndex?: number;
  setIsTyping: (isTyping: boolean) => void;
}

export function TimerView({
  secondsLeft, totalSeconds, sessionType, isPaused, isRunning,
  sessionNumber, totalWorkSessions,
  sequenceBlocks, currentBlockIndex,
  setIsTyping,
}: TimerViewProps) {
  const [tasks, setTasks] = useState<Task[]>(loadTasks);
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [newTaskText, setNewTaskText] = useState('');
  const [selectedTask, setSelectedTask] = useState(0);

  const incompleteTasks = tasks.filter(t => !t.completed);

  const refreshTasks = useCallback(() => {
    setTasks(loadTasks());
  }, []);

  useInput((input, key) => {
    if (isAddingTask) {
      if (key.escape) {
        setIsAddingTask(false);
        setIsTyping(false);
      }
      return;
    }

    if (input === 'a') {
      setIsAddingTask(true);
      setIsTyping(true);
      setNewTaskText('');
      return;
    }

    if (input === 'j' || key.downArrow) {
      setSelectedTask(prev => Math.min(prev + 1, incompleteTasks.length - 1));
    }
    if (input === 'k' || key.upArrow) {
      setSelectedTask(prev => Math.max(prev - 1, 0));
    }
    if (key.return && incompleteTasks.length > 0) {
      const task = incompleteTasks[selectedTask];
      if (task) {
        const newActiveId = task.active ? null : task.id;
        setActiveTask(newActiveId);
        refreshTasks();
      }
    }
    if (input === 'x' && incompleteTasks.length > 0) {
      const task = incompleteTasks[selectedTask];
      if (task) {
        completeTask(task.id);
        refreshTasks();
      }
    }
    if (input === 'd' && incompleteTasks.length > 0) {
      const task = incompleteTasks[selectedTask];
      if (task) {
        deleteTask(task.id);
        refreshTasks();
        setSelectedTask(prev => Math.max(0, Math.min(prev, incompleteTasks.length - 2)));
      }
    }
  });

  const handleAddTask = useCallback((text: string) => {
    if (text.trim()) {
      const match = text.match(/^(.+?)\s*\/(\d+)\s*$/);
      if (match) {
        addTask(match[1]!.trim(), parseInt(match[2]!, 10));
      } else {
        addTask(text.trim());
      }
      refreshTasks();
    }
    setIsAddingTask(false);
    setIsTyping(false);
    setNewTaskText('');
  }, [refreshTasks, setIsTyping]);

  const activeTask = incompleteTasks.find(t => t.active);

  return (
    <Box flexDirection="column" flexGrow={1}>
      {/* Session info */}
      <Box marginBottom={1}>
        <Text dimColor>Session </Text>
        <Text bold>{sessionNumber}</Text>
        <Text dimColor> | Work sessions: </Text>
        <Text>{totalWorkSessions}</Text>
      </Box>

      {/* Sequence progress */}
      {sequenceBlocks && sequenceBlocks.length > 0 && (
        <Box marginBottom={1} flexWrap="wrap">
          {sequenceBlocks.map((block, i) => {
            const isCurrent = i === currentBlockIndex;
            const isDone = i < (currentBlockIndex ?? 0);
            const label = `${block.durationMinutes}m ${block.type === 'work' ? 'W' : 'B'}`;
            return (
              <Box key={i} marginRight={1}>
                <Text
                  color={isCurrent ? 'yellow' : isDone ? 'green' : 'gray'}
                  bold={isCurrent}
                  dimColor={!isCurrent && !isDone}
                >
                  {isDone ? '[x]' : isCurrent ? '[>]' : '[ ]'} {label}
                </Text>
                {i < sequenceBlocks.length - 1 && <Text dimColor> → </Text>}
              </Box>
            );
          })}
        </Box>
      )}

      {/* Active task */}
      {activeTask && (
        <Box marginBottom={1}>
          <Text color="green" bold>▶ </Text>
          <Text color="white">{activeTask.text}</Text>
          <Text dimColor>  [{activeTask.completedPomodoros}/{activeTask.expectedPomodoros}]</Text>
        </Box>
      )}

      {/* Big timer */}
      <BigTimer
        secondsLeft={secondsLeft}
        totalSeconds={totalSeconds}
        sessionType={sessionType}
        isPaused={isPaused}
        isRunning={isRunning}
      />

      {/* Tasks section */}
      <Box marginTop={1} flexDirection="column">
        <Box marginBottom={1}>
          <Text bold color="white">Tasks</Text>
          <Text dimColor> ({incompleteTasks.length} remaining)</Text>
          <Text dimColor>  Enter: set active  x: done  d: delete  a: add</Text>
        </Box>
        <TaskList
          tasks={tasks}
          selectedIndex={selectedTask}
        />
        {isAddingTask && (
          <Box marginTop={1}>
            <Text color="yellow">{'> '}</Text>
            <TextInput
              value={newTaskText}
              onChange={setNewTaskText}
              onSubmit={handleAddTask}
              placeholder="Task name (/N for pomodoros)"
            />
          </Box>
        )}
      </Box>
    </Box>
  );
}
