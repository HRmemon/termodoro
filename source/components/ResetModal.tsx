import React, { useState } from 'react';
import { useInput } from 'ink';
import { Box, Text } from 'ink';
import type { SessionType } from '../types.js';
import { useFullScreen } from '../hooks/useFullScreen.js';
import { colors } from '../lib/theme.js';

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
  const { columns, rows } = useFullScreen();

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

  const boxWidth = Math.min(40, columns - 4);
  const boxHeight = Math.min(14, rows - 4);
  const padTop = Math.max(0, Math.floor((rows - boxHeight) / 2));

  return (
    <Box flexDirection="column" height={rows}>
      {padTop > 0 && <Box height={padTop} />}
      <Box justifyContent="center">
        <Box
          flexDirection="column"
          width={boxWidth}
          height={boxHeight}
          borderStyle="round"
          borderColor={colors.highlight}
          paddingX={2}
          paddingY={1}
          overflow="hidden"
        >
          <Box marginBottom={1} justifyContent="space-between">
            <Text bold color={colors.text}>Reset Timer</Text>
            <Text color={colors.dim}>Esc to cancel</Text>
          </Box>
          <Box marginBottom={1}>
            <Text color={colors.dim}>Elapsed: </Text>
            <Text color={colors.highlight} bold>{formatElapsed(elapsed)}</Text>
            {elapsed < 10 && <Text color={colors.dim}>  (nothing to log)</Text>}
          </Box>
          {isWork && elapsed >= 10 && (
            <Box marginBottom={1}>
              <Text color={colors.dim}>How should this time be logged?</Text>
            </Box>
          )}
          {options.map((opt, i) => (
            <Box key={opt}>
              <Text color={i === selectedOpt ? colors.highlight : colors.dim} bold={i === selectedOpt}>
                {i === selectedOpt ? '> ' : '  '}{opt}
              </Text>
            </Box>
          ))}
          <Box marginTop={1}>
            <Text color={colors.dim}>j/k: select  Enter: confirm  Esc: cancel</Text>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
