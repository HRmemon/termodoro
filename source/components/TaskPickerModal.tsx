import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { Modal } from './Modal.js';
import { loadTasks, addTask, updateTask, parseTaskInput, getProjects } from '../lib/tasks.js';
import { getConsecutiveDates, getTodayStr } from '../lib/date-utils.js';
import { parseTimeInput } from '../lib/format.js';
import { useProjectAutocomplete } from '../hooks/useProjectAutocomplete.js';
import type { Task } from '../types.js';

interface TaskPickerModalProps {
  onDismiss: () => void;
  onComplete: () => void;
  compactTime: boolean;
  initialDate?: string;
  initialMode: 'select' | 'text';
  setIsTyping: (v: boolean) => void;
}

type Step = 'select' | 'text' | 'date' | 'time' | 'desc';

export function TaskPickerModal({ onDismiss, onComplete, compactTime, initialDate, initialMode, setIsTyping }: TaskPickerModalProps) {
  const [step, setStep] = useState<Step>(initialMode);
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [textInput, setTextInput] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);

  // Form State
  const [pendingTask, setPendingTask] = useState<Task | { text: string; project?: string } | null>(null);
  const [dateValue, setDateValue] = useState(initialDate || getTodayStr());
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [desc, setDesc] = useState('');

  useEffect(() => {
    // Determine if typing mode based on step and searching status
    const isTyping = step !== 'select' || isSearching;
    setIsTyping(isTyping);
  }, [step, isSearching, setIsTyping]);

  // Step: select
  const allTasks = useMemo(() => loadTasks().filter(t => !t.completed), []);
  const filteredTasks = useMemo(() => {
    if (!isSearching || !searchQuery) return allTasks;
    return allTasks.filter(t => t.text.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [allTasks, isSearching, searchQuery]);

  // Autocomplete for 'text' step
  const { projectMenu, suggestionIdx, navigateUp: navProjUp, navigateDown: navProjDown, selectedProject } = useProjectAutocomplete({
    input: textInput,
    enabled: step === 'text',
    hashAnchor: true,
  });

  const dateHints = useMemo(() => getConsecutiveDates(dateValue, 10), [dateValue]);

  const handleNext = useCallback(() => {
    if (step === 'select') {
      const selection = filteredTasks[selectedIdx];
      if (selection) {
        setPendingTask(selection);
        if (selection.time) setStartTime(selection.time);
        if (selection.endTime) setEndTime(selection.endTime);
        if (selection.date) setDateValue(selection.date);
        if (selection.description) setDesc(selection.description);
        setStep('date');
        setSelectedIdx(0);
      }
    } else if (step === 'text') {
      if (!textInput.trim()) return;
      const parsed = parseTaskInput(textInput);
      setPendingTask({ text: parsed.text, project: parsed.project });
      if (parsed.time) setStartTime(parsed.time);
      if (parsed.endTime) setEndTime(parsed.endTime);
      if (parsed.date) setDateValue(parsed.date);
      setStep('date');
      setSelectedIdx(0);
    } else if (step === 'date') {
      // If dateValue is empty but hints exist, we can pick the highlighted hint
      // But typically user just confirms what's in the input.
      setStep('time');
    } else if (step === 'time') {
      setStep('desc');
    } else if (step === 'desc') {
      if (pendingTask) {
        const finalStart = parseTimeInput(startTime, compactTime) || undefined;
        const finalEnd = parseTimeInput(endTime, compactTime) || undefined;
        
        if ('id' in pendingTask) {
          updateTask(pendingTask.id, {
            date: dateValue,
            time: finalStart,
            endTime: finalEnd,
            description: desc || undefined
          });
        } else {
          addTask(pendingTask.text, pendingTask.project, desc || undefined, dateValue, finalStart, finalEnd);
        }
      }
      onComplete();
    }
  }, [step, filteredTasks, selectedIdx, textInput, dateValue, startTime, endTime, desc, pendingTask, compactTime, onComplete]);

  useInput((input, key) => {
    if (key.escape) {
      if (isSearching) {
        setIsSearching(false);
        setSearchQuery('');
        return;
      }
      onDismiss();
      return;
    }

    if (key.return) {
      // If project menu is open, it consumes Enter to autocomplete
      if (step === 'text' && projectMenu && selectedProject) {
        const hashIdx = textInput.lastIndexOf('#');
        setTextInput(textInput.slice(0, hashIdx + 1) + selectedProject + ' ');
        return;
      }
      // If searching in select mode, Enter just stops searching and focuses the item?
      // No, let's say Enter in search confirms the search and focuses the top item.
      if (step === 'select' && isSearching) {
        setIsSearching(false);
        setSelectedIdx(0);
        return;
      }
      handleNext();
      return;
    }

    // Modal navigation
    const isTyping = step !== 'select' || isSearching;
    const isNav = (isTyping && (key.ctrl && (input === 'j' || input === 'k'))) || key.upArrow || key.downArrow || (!isTyping && (input === 'j' || input === 'k'));

    if (isNav) {
      const dir = (key.downArrow || (key.ctrl && input === 'j') || (!isTyping && input === 'j')) ? 1 : -1;
      
      if (step === 'text' && projectMenu) {
        if (dir === 1) navProjDown(); else navProjUp();
        return;
      }

      const max = step === 'select' ? filteredTasks.length : step === 'date' ? dateHints.length : 0;
      if (max > 0) {
        setSelectedIdx(i => Math.max(0, Math.min(max - 1, i + dir)));
      }
      return;
    }

    if (step === 'select' && !isSearching) {
      if (input === '/') {
        setIsSearching(true);
        setSearchQuery('');
        return;
      }
      if (input === 'a') {
        setStep('text');
        setTextInput('');
        return;
      }
    }
    
    if (step === 'text' && key.tab && projectMenu && selectedProject) {
      const hashIdx = textInput.lastIndexOf('#');
      setTextInput(textInput.slice(0, hashIdx + 1) + selectedProject + ' ');
      return;
    }
  });

  const renderSelect = () => (
    <Box flexDirection="column">
      {isSearching && (
        <Box marginBottom={1}>
          <Text color="yellow">Search: </Text>
          <TextInput value={searchQuery} onChange={setSearchQuery} placeholder="Filter tasks..." />
        </Box>
      )}
      <Box flexDirection="column">
        {filteredTasks.length === 0 ? (
          <Text dimColor>No tasks found.</Text>
        ) : (
          filteredTasks.slice(0, 10).map((t, i) => (
            <Box key={t.id}>
              <Text color={i === selectedIdx ? 'cyan' : 'gray'}>
                {i === selectedIdx ? '> ' : '  '}
              </Text>
              <Text bold={i === selectedIdx}>{t.text}</Text>
              {t.project && <Text color="cyan"> #{t.project}</Text>}
            </Box>
          ))
        )}
      </Box>
    </Box>
  );

  const renderText = () => (
    <Box flexDirection="column">
      <Box>
        <Text color="yellow">Task: </Text>
        <TextInput value={textInput} onChange={setTextInput} placeholder="Task name #project" />
      </Box>
      {projectMenu && (
        <Box flexDirection="column" marginLeft={2} marginTop={1}>
          <Text color="cyan" bold>Projects:</Text>
          {projectMenu.matches.map((p, i) => (
            <Text key={p} color={i === suggestionIdx ? 'yellow' : 'gray'}>
              {i === suggestionIdx ? '> ' : '  '}#{p}
            </Text>
          ))}
        </Box>
      )}
    </Box>
  );

  const renderDatePicker = () => (
    <Box flexDirection="column">
      <Box>
        <Text color="yellow">Date: </Text>
        <TextInput value={dateValue} onChange={(v) => { setDateValue(v); setSelectedIdx(0); }} placeholder="YYYY-MM-DD" />
      </Box>
      <Box flexDirection="column" marginTop={1}>
        {dateHints.map((hint, i) => (
          <Box key={hint.date}>
            <Text color={i === selectedIdx ? 'cyan' : 'gray'}>
              {i === selectedIdx ? '● ' : '  '}
            </Text>
            <Text color={i === selectedIdx ? 'white' : 'gray'}>{hint.date} ({hint.label})</Text>
          </Box>
        ))}
      </Box>
    </Box>
  );

  const renderTimePicker = () => (
    <Box flexDirection="column">
      <Box>
        <Text color="yellow">Start Time: </Text>
        <TextInput value={startTime} onChange={setStartTime} placeholder="e.g. 2pm, 14:30" />
      </Box>
      <Box marginTop={1}>
        <Text color="yellow">End Time:   </Text>
        <TextInput value={endTime} onChange={setEndTime} placeholder="Optional" />
      </Box>
      <Box marginTop={1}>
        <Text dimColor>Format: 2pm, 14:30, 0900</Text>
      </Box>
    </Box>
  );

  const renderDescPicker = () => (
    <Box flexDirection="column">
      <Box>
        <Text color="yellow">Description: </Text>
        <TextInput value={desc} onChange={setDesc} placeholder="Optional details..." />
      </Box>
    </Box>
  );

  const stepMeta = {
    select: { current: 1, total: 4, title: 'Attach Task to Plan', footer: 'j/k: move  /: search  a: add new  Enter: select' },
    text: { current: 1, total: 4, title: 'Create New Task', footer: 'Enter: next  Tab: select project  Esc: cancel' },
    date: { current: 2, total: 4, title: 'Set Date', footer: 'Ctrl+j/k: hints  Enter: next  Esc: cancel' },
    time: { current: 3, total: 4, title: 'Set Time', footer: 'Enter: next  Esc: cancel' },
    desc: { current: 4, total: 4, title: 'Add Description', footer: 'Enter: finish  Esc: cancel' },
  }[step];

  return (
    <Modal
      title={stepMeta.title}
      step={{ current: stepMeta.current, total: stepMeta.total }}
      footer={stepMeta.footer}
    >
      {step === 'select' && renderSelect()}
      {step === 'text' && renderText()}
      {step === 'date' && renderDatePicker()}
      {step === 'time' && renderTimePicker()}
      {step === 'desc' && renderDescPicker()}
    </Modal>
  );
}
