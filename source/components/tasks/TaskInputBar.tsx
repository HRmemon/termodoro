import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import { colors } from '../../lib/theme.js';

interface ProjectMenu {
  hashIdx: number;
  partial: string;
  matches: string[];
}

interface TaskInputBarProps {
  label: string;
  inputKey: number;
  inputValue: string;
  setInputValue: (v: string) => void;
  onSubmit: (v: string) => void;
  placeholder?: string;
  projectMenu: ProjectMenu | null;
  suggestionIdx: number;
}

export function TaskInputBar({
  label, inputKey, inputValue, setInputValue,
  onSubmit, placeholder, projectMenu, suggestionIdx,
}: TaskInputBarProps) {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Box>
        <Text color="yellow">{label}</Text>
        <TextInput key={inputKey} value={inputValue} onChange={setInputValue} onSubmit={onSubmit} placeholder={placeholder} />
      </Box>
      {projectMenu && (
        <Box flexDirection="column" marginLeft={2} marginTop={0}>
          {projectMenu.matches.map((p, i) => (
            <Box key={p}>
              <Text color={i === suggestionIdx ? colors.highlight : colors.dim}>
                {i === suggestionIdx ? '> ' : '  '}
              </Text>
              <Text color={i === suggestionIdx ? 'cyan' : colors.dim} bold={i === suggestionIdx}>
                #{p}
              </Text>
            </Box>
          ))}
          <Text color={colors.dim}>  {'↑↓:navigate  Tab:select'}</Text>
        </Box>
      )}
    </Box>
  );
}
