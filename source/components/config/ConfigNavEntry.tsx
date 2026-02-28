import { Box, Text } from 'ink';

interface ConfigNavEntryProps {
  label: string;
  detail: string;
  isSelected: boolean;
  hint?: string;
}

export function ConfigNavEntry({ label, detail, isSelected, hint }: ConfigNavEntryProps) {
  return (
    <Box>
      <Text color={isSelected ? 'yellow' : 'gray'} bold={isSelected}>
        {isSelected ? '> ' : '  '}
      </Text>
      <Box width={22}>
        <Text color={isSelected ? 'white' : 'gray'}>{label}</Text>
      </Box>
      <Text color="cyan" bold={isSelected}>{detail}</Text>
      {isSelected && hint && <Text dimColor>  {hint}</Text>}
    </Box>
  );
}
