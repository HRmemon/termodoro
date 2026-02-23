import { useState, useCallback, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import type { Task } from '../types.js';
import { loadTasks, saveTasks, addTask, completeTask, deleteTask, setActiveTask, updateTask } from '../lib/tasks.js';

interface TasksViewProps {
  setIsTyping: (v: boolean) => void;
  focusId?: string | null;
  onFocusConsumed?: () => void;
}

type InputMode = 'none' | 'add' | 'edit';

export function TasksView({ setIsTyping, focusId, onFocusConsumed }: TasksViewProps) {
  const [tasks, setTasks] = useState<Task[]>(loadTasks);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [inputMode, setInputMode] = useState<InputMode>('none');
  const [inputValue, setInputValue] = useState('');

  const incompleteTasks = tasks.filter(t => !t.completed);
  const completedTasks = tasks.filter(t => t.completed);
  const allNavItems = [...incompleteTasks, ...completedTasks];

  const refresh = useCallback(() => setTasks(loadTasks()), []);

  // Handle focusId from global search
  useEffect(() => {
    if (focusId) {
      const allTasks = loadTasks();
      const idx = allTasks.filter(t => !t.completed).findIndex(t => t.id === focusId);
      if (idx >= 0) setSelectedIdx(idx);
      onFocusConsumed?.();
    }
  }, [focusId, onFocusConsumed]);

  useInput((input, key) => {
    if (inputMode !== 'none') {
      if (key.escape) {
        setInputMode('none');
        setIsTyping(false);
      }
      return;
    }

    if (input === 'j' || key.downArrow) {
      setSelectedIdx(i => Math.min(i + 1, allNavItems.length - 1));
      return;
    }
    if (input === 'k' || key.upArrow) {
      setSelectedIdx(i => Math.max(i - 1, 0));
      return;
    }

    if (input === 'a') {
      setInputValue('');
      setInputMode('add');
      setIsTyping(true);
      return;
    }

    if (input === 'e' && selectedIdx < incompleteTasks.length && incompleteTasks.length > 0) {
      const task = incompleteTasks[selectedIdx];
      if (task) {
        setInputValue(task.text);
        setInputMode('edit');
        setIsTyping(true);
      }
      return;
    }

    if (input === 'x') {
      if (selectedIdx < incompleteTasks.length && incompleteTasks.length > 0) {
        // Complete the incomplete task
        const task = incompleteTasks[selectedIdx];
        if (task) {
          completeTask(task.id);
          refresh();
          setSelectedIdx(i => Math.max(0, Math.min(i, incompleteTasks.length - 2)));
        }
      } else if (selectedIdx >= incompleteTasks.length && completedTasks.length > 0) {
        // Undo the completed task
        const task = allNavItems[selectedIdx];
        if (task) {
          const allTasks = loadTasks();
          const idx = allTasks.findIndex(t => t.id === task.id);
          if (idx >= 0) {
            allTasks[idx] = { ...allTasks[idx]!, completed: false, completedAt: undefined };
            saveTasks(allTasks);
            refresh();
          }
        }
      }
      return;
    }

    if (input === 'u') {
      // Undo: restore last completed task
      const allTasks = loadTasks();
      const lastCompleted = [...allTasks].reverse().find(t => t.completed);
      if (lastCompleted) {
        const idx = allTasks.findIndex(t => t.id === lastCompleted.id);
        if (idx >= 0) {
          allTasks[idx] = { ...allTasks[idx]!, completed: false, completedAt: undefined };
          saveTasks(allTasks);
          refresh();
        }
      }
      return;
    }

    if (input === 'd' && selectedIdx < incompleteTasks.length && incompleteTasks.length > 0) {
      const task = incompleteTasks[selectedIdx];
      if (task) {
        deleteTask(task.id);
        refresh();
        setSelectedIdx(i => Math.max(0, Math.min(i, incompleteTasks.length - 2)));
      }
      return;
    }

    if (key.return && selectedIdx < incompleteTasks.length && incompleteTasks.length > 0) {
      const task = incompleteTasks[selectedIdx];
      if (task) {
        setActiveTask(task.active ? null : task.id);
        refresh();
      }
      return;
    }
  });

  const handleAddSubmit = useCallback((value: string) => {
    if (value.trim()) {
      const match = value.match(/^(.+?)\s*\/(\d+)\s*$/);
      if (match) {
        addTask(match[1]!.trim(), parseInt(match[2]!, 10));
      } else {
        addTask(value.trim());
      }
      refresh();
    }
    setInputMode('none');
    setIsTyping(false);
    setInputValue('');
  }, [refresh, setIsTyping]);

  const handleEditSubmit = useCallback((value: string) => {
    const task = incompleteTasks[selectedIdx];
    if (task && value.trim()) {
      updateTask(task.id, { text: value.trim() });
      refresh();
    }
    setInputMode('none');
    setIsTyping(false);
    setInputValue('');
  }, [incompleteTasks, selectedIdx, refresh, setIsTyping]);

  return (
    <Box flexDirection="column" flexGrow={1}>
      {allNavItems.length === 0 && inputMode === 'none' && (
        <Text dimColor>No tasks. Press 'a' to add one.</Text>
      )}

      {/* Incomplete tasks */}
      {incompleteTasks.map((task, i) => {
        const isSelected = i === selectedIdx;
        return (
          <Box key={task.id}>
            <Text color={isSelected ? 'yellow' : 'gray'} bold={isSelected}>{isSelected ? '> ' : '  '}</Text>
            {task.active && <Text color="green" bold>{'▶ '}</Text>}
            <Text color={isSelected ? 'white' : 'gray'} bold={isSelected}>{task.text}</Text>
            <Text dimColor>{'  '}[{task.completedPomodoros}/{task.expectedPomodoros}]</Text>
            {task.project && <Text color="cyan"> #{task.project}</Text>}
          </Box>
        );
      })}

      {inputMode === 'add' && (
        <Box marginTop={1}>
          <Text color="yellow">{'> '}</Text>
          <TextInput value={inputValue} onChange={setInputValue} onSubmit={handleAddSubmit} placeholder="Task name (/N for pomodoros)" />
        </Box>
      )}
      {inputMode === 'edit' && (
        <Box marginTop={1}>
          <Text color="yellow">Edit: </Text>
          <TextInput value={inputValue} onChange={setInputValue} onSubmit={handleEditSubmit} />
        </Box>
      )}

      {/* Divider */}
      {completedTasks.length > 0 && (
        <Box marginTop={1} marginBottom={0}>
          <Text dimColor>{'── Completed ('}{completedTasks.length}{') ──  x: undo'}</Text>
        </Box>
      )}

      {/* Completed tasks — navigable */}
      {completedTasks.map((task, i) => {
        const absIdx = incompleteTasks.length + i;
        const isSelected = absIdx === selectedIdx;
        return (
          <Box key={task.id}>
            <Text color={isSelected ? 'yellow' : 'gray'} bold={isSelected}>{isSelected ? '> ' : '  '}</Text>
            <Text color="gray" strikethrough dimColor={!isSelected}>[x] {task.text}</Text>
          </Box>
        );
      })}
    </Box>
  );
}
