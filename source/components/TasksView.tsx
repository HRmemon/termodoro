import { useState, useCallback, useEffect, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import type { Task } from '../types.js';
import { loadTasks, saveTasks, addTask, completeTask, deleteTask, setActiveTask, updateTask, getProjects } from '../lib/tasks.js';
import { colors } from '../lib/theme.js';

interface TasksViewProps {
  setIsTyping: (v: boolean) => void;
  focusId?: string | null;
  onFocusConsumed?: () => void;
}

type InputMode = 'none' | 'add' | 'edit';

/** Parse `text #project /N` from input string */
function parseTaskInput(value: string): { text: string; project?: string; expectedPomodoros: number } {
  let text = value.trim();
  let project: string | undefined;
  let expectedPomodoros = 1;

  // Extract /N pomodoros suffix
  const pomMatch = text.match(/^(.+?)\s*\/(\d+)\s*$/);
  if (pomMatch) {
    text = pomMatch[1]!.trim();
    expectedPomodoros = parseInt(pomMatch[2]!, 10);
  }

  // Extract #project
  const projMatch = text.match(/^(.+?)\s+#(\S+)\s*$/);
  if (projMatch) {
    text = projMatch[1]!.trim();
    project = projMatch[2]!;
  }

  return { text, project, expectedPomodoros };
}

export function TasksView({ setIsTyping, focusId, onFocusConsumed }: TasksViewProps) {
  const [tasks, setTasks] = useState<Task[]>(loadTasks);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [inputMode, setInputMode] = useState<InputMode>('none');
  const [inputValue, setInputValue] = useState('');
  const [suggestionIdx, setSuggestionIdx] = useState(0);

  const incompleteTasks = tasks.filter(t => !t.completed);
  const completedTasks = tasks.filter(t => t.completed);
  const allNavItems = [...incompleteTasks, ...completedTasks];

  const refresh = useCallback(() => setTasks(loadTasks()), []);

  // Get all existing projects for autocomplete
  const allProjects = useMemo(() => getProjects(), [tasks]);

  // Compute filtered project list based on partial after #
  const projectMenu = useMemo(() => {
    const hashIdx = inputValue.lastIndexOf('#');
    if (hashIdx < 0) return null;
    // Only trigger if # is preceded by a space or is at the start
    if (hashIdx > 0 && inputValue[hashIdx - 1] !== ' ') return null;
    const afterHash = inputValue.slice(hashIdx + 1);
    // Close menu if there's a space after the project name (user moved on)
    if (afterHash.includes(' ')) return null;
    const partial = afterHash.toLowerCase();
    const matches = allProjects.filter(p => p.toLowerCase().includes(partial));
    if (matches.length === 0) return null;
    // Don't show menu if the partial exactly matches one project and it's the only match
    if (matches.length === 1 && matches[0]!.toLowerCase() === partial) return null;
    return { hashIdx, partial: afterHash, matches };
  }, [inputValue, allProjects]);

  // Reset suggestion index when menu changes
  useEffect(() => {
    setSuggestionIdx(0);
  }, [projectMenu?.matches.length, projectMenu?.partial]);

  // Accept the currently highlighted suggestion
  const acceptSuggestion = useCallback(() => {
    if (!projectMenu) return;
    const chosen = projectMenu.matches[suggestionIdx];
    if (!chosen) return;
    setInputValue(inputValue.slice(0, projectMenu.hashIdx + 1) + chosen + ' ');
  }, [projectMenu, suggestionIdx, inputValue]);

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
        setInputValue('');
        return;
      }
      // When project menu is open, arrow keys navigate it
      if (projectMenu) {
        if (key.downArrow) {
          setSuggestionIdx(i => Math.min(i + 1, projectMenu.matches.length - 1));
          return;
        }
        if (key.upArrow) {
          setSuggestionIdx(i => Math.max(i - 1, 0));
          return;
        }
        if (key.tab) {
          acceptSuggestion();
          return;
        }
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
        // Reconstruct input with project if it exists
        let editValue = task.text;
        if (task.project) editValue += ` #${task.project}`;
        setInputValue(editValue);
        setInputMode('edit');
        setIsTyping(true);
      }
      return;
    }

    if (input === 'x') {
      if (selectedIdx < incompleteTasks.length && incompleteTasks.length > 0) {
        const task = incompleteTasks[selectedIdx];
        if (task) {
          completeTask(task.id);
          refresh();
          setSelectedIdx(i => Math.max(0, Math.min(i, incompleteTasks.length - 2)));
        }
      } else if (selectedIdx >= incompleteTasks.length && completedTasks.length > 0) {
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
      const { text, project, expectedPomodoros } = parseTaskInput(value);
      addTask(text, expectedPomodoros, project);
      refresh();
    }
    setInputMode('none');
    setIsTyping(false);
    setInputValue('');
  }, [refresh, setIsTyping]);

  const handleEditSubmit = useCallback((value: string) => {
    const task = incompleteTasks[selectedIdx];
    if (task && value.trim()) {
      const { text, project, expectedPomodoros } = parseTaskInput(value);
      updateTask(task.id, { text, project, expectedPomodoros });
      refresh();
    }
    setInputMode('none');
    setIsTyping(false);
    setInputValue('');
  }, [incompleteTasks, selectedIdx, refresh, setIsTyping]);

  const renderInput = (label: string, onSubmit: (v: string) => void, placeholder?: string) => (
    <Box flexDirection="column" marginTop={1}>
      <Box>
        <Text color="yellow">{label}</Text>
        <TextInput value={inputValue} onChange={setInputValue} onSubmit={onSubmit} placeholder={placeholder} />
      </Box>
      {projectMenu && (
        <Box flexDirection="column" marginLeft={2} marginTop={0}>
          {projectMenu.matches.map((p, i) => (
            <Box key={p}>
              <Text color={i === suggestionIdx ? colors.highlight : colors.dim}>
                {i === suggestionIdx ? '> ' : '  '}
              </Text>
              <Text color={i === suggestionIdx ? 'cyan' : colors.dim} bold={i === suggestionIdx}>
                #{p}
              </Text>
            </Box>
          ))}
          <Text color={colors.dim}>  ↑↓:navigate  Tab:select</Text>
        </Box>
      )}
    </Box>
  );

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

      {inputMode === 'add' && renderInput('> ', handleAddSubmit, 'Task name #project /N')}
      {inputMode === 'edit' && renderInput('Edit: ', handleEditSubmit)}

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
