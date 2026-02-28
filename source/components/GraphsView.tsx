import { useState, useMemo, useCallback, useEffect } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import type { Keymap } from '../lib/keymap.js';
import { nanoid } from 'nanoid';
import {
  loadGoals, addGoal, removeGoal, updateGoal, toggleCompletion,
  getTodayStr, getRecentWeeks,
  getAllProjects, GOAL_COLORS, GoalsData, TrackedGoal,
  setRating, getRating, setNote, getNote,
} from '../lib/goals.js';
import { GoalSection } from './graphs/GoalSection.js';
import { GoalFormView } from './graphs/GoalFormView.js';
import { TabBar } from './graphs/TabBar.js';
import { DeleteConfirmView } from './graphs/DeleteConfirmView.js';
import { RatePicker } from './graphs/RatePicker.js';
import { NoteEditor } from './graphs/NoteEditor.js';

const WEEKS_TO_SHOW = 8;

type ViewMode = 'main' | 'add' | 'edit' | 'delete-confirm' | 'rate-picker' | 'note-editor';
type AddStep = 'name' | 'type' | 'project' | 'rateMax' | 'color';

export function GraphsView({ setIsTyping, keymap }: { setIsTyping: (v: boolean) => void; keymap?: Keymap }) {
  const [data, setData] = useState<GoalsData>(() => loadGoals());
  const [activeTab, setActiveTab] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>('main');
  const [weekOffset, setWeekOffset] = useState(0);
  const [allTabOffset, setAllTabOffset] = useState(0);

  const { stdout } = useStdout();
  const termRows = stdout?.rows ?? 24;
  // Each compact GoalSection uses: 1 name row + 1 week header row + 7 day rows + 1 blank = ~10 lines
  const GOAL_SECTION_HEIGHT = 10;
  const visibleGoalCount = Math.max(1, Math.floor((termRows - 6) / GOAL_SECTION_HEIGHT));

  // Selected date for heatmap navigation (Part 4)
  const [selectedDate, setSelectedDate] = useState<string>(() => getTodayStr());

  // Add goal state
  const [addStep, setAddStep] = useState<AddStep>('name');
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<'manual' | 'auto' | 'rate' | 'note'>('manual');
  const [newProject, setNewProject] = useState('');
  const [newRateMax, setNewRateMax] = useState('5');
  const [newColorIdx, setNewColorIdx] = useState(0);

  // Rate picker state
  const [pickerValue, setPickerValue] = useState(0);

  // Note editor state
  const [noteValue, setNoteValue] = useState('');

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
    setNewRateMax('5');
    setNewColorIdx(data.goals.length % GOAL_COLORS.length);
    setIsTyping(true);
  }, [data.goals.length]);

  // Part 8: Start edit
  const handleStartEdit = useCallback(() => {
    if (!activeGoal) return;
    setViewMode('edit');
    setAddStep('name');
    setNewName(activeGoal.name);
    setNewType(activeGoal.type as 'manual' | 'auto' | 'rate' | 'note');
    setNewProject(activeGoal.autoProject ?? '');
    setNewRateMax(String(activeGoal.rateMax ?? 5));
    setNewColorIdx(Math.max(0, GOAL_COLORS.indexOf(activeGoal.color)));
    setIsTyping(true);
  }, [activeGoal]);

  const handleFinishAdd = useCallback(() => {
    if (!newName.trim()) { setViewMode('main'); setIsTyping(false); return; }
    const goal: TrackedGoal = {
      id: nanoid(),
      name: newName.trim(),
      color: GOAL_COLORS[newColorIdx]!,
      type: newType,
      ...(newType === 'auto' && newProject.trim() ? { autoProject: newProject.trim() } : {}),
      ...(newType === 'rate' ? { rateMax: Math.max(1, parseInt(newRateMax, 10) || 5) } : {}),
    };
    const updated = addGoal(goal);
    setData(updated);
    setActiveTab(updated.goals.length - 1);
    setViewMode('main');
    setIsTyping(false);
  }, [newName, newType, newProject, newRateMax, newColorIdx]);

  // Part 8: Finish edit
  const handleFinishEdit = useCallback(() => {
    if (!activeGoal || !newName.trim()) { setViewMode('main'); setIsTyping(false); return; }
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
    if (newType === 'rate') {
      updates.rateMax = Math.max(1, parseInt(newRateMax, 10) || 5);
    } else {
      updates.rateMax = undefined;
    }
    const updated = updateGoal(activeGoal.id, updates);
    setData(updated);
    setViewMode('main');
    setIsTyping(false);
  }, [activeGoal, newName, newType, newProject, newRateMax, newColorIdx]);

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
    const str = `${y}-${m}-${dd}`;
    if (str <= today) setSelectedDate(str);
  }, [selectedDate, today]);

  useInput((input, key) => {
    const km = keymap;

    if (viewMode === 'delete-confirm') {
      if (input === 'y' || input === 'Y') handleConfirmDelete();
      else if (input === 'n' || input === 'N' || key.escape) { setDeleteTarget(null); setViewMode('main'); }
      return;
    }

    // Rate picker mode — up/down to adjust, Enter to confirm, digits as shortcut
    if (viewMode === 'rate-picker') {
      const max = activeGoal?.rateMax ?? 5;
      if (key.escape) { setViewMode('main'); setIsTyping(false); return; }
      if (key.upArrow || input === 'k') {
        setPickerValue(v => Math.min(v + 1, max));
        return;
      }
      if (key.downArrow || input === 'j') {
        setPickerValue(v => Math.max(v - 1, 0));
        return;
      }
      if (key.return) {
        if (activeGoal) {
          const updated = setRating(activeGoal.id, selectedDate, pickerValue, { ...data });
          setData(updated);
        }
        setViewMode('main');
        setIsTyping(false);
        return;
      }
      // Digit shortcut — set and confirm immediately
      if (activeGoal?.type === 'rate' && /^[0-9]$/.test(input)) {
        const value = parseInt(input, 10);
        if (value <= max) {
          const updated = setRating(activeGoal.id, selectedDate, value, { ...data });
          setData(updated);
        }
        setViewMode('main');
        setIsTyping(false);
      }
      return;
    }

    // Note editor mode
    if (viewMode === 'note-editor') {
      // TextInput handles input; Esc saves and closes
      if (key.escape) {
        if (activeGoal) {
          const updated = setNote(activeGoal.id, selectedDate, noteValue, { ...data });
          setData(updated);
        }
        setViewMode('main');
        setIsTyping(false);
      }
      return;
    }

    if (viewMode === 'add' || viewMode === 'edit') {
      if (key.escape) { setViewMode('main'); setIsTyping(false); return; }

      if (addStep === 'name') {
        return;
      }
      if (addStep === 'type') {
        if (input === 'm' || input === 'M') { setNewType('manual'); setAddStep('color'); }
        else if (input === 'a' || input === 'A') { setNewType('auto'); setAddStep('project'); setIsTyping(true); }
        else if (input === 'r' || input === 'R') { setNewType('rate'); setAddStep('rateMax'); setIsTyping(true); }
        else if (input === 'n' || input === 'N') { setNewType('note'); setAddStep('color'); }
        else if (key.return) {
          if (newType === 'auto') { setAddStep('project'); setIsTyping(true); }
          else if (newType === 'rate') { setAddStep('rateMax'); setIsTyping(true); }
          else setAddStep('color');
        }
        else if (key.tab) setNewType(t => t === 'manual' ? 'auto' : t === 'auto' ? 'rate' : t === 'rate' ? 'note' : 'manual');
        return;
      }
      if (addStep === 'rateMax') {
        // TextInput handles input
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
      setActiveTab(t => {
        const next = (t + 1) % tabs.length;
        if (next !== tabs.length - 1) setAllTabOffset(0);
        return next;
      });
    }
    // h/l tab switching
    else if (km ? km.matches('nav.left', input, key) : input === 'h') {
      setActiveTab(t => {
        const next = Math.max(0, t - 1);
        if (next !== tabs.length - 1) setAllTabOffset(0);
        return next;
      });
    } else if (km ? km.matches('nav.right', input, key) : input === 'l') {
      setActiveTab(t => {
        const next = Math.min(tabs.length - 1, t + 1);
        if (next !== tabs.length - 1) setAllTabOffset(0);
        return next;
      });
    }
    // Date navigation with arrow keys (clamp to today)
    else if (key.leftArrow) {
      moveDateBy(-1);
    } else if (key.rightArrow) {
      moveDateBy(1);
    }
    // t = jump to today
    else if (input === 't') {
      setSelectedDate(today);
    }
    // Up/down arrows: adjust rating for rate goals, otherwise week scroll (non-All tab)
    else if (key.upArrow) {
      if (isAllTab) {
        setAllTabOffset(o => Math.max(0, o - 1));
      } else if (activeGoal?.type === 'rate') {
        const current = getRating(activeGoal, selectedDate, data);
        const max = activeGoal.rateMax ?? 5;
        if (current < max) {
          const updated = setRating(activeGoal.id, selectedDate, current + 1, { ...data });
          setData(updated);
        }
      } else {
        setWeekOffset(o => Math.max(0, o - 1));
      }
    } else if (key.downArrow) {
      if (isAllTab) {
        setAllTabOffset(o => Math.min(o + 1, Math.max(0, data.goals.length - visibleGoalCount)));
      } else if (activeGoal?.type === 'rate') {
        const current = getRating(activeGoal, selectedDate, data);
        if (current > 0) {
          const updated = setRating(activeGoal.id, selectedDate, current - 1, { ...data });
          setData(updated);
        }
      } else {
        setWeekOffset(o => o + 1);
      }
    }
    // j/k: on All tab scroll goals, on individual tabs navigate dates
    else if (km ? km.matches('nav.down', input, key) : input === 'j') {
      if (isAllTab) {
        setAllTabOffset(o => Math.min(o + 1, Math.max(0, data.goals.length - visibleGoalCount)));
      } else {
        moveDateBy(1);
      }
    } else if (km ? km.matches('nav.up', input, key) : input === 'k') {
      if (isAllTab) {
        setAllTabOffset(o => Math.max(0, o - 1));
      } else {
        moveDateBy(-1);
      }
    }
    else if (key.return || input === 'x') {
      if (activeGoal?.type === 'rate') {
        // Open inline rate picker, start at current value
        setPickerValue(getRating(activeGoal, selectedDate, data));
        setViewMode('rate-picker');
        setIsTyping(true);
      } else if (activeGoal?.type === 'note') {
        // Open inline note editor
        setNoteValue(getNote(activeGoal, selectedDate, data));
        setViewMode('note-editor');
        setIsTyping(true);
      } else {
        handleToggleDate();
      }
    } else if (km ? km.matches('list.add', input, key) : input === 'a') {
      handleStartAdd();
    }
    // edit goal
    else if (km ? km.matches('list.edit', input, key) : input === 'e') {
      if (activeGoal) handleStartEdit();
    }
    else if (km ? km.matches('list.delete', input, key) : input === 'd') {
      if (activeGoal) {
        setDeleteTarget(activeGoal.id);
        setViewMode('delete-confirm');
      }
    }
  });

  // ─── Add / Edit Goal Flow ────────────────────────────────────────────────────

  if (viewMode === 'add' || viewMode === 'edit') {
    return (
      <GoalFormView
        isEdit={viewMode === 'edit'}
        addStep={addStep}
        newName={newName}
        setNewName={setNewName}
        newType={newType}
        newProject={newProject}
        setNewProject={setNewProject}
        newRateMax={newRateMax}
        setNewRateMax={setNewRateMax}
        newColorIdx={newColorIdx}
        projSuggestions={projSuggestions}
        projSuggIdx={projSuggIdx}
        onNameSubmit={() => {
          if (newName.trim()) { setAddStep('type'); setIsTyping(false); }
        }}
        onRateMaxSubmit={() => { setAddStep('color'); setIsTyping(false); }}
        onProjectSubmit={() => { setAddStep('color'); setIsTyping(false); }}
      />
    );
  }

  // ─── Delete Confirmation ──────────────────────────────────────────────────

  if (viewMode === 'delete-confirm' && deleteTarget) {
    const goal = data.goals.find(g => g.id === deleteTarget);
    return <DeleteConfirmView goal={goal} />;
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

  const tabBar = <TabBar tabs={tabs} activeTab={activeTab} selDateLabel={selDateLabel} />;

  const ratePicker = viewMode === 'rate-picker' && activeGoal?.type === 'rate'
    ? <RatePicker goal={activeGoal} selDateLabel={selDateLabel} pickerValue={pickerValue} />
    : null;

  const noteEditor = viewMode === 'note-editor' && activeGoal?.type === 'note' ? (
    <NoteEditor
      goal={activeGoal}
      selDateLabel={selDateLabel}
      noteValue={noteValue}
      onChange={setNoteValue}
      onSubmit={(v: string) => {
        const updated = setNote(activeGoal.id, selectedDate, v, { ...data });
        setData(updated);
        setViewMode('main');
        setIsTyping(false);
      }}
    />
  ) : null;

  if (isAllTab) {
    const visibleGoals = data.goals.slice(allTabOffset, allTabOffset + visibleGoalCount);
    const showScrollIndicator = data.goals.length > visibleGoalCount;
    return (
      <Box flexDirection="column" flexGrow={1}>
        {tabBar}
        {visibleGoals.map(goal => (
          <GoalSection key={goal.id} goal={goal} data={data} weeks={weeks} today={today} selectedDate={selectedDate} compact />
        ))}
        {showScrollIndicator && (
          <Text dimColor>
            j/k: scroll  Showing {allTabOffset + 1}-{Math.min(allTabOffset + visibleGoalCount, data.goals.length)} of {data.goals.length} goals
          </Text>
        )}
      </Box>
    );
  }

  return (
    <Box flexDirection="column" flexGrow={1}>
      {tabBar}
      {activeGoal && <GoalSection goal={activeGoal} data={data} weeks={weeks} today={today} selectedDate={selectedDate} />}
      {ratePicker}
      {noteEditor}
    </Box>
  );
}

