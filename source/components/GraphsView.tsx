import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { nanoid } from 'nanoid';
import {
  loadGoals, addGoal, removeGoal, updateGoal, toggleCompletion,
  isGoalComplete, computeStreak, getTodayStr, getRecentWeeks,
  getAllProjects, GOAL_COLORS, GoalsData, TrackedGoal,
} from '../lib/goals.js';

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const WEEKS_TO_SHOW = 8;

type ViewMode = 'main' | 'add' | 'edit' | 'delete-confirm';
type AddStep = 'name' | 'type' | 'project' | 'color';

export function GraphsView() {
  const [data, setData] = useState<GoalsData>(() => loadGoals());
  const [activeTab, setActiveTab] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>('main');
  const [weekOffset, setWeekOffset] = useState(0);

  // Selected date for heatmap navigation (Part 4)
  const [selectedDate, setSelectedDate] = useState<string>(() => getTodayStr());

  // Add goal state
  const [addStep, setAddStep] = useState<AddStep>('name');
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<'manual' | 'auto'>('manual');
  const [newProject, setNewProject] = useState('');
  const [newColorIdx, setNewColorIdx] = useState(0);

  // Project autocomplete (Part 5)
  const allProjects = useMemo(() => getAllProjects(), [data]);
  const [projSuggIdx, setProjSuggIdx] = useState(0);

  const projSuggestions = useMemo(() => {
    const partial = newProject.toLowerCase();
    if (!partial) return allProjects.slice(0, 8);
    return allProjects.filter(p => p.toLowerCase().includes(partial)).slice(0, 8);
  }, [newProject, allProjects]);

  useEffect(() => { setProjSuggIdx(0); }, [projSuggestions.length, newProject]);

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const tabs = useMemo(() => {
    const goalTabs = data.goals.map(g => g.name);
    return [...goalTabs, 'All'];
  }, [data.goals]);

  const activeGoal = activeTab < data.goals.length ? data.goals[activeTab]! : null;
  const isAllTab = activeTab >= data.goals.length;

  // Part 7: Fix week scrolling
  const weeks = useMemo(() => getRecentWeeks(WEEKS_TO_SHOW + weekOffset).slice(weekOffset, weekOffset + WEEKS_TO_SHOW), [weekOffset]);

  const today = getTodayStr();

  // Part 4: Toggle selected date instead of today
  const handleToggleDate = useCallback(() => {
    if (!activeGoal) return;
    const updated = toggleCompletion(activeGoal.id, selectedDate, { ...data });
    setData(updated);
  }, [activeGoal, selectedDate, data]);

  const handleStartAdd = useCallback(() => {
    setViewMode('add');
    setAddStep('name');
    setNewName('');
    setNewType('manual');
    setNewProject('');
    setNewColorIdx(data.goals.length % GOAL_COLORS.length);
  }, [data.goals.length]);

  // Part 8: Start edit
  const handleStartEdit = useCallback(() => {
    if (!activeGoal) return;
    setViewMode('edit');
    setAddStep('name');
    setNewName(activeGoal.name);
    setNewType(activeGoal.type);
    setNewProject(activeGoal.autoProject ?? '');
    setNewColorIdx(Math.max(0, GOAL_COLORS.indexOf(activeGoal.color)));
  }, [activeGoal]);

  const handleFinishAdd = useCallback(() => {
    if (!newName.trim()) { setViewMode('main'); return; }
    const goal: TrackedGoal = {
      id: nanoid(),
      name: newName.trim(),
      color: GOAL_COLORS[newColorIdx]!,
      type: newType,
      ...(newType === 'auto' && newProject.trim() ? { autoProject: newProject.trim() } : {}),
    };
    const updated = addGoal(goal);
    setData(updated);
    setActiveTab(updated.goals.length - 1);
    setViewMode('main');
  }, [newName, newType, newProject, newColorIdx]);

  // Part 8: Finish edit
  const handleFinishEdit = useCallback(() => {
    if (!activeGoal || !newName.trim()) { setViewMode('main'); return; }
    const updates: Partial<Omit<TrackedGoal, 'id'>> = {
      name: newName.trim(),
      color: GOAL_COLORS[newColorIdx]!,
      type: newType,
    };
    if (newType === 'auto' && newProject.trim()) {
      updates.autoProject = newProject.trim();
    } else {
      updates.autoProject = undefined;
    }
    const updated = updateGoal(activeGoal.id, updates);
    setData(updated);
    setViewMode('main');
  }, [activeGoal, newName, newType, newProject, newColorIdx]);

  const handleConfirmDelete = useCallback(() => {
    if (!deleteTarget) return;
    const updated = removeGoal(deleteTarget);
    setData(updated);
    setActiveTab(t => Math.min(t, updated.goals.length));
    setDeleteTarget(null);
    setViewMode('main');
  }, [deleteTarget]);

  // Part 4: h/l date navigation helpers
  const moveDateBy = useCallback((days: number) => {
    const d = new Date(selectedDate + 'T00:00:00');
    d.setDate(d.getDate() + days);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    setSelectedDate(`${y}-${m}-${dd}`);
  }, [selectedDate]);

  useInput((input, key) => {
    if (viewMode === 'delete-confirm') {
      if (input === 'y' || input === 'Y') handleConfirmDelete();
      else if (input === 'n' || input === 'N' || key.escape) { setDeleteTarget(null); setViewMode('main'); }
      return;
    }

    if (viewMode === 'add' || viewMode === 'edit') {
      if (key.escape) { setViewMode('main'); return; }

      if (addStep === 'name') {
        return;
      }
      if (addStep === 'type') {
        if (input === 'm' || input === 'M') { setNewType('manual'); setAddStep('color'); }
        else if (input === 'a' || input === 'A') { setNewType('auto'); setAddStep('project'); }
        else if (key.return) {
          if (newType === 'auto') setAddStep('project');
          else setAddStep('color');
        }
        else if (key.tab) setNewType(t => t === 'manual' ? 'auto' : 'manual');
        return;
      }
      if (addStep === 'project') {
        // Handle arrow keys for project suggestions
        if (key.downArrow) { setProjSuggIdx(i => Math.min(i + 1, projSuggestions.length - 1)); return; }
        if (key.upArrow) { setProjSuggIdx(i => Math.max(0, i - 1)); return; }
        if (key.tab && projSuggestions.length > 0) {
          setNewProject(projSuggestions[projSuggIdx] ?? newProject);
          return;
        }
        return;
      }
      if (addStep === 'color') {
        if (input === 'h' || key.leftArrow) setNewColorIdx(i => (i - 1 + GOAL_COLORS.length) % GOAL_COLORS.length);
        else if (input === 'l' || key.rightArrow) setNewColorIdx(i => (i + 1) % GOAL_COLORS.length);
        else if (key.return) {
          if (viewMode === 'edit') handleFinishEdit();
          else handleFinishAdd();
        }
        return;
      }
      return;
    }

    // Main mode
    if (key.tab) {
      setActiveTab(t => (t + 1) % tabs.length);
    }
    // Part 6: h/l tab switching
    else if (input === 'h') {
      setActiveTab(t => Math.max(0, t - 1));
    } else if (input === 'l') {
      setActiveTab(t => Math.min(tabs.length - 1, t + 1));
    }
    // Part 4: date navigation with arrow keys
    else if (key.leftArrow) {
      moveDateBy(-1);
    } else if (key.rightArrow) {
      moveDateBy(1);
    }
    else if (key.return || input === 'x') {
      handleToggleDate();
    } else if (input === 'a') {
      handleStartAdd();
    }
    // Part 8: edit goal
    else if (input === 'e') {
      if (activeGoal) handleStartEdit();
    }
    else if (input === 'd') {
      if (activeGoal) {
        setDeleteTarget(activeGoal.id);
        setViewMode('delete-confirm');
      }
    } else if (input === 'j' || key.downArrow) {
      setWeekOffset(o => o + 1);
    } else if (input === 'k' || key.upArrow) {
      setWeekOffset(o => Math.max(0, o - 1));
    }
  });

  // ─── Add / Edit Goal Flow ────────────────────────────────────────────────────

  if (viewMode === 'add' || viewMode === 'edit') {
    const isEdit = viewMode === 'edit';
    return (
      <Box flexDirection="column" flexGrow={1}>
        <Text bold color="cyan">{isEdit ? 'Edit Goal' : 'Add New Goal'}</Text>
        <Text dimColor>Esc to cancel</Text>
        <Box marginTop={1} flexDirection="column">
          {addStep === 'name' && (
            <Box>
              <Text>Name: </Text>
              <TextInput
                value={newName}
                onChange={setNewName}
                onSubmit={() => {
                  if (newName.trim()) setAddStep('type');
                }}
              />
            </Box>
          )}
          {addStep === 'type' && (
            <Box flexDirection="column">
              <Text>Name: <Text bold>{newName}</Text></Text>
              <Box marginTop={1}>
                <Text>Type: </Text>
                <Text color={newType === 'manual' ? 'cyan' : 'gray'} bold={newType === 'manual'}>[m] manual</Text>
                <Text>  </Text>
                <Text color={newType === 'auto' ? 'cyan' : 'gray'} bold={newType === 'auto'}>[a] auto</Text>
              </Box>
              <Text dimColor>Tab to toggle, Enter to confirm</Text>
            </Box>
          )}
          {addStep === 'project' && (
            <Box flexDirection="column">
              <Text>Name: <Text bold>{newName}</Text>  Type: <Text bold>auto</Text></Text>
              <Box marginTop={1}>
                <Text>#project: </Text>
                <TextInput
                  value={newProject}
                  onChange={setNewProject}
                  onSubmit={() => setAddStep('color')}
                />
              </Box>
              {/* Project suggestions */}
              {projSuggestions.length > 0 && (
                <Box flexDirection="column" marginTop={1}>
                  {projSuggestions.map((p, i) => (
                    <Text key={p} color={i === projSuggIdx ? 'cyan' : 'gray'} bold={i === projSuggIdx}>
                      {i === projSuggIdx ? '> ' : '  '}{p}
                    </Text>
                  ))}
                  <Text dimColor>Up/Down to navigate, Tab to accept</Text>
                </Box>
              )}
            </Box>
          )}
          {addStep === 'color' && (
            <Box flexDirection="column">
              <Text>Name: <Text bold>{newName}</Text>  Type: <Text bold>{newType}</Text></Text>
              <Box marginTop={1}>
                <Text>Color: </Text>
                {GOAL_COLORS.map((c, i) => (
                  <Text key={c} color={c as any} bold={i === newColorIdx}>
                    {i === newColorIdx ? '[' : ' '}{'\u2588'}{i === newColorIdx ? ']' : ' '}
                  </Text>
                ))}
              </Box>
              <Text dimColor>h/l to select, Enter to save</Text>
            </Box>
          )}
        </Box>
      </Box>
    );
  }

  // ─── Delete Confirmation ──────────────────────────────────────────────────

  if (viewMode === 'delete-confirm' && deleteTarget) {
    const goal = data.goals.find(g => g.id === deleteTarget);
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

  // ─── Main View ──────────────────────────────────────────────────────────────

  if (data.goals.length === 0) {
    return (
      <Box flexDirection="column" flexGrow={1}>
        <Text dimColor>No goals configured yet.</Text>
        <Box marginTop={1}>
          <Text>Press <Text bold color="cyan">a</Text> to add your first goal</Text>
        </Box>
        <Box marginTop={1} flexDirection="column">
          <Text dimColor>Goals can be:</Text>
          <Text dimColor>  manual — you toggle daily (e.g. Exercise, Reading)</Text>
          <Text dimColor>  auto   — tracks pomodoro sessions by #project</Text>
        </Box>
      </Box>
    );
  }

  // Selected date display
  const selDateLabel = selectedDate === today ? 'Today' : selectedDate.slice(5).replace('-', '/');

  // Tab bar
  const tabBar = (
    <Box marginBottom={1}>
      {tabs.map((label, i) => (
        <React.Fragment key={i}>
          {i > 0 && <Text dimColor>  </Text>}
          <Text
            bold={i === activeTab}
            color={i === activeTab ? 'yellow' : 'gray'}
            underline={i === activeTab}
          >
            {label}
          </Text>
        </React.Fragment>
      ))}
      <Text dimColor>{'  |\u2190\u2192'}</Text>
      <Text bold color="cyan">{' '}{selDateLabel}</Text>
    </Box>
  );

  if (isAllTab) {
    return (
      <Box flexDirection="column" flexGrow={1}>
        {tabBar}
        {data.goals.map(goal => (
          <GoalSection key={goal.id} goal={goal} data={data} weeks={weeks} today={today} selectedDate={selectedDate} compact />
        ))}
      </Box>
    );
  }

  return (
    <Box flexDirection="column" flexGrow={1}>
      {tabBar}
      {activeGoal && <GoalSection goal={activeGoal} data={data} weeks={weeks} today={today} selectedDate={selectedDate} />}
    </Box>
  );
}

// ─── Goal Section Component ──────────────────────────────────────────────────

function GoalSection({
  goal, data, weeks, today, selectedDate, compact
}: {
  goal: TrackedGoal;
  data: GoalsData;
  weeks: string[][];
  today: string;
  selectedDate: string;
  compact?: boolean;
}) {
  const streak = useMemo(() => computeStreak(goal.id, data), [goal.id, data]);

  const totalDays = useMemo(() => {
    let count = 0;
    for (const week of weeks) {
      for (const date of week) {
        if (isGoalComplete(goal, date, data)) count++;
      }
    }
    return count;
  }, [goal, data, weeks]);

  const thisWeek = weeks[weeks.length - 1] ?? [];
  const thisWeekDone = thisWeek.filter(d => isGoalComplete(goal, d, data)).length;

  return (
    <Box flexDirection="column" marginBottom={compact ? 1 : 0}>
      <Box>
        <Text bold color={goal.color as any}>{'\u2500\u2500 '}{goal.name}</Text>
        <Text dimColor> ({goal.type}){compact ? `  ${totalDays}d  streak:${streak.current}d  best:${streak.best}d` : ''}</Text>
      </Box>

      {/* Heatmap grid */}
      <Box flexDirection="column" marginTop={compact ? 0 : 1}>
        {/* Week number headers */}
        <Box>
          <Box width={5}><Text> </Text></Box>
          {weeks.map((_, wi) => (
            <Text key={wi} dimColor>{`W${wi + 1} `}</Text>
          ))}
        </Box>

        {/* Day rows */}
        {DAY_NAMES.map((dayName, dayIdx) => (
          <Box key={dayName}>
            <Box width={5}><Text dimColor>{dayName}</Text></Box>
            {weeks.map((weekDates, wi) => {
              const date = weekDates[dayIdx]!;
              const isFuture = date > today;
              const done = !isFuture && isGoalComplete(goal, date, data);
              const isToday = date === today;
              const isSelected = date === selectedDate;

              if (isFuture) {
                return <Text key={wi} dimColor>{isSelected ? '\u2591\u25c4 ' : '\u2591  '}</Text>;
              }
              if (done) {
                return <Text key={wi} color={goal.color as any} bold={isSelected}>{isSelected ? '\u2588\u25c4 ' : isToday ? '\u2588* ' : '\u2588  '}</Text>;
              }
              return <Text key={wi} color={isSelected ? 'white' : undefined} dimColor={!isSelected} bold={isSelected}>{isSelected ? '\u00b7\u25c4 ' : isToday ? '\u00b7* ' : '\u00b7  '}</Text>;
            })}
          </Box>
        ))}
      </Box>

      {!compact && (
        <Box flexDirection="column" marginTop={1}>
          <Text dimColor>{'\u00b7'} = not done  {'\u2588'} = done  * = today  {'\u25c4'} = selected  {'\u2591'} = future</Text>
          <Box marginTop={1}>
            <Text>Total: <Text bold>{totalDays}d</Text></Text>
            <Text>{'  '}Streak: <Text bold color={streak.current > 0 ? 'green' : undefined}>{streak.current}d</Text></Text>
            <Text>{'  '}Best: <Text bold>{streak.best}d</Text></Text>
          </Box>
          <Text>This week: <Text bold>{thisWeekDone}/7</Text></Text>
        </Box>
      )}
    </Box>
  );
}
