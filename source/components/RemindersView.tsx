import { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { nanoid } from 'nanoid';
import type { ScheduledNotification, Task } from '../types.js';
import { loadReminders, addReminder, deleteReminder, updateReminder } from '../lib/reminders.js';
import { loadTasks } from '../lib/tasks.js';

interface RemindersViewProps {
  setIsTyping: (v: boolean) => void;
}

type InputStep = 'none' | 'time' | 'title' | 'task';

export function RemindersView({ setIsTyping }: RemindersViewProps) {
  const [reminders, setReminders] = useState<ScheduledNotification[]>(loadReminders);
  const [tasks] = useState<Task[]>(() => loadTasks().filter(t => !t.completed));
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [step, setStep] = useState<InputStep>('none');
  const [inputValue, setInputValue] = useState('');
  const [pendingTime, setPendingTime] = useState('');
  const [pendingTitle, setPendingTitle] = useState('');
  const [error, setError] = useState('');
  const [taskIdx, setTaskIdx] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);

  const refresh = useCallback(() => setReminders(loadReminders()), []);

  useInput((input, key) => {
    if (step === 'task') {
      if (key.escape) {
        // Skip task linking, save reminder without task
        finalizeReminder(null);
        return;
      }
      if (key.return) {
        const t = tasks[taskIdx];
        finalizeReminder(t?.id ?? null);
        return;
      }
      if (input === 'j' || key.downArrow) {
        setTaskIdx(i => Math.min(i + 1, tasks.length - 1));
      }
      if (input === 'k' || key.upArrow) {
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

    if (input === 'j' || key.downArrow) {
      setSelectedIdx(i => Math.min(i + 1, reminders.length - 1));
      return;
    }
    if (input === 'k' || key.upArrow) {
      setSelectedIdx(i => Math.max(i - 1, 0));
      return;
    }

    if (input === 'a') {
      setEditingId(null);
      setInputValue('');
      setPendingTime('');
      setPendingTitle('');
      setStep('time');
      setIsTyping(true);
      setError('');
      return;
    }

    if (input === 'e' && reminders.length > 0) {
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

    if (input === 'd' && reminders.length > 0) {
      const r = reminders[selectedIdx];
      if (r) {
        deleteReminder(r.id);
        refresh();
        setSelectedIdx(i => Math.max(0, i - 1));
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

  const finalizeReminder = useCallback((linkedTaskId: string | null) => {
    if (editingId) {
      updateReminder(editingId, { time: pendingTime, title: pendingTitle, taskId: linkedTaskId ?? undefined });
    } else {
      addReminder({
        id: nanoid(),
        time: pendingTime,
        title: pendingTitle || pendingTime,
        taskId: linkedTaskId ?? undefined,
        enabled: true,
      });
    }
    refresh();
    setStep('none');
    setIsTyping(false);
    setError('');
    setTaskIdx(0);
  }, [editingId, pendingTime, pendingTitle, refresh, setIsTyping]);

  const handleTimeSubmit = useCallback((value: string) => {
    const trimmed = value.trim();
    if (!/^\d{2}:\d{2}$/.test(trimmed)) {
      setError('Invalid time. Use HH:MM (e.g. 09:30)');
      return;
    }
    setPendingTime(trimmed);
    setInputValue(editingId ? pendingTitle : '');
    setStep('title');
    setError('');
  }, [editingId, pendingTitle]);

  const handleTitleSubmit = useCallback((value: string) => {
    setPendingTitle(value.trim() || pendingTime);
    setInputValue('');
    if (tasks.length > 0) {
      setStep('task');
    } else {
      finalizeReminder(null);
    }
  }, [pendingTime, tasks.length, finalizeReminder]);

  return (
    <Box flexDirection="column" flexGrow={1}>
      {reminders.length === 0 && step === 'none' && (
        <Text dimColor>No reminders. Press 'a' to add one.</Text>
      )}

      {reminders.map((r, i) => {
        const isSelected = i === selectedIdx;
        const linkedTask = tasks.find(t => t.id === r.taskId);
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
            {linkedTask && (
              <Text dimColor>→ {linkedTask.text}</Text>
            )}
            {!r.enabled && <Text dimColor>  [off]</Text>}
          </Box>
        );
      })}

      {/* Input steps */}
      {step === 'time' && (
        <Box marginTop={1} flexDirection="column">
          <Text color="yellow">Time (HH:MM):</Text>
          <Box>
            <Text color="yellow">{'> '}</Text>
            <TextInput value={inputValue} onChange={setInputValue} onSubmit={handleTimeSubmit} placeholder="09:30" />
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
          <Text color="yellow">Link to task (Esc to skip, Enter to confirm):</Text>
          {tasks.map((t, i) => (
            <Box key={t.id}>
              <Text color={i === taskIdx ? 'yellow' : 'gray'} bold={i === taskIdx}>
                {i === taskIdx ? '> ' : '  '}{t.text}
              </Text>
            </Box>
          ))}
        </Box>
      )}

      {error !== '' && (
        <Box marginTop={1}><Text color="red">{error}</Text></Box>
      )}
    </Box>
  );
}
