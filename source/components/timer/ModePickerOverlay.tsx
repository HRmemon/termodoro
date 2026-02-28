import { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { colors } from '../../lib/theme.js';

interface ModePickerOverlayProps {
  timerMode: 'countdown' | 'stopwatch';
  onSwitchToStopwatch: () => void;
  onStopStopwatch: () => void;
  onClose: () => void;
}

export function ModePickerOverlay({ timerMode, onSwitchToStopwatch, onStopStopwatch, onClose }: ModePickerOverlayProps) {
  const isStopwatch = timerMode === 'stopwatch';
  const [modeCursor, setModeCursor] = useState(isStopwatch ? 1 : 0);
  const options = ['Timer', 'Stopwatch'];

  useInput((input, key) => {
    if (key.escape) { onClose(); return; }
    if (input === 'j' || key.downArrow) { setModeCursor(c => Math.min(c + 1, 1)); return; }
    if (input === 'k' || key.upArrow) { setModeCursor(c => Math.max(c - 1, 0)); return; }
    if (key.return) {
      const selected = modeCursor === 0 ? 'countdown' : 'stopwatch';
      if (selected === 'stopwatch' && timerMode !== 'stopwatch') onSwitchToStopwatch();
      else if (selected === 'countdown' && timerMode === 'stopwatch') onStopStopwatch();
      onClose();
      return;
    }
  });

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box borderStyle="round" borderColor={colors.highlight} flexDirection="column" paddingX={1}>
        <Box marginBottom={1}>
          <Text bold color={colors.highlight}>Timer Mode</Text>
          <Text dimColor>  (j/k navigate, Enter select, Esc cancel)</Text>
        </Box>
        {options.map((opt, i) => {
          const isCursor = i === modeCursor;
          const isCurrent = (i === 0 && !isStopwatch) || (i === 1 && isStopwatch);
          return (
            <Box key={opt}>
              <Text color={isCursor ? colors.highlight : colors.text} bold={isCursor}>
                {isCursor ? '> ' : '  '}{opt}
              </Text>
              {isCurrent && <Text color={colors.focus}>  ← current</Text>}
              {i === 0 && isStopwatch && <Text dimColor>  (logs & resets)</Text>}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
