import { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import { FilterInput } from './FilterInput.js';
import type { SessionSequence } from '../types.js';
import { parseSequenceString } from '../hooks/useSequence.js';
import { loadSequences, saveSequence, deleteSequence, importDefaultSequences } from '../lib/sequences.js';
import { colors } from '../lib/theme.js';

interface PlannerViewProps {
  activeSequence: SessionSequence | null;
  onActivateSequence: (seq: SessionSequence) => void;
  onClearSequence: () => void;
  setIsTyping: (v: boolean) => void;
}

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
  const [sequences, setSequences] = useState<SessionSequence[]>(() => loadSequences());
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [editing, setEditing] = useState<'add' | 'edit' | null>(null);
  const [editStep, setEditStep] = useState<'name' | 'blocks'>('name');
  const [editName, setEditName] = useState('');
  const [editBlocks, setEditBlocks] = useState('');
  const [error, setError] = useState('');

  const refresh = useCallback(() => {
    setSequences(loadSequences());
  }, []);

  const handleNameSubmit = useCallback((value: string) => {
    const name = value.trim();
    if (!name) { setError('Name cannot be empty'); return; }
    setEditName(name);
    setEditStep('blocks');
    setEditBlocks('');
    setError('');
  }, []);

  const handleBlocksSubmit = useCallback((value: string) => {
    const seq = parseSequenceString(value.trim());
    if (!seq) { setError('Invalid format. Use: 45w 15b 45w'); return; }

    if (editing === 'add') {
      seq.name = editName;
      saveSequence(seq);
    } else if (editing === 'edit') {
      const existing = sequences[selectedIdx];
      if (existing) {
        seq.name = existing.name;
        saveSequence(seq);
      }
    }

    refresh();
    setEditing(null);
    setIsTyping(false);
    setError('');
  }, [editing, editName, selectedIdx, sequences, refresh, setIsTyping]);

  useInput((input, key) => {
    if (editing) {
      if (key.escape) { setEditing(null); setIsTyping(false); setError(''); }
      return;
    }

    if (input === 'j' || key.downArrow) {
      setSelectedIdx(i => Math.min(i + 1, sequences.length - 1));
      return;
    }
    if (input === 'k' || key.upArrow) {
      setSelectedIdx(i => Math.max(i - 1, 0));
      return;
    }

    if (key.return) {
      const seq = sequences[selectedIdx];
      if (seq) onActivateSequence(seq);
      return;
    }

    if (input === 'c' && activeSequence) {
      onClearSequence();
      return;
    }

    if (input === 'a') {
      setEditing('add');
      setEditStep('name');
      setEditName('');
      setEditBlocks('');
      setError('');
      setIsTyping(true);
      return;
    }

    if (input === 'e' && sequences.length > 0) {
      const seq = sequences[selectedIdx]!;
      setEditing('edit');
      setEditStep('blocks');
      setEditName(seq.name);
      setEditBlocks(seq.blocks.map(b => `${b.durationMinutes}${b.type === 'work' ? 'w' : 'b'}`).join(' '));
      setError('');
      setIsTyping(true);
      return;
    }

    if (input === 'd' && sequences.length > 0) {
      const seq = sequences[selectedIdx]!;
      if (activeSequence?.name === seq.name) {
        onClearSequence();
      }
      deleteSequence(seq.name);
      refresh();
      setSelectedIdx(i => Math.min(i, Math.max(0, sequences.length - 2)));
      return;
    }

    if (input === 'i') {
      importDefaultSequences();
      refresh();
      return;
    }
  });

  if (editing) {
    return (
      <Box flexDirection="column" flexGrow={1}>
        <Text bold color="cyan">{editing === 'add' ? 'Add' : 'Edit'} Sequence</Text>
        <Text dimColor>Esc to cancel</Text>
        <Box marginTop={1} flexDirection="column">
          {editStep === 'name' && (
            <FilterInput
              label="Name: "
              value={editName}
              onChange={setEditName}
              onSubmit={handleNameSubmit}
              placeholder="my-flow"
            />
          )}
          {editStep === 'blocks' && (
            <Box flexDirection="column">
              <Text>Name: <Text bold>{editName}</Text></Text>
              <FilterInput
                label="Blocks: "
                value={editBlocks}
                onChange={setEditBlocks}
                onSubmit={handleBlocksSubmit}
                placeholder="e.g. 45w 15b 45w"
              />
            </Box>
          )}
        </Box>
        {error !== '' && (
          <Box marginTop={1}><Text color="red">{error}</Text></Box>
        )}
      </Box>
    );
  }

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box marginBottom={1}>
        <Text dimColor>Sequences</Text>
      </Box>
      {sequences.map((seq, i) => {
        const isSelected = i === selectedIdx;
        const isActive = activeSequence?.name === seq.name;
        return (
          <Box key={seq.name}>
            <Text color={isSelected ? 'yellow' : 'gray'} bold={isSelected}>{isSelected ? '> ' : '  '}</Text>
            <Box width={14}><Text color={isSelected ? 'white' : 'gray'} bold={isSelected}>{seq.name}</Text></Box>
            <Box width={36}><Text dimColor>{formatBlocks(seq)}</Text></Box>
            <Text dimColor>{totalMinutes(seq)}m</Text>
            {isActive && <Text color={colors.focus} bold>  [ACTIVE]</Text>}
          </Box>
        );
      })}

      {sequences.length === 0 && (
        <Text dimColor>  No sequences. Press i to import presets or a to add one.</Text>
      )}

      {activeSequence && (
        <Box marginTop={1}>
          <Text dimColor>Active: </Text>
          <Text color={colors.focus}>{activeSequence.name}</Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>a:add  e:edit  d:delete  i:import presets  Enter:activate  c:clear</Text>
      </Box>
    </Box>
  );
}
