import { useState, useCallback, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { nanoid } from 'nanoid';
import type { ScheduledNotification, Task } from '../types.js';
import { loadReminders, addReminder, deleteReminder, updateReminder } from '../lib/reminders.js';
import { loadTasks } from '../lib/tasks.js';
import { type Keymap, kmMatches } from '../lib/keymap.js';
import { parseTimeInput } from '../lib/format.js';

interface RemindersViewProps {
  setIsTyping: (v: boolean) => void;
  compactTime: boolean;
  focusId?: string | null;
  onFocusConsumed?: () => void;
  keymap?: Keymap;
}

type InputStep = 'none' | 'time' | 'title' | 'task';

export function RemindersView({ setIsTyping, compactTime, focusId, onFocusConsumed, keymap }: RemindersViewProps) {
  const [reminders, setReminders] = useState<ScheduledNotification[]>(loadReminders);
  const [tasks] = useState<Task[]>(() => loadTasks().filter(t => !t.completed));
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [step, setStep] = useState<InputStep>('none');
  const [inputValue, setInputValue] = useState('');
  const [pendingTime, setPendingTime] = useState('');
  const [pendingTitle, setPendingTitle] = useState('');
  const [pendingRecurring, setPendingRecurring] = useState(true);
  const [error, setError] = useState('');
  const [taskIdx, setTaskIdx] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);

  const refresh = useCallback(() => setReminders(loadReminders()), []);

  // Handle focusId from global search
  useEffect(() => {
    if (focusId) {
      const allReminders = loadReminders();
      const idx = allReminders.findIndex(r => r.id === focusId);
      if (idx >= 0) setSelectedIdx(idx);
      onFocusConsumed?.();
    }
  }, [focusId, onFocusConsumed]);

  useInput((input, key) => {
    const km = keymap;

    if (step === 'task') {
      if (key.escape) {
        setStep('none');
        setIsTyping(false);
        return;
      }
      if (key.return) {
        if (editingId) {
          const t = taskIdx === 0 ? null : tasks[taskIdx - 1];
          updateReminder(editingId, { taskId: t?.id ?? undefined });
          refresh();
        }
        setStep('none');
        setIsTyping(false);
        return;
      }
      if ((kmMatches(km, 'nav.down', input, key)) || key.downArrow) {
        setTaskIdx(i => Math.min(i + 1, tasks.length));
      }
      if ((kmMatches(km, 'nav.up', input, key)) || key.upArrow) {
        setTaskIdx(i => Math.max(i - 1, 0));
      }
      return;
    }

    if (step !== 'none') {
      if (key.escape) {
        setStep('none');
        setIsTyping(false);
        setError('');
      }
      return;
    }

    if ((kmMatches(km, 'nav.down', input, key)) || key.downArrow) {
      setSelectedIdx(i => Math.min(i + 1, reminders.length - 1));
      return;
    }
    if ((kmMatches(km, 'nav.up', input, key)) || key.upArrow) {
      setSelectedIdx(i => Math.max(i - 1, 0));
      return;
    }

    if (kmMatches(km, 'list.add', input, key)) {
      setEditingId(null);
      setInputValue('');
      setPendingTime('');
      setPendingTitle('');
      setPendingRecurring(true);
      setStep('time');
      setIsTyping(true);
      setError('');
      return;
    }

    if (kmMatches(km, 'list.edit', input, key) && reminders.length > 0) {
      const r = reminders[selectedIdx];
      if (r) {
        setEditingId(r.id);
        setInputValue(r.time);
        setPendingTime(r.time);
        setPendingTitle(r.title);
        setStep('time');
        setIsTyping(true);
        setError('');
      }
      return;
    }

    if (input === 'l' && reminders.length > 0) {
      const r = reminders[selectedIdx];
      if (r) {
        setEditingId(r.id);
        // Find if it has a linked task to pre-select it
        const currentTaskIdx = tasks.findIndex(t => t.id === r.taskId);
        setTaskIdx(currentTaskIdx >= 0 ? currentTaskIdx + 1 : 0);
        setStep('task');
        setIsTyping(true);
      }
      return;
    }

    if (kmMatches(km, 'list.delete', input, key) && reminders.length > 0) {
      const r = reminders[selectedIdx];
      if (r) {
        deleteReminder(r.id);
        refresh();
        setSelectedIdx(i => Math.max(0, i - 1));
      }
      return;
    }

    if (input === 'r' && reminders.length > 0) {
      const r = reminders[selectedIdx];
      if (r) {
        updateReminder(r.id, { recurring: !r.recurring });
        refresh();
      }
      return;
    }

    if (key.return && reminders.length > 0) {
      const r = reminders[selectedIdx];
      if (r) {
        updateReminder(r.id, { enabled: !r.enabled });
        refresh();
      }
      return;
    }
  });

  const finalizeReminder = useCallback(() => {
    if (editingId) {
      updateReminder(editingId, { time: pendingTime, title: pendingTitle });
    } else {
      addReminder({
        id: nanoid(),
        time: pendingTime,
        title: pendingTitle || pendingTime,
        enabled: true,
        recurring: pendingRecurring,
      });
    }
    refresh();
    setStep('none');
    setIsTyping(false);
    setError('');
    setTaskIdx(0);
  }, [editingId, pendingTime, pendingTitle, pendingRecurring, refresh, setIsTyping]);

  const handleTimeSubmit = useCallback((value: string) => {
    const trimmed = value.trim();
    const parsed = parseTimeInput(trimmed, compactTime);
    if (!parsed) {
      setError(compactTime
        ? 'Invalid time. Use 3-4 digits (e.g. 930 or 2233)'
        : 'Invalid time. Use HH:MM (e.g. 09:30)');
      return;
    }

    const cleanValue = trimmed.toLowerCase().replace(/^remind\s+/, '').trim();
    const isRelative = cleanValue.length > 0 && /^(?:\+)?(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?$/.test(cleanValue);

    setPendingTime(parsed);
    setPendingRecurring(!isRelative);
    setInputValue(editingId ? pendingTitle : '');
    setStep('title');
    setError('');
  }, [editingId, pendingTitle, compactTime]);

  const handleTitleSubmit = useCallback((value: string) => {
    setPendingTitle(value.trim() || pendingTime);
    setInputValue('');
    finalizeReminder();
  }, [pendingTime, finalizeReminder]);

  return (
    <Box flexDirection="column" flexGrow={1}>
      {reminders.length === 0 && step === 'none' && (
        <Text dimColor>No reminders. Press 'a' to add one.</Text>
      )}

      {reminders.map((r, i) => {
        const isSelected = i === selectedIdx;
        const linkedTask = tasks.find(t => t.id === r.taskId);
        const recurringLabel = r.recurring ? '(R)' : '(1)';
        return (
          <Box key={r.id}>
            <Text color={isSelected ? 'yellow' : 'gray'} bold={isSelected}>{isSelected ? '> ' : '  '}</Text>
            <Box width={7}>
              <Text color={r.enabled ? (isSelected ? 'white' : 'gray') : 'gray'} dimColor={!r.enabled} bold={isSelected}>
                {r.time}
              </Text>
            </Box>
            <Box width={28}>
              <Text color={r.enabled ? (isSelected ? 'white' : 'gray') : 'gray'} dimColor={!r.enabled}>
                {r.title}
              </Text>
            </Box>
            <Text dimColor>{recurringLabel}</Text>
            {linkedTask && (
              <Text dimColor> {'→'} {linkedTask.text}</Text>
            )}
            {!r.enabled && <Text dimColor>  [off]</Text>}
          </Box>
        );
      })}

      {/* Input steps */}
      {step === 'time' && (
        <Box marginTop={1} flexDirection="column">
          <Text color="yellow">{compactTime ? 'Time (e.g. 930 or 2233):' : 'Time (HH:MM):'}</Text>
          <Box>
            <Text color="yellow">{'> '}</Text>
            <TextInput value={inputValue} onChange={setInputValue} onSubmit={handleTimeSubmit} placeholder={compactTime ? '930' : '09:30'} />
          </Box>
        </Box>
      )}
      {step === 'title' && (
        <Box marginTop={1} flexDirection="column">
          <Text color="yellow">Title (Enter to skip):</Text>
          <Box>
            <Text color="yellow">{'> '}</Text>
            <TextInput value={inputValue} onChange={setInputValue} onSubmit={handleTitleSubmit} placeholder="Meeting reminder..." />
          </Box>
        </Box>
      )}
      {step === 'task' && (
        <Box marginTop={1} flexDirection="column">
          <Text color="yellow">Link to task (Esc to cancel, Enter to confirm):</Text>
          <Box key="none">
            <Text color={taskIdx === 0 ? 'yellow' : 'gray'} bold={taskIdx === 0}>
              {taskIdx === 0 ? '> ' : '  '}None
            </Text>
          </Box>
          {tasks.map((t, i) => {
            const actualIdx = i + 1;
            return (
              <Box key={t.id}>
                <Text color={actualIdx === taskIdx ? 'yellow' : 'gray'} bold={actualIdx === taskIdx}>
                  {actualIdx === taskIdx ? '> ' : '  '}{t.text}
                </Text>
              </Box>
            );
          })}
        </Box>
      )}

      {error !== '' && (
        <Box marginTop={1}><Text color="red">{error}</Text></Box>
      )}
    </Box>
  );
}
