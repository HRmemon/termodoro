import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import type { TrackedGoal } from '../../lib/goals.js';

interface NoteEditorProps {
  goal: TrackedGoal;
  selDateLabel: string;
  noteValue: string;
  onChange: (v: string) => void;
  onSubmit: (v: string) => void;
}

export function NoteEditor({ goal, selDateLabel, noteValue, onChange, onSubmit }: NoteEditorProps) {
  return (
    <Box flexDirection="column" borderStyle="single" borderColor="cyan" paddingX={1} marginTop={1}>
      <Text bold color="cyan">{goal.name} — {selDateLabel}</Text>
      <Box marginTop={1}>
        <Text>Note: </Text>
        <TextInput
          value={noteValue}
          onChange={onChange}
          onSubmit={onSubmit}
        />
      </Box>
      <Text dimColor>Enter:save  Esc:save+close</Text>
    </Box>
  );
}
