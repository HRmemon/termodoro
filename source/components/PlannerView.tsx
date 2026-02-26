import { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { SessionSequence } from '../types.js';
import { loadSequences } from '../lib/sequences.js';
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

export function PlannerView({ activeSequence, onActivateSequence, onClearSequence }: PlannerViewProps) {
  const [sequences] = useState<SessionSequence[]>(() => loadSequences());
  const [selectedIdx, setSelectedIdx] = useState(0);

  useInput((input, key) => {
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
  });

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
        <Text dimColor>  No sequences. Manage sequences in [7] Config.</Text>
      )}

      {activeSequence && (
        <Box marginTop={1}>
          <Text dimColor>Active: </Text>
          <Text color={colors.focus}>{activeSequence.name}</Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>Enter:activate  c:clear  Manage in [7] Config</Text>
      </Box>
    </Box>
  );
}
