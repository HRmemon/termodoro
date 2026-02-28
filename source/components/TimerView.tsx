import { useState, useCallback, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import type { SessionType, SequenceBlock, SessionSequence } from '../types.js';
import { BigTimer } from './BigTimer.js';
import { useProjectAutocomplete } from '../hooks/useProjectAutocomplete.js';
import { colors } from '../lib/theme.js';
import { type Keymap, kmMatches } from '../lib/keymap.js';
import { ModePickerOverlay } from './timer/ModePickerOverlay.js';
import { SequencePickerOverlay } from './timer/SequencePickerOverlay.js';

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
  currentProject?: string;
  onSetProject: (project: string) => void;
  sequences: SessionSequence[];
  activeSequence: SessionSequence | null;
  onActivateSequence: (seq: SessionSequence) => void;
  onClearSequence: () => void;
  onEditSequences: () => void;
  timerMode: 'countdown' | 'stopwatch';
  stopwatchElapsed: number;
  onSwitchToStopwatch: () => void;
  onStopStopwatch: () => void;
  keymap?: Keymap;
}

export function TimerView({
  secondsLeft, totalSeconds, sessionType, isPaused, isRunning,
  sessionNumber, totalWorkSessions,
  sequenceBlocks, currentBlockIndex,
  setIsTyping,
  timerFormat,
  onSetCustomDuration,
  currentProject,
  onSetProject,
  sequences,
  activeSequence,
  onActivateSequence,
  onClearSequence,
  onEditSequences,
  timerMode,
  stopwatchElapsed,
  onSwitchToStopwatch,
  onStopStopwatch,
  keymap,
}: TimerViewProps) {
  const [isSettingDuration, setIsSettingDuration] = useState(false);
  const [durationInput, setDurationInput] = useState('');
  const [showProjectInput, setShowProjectInput] = useState(false);
  const [projectInput, setProjectInput] = useState('');
  const [projectInputKey, setProjectInputKey] = useState(0);
  const [showSeqPicker, setShowSeqPicker] = useState(false);
  const [showModePicker, setShowModePicker] = useState(false);

  const { projectMenu, suggestionIdx, navigateUp, navigateDown, selectedProject } = useProjectAutocomplete({
    input: projectInput,
    enabled: showProjectInput,
    refreshDeps: [showProjectInput],
  });

  const acceptSuggestion = useCallback(() => {
    if (!selectedProject) return;
    setProjectInput(selectedProject);
    setProjectInputKey(k => k + 1);
  }, [selectedProject]);

  const handleDurationSubmit = useCallback((value: string) => {
    const mins = parseInt(value, 10);
    if (!isNaN(mins) && mins > 0) {
      onSetCustomDuration(mins);
    }
    setIsSettingDuration(false);
    setIsTyping(false);
    setDurationInput('');
  }, [onSetCustomDuration, setIsTyping]);

  const projectHandledRef = useRef(false);

  const handleProjectSubmit = useCallback((value: string) => {
    if (projectHandledRef.current) {
      projectHandledRef.current = false;
      return;
    }
    const trimmed = value.trim();
    onSetProject(trimmed);
    setShowProjectInput(false);
    setIsTyping(false);
    setProjectInput('');
  }, [onSetProject, setIsTyping]);

  useInput((_input, key) => {
    const input = _input;

    if (showProjectInput) {
      if (key.escape) {
        setShowProjectInput(false);
        setIsTyping(false);
        return;
      }
      if (projectMenu && projectInput) {
        if (key.downArrow) {
          navigateDown();
          return;
        }
        if (key.upArrow) {
          navigateUp();
          return;
        }
        if (key.tab) {
          acceptSuggestion();
          return;
        }
        if (key.return) {
          if (selectedProject) {
            onSetProject(selectedProject);
          }
          projectHandledRef.current = true;
          setShowProjectInput(false);
          setIsTyping(false);
          setProjectInput('');
          return;
        }
      }
      return;
    }

    if (isSettingDuration && key.escape) {
      setIsSettingDuration(false);
      setIsTyping(false);
      return;
    }
    if (isSettingDuration) return;

    // Don't handle input while overlays are open (they handle their own)
    if (showModePicker || showSeqPicker) return;

    const km = keymap;

    if (kmMatches(km, 'timer.set_duration', input, key) && timerMode !== 'stopwatch') {
      setIsSettingDuration(true);
      setIsTyping(true);
      setDurationInput('');
      return;
    }

    if (kmMatches(km, 'timer.set_project', input, key)) {
      setShowProjectInput(true);
      setIsTyping(true);
      setProjectInput(currentProject ?? '');
      setProjectInputKey(k => k + 1);
      return;
    }

    if (kmMatches(km, 'timer.clear_project', input, key) && currentProject) {
      onSetProject('');
      return;
    }

    if (kmMatches(km, 'timer.sequences', input, key)) {
      setShowSeqPicker(true);
      return;
    }

    if (input === 'm') {
      setShowModePicker(true);
      setIsTyping(true);
      return;
    }
  });

  if (showModePicker) {
    return (
      <ModePickerOverlay
        timerMode={timerMode}
        onSwitchToStopwatch={onSwitchToStopwatch}
        onStopStopwatch={onStopStopwatch}
        onClose={() => { setShowModePicker(false); setIsTyping(false); }}
      />
    );
  }

  if (showSeqPicker) {
    return (
      <SequencePickerOverlay
        sequences={sequences}
        activeSequence={activeSequence}
        onSelect={onActivateSequence}
        onClear={onClearSequence}
        onEditSequences={onEditSequences}
        onClose={() => setShowSeqPicker(false)}
        keymap={keymap}
      />
    );
  }

  return (
    <Box flexDirection="column" flexGrow={1}>
      {/* Session info */}
      <Box marginBottom={1}>
        <Text dimColor>Session </Text>
        <Text bold>{sessionNumber}</Text>
        <Text dimColor> | Work sessions: </Text>
        <Text>{totalWorkSessions}</Text>
        {currentProject && (
          <>
            <Text dimColor>  </Text>
            <Text color={colors.focus} bold>#{currentProject}</Text>
          </>
        )}
      </Box>

      {/* Sequence progress */}
      {sequenceBlocks && sequenceBlocks.length > 0 && (
        <Box marginBottom={1} flexWrap="wrap">
          {sequenceBlocks.map((block, i) => {
            const isCurrent = i === currentBlockIndex;
            const isDone = i < (currentBlockIndex ?? 0);
            const blockColor = block.type === 'work' ? colors.focus : colors.break;
            const label = `${block.durationMinutes}m ${block.type === 'work' ? 'W' : 'B'}`;
            return (
              <Box key={i} marginRight={1}>
                <Text
                  color={isCurrent ? colors.highlight : isDone ? blockColor : colors.dim}
                  bold={isCurrent}
                >
                  {isDone ? '[x]' : isCurrent ? '[>]' : '[ ]'} {label}
                </Text>
                {i < sequenceBlocks.length - 1 && <Text color={colors.dim}> → </Text>}
              </Box>
            );
          })}
        </Box>
      )}

      {/* Duration input */}
      {isSettingDuration && (
        <Box marginBottom={1}>
          <Text color={colors.highlight}>Duration (min): </Text>
          <TextInput value={durationInput} onChange={setDurationInput} onSubmit={handleDurationSubmit} placeholder="45" />
        </Box>
      )}

      {/* Project input with dropdown autocomplete */}
      {showProjectInput && (
        <Box marginBottom={1} flexDirection="column">
          <Box>
            <Text color={colors.highlight}>Project: </Text>
            <TextInput key={projectInputKey} value={projectInput} onChange={setProjectInput} onSubmit={handleProjectSubmit} placeholder="project-name" />
          </Box>
          {projectMenu && (
            <Box flexDirection="column" marginLeft={2}>
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
              <Text dimColor>  Tab:fill  ↑↓:navigate</Text>
            </Box>
          )}
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
        timerMode={timerMode}
        stopwatchElapsed={stopwatchElapsed}
      />
    </Box>
  );
}
