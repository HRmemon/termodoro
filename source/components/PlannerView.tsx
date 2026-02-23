import React, { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import type { SessionSequence } from '../types.js';
import { PRESET_SEQUENCES, parseSequenceString } from '../hooks/useSequence.js';
import { loadCustomSequences, addCustomSequence, deleteCustomSequence } from '../lib/sequences.js';

interface PlannerViewProps {
  activeSequence: SessionSequence | null;
  onActivateSequence: (seq: SessionSequence) => void;
  onClearSequence: () => void;
  setIsTyping: (v: boolean) => void;
}

type InputMode = 'none' | 'new-name' | 'new-blocks' | 'edit-blocks';

function formatBlocks(seq: SessionSequence): string {
  return seq.blocks.map(b => {
    const t = b.type === 'work' ? 'w' : 'b';
    return `${b.durationMinutes}${t}`;
  }).join(' ');
}

function totalMinutes(seq: SessionSequence): number {
  return seq.blocks.reduce((s, b) => s + b.durationMinutes, 0);
}

export function PlannerView({ activeSequence, onActivateSequence, onClearSequence, setIsTyping }: PlannerViewProps) {
  const presets = Object.values(PRESET_SEQUENCES);
  const [customs, setCustoms] = useState<SessionSequence[]>(loadCustomSequences);
  const all = [...presets, ...customs];

  const [selectedIdx, setSelectedIdx] = useState(0);
  const [inputMode, setInputMode] = useState<InputMode>('none');
  const [inputValue, setInputValue] = useState('');
  const [pendingName, setPendingName] = useState('');
  const [error, setError] = useState('');

  const refreshCustoms = useCallback(() => {
    setCustoms(loadCustomSequences());
  }, []);

  const isPreset = (idx: number) => idx < presets.length;

  useInput((input, key) => {
    if (inputMode !== 'none') {
      if (key.escape) {
        setInputMode('none');
        setIsTyping(false);
        setError('');
      }
      return;
    }

    if (input === 'j' || key.downArrow) {
      setSelectedIdx(i => Math.min(i + 1, all.length - 1));
      return;
    }
    if (input === 'k' || key.upArrow) {
      setSelectedIdx(i => Math.max(i - 1, 0));
      return;
    }

    if (key.return) {
      const seq = all[selectedIdx];
      if (seq) onActivateSequence(seq);
      return;
    }

    if (input === 'a') {
      setInputValue('');
      setPendingName('');
      setInputMode('new-name');
      setIsTyping(true);
      setError('');
      return;
    }

    if (input === 'e' && !isPreset(selectedIdx)) {
      const seq = all[selectedIdx];
      if (seq) {
        setInputValue(formatBlocks(seq));
        setInputMode('edit-blocks');
        setIsTyping(true);
        setError('');
      }
      return;
    }

    if (input === 'd' && !isPreset(selectedIdx)) {
      const seq = all[selectedIdx];
      if (seq) {
        deleteCustomSequence(seq.name);
        refreshCustoms();
        setSelectedIdx(i => Math.max(0, i - 1));
      }
      return;
    }

    if (input === 'c' && activeSequence) {
      onClearSequence();
      return;
    }
  });

  const handleNameSubmit = useCallback((value: string) => {
    const name = value.trim();
    if (!name) { setError('Name cannot be empty'); return; }
    if (PRESET_SEQUENCES[name]) { setError('Cannot shadow a preset name'); return; }
    setPendingName(name);
    setInputValue('');
    setInputMode('new-blocks');
  }, []);

  const handleBlocksSubmit = useCallback((value: string) => {
    const seq = parseSequenceString(value.trim());
    if (!seq) { setError('Invalid format. Use: 45w 15b 45w'); return; }

    if (inputMode === 'new-blocks') {
      seq.name = pendingName;
      addCustomSequence(seq);
    } else if (inputMode === 'edit-blocks') {
      const existing = all[selectedIdx];
      if (existing) {
        seq.name = existing.name;
        addCustomSequence(seq);
      }
    }

    refreshCustoms();
    setInputMode('none');
    setIsTyping(false);
    setError('');
  }, [inputMode, pendingName, selectedIdx, all, refreshCustoms, setIsTyping]);

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box marginBottom={1}>
        <Text dimColor>Presets</Text>
      </Box>
      {presets.map((seq, i) => {
        const isSelected = i === selectedIdx;
        const isActive = activeSequence?.name === seq.name;
        return (
          <Box key={seq.name}>
            <Text color={isSelected ? 'yellow' : 'gray'} bold={isSelected}>{isSelected ? '> ' : '  '}</Text>
            <Box width={14}><Text color={isSelected ? 'white' : 'gray'} bold={isSelected}>{seq.name}</Text></Box>
            <Box width={36}><Text dimColor>{formatBlocks(seq)}</Text></Box>
            <Text dimColor>{totalMinutes(seq)}m</Text>
            {isActive && <Text color="green" bold>  [ACTIVE]</Text>}
          </Box>
        );
      })}

      <Box marginTop={1} marginBottom={1}>
        <Text dimColor>Custom</Text>
        {customs.length === 0 && <Text dimColor italic>  (none — a to create)</Text>}
      </Box>
      {customs.map((seq, i) => {
        const idx = presets.length + i;
        const isSelected = idx === selectedIdx;
        const isActive = activeSequence?.name === seq.name;
        return (
          <Box key={seq.name}>
            <Text color={isSelected ? 'yellow' : 'gray'} bold={isSelected}>{isSelected ? '> ' : '  '}</Text>
            <Box width={14}><Text color={isSelected ? 'white' : 'gray'} bold={isSelected}>{seq.name}</Text></Box>
            <Box width={36}><Text dimColor>{formatBlocks(seq)}</Text></Box>
            <Text dimColor>{totalMinutes(seq)}m</Text>
            {isActive && <Text color="green" bold>  [ACTIVE]</Text>}
          </Box>
        );
      })}

      {inputMode === 'new-name' && (
        <Box marginTop={1} flexDirection="column">
          <Text color="yellow">Sequence name:</Text>
          <Box>
            <Text color="yellow">{'> '}</Text>
            <TextInput value={inputValue} onChange={setInputValue} onSubmit={handleNameSubmit} placeholder="my-flow" />
          </Box>
        </Box>
      )}
      {inputMode === 'new-blocks' && (
        <Box marginTop={1} flexDirection="column">
          <Text color="yellow">Blocks for "{pendingName}" (e.g. 45w 15b 45w):</Text>
          <Box>
            <Text color="yellow">{'> '}</Text>
            <TextInput value={inputValue} onChange={setInputValue} onSubmit={handleBlocksSubmit} placeholder="25w 5b 25w 5b" />
          </Box>
        </Box>
      )}
      {inputMode === 'edit-blocks' && (
        <Box marginTop={1} flexDirection="column">
          <Text color="yellow">Edit blocks:</Text>
          <Box>
            <Text color="yellow">{'> '}</Text>
            <TextInput value={inputValue} onChange={setInputValue} onSubmit={handleBlocksSubmit} />
          </Box>
        </Box>
      )}

      {error !== '' && (
        <Box marginTop={1}><Text color="red">{error}</Text></Box>
      )}

      {activeSequence && (
        <Box marginTop={1}>
          <Text dimColor>Active: </Text>
          <Text color="green">{activeSequence.name}</Text>
          <Text dimColor>  c: clear</Text>
        </Box>
      )}
    </Box>
  );
}
