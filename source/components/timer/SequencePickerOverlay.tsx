import { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { SessionSequence } from '../../types.js';
import { colors } from '../../lib/theme.js';
import type { Keymap } from '../../lib/keymap.js';

interface SequencePickerOverlayProps {
  sequences: SessionSequence[];
  activeSequence: SessionSequence | null;
  onSelect: (seq: SessionSequence) => void;
  onClear: () => void;
  onEditSequences: () => void;
  onClose: () => void;
  keymap?: Keymap;
}

export function SequencePickerOverlay({
  sequences, activeSequence, onSelect, onClear, onEditSequences, onClose, keymap,
}: SequencePickerOverlayProps) {
  const [seqCursor, setSeqCursor] = useState(0);

  useInput((input, key) => {
    if (key.escape || input === 'q') {
      onClose();
      return;
    }
    if ((keymap ? keymap.matches('nav.down', input, key) : input === 'j') || key.downArrow) {
      setSeqCursor(prev => Math.min(prev + 1, sequences.length - 1));
      return;
    }
    if ((keymap ? keymap.matches('nav.up', input, key) : input === 'k') || key.upArrow) {
      setSeqCursor(prev => Math.max(prev - 1, 0));
      return;
    }
    if (input === 'E') {
      onClose();
      onEditSequences();
      return;
    }
    if (key.return && sequences.length > 0) {
      const selected = sequences[seqCursor];
      if (selected) {
        if (activeSequence && activeSequence.name === selected.name) {
          onClear();
        } else {
          onSelect(selected);
        }
      }
      onClose();
      return;
    }
  });

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box borderStyle="round" borderColor={colors.highlight} flexDirection="column" paddingX={1}>
        <Box marginBottom={1}>
          <Text bold color={colors.highlight}>Select Sequence</Text>
          <Text dimColor>  (j/k navigate, Enter select, E:edit, Esc close)</Text>
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
