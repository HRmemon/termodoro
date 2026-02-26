import { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import type { SessionSequence } from '../../types.js';
import { loadSequences, saveSequence, deleteSequence as deleteSeq, importDefaultSequences } from '../../lib/sequences.js';
import { parseSequenceString } from '../../hooks/useSequence.js';
import { FilterInput } from '../FilterInput.js';

interface SequenceManagerProps {
  setIsTyping: (v: boolean) => void;
  onBack: () => void;
}

export function SequenceManager({ setIsTyping, onBack }: SequenceManagerProps) {
  const [seqList, setSeqList] = useState<SessionSequence[]>(() => loadSequences());
  const [seqCursor, setSeqCursor] = useState(0);
  const [seqEditing, setSeqEditing] = useState<'add' | 'edit' | null>(null);
  const [seqEditStep, setSeqEditStep] = useState<'name' | 'blocks'>('name');
  const [seqEditName, setSeqEditName] = useState('');
  const [seqEditBlocks, setSeqEditBlocks] = useState('');
  const [seqError, setSeqError] = useState('');

  const refreshSeqs = useCallback(() => {
    setSeqList(loadSequences());
  }, []);

  const handleSeqNameSubmit = useCallback((value: string) => {
    const name = value.trim();
    if (!name) { setSeqError('Name cannot be empty'); return; }
    setSeqEditName(name);
    setSeqEditStep('blocks');
    setSeqEditBlocks('');
    setSeqError('');
  }, []);

  const handleSeqBlocksSubmit = useCallback((value: string) => {
    const seq = parseSequenceString(value.trim());
    if (!seq) { setSeqError('Invalid format. Use: 45w 15b 45w'); return; }

    if (seqEditing === 'add') {
      seq.name = seqEditName;
      saveSequence(seq);
    } else if (seqEditing === 'edit') {
      const existing = seqList[seqCursor];
      if (existing) {
        seq.name = existing.name;
        saveSequence(seq);
      }
    }

    refreshSeqs();
    setSeqEditing(null);
    setIsTyping(false);
    setSeqError('');
  }, [seqEditing, seqEditName, seqCursor, seqList, refreshSeqs, setIsTyping]);

  useInput((input, key) => {
    if (seqEditing) {
      if (key.escape) { setSeqEditing(null); setIsTyping(false); setSeqError(''); return; }
      return; // FilterInput handles input
    }

    if (key.escape) { onBack(); return; }
    if (input === 'j' || key.downArrow) setSeqCursor(p => Math.min(p + 1, seqList.length - 1));
    else if (input === 'k' || key.upArrow) setSeqCursor(p => Math.max(0, p - 1));
    else if (input === 'a') {
      setSeqEditing('add');
      setSeqEditStep('name');
      setSeqEditName('');
      setSeqEditBlocks('');
      setSeqError('');
      setIsTyping(true);
    } else if (input === 'e' && seqList.length > 0) {
      const seq = seqList[seqCursor]!;
      setSeqEditing('edit');
      setSeqEditStep('blocks');
      setSeqEditName(seq.name);
      setSeqEditBlocks(seq.blocks.map(b => `${b.durationMinutes}${b.type === 'work' ? 'w' : 'b'}`).join(' '));
      setSeqError('');
      setIsTyping(true);
    } else if (input === 'd' && seqList.length > 0) {
      const seq = seqList[seqCursor]!;
      deleteSeq(seq.name);
      refreshSeqs();
      setSeqCursor(p => Math.min(p, Math.max(0, seqList.length - 2)));
    } else if (input === 'i') {
      importDefaultSequences();
      refreshSeqs();
    }
  });

  // Sequence editor form
  if (seqEditing) {
    return (
      <Box flexDirection="column" flexGrow={1}>
        <Text bold color="cyan">{seqEditing === 'add' ? 'Add' : 'Edit'} Sequence</Text>
        <Text dimColor>Esc to cancel</Text>
        <Box marginTop={1} flexDirection="column">
          {seqEditStep === 'name' && (
            <FilterInput
              label="Name: "
              value={seqEditName}
              onChange={setSeqEditName}
              onSubmit={handleSeqNameSubmit}
              placeholder="my-flow"
            />
          )}
          {seqEditStep === 'blocks' && (
            <Box flexDirection="column">
              <Text>Name: <Text bold>{seqEditName}</Text></Text>
              <FilterInput
                label="Blocks: "
                value={seqEditBlocks}
                onChange={setSeqEditBlocks}
                onSubmit={handleSeqBlocksSubmit}
                placeholder="e.g. 45w 15b 45w"
              />
            </Box>
          )}
        </Box>
        {seqError !== '' && (
          <Box marginTop={1}><Text color="red">{seqError}</Text></Box>
        )}
      </Box>
    );
  }

  // Sequence list
  return (
    <Box flexDirection="column" flexGrow={1}>
      <Text bold color="cyan">Sequences</Text>
      <Text dimColor>a:add  e:edit  d:delete  i:import presets  Esc:back</Text>
      <Box flexDirection="column" marginTop={1}>
        {seqList.map((seq, i) => {
          const formatBlocks = seq.blocks.map(b => `${b.durationMinutes}${b.type === 'work' ? 'w' : 'b'}`).join(' ');
          const total = seq.blocks.reduce((s, b) => s + b.durationMinutes, 0);
          return (
            <Box key={seq.name}>
              <Text color={i === seqCursor ? 'yellow' : 'gray'} bold={i === seqCursor}>
                {i === seqCursor ? '> ' : '  '}
              </Text>
              <Box width={14}><Text color={i === seqCursor ? 'white' : 'gray'} bold={i === seqCursor}>{seq.name}</Text></Box>
              <Box width={36}><Text dimColor>{formatBlocks}</Text></Box>
              <Text dimColor>{total}m</Text>
            </Box>
          );
        })}
        {seqList.length === 0 && <Text dimColor>  No sequences. Press i to import presets or a to add one.</Text>}
      </Box>
    </Box>
  );
}
