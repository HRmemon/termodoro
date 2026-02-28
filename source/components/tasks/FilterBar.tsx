import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';

type InputMode = 'none' | 'add' | 'add-desc' | 'edit' | 'edit-desc' | 'filter' | 'filtered' | 'confirm-project';

interface FilterBarProps {
  inputMode: InputMode;
  filterQuery: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
}

export function FilterBar({ inputMode, filterQuery, onChange, onSubmit }: FilterBarProps) {
  if (inputMode === 'filter') {
    return (
      <Box marginBottom={1}>
        <Text color="yellow">{'/ '}</Text>
        <TextInput
          value={filterQuery}
          onChange={onChange}
          onSubmit={onSubmit}
          placeholder="Filter tasks..."
        />
        <Text dimColor>  Enter: apply  Esc: cancel</Text>
      </Box>
    );
  }

  if (inputMode === 'filtered') {
    return (
      <Box marginBottom={1}>
        <Text color="yellow" bold>{'/ '}</Text>
        <Text color="white">{filterQuery}</Text>
        <Text dimColor>  Esc: clear  /: refine</Text>
      </Box>
    );
  }

  return null;
}
