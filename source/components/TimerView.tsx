import { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import type { Task, SessionType, SequenceBlock } from '../types.js';
import { BigTimer } from './BigTimer.js';
import { loadTasks, completeTask, setActiveTask } from '../lib/tasks.js';

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
  timerFormat?: 'mm:ss' | 'hh:mm:ss' | 'minutes';
  onSetCustomDuration: (minutes: number) => void;
}

export function TimerView({
  secondsLeft, totalSeconds, sessionType, isPaused, isRunning,
  sessionNumber, totalWorkSessions,
  sequenceBlocks, currentBlockIndex,
  setIsTyping,
  timerFormat,
  onSetCustomDuration,
}: TimerViewProps) {
  const [tasks, setTasks] = useState<Task[]>(loadTasks);
  const [selectedTask, setSelectedTask] = useState(0);
  const [isSettingDuration, setIsSettingDuration] = useState(false);
  const [durationInput, setDurationInput] = useState('');

  const activeTasks = tasks.filter(t => t.active && !t.completed);

  const refreshTasks = useCallback(() => {
    setTasks(loadTasks());
  }, []);

  const handleDurationSubmit = useCallback((value: string) => {
    const mins = parseInt(value, 10);
    if (!isNaN(mins) && mins > 0) {
      onSetCustomDuration(mins);
    }
    setIsSettingDuration(false);
    setIsTyping(false);
    setDurationInput('');
  }, [onSetCustomDuration, setIsTyping]);

  useInput((_input, key) => {
    const input = _input;

    // Escape guard for duration input
    if (isSettingDuration && key.escape) {
      setIsSettingDuration(false);
      setIsTyping(false);
      return;
    }
    if (isSettingDuration) return;

    if (input === 't') {
      setIsSettingDuration(true);
      setIsTyping(true);
      setDurationInput('');
      return;
    }

    if (input === 'j' || key.downArrow) {
      setSelectedTask(prev => Math.min(prev + 1, activeTasks.length - 1));
      return;
    }
    if (input === 'k' || key.upArrow) {
      setSelectedTask(prev => Math.max(prev - 1, 0));
      return;
    }
    if (key.return && activeTasks.length > 0) {
      const task = activeTasks[selectedTask];
      if (task) {
        setActiveTask(null); // deactivate all
        refreshTasks();
        setSelectedTask(0);
      }
      return;
    }
    if (input === 'x' && activeTasks.length > 0) {
      const task = activeTasks[selectedTask];
      if (task) {
        completeTask(task.id);
        refreshTasks();
        setSelectedTask(prev => Math.max(0, Math.min(prev, activeTasks.length - 2)));
      }
      return;
    }
  });

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
                {i < sequenceBlocks.length - 1 && <Text dimColor> {'->'} </Text>}
              </Box>
            );
          })}
        </Box>
      )}

      {/* Duration input */}
      {isSettingDuration && (
        <Box marginBottom={1}>
          <Text color="yellow">Duration (min): </Text>
          <TextInput value={durationInput} onChange={setDurationInput} onSubmit={handleDurationSubmit} placeholder="45" />
        </Box>
      )}

      {/* Active tasks */}
      {activeTasks.length > 0 && (
        <Box marginBottom={1} flexDirection="column">
          {activeTasks.map((task, i) => {
            const isSelected = i === selectedTask;
            return (
              <Box key={task.id}>
                <Text color={isSelected ? 'yellow' : 'green'} bold>{'▶ '}</Text>
                <Text color={isSelected ? 'white' : 'gray'} bold={isSelected}>{task.text}</Text>
                <Text dimColor>{'  '}[{task.completedPomodoros}/{task.expectedPomodoros}]</Text>
              </Box>
            );
          })}
        </Box>
      )}
      {activeTasks.length === 0 && (
        <Box marginBottom={1}>
          <Text dimColor>No active task. Go to </Text>
          <Text color="yellow">[2] Tasks</Text>
          <Text dimColor> to activate one.</Text>
        </Box>
      )}

      {/* Big timer */}
      <BigTimer
        secondsLeft={secondsLeft}
        totalSeconds={totalSeconds}
        sessionType={sessionType}
        isPaused={isPaused}
        isRunning={isRunning}
        timerFormat={timerFormat}
      />
    </Box>
  );
}
