import { useState, useCallback, useEffect, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import type { Task } from '../types.js';
import { loadTasks, saveTasks, addTask, completeTask, deleteTask, updateTask, getProjects, addProject, renameProject, removeProjectTag, deleteProjectTasks } from '../lib/tasks.js';
import { colors } from '../lib/theme.js';
import { fuzzyMatchAny } from '../lib/fuzzy.js';
import { FilterInput } from './FilterInput.js';

interface TasksViewProps {
  setIsTyping: (v: boolean) => void;
  focusId?: string | null;
  onFocusConsumed?: () => void;
}

type InputMode = 'none' | 'add' | 'add-desc' | 'edit' | 'edit-desc' | 'filter' | 'filtered' | 'confirm-project';

/** Parse `text #project /N` from input string */
function parseTaskInput(value: string): { text: string; project?: string; unknownProject?: string; expectedPomodoros: number } {
  let text = value.trim();
  let project: string | undefined;
  let unknownProject: string | undefined;
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
    const candidate = projMatch[2]!;
    const existing = getProjects();
    text = projMatch[1]!.trim();
    if (existing.includes(candidate)) {
      project = candidate;
    } else {
      unknownProject = candidate;
    }
  }

  return { text, project, unknownProject, expectedPomodoros };
}

export function TasksView({ setIsTyping, focusId, onFocusConsumed }: TasksViewProps) {
  const [tasks, setTasks] = useState<Task[]>(loadTasks);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [inputMode, setInputMode] = useState<InputMode>('none');
  const [inputValue, setInputValue] = useState('');
  const [descInputValue, setDescInputValue] = useState('');
  const [suggestionIdx, setSuggestionIdx] = useState(0);
  const [inputKey, setInputKey] = useState(0);
  const [filterQuery, setFilterQuery] = useState('');

  // Pending add data (for two-step add)
  const [pendingAdd, setPendingAdd] = useState<{ text: string; project?: string; unknownProject?: string; expectedPomodoros: number } | null>(null);
  // For confirm-project prompt (unknown #tag)
  const [confirmProjectName, setConfirmProjectName] = useState('');
  const [confirmProjectFrom, setConfirmProjectFrom] = useState<'add' | 'edit'>('add');

  // Task detail view
  const [viewingTask, setViewingTask] = useState<Task | null>(null);

  // Project overlay
  const [projectMode, setProjectMode] = useState(false);
  const [projectList, setProjectList] = useState<string[]>([]);
  const [projectCursor, setProjectCursor] = useState(0);
  const [projectEditing, setProjectEditing] = useState<'add' | 'rename' | null>(null);
  const [projectInput, setProjectInput] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<'prompt' | null>(null);

  const isFiltering = inputMode === 'filter' || inputMode === 'filtered';
  const allIncomplete = tasks.filter(t => !t.completed);
  const allCompleted = tasks.filter(t => t.completed);

  // Apply fuzzy filter when active
  const incompleteTasks = isFiltering && filterQuery
    ? allIncomplete.filter(t => fuzzyMatchAny(filterQuery, t.text, t.project) !== null)
    : allIncomplete;
  const completedTasks = isFiltering && filterQuery
    ? allCompleted.filter(t => fuzzyMatchAny(filterQuery, t.text, t.project) !== null)
    : allCompleted;
  const allNavItems = [...incompleteTasks, ...completedTasks];

  const refresh = useCallback(() => setTasks(loadTasks()), []);

  // Get all existing projects for autocomplete
  const allProjects = useMemo(() => getProjects(), [tasks]);

  // Compute filtered project list based on partial after #
  const projectMenu = useMemo(() => {
    const hashIdx = inputValue.lastIndexOf('#');
    if (hashIdx < 0) return null;
    if (hashIdx > 0 && inputValue[hashIdx - 1] !== ' ') return null;
    const afterHash = inputValue.slice(hashIdx + 1);
    if (afterHash.includes(' ')) return null;
    const partial = afterHash.toLowerCase();
    const matches = allProjects.filter(p => p.toLowerCase().includes(partial));
    if (matches.length === 0) return null;
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
    setInputKey(k => k + 1);
  }, [projectMenu, suggestionIdx, inputValue]);

  // Compute project task counts
  const projectCounts = useMemo(() => {
    const counts = new Map<string, { open: number; done: number }>();
    for (const t of tasks) {
      if (t.project) {
        const c = counts.get(t.project) || { open: 0, done: 0 };
        if (t.completed) c.done++;
        else c.open++;
        counts.set(t.project, c);
      }
    }
    return counts;
  }, [tasks]);

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
    // ─── Project overlay ────────────────────────────────────────────────
    if (projectMode) {
      // Delete confirmation sub-mode
      if (deleteConfirm === 'prompt') {
        if (input === 'u') {
          const proj = projectList[projectCursor];
          if (proj) {
            removeProjectTag(proj);
            refresh();
            const newList = getProjects();
            setProjectList(newList);
            setProjectCursor(c => Math.min(c, newList.length - 1));
          }
          setDeleteConfirm(null);
          return;
        }
        if (input === 'd') {
          const proj = projectList[projectCursor];
          if (proj) {
            deleteProjectTasks(proj);
            refresh();
            const newList = getProjects();
            setProjectList(newList);
            setProjectCursor(c => Math.min(c, newList.length - 1));
          }
          setDeleteConfirm(null);
          return;
        }
        if (key.escape) {
          setDeleteConfirm(null);
          return;
        }
        return;
      }

      // Editing (add/rename) sub-mode
      if (projectEditing) {
        if (key.escape) {
          setProjectEditing(null);
          setProjectInput('');
          setIsTyping(false);
          return;
        }
        // Let FilterInput handle the rest
        return;
      }

      if (key.escape) {
        setProjectMode(false);
        return;
      }
      if (input === 'j' || key.downArrow) {
        setProjectCursor(i => Math.min(i + 1, projectList.length - 1));
        return;
      }
      if (input === 'k' || key.upArrow) {
        setProjectCursor(i => Math.max(i - 1, 0));
        return;
      }
      if (input === 'a') {
        setProjectEditing('add');
        setProjectInput('');
        setIsTyping(true);
        return;
      }
      if (input === 'e' && projectList.length > 0) {
        setProjectEditing('rename');
        setProjectInput(projectList[projectCursor] ?? '');
        setIsTyping(true);
        return;
      }
      if (input === 'd' && projectList.length > 0) {
        setDeleteConfirm('prompt');
        return;
      }
      if (key.return && projectList.length > 0) {
        const proj = projectList[projectCursor];
        if (proj) {
          setFilterQuery(proj);
          setInputMode('filtered');
        }
        setProjectMode(false);
        setSelectedIdx(0);
        return;
      }
      return;
    }

    // ─── Task detail view ───────────────────────────────────────────────
    if (viewingTask) {
      if (key.escape || key.return) {
        setViewingTask(null);
        return;
      }
      if (input === 'e') {
        // Jump straight to description edit
        const idx = incompleteTasks.findIndex(t => t.id === viewingTask.id);
        if (idx >= 0) {
          setSelectedIdx(idx);
          setDescInputValue(viewingTask.description ?? '');
          setInputMode('edit-desc');
          setIsTyping(true);
        }
        setViewingTask(null);
        return;
      }
      return;
    }

    // ─── Filter input mode ──────────────────────────────────────────────
    if (inputMode === 'filter') {
      if (key.escape) {
        setInputMode('none');
        setIsTyping(false);
        setFilterQuery('');
        setSelectedIdx(0);
        return;
      }
      if (key.return) {
        setInputMode('filtered');
        setIsTyping(false);
        setSelectedIdx(0);
        return;
      }
      return;
    }

    // Filtered mode
    if (inputMode === 'filtered') {
      if (key.escape) {
        setInputMode('none');
        setFilterQuery('');
        setSelectedIdx(0);
        return;
      }
      if (input === '/') {
        setInputMode('filter');
        setIsTyping(true);
        return;
      }
      // Fall through to normal navigation keys below
    }

    // ─── Description input (add-desc / edit-desc) ───────────────────────
    if (inputMode === 'add-desc') {
      if (key.escape) {
        // Skip description, save task without it
        if (pendingAdd) {
          addTask(pendingAdd.text, pendingAdd.expectedPomodoros, pendingAdd.project);
          refresh();
        }
        setInputMode('none');
        setIsTyping(false);
        setDescInputValue('');
        setPendingAdd(null);
        return;
      }
      // TextInput handles the rest via onSubmit
      return;
    }

    if (inputMode === 'edit-desc') {
      if (key.escape) {
        // Keep existing description unchanged
        setInputMode('none');
        setIsTyping(false);
        setDescInputValue('');
        return;
      }
      return;
    }

    // ─── Confirm unknown project prompt ────────────────────────────────
    if (inputMode === 'confirm-project') {
      if (input === 'a' && pendingAdd?.unknownProject) {
        // Add as new project and continue
        addProject(pendingAdd.unknownProject);
        const updated = { ...pendingAdd, project: pendingAdd.unknownProject, unknownProject: undefined };
        if (confirmProjectFrom === 'edit') {
          const task = incompleteTasks[selectedIdx];
          if (task) {
            updateTask(task.id, { text: updated.text, project: updated.project, expectedPomodoros: updated.expectedPomodoros });
            refresh();
            setDescInputValue(task.description ?? '');
            setInputMode('edit-desc');
          } else {
            setInputMode('none');
            setIsTyping(false);
          }
        } else {
          setPendingAdd(updated);
          setInputMode('add-desc');
          setDescInputValue('');
        }
        setConfirmProjectName('');
        return;
      }
      if (input === 'u') {
        // Untag — drop the project
        const updated = pendingAdd ? { ...pendingAdd, unknownProject: undefined } : null;
        if (confirmProjectFrom === 'edit') {
          const task = incompleteTasks[selectedIdx];
          if (task && updated) {
            updateTask(task.id, { text: updated.text, project: undefined, expectedPomodoros: updated.expectedPomodoros });
            refresh();
            setDescInputValue(task.description ?? '');
            setInputMode('edit-desc');
          } else {
            setInputMode('none');
            setIsTyping(false);
          }
        } else {
          setPendingAdd(updated);
          setInputMode('add-desc');
          setDescInputValue('');
        }
        setConfirmProjectName('');
        return;
      }
      if (key.escape) {
        setInputMode('none');
        setIsTyping(false);
        setConfirmProjectName('');
        setPendingAdd(null);
        return;
      }
      return;
    }

    // ─── Add/Edit text input ────────────────────────────────────────────
    if (inputMode === 'add' || inputMode === 'edit') {
      if (key.escape) {
        setInputMode('none');
        setIsTyping(false);
        setInputValue('');
        return;
      }
      if (projectMenu) {
        if (key.downArrow) {
          setSuggestionIdx(i => Math.min(i + 1, projectMenu.matches.length - 1));
          return;
        }
        if (key.upArrow) {
          setSuggestionIdx(i => Math.max(i - 1, 0));
          return;
        }
        if (key.tab || key.return) {
          acceptSuggestion();
          return;
        }
      }
      return;
    }

    // ─── Normal navigation ──────────────────────────────────────────────
    if (input === 'j' || key.downArrow) {
      setSelectedIdx(i => Math.min(i + 1, allNavItems.length - 1));
      return;
    }
    if (input === 'k' || key.upArrow) {
      setSelectedIdx(i => Math.max(i - 1, 0));
      return;
    }

    if (input === '/') {
      setFilterQuery('');
      setInputMode('filter');
      setIsTyping(true);
      setSelectedIdx(0);
      return;
    }

    if (input === 'P') {
      const list = getProjects();
      setProjectList(list);
      setProjectCursor(0);
      setProjectMode(true);
      setProjectEditing(null);
      setDeleteConfirm(null);
      return;
    }

    if (input === 'a' && inputMode !== 'filtered') {
      setInputValue('');
      setInputMode('add');
      setIsTyping(true);
      return;
    }

    if (input === 'e' && inputMode !== 'filtered' && selectedIdx < incompleteTasks.length && incompleteTasks.length > 0) {
      const task = incompleteTasks[selectedIdx];
      if (task) {
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

    if (input === 'd' && inputMode !== 'filtered' && selectedIdx < incompleteTasks.length && incompleteTasks.length > 0) {
      const task = incompleteTasks[selectedIdx];
      if (task) {
        deleteTask(task.id);
        refresh();
        setSelectedIdx(i => Math.max(0, Math.min(i, incompleteTasks.length - 2)));
      }
      return;
    }

    // Enter: view task detail
    if (key.return && selectedIdx < incompleteTasks.length && incompleteTasks.length > 0) {
      const task = incompleteTasks[selectedIdx];
      if (task) {
        setViewingTask(task);
      }
      return;
    }
  });

  const handleAddSubmit = useCallback((value: string) => {
    // If project menu is open, Enter was consumed by autocomplete — skip submit
    if (projectMenu) return;
    if (value.trim()) {
      const parsed = parseTaskInput(value);
      setPendingAdd(parsed);
      if (parsed.unknownProject) {
        setConfirmProjectName(parsed.unknownProject);
        setConfirmProjectFrom('add');
        setInputMode('confirm-project');
        setIsTyping(false);
        setInputValue('');
        return;
      }
      // Move to description step
      setInputMode('add-desc');
      setInputValue('');
      setDescInputValue('');
      return;
    }
    setInputMode('none');
    setIsTyping(false);
    setInputValue('');
  }, [setIsTyping, projectMenu]);

  const handleAddDescSubmit = useCallback((value: string) => {
    if (pendingAdd) {
      const desc = value.trim() || undefined;
      addTask(pendingAdd.text, pendingAdd.expectedPomodoros, pendingAdd.project, desc);
      refresh();
    }
    setInputMode('none');
    setIsTyping(false);
    setDescInputValue('');
    setPendingAdd(null);
  }, [pendingAdd, refresh, setIsTyping]);

  const handleEditSubmit = useCallback((value: string) => {
    // If project menu is open, Enter was consumed by autocomplete — skip submit
    if (projectMenu) return;
    const task = incompleteTasks[selectedIdx];
    if (task && value.trim()) {
      const parsed = parseTaskInput(value);
      if (parsed.unknownProject) {
        setPendingAdd({ ...parsed });
        setConfirmProjectName(parsed.unknownProject);
        setConfirmProjectFrom('edit');
        setInputMode('confirm-project');
        setIsTyping(false);
        setInputValue('');
        return;
      }
      updateTask(task.id, { text: parsed.text, project: parsed.project, expectedPomodoros: parsed.expectedPomodoros });
      refresh();
      // Move to description edit step
      setDescInputValue(task.description ?? '');
      setInputMode('edit-desc');
      return;
    }
    setInputMode('none');
    setIsTyping(false);
    setInputValue('');
  }, [incompleteTasks, selectedIdx, refresh, setIsTyping, projectMenu]);

  const handleEditDescSubmit = useCallback((value: string) => {
    const task = incompleteTasks[selectedIdx];
    if (task) {
      const desc = value.trim() || undefined;
      updateTask(task.id, { description: desc });
      refresh();
    }
    setInputMode('none');
    setIsTyping(false);
    setDescInputValue('');
  }, [incompleteTasks, selectedIdx, refresh, setIsTyping]);

  // Project overlay handlers
  const handleProjectAddSubmit = useCallback((value: string) => {
    if (value.trim()) {
      addProject(value.trim());
      const newList = getProjects();
      setProjectList(newList);
      setProjectCursor(newList.indexOf(value.trim()));
    }
    setProjectEditing(null);
    setProjectInput('');
    setIsTyping(false);
  }, [setIsTyping]);

  const handleProjectRenameSubmit = useCallback((value: string) => {
    const oldName = projectList[projectCursor];
    if (oldName && value.trim() && value.trim() !== oldName) {
      renameProject(oldName, value.trim());
      refresh();
      const newList = getProjects();
      setProjectList(newList);
      setProjectCursor(Math.max(0, newList.indexOf(value.trim())));
    }
    setProjectEditing(null);
    setProjectInput('');
    setIsTyping(false);
  }, [projectList, projectCursor, refresh, setIsTyping]);

  const renderInput = (label: string, onSubmit: (v: string) => void, placeholder?: string) => (
    <Box flexDirection="column" marginTop={1}>
      <Box>
        <Text color="yellow">{label}</Text>
        <TextInput key={inputKey} value={inputValue} onChange={setInputValue} onSubmit={onSubmit} placeholder={placeholder} />
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
          <Text color={colors.dim}>  {'↑↓:navigate  Tab:select'}</Text>
        </Box>
      )}
    </Box>
  );

  // ─── Task detail overlay ────────────────────────────────────────────
  if (viewingTask) {
    const pomLabel = `[${viewingTask.completedPomodoros}/${viewingTask.expectedPomodoros}]`;
    return (
      <Box flexDirection="column" flexGrow={1} padding={1}>
        <Box borderStyle="round" flexDirection="column" paddingX={2} paddingY={1}>
          <Text bold color="white">Task: {viewingTask.text}</Text>
          <Box>
            {viewingTask.project && <Text color="cyan">#{viewingTask.project}</Text>}
            {viewingTask.project && <Text dimColor>{'   '}</Text>}
            <Text dimColor>Pom: {pomLabel}</Text>
          </Box>
          <Box marginTop={1}>
            {viewingTask.description
              ? <Text>{viewingTask.description}</Text>
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

  // ─── Project overlay ────────────────────────────────────────────────
  if (projectMode) {
    return (
      <Box flexDirection="column" flexGrow={1} padding={1}>
        <Box borderStyle="round" flexDirection="column" paddingX={2} paddingY={1}>
          <Text bold color="white">Projects</Text>
          <Box marginTop={1} flexDirection="column">
            {projectList.length === 0 && (
              <Text dimColor>No projects yet. Press 'a' to add one.</Text>
            )}
            {projectList.map((proj, i) => {
              const isSelected = i === projectCursor;
              const counts = projectCounts.get(proj) || { open: 0, done: 0 };
              return (
                <Box key={proj}>
                  <Text color={isSelected ? 'yellow' : 'gray'} bold={isSelected}>
                    {isSelected ? '> ' : '  '}
                  </Text>
                  <Box width={20}>
                    <Text color={isSelected ? 'white' : 'gray'} bold={isSelected}>{proj}</Text>
                  </Box>
                  <Text dimColor>{counts.open} open | {counts.done} done</Text>
                </Box>
              );
            })}
          </Box>

          {/* Delete confirmation */}
          {deleteConfirm === 'prompt' && (
            <Box marginTop={1}>
              <Text color="red" bold>Delete "{projectList[projectCursor]}"? </Text>
              <Text dimColor>u:untag tasks  d:delete tasks  Esc:cancel</Text>
            </Box>
          )}

          {/* Add/Rename input */}
          {projectEditing === 'add' && (
            <Box marginTop={1}>
              <FilterInput
                label="New project: "
                value={projectInput}
                onChange={setProjectInput}
                onSubmit={handleProjectAddSubmit}
                placeholder="Project name"
              />
            </Box>
          )}
          {projectEditing === 'rename' && (
            <Box marginTop={1}>
              <FilterInput
                label="Rename: "
                value={projectInput}
                onChange={setProjectInput}
                onSubmit={handleProjectRenameSubmit}
                placeholder="New name"
              />
            </Box>
          )}

          {!projectEditing && !deleteConfirm && (
            <Box marginTop={1}>
              <Text dimColor>a:add  e:rename  d:delete  Enter:filter  Esc:close</Text>
            </Box>
          )}
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" flexGrow={1}>
      {/* Filter input bar */}
      {inputMode === 'filter' && (
        <Box marginBottom={1}>
          <Text color="yellow">{'/ '}</Text>
          <TextInput
            value={filterQuery}
            onChange={(v) => { setFilterQuery(v); setSelectedIdx(0); }}
            onSubmit={() => {
              if (filterQuery.trim()) {
                setInputMode('filtered');
              } else {
                setInputMode('none');
                setFilterQuery('');
              }
              setIsTyping(false);
              setSelectedIdx(0);
            }}
            placeholder="Filter tasks..."
          />
          <Text dimColor>  Enter: apply  Esc: cancel</Text>
        </Box>
      )}

      {/* Locked filter indicator */}
      {inputMode === 'filtered' && (
        <Box marginBottom={1}>
          <Text color="yellow" bold>{'/ '}</Text>
          <Text color="white">{filterQuery}</Text>
          <Text dimColor>  Esc: clear  /: refine</Text>
        </Box>
      )}

      {allNavItems.length === 0 && !isFiltering && inputMode === 'none' && (
        <Text dimColor>No tasks. Press 'a' to add one.</Text>
      )}

      {allNavItems.length === 0 && isFiltering && filterQuery && (
        <Text dimColor>No matches for "{filterQuery}"</Text>
      )}

      {/* Incomplete tasks */}
      {incompleteTasks.map((task, i) => {
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

      {inputMode === 'confirm-project' && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="yellow">#{confirmProjectName}</Text>
          <Text dimColor> is not an existing project.</Text>
          <Box marginTop={0}>
            <Text dimColor>a:add as new project  u:untag  Esc:cancel</Text>
          </Box>
        </Box>
      )}
      {inputMode === 'add' && renderInput('> ', handleAddSubmit, 'Task name #project /N')}
      {inputMode === 'add-desc' && (
        <Box flexDirection="column" marginTop={1}>
          <Box>
            <Text color="yellow">{'Desc: '}</Text>
            <TextInput value={descInputValue} onChange={setDescInputValue} onSubmit={handleAddDescSubmit} placeholder="Description (Enter to skip)" />
          </Box>
        </Box>
      )}
      {inputMode === 'edit' && renderInput('Edit: ', handleEditSubmit)}
      {inputMode === 'edit-desc' && (
        <Box flexDirection="column" marginTop={1}>
          <Box>
            <Text color="yellow">{'Desc: '}</Text>
            <TextInput value={descInputValue} onChange={setDescInputValue} onSubmit={handleEditDescSubmit} placeholder="Description (Enter to keep, Esc to skip)" />
          </Box>
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
