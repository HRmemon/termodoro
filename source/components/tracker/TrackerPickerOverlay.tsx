import { Box, Text } from 'ink';
import type { SlotCategory } from '../../lib/tracker.js';

interface TrackerPickerOverlayProps {
  categories: SlotCategory[];
  pickerCursor: number;
  currentDate: string | null;
  currentTime: string | null;
}

export function TrackerPickerOverlay({ categories, pickerCursor, currentDate, currentTime }: TrackerPickerOverlayProps) {
  return (
    <Box flexDirection="column" borderStyle="single" borderColor="cyan" paddingX={1}>
      <Text bold color="cyan">Set slot: {currentDate} {currentTime}</Text>
      {categories.map((cat, i) => (
        <Box key={cat.code}>
          <Text color={i === pickerCursor ? 'cyan' : undefined} bold={i === pickerCursor}>
            {i === pickerCursor ? '> ' : '  '}
          </Text>
          <Text dimColor>[</Text>
          <Text color={cat.key ? 'white' : 'gray'} bold={!!cat.key}>
            {cat.key ?? ' '}
          </Text>
          <Text dimColor>] </Text>
          <Text color={cat.color as any} bold={i === pickerCursor}>
            {cat.code.padEnd(4)}
          </Text>
          <Text color={i === pickerCursor ? 'cyan' : undefined}>
            {cat.label}
          </Text>
        </Box>
      ))}
      <Text dimColor>Enter:set  j/k:nav  [.]:clear  Esc:cancel</Text>
    </Box>
  );
}
