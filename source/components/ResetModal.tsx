import React, { useState } from 'react';
import { useInput } from 'ink';
import { Box, Text } from 'ink';
import type { SessionType } from '../types.js';

interface ResetModalProps {
  elapsed: number;
  sessionType: SessionType;
  onConfirm: (asProductive: boolean) => void;
  onCancel: () => void;
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function ResetModal({ elapsed, sessionType, onConfirm, onCancel }: ResetModalProps) {
  const isWork = sessionType === 'work';
  const options = isWork
    ? ['Productive', 'Unproductive', 'Cancel']
    : ['Log break', 'Cancel'];

  const [selectedOpt, setSelectedOpt] = useState(0);

  useInput((input, key) => {
    if (key.escape) { onCancel(); return; }
    if (input === 'j' || key.downArrow) { setSelectedOpt(i => Math.min(i + 1, options.length - 1)); return; }
    if (input === 'k' || key.upArrow) { setSelectedOpt(i => Math.max(i - 1, 0)); return; }
    if (key.return) {
      const choice = options[selectedOpt];
      if (choice === 'Cancel') { onCancel(); return; }
      if (choice === 'Productive' || choice === 'Log break') { onConfirm(true); return; }
      if (choice === 'Unproductive') { onConfirm(false); return; }
    }
  });

  return (
    <Box flexDirection="column" padding={2} borderStyle="round" borderColor="yellow">
      <Box marginBottom={1}>
        <Text bold color="white">Reset Timer</Text>
      </Box>
      <Box marginBottom={1}>
        <Text dimColor>Elapsed: </Text>
        <Text color="yellow" bold>{formatElapsed(elapsed)}</Text>
        {elapsed < 10 && <Text dimColor>  (nothing to log)</Text>}
      </Box>
      {isWork && elapsed >= 10 && (
        <Box marginBottom={1}>
          <Text dimColor>How should this time be logged?</Text>
        </Box>
      )}
      {options.map((opt, i) => (
        <Box key={opt}>
          <Text color={i === selectedOpt ? 'yellow' : 'gray'} bold={i === selectedOpt}>
            {i === selectedOpt ? '> ' : '  '}{opt}
          </Text>
        </Box>
      ))}
      <Box marginTop={1}>
        <Text dimColor>j/k: select  Enter: confirm  Esc: cancel</Text>
      </Box>
    </Box>
  );
}
