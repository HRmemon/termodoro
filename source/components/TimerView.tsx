import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import type { SessionType, SequenceBlock, SessionSequence } from '../types.js';
import { BigTimer } from './BigTimer.js';
import { getProjects } from '../lib/tasks.js';
import { colors } from '../lib/theme.js';

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
}: TimerViewProps) {
  const [isSettingDuration, setIsSettingDuration] = useState(false);
  const [durationInput, setDurationInput] = useState('');
  const [showProjectInput, setShowProjectInput] = useState(false);
  const [projectInput, setProjectInput] = useState('');
  const [projectInputKey, setProjectInputKey] = useState(0);
  const [suggestionIdx, setSuggestionIdx] = useState(0);
  const [showSeqPicker, setShowSeqPicker] = useState(false);
  const [seqCursor, setSeqCursor] = useState(0);

  const allProjects = useMemo(() => getProjects(), [showProjectInput]);

  // Compute filtered project menu based on current input
  const projectMenu = useMemo(() => {
    if (!showProjectInput) return null;
    const partial = projectInput.toLowerCase();
    if (!partial) return allProjects.length > 0 ? { matches: allProjects } : null;
    const matches = allProjects.filter(p => p.toLowerCase().includes(partial));
    if (matches.length === 0) return null;
    // Don't show menu if exact match is the only result
    if (matches.length === 1 && matches[0]!.toLowerCase() === partial) return null;
    return { matches };
  }, [showProjectInput, projectInput, allProjects]);

  // Reset suggestion index when menu changes
  useEffect(() => {
    setSuggestionIdx(0);
  }, [projectMenu?.matches.length, projectInput]);

  // Accept the currently highlighted suggestion
  const acceptSuggestion = useCallback(() => {
    if (!projectMenu) return;
    const chosen = projectMenu.matches[suggestionIdx];
    if (!chosen) return;
    setProjectInput(chosen);
    setProjectInputKey(k => k + 1);
  }, [projectMenu, suggestionIdx]);

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
    // Skip if useInput already handled this Enter via the menu
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

    // Project input: arrow keys navigate menu, Tab accepts, Enter selects & submits
    if (showProjectInput) {
      if (key.escape) {
        setShowProjectInput(false);
        setIsTyping(false);
        return;
      }
      if (projectMenu && projectInput) {
        if (key.downArrow) {
          setSuggestionIdx(i => Math.min(i + 1, projectMenu.matches.length - 1));
          return;
        }
        if (key.upArrow) {
          setSuggestionIdx(i => Math.max(0, i - 1));
          return;
        }
        if (key.tab) {
          acceptSuggestion();
          return;
        }
        if (key.return) {
          // Select the highlighted suggestion and submit immediately
          const chosen = projectMenu.matches[suggestionIdx];
          if (chosen) {
            onSetProject(chosen);
          }
          projectHandledRef.current = true;
          setShowProjectInput(false);
          setIsTyping(false);
          setProjectInput('');
          return;
        }
      }
      return; // TextInput handles the rest (including Enter when no menu/empty input)
    }

    // Escape guard for duration input
    if (isSettingDuration && key.escape) {
      setIsSettingDuration(false);
      setIsTyping(false);
      return;
    }
    if (isSettingDuration) return;

    // Sequence picker input handling
    if (showSeqPicker) {
      if (key.escape || input === 'q') {
        setShowSeqPicker(false);
        return;
      }
      if (input === 'j' || key.downArrow) {
        setSeqCursor(prev => Math.min(prev + 1, sequences.length - 1));
        return;
      }
      if (input === 'k' || key.upArrow) {
        setSeqCursor(prev => Math.max(prev - 1, 0));
        return;
      }
      if (key.return && sequences.length > 0) {
        const selected = sequences[seqCursor];
        if (selected) {
          if (activeSequence && activeSequence.name === selected.name) {
            onClearSequence();
          } else {
            onActivateSequence(selected);
          }
        }
        setShowSeqPicker(false);
        return;
      }
      return;
    }

    if (input === 't') {
      setIsSettingDuration(true);
      setIsTyping(true);
      setDurationInput('');
      return;
    }

    if (input === 'p') {
      setShowProjectInput(true);
      setIsTyping(true);
      setProjectInput(currentProject ?? '');
      setProjectInputKey(k => k + 1);
      return;
    }

    if (input === 'P' && currentProject) {
      onSetProject('');
      return;
    }

    if (input === 'S') {
      setShowSeqPicker(true);
      setSeqCursor(0);
      return;
    }
  });

  // Sequence picker overlay
  if (showSeqPicker) {
    return (
      <Box flexDirection="column" flexGrow={1}>
        <Box borderStyle="round" borderColor={colors.highlight} flexDirection="column" paddingX={1}>
          <Box marginBottom={1}>
            <Text bold color={colors.highlight}>Select Sequence</Text>
            <Text dimColor>  (j/k navigate, Enter select, Esc close)</Text>
          </Box>
          {sequences.map((seq, i) => {
            const isCursor = i === seqCursor;
            const isActive = activeSequence?.name === seq.name;
            const summary = seq.blocks.map(b => `${b.durationMinutes}${b.type === 'work' ? 'w' : 'b'}`).join(' ');
            return (
              <Box key={seq.name}>
                <Text color={isCursor ? colors.highlight : colors.text} bold={isCursor}>
                  {isCursor ? '> ' : '  '}{seq.name}
                </Text>
                <Text dimColor>  {summary}</Text>
                {isActive && <Text color={colors.focus} bold>  [ACTIVE]</Text>}
              </Box>
            );
          })}
          {sequences.length === 0 && <Text dimColor>No sequences available.</Text>}
        </Box>
      </Box>
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
      />
    </Box>
  );
}
