import React, { useState, useMemo, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import type { Keymap } from '../lib/keymap.js';
import { loadTasks, saveTasks, addTask, completeTask, deleteTask, updateTask, parseTaskInput } from '../lib/tasks.js';
import { loadReminders, updateReminder, deleteReminder } from '../lib/reminders.js';
import { addDays, localDateStr } from '../lib/date-utils.js';
import { kmMatches } from '../lib/keymap.js';
import { FilterInput } from './FilterInput.js';
import { parseTimeInput } from '../lib/format.js';

interface DayPlannerViewProps {
  keymap?: Keymap;
  setIsTyping: (v: boolean) => void;
  compactTime: boolean;
}

type InputMode = 'none' | 'add' | 'edit' | 'schedule';

type TimelineItem =
  | { type: 'task'; id: string; time: string; endTime?: string; text: string; completed: boolean; completedAt?: string; project?: string }
  | { type: 'reminder'; id: string; time: string; title: string; enabled: boolean; recurring: boolean };

export function DayPlannerView({ keymap, setIsTyping, compactTime }: DayPlannerViewProps) {
  const [selectedDate, setSelectedDate] = useState(() => localDateStr(new Date()));
  const [selectedIdx, setSelectedIdx] = useState(0);
  
  const [inputMode, setInputMode] = useState<InputMode>('none');
  const [inputValue, setInputValue] = useState('');
  const [inputKey, setInputKey] = useState(0);

  const [scheduleStep, setScheduleStep] = useState<'date' | 'time' | 'end'>('date');
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [scheduleEndTime, setScheduleEndTime] = useState('');

  // Auto-refresh trigger
  const [refreshGen, setRefreshGen] = useState(0);
  const refresh = useCallback(() => setRefreshGen(g => g + 1), []);

  const todayStr = localDateStr(new Date());

  const { backlogTasks, timelineItems, allNavItems } = useMemo(() => {
    // We reference refreshGen just to trigger re-renders
    const _force = refreshGen;
    const allTasks = loadTasks();
    const allReminders = loadReminders();

    const backlog = allTasks.filter(t => t.date === selectedDate && !t.time);
    
    const items: TimelineItem[] = [];

    // Add scheduled tasks
    const scheduledTasks = allTasks.filter(t => t.date === selectedDate && t.time);
    for (const t of scheduledTasks) {
      items.push({
        type: 'task',
        id: t.id,
        time: t.time!,
        endTime: t.endTime,
        text: t.text,
        completed: t.completed,
        completedAt: t.completedAt,
        project: t.project,
      });
    }

    // Add reminders (if today or recurring)
    for (const r of allReminders) {
      if (r.enabled && (r.recurring || selectedDate === todayStr)) {
        items.push({
          type: 'reminder',
          id: r.id,
          time: r.time,
          title: r.title,
          enabled: r.enabled,
          recurring: r.recurring,
        });
      }
    }

    items.sort((a, b) => a.time.localeCompare(b.time));

    const navItems: TimelineItem[] = [
      ...backlog.map(t => ({
        type: 'task' as const,
        id: t.id,
        time: '',
        text: t.text,
        completed: t.completed,
        completedAt: t.completedAt,
        project: t.project,
      })),
      ...items
    ];

    return { backlogTasks: backlog, timelineItems: items, allNavItems: navItems };
  }, [selectedDate, todayStr, refreshGen]);

  const totalNavItems = allNavItems.length;

  const existingTaskTexts = useMemo(() => {
    const _force = refreshGen;
    const tasks = loadTasks();
    const incomplete = tasks.filter(t => !t.completed).map(t => {
      let s = t.text;
      if (t.project) s += ` #${t.project}`;
      return s;
    });
    return Array.from(new Set(incomplete));
  }, [refreshGen]);

  useInput((input, key) => {
    if (inputMode === 'add' || inputMode === 'edit') {
      if (key.escape) {
        setInputMode('none');
        setIsTyping(false);
        setInputValue('');
        return;
      }
      return;
    }

    if (inputMode === 'schedule') {
      if (key.escape) {
        setInputMode('none');
        setIsTyping(false);
        setScheduleDate('');
        setScheduleTime('');
        setScheduleEndTime('');
        setScheduleStep('date');
        return;
      }
      return;
    }

    if ((kmMatches(keymap, 'nav.right', input, key)) || key.rightArrow) {
      setSelectedDate(prev => addDays(prev, 1));
      setSelectedIdx(0);
      return;
    }
    if ((kmMatches(keymap, 'nav.left', input, key)) || key.leftArrow) {
      setSelectedDate(prev => addDays(prev, -1));
      setSelectedIdx(0);
      return;
    }
    if ((kmMatches(keymap, 'nav.down', input, key)) || key.downArrow) {
      setSelectedIdx(i => Math.min(i + 1, Math.max(0, totalNavItems - 1)));
      return;
    }
    if ((kmMatches(keymap, 'nav.up', input, key)) || key.upArrow) {
      setSelectedIdx(i => Math.max(0, i - 1));
      return;
    }
    if (input === 't') {
      setSelectedDate(todayStr);
      setSelectedIdx(0);
      return;
    }

    if (kmMatches(keymap, 'list.add', input, key)) {
      setInputValue('');
      setInputMode('add');
      setIsTyping(true);
      return;
    }

    if (kmMatches(keymap, 'list.edit', input, key) && totalNavItems > 0) {
      const item = allNavItems[selectedIdx];
      if (item && item.type === 'task') {
        let editValue = item.text;
        if (item.project) editValue += ` #${item.project}`;
        setInputValue(editValue);
        setInputMode('edit');
        setIsTyping(true);
      }
      return;
    }

    if (input === 's' && totalNavItems > 0) {
      const item = allNavItems[selectedIdx];
      if (item && item.type === 'task') {
        setScheduleDate(selectedDate);
        setScheduleTime(item.time || '');
        setScheduleEndTime(item.endTime || '');
        setScheduleStep('date');
        setInputMode('schedule');
        setIsTyping(true);
      }
      return;
    }

    if (input === 'x' && totalNavItems > 0) {
      const item = allNavItems[selectedIdx];
      if (item && item.type === 'task') {
        if (!item.completed) {
          completeTask(item.id);
        } else {
          // Undo completion
          const allTasks = loadTasks();
          const idx = allTasks.findIndex(t => t.id === item.id);
          if (idx >= 0) {
            allTasks[idx] = { ...allTasks[idx]!, completed: false, completedAt: undefined };
            saveTasks(allTasks);
          }
        }
        refresh();
      } else if (item && item.type === 'reminder') {
        updateReminder(item.id, { enabled: !item.enabled });
        refresh();
      }
      return;
    }

    if (kmMatches(keymap, 'list.delete', input, key) && totalNavItems > 0) {
      const item = allNavItems[selectedIdx];
      if (item && item.type === 'task') {
        deleteTask(item.id);
        refresh();
        setSelectedIdx(i => Math.max(0, Math.min(i, totalNavItems - 2)));
      } else if (item && item.type === 'reminder') {
        deleteReminder(item.id);
        refresh();
        setSelectedIdx(i => Math.max(0, Math.min(i, totalNavItems - 2)));
      }
      return;
    }
  });

  const handleAddSubmit = useCallback((value: string) => {
    if (value.trim()) {
      const parsed = parseTaskInput(value);
      // Automatically attach the currently selected date in the Day Planner to the task
      const assignedDate = parsed.date || selectedDate;
      addTask(parsed.text, parsed.project, undefined, assignedDate, parsed.time, parsed.endTime);
      refresh();
    }
    setInputMode('none');
    setIsTyping(false);
    setInputValue('');
  }, [setIsTyping, refresh, selectedDate]);

  const handleEditSubmit = useCallback((value: string) => {
    const item = allNavItems[selectedIdx];
    if (item && item.type === 'task' && value.trim()) {
      const parsed = parseTaskInput(value);
      updateTask(item.id, { text: parsed.text, project: parsed.project, date: parsed.date, time: parsed.time, endTime: parsed.endTime });
      refresh();
    }
    setInputMode('none');
    setIsTyping(false);
    setInputValue('');
  }, [allNavItems, selectedIdx, refresh, setIsTyping]);

  const handleScheduleSubmit = useCallback((value: string) => {
    const item = allNavItems[selectedIdx];
    if (!item || item.type !== 'task') return;

    if (scheduleStep === 'date') {
      setScheduleDate(value.trim());
      setScheduleStep('time');
      return;
    }
    if (scheduleStep === 'time') {
      setScheduleTime(value.trim());
      setScheduleStep('end');
      return;
    }
    if (scheduleStep === 'end') {
      const endTime = value.trim();
      updateTask(item.id, {
        date: scheduleDate || undefined,
        time: scheduleTime || undefined,
        endTime: endTime || undefined,
      });
      refresh();
      setInputMode('none');
      setIsTyping(false);
      setScheduleDate('');
      setScheduleTime('');
      setScheduleEndTime('');
      setScheduleStep('date');
    }
  }, [allNavItems, selectedIdx, scheduleStep, scheduleDate, scheduleTime, refresh, setIsTyping]);

  return (
    <Box flexDirection="column" flexGrow={1}>
      {/* Header */}
      <Box marginBottom={1} justifyContent="center" borderStyle="round" borderColor="gray">
        <Text dimColor>{'< Prev Day    '}</Text>
        <Text bold color={selectedDate === todayStr ? 'green' : 'white'}>
          {selectedDate === todayStr ? `Today: ${selectedDate}` : selectedDate}
        </Text>
        <Text dimColor>{'    Next Day >'}</Text>
        <Text dimColor>{'    [t] Today'}</Text>
      </Box>

      {/* Backlog */}
      <Box flexDirection="column" marginBottom={1}>
        <Text bold color="cyan">All-Day / Backlog</Text>
        <Text dimColor>{'─'.repeat(50)}</Text>
        {backlogTasks.length === 0 ? (
          <Text dimColor>  No all-day tasks</Text>
        ) : (
          backlogTasks.map((t, i) => {
            const isSelected = i === selectedIdx;
            return (
              <Box key={t.id}>
                <Text color={isSelected ? 'yellow' : 'gray'} bold={isSelected}>{isSelected ? '> ' : '  '}</Text>
                <Text color="gray">{t.completed ? '[x]' : '[ ]'} </Text>
                <Text color={t.completed ? 'gray' : 'white'} strikethrough={t.completed}>{t.text}</Text>
                {t.project && <Text color="cyan"> #{t.project}</Text>}
                {t.completed && t.completedAt && <Text dimColor> (done: {t.completedAt.slice(11, 16)})</Text>}
              </Box>
            );
          })
        )}
      </Box>

      {/* Timeline */}
      <Box flexDirection="column">
        <Text bold color="cyan">Timeline</Text>
        <Text dimColor>{'─'.repeat(50)}</Text>
        {timelineItems.length === 0 ? (
          <Text dimColor>  No scheduled events</Text>
        ) : (
          timelineItems.map((item, i) => {
            const isSelected = backlogTasks.length + i === selectedIdx;
            
            if (item.type === 'reminder') {
              return (
                <Box key={item.id}>
                  <Text color={isSelected ? 'yellow' : 'gray'} bold={isSelected}>{isSelected ? '> ' : '  '}</Text>
                  <Text color="yellow">{item.time}  -- 🔔 {item.title} (Alarm) {item.recurring ? '[R]' : ''} {'-'.repeat(20)}</Text>
                </Box>
              );
            }

            // Task
            if (item.type === 'task') {
              return (
                <Box key={item.id} flexDirection="column">
                  <Box>
                    <Text color={isSelected ? 'yellow' : 'gray'} bold={isSelected}>{isSelected ? '> ' : '  '}</Text>
                    <Text color="cyan">{item.time}  </Text>
                    <Text dimColor>╭{item.endTime ? '─'.repeat(45) : '─'.repeat(45)}</Text>
                  </Box>
                  <Box>
                    <Text>{'  '}</Text>
                    <Text dimColor>{'       │ '}</Text>
                    <Text color="gray">{item.completed ? '[x]' : '[ ]'} </Text>
                    <Text color={item.completed ? 'gray' : 'white'} strikethrough={item.completed}>{item.text}</Text>
                    {item.project && <Text color="cyan"> #{item.project}</Text>}
                    {item.completed && item.completedAt && <Text dimColor> (done: {item.completedAt.slice(11, 16)})</Text>}
                  </Box>
                  <Box>
                    <Text>{'  '}</Text>
                    <Text color={item.endTime ? 'cyan' : 'gray'}>{item.endTime || '       '}  </Text>
                    <Text dimColor>╰{item.endTime ? '─'.repeat(45) : '─'.repeat(45)}</Text>
                  </Box>
                </Box>
              );
            }
            return null;
          })
        )}
      </Box>

      {/* Inputs */}
      {inputMode === 'add' && (
        <Box marginTop={1} flexDirection="column">
          <Text dimColor>Adding task for date: <Text color="cyan">{selectedDate}</Text></Text>
          <FilterInput
            label={<Text color="yellow">{'> '}</Text>}
            value={inputValue}
            onChange={setInputValue}
            onSubmit={handleAddSubmit}
            placeholder="Task name #project time:HH:MM end:HH:MM"
            items={existingTaskTexts}
          />
        </Box>
      )}
      {inputMode === 'edit' && (
        <Box marginTop={1} flexDirection="column">
          <Text dimColor>Editing task for date: <Text color="cyan">{selectedDate}</Text></Text>
          <FilterInput
            label={<Text color="yellow">{'Edit: '}</Text>}
            value={inputValue}
            onChange={setInputValue}
            onSubmit={handleEditSubmit}
            items={existingTaskTexts}
          />
        </Box>
      )}
      {inputMode === 'schedule' && (
        <Box flexDirection="column" marginTop={1} borderStyle="round" borderColor="cyan" paddingX={1}>
          <Text color="cyan" bold>Schedule Item</Text>
          <Box>
            <Text color="yellow">{scheduleStep === 'date' ? '🗓️ Date (YYYY-MM-DD): ' : scheduleStep === 'time' ? '⏱️ Start Time (HH:MM): ' : '🛑 End Time (HH:MM): '}</Text>
            <TextInput
              value={scheduleStep === 'date' ? scheduleDate : scheduleStep === 'time' ? scheduleTime : scheduleEndTime}
              onChange={(v) => {
                if (scheduleStep === 'date') setScheduleDate(v);
                else if (scheduleStep === 'time') setScheduleTime(v);
                else setScheduleEndTime(v);
              }}
              onSubmit={handleScheduleSubmit}
              placeholder={scheduleStep === 'date' ? 'YYYY-MM-DD' : scheduleStep === 'time' ? 'HH:MM' : 'HH:MM (Enter to skip)'}
            />
          </Box>
        </Box>
      )}
    </Box>
  );
}