import { Box, Text } from 'ink';

interface ConfirmProjectPromptProps {
  projectName: string;
}

export function ConfirmProjectPrompt({ projectName }: ConfirmProjectPromptProps) {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color="yellow">#{projectName}</Text>
      <Text dimColor> is not an existing project.</Text>
      <Box marginTop={0}>
        <Text dimColor>a:add as new project  u:untag  Esc:cancel</Text>
      </Box>
    </Box>
  );
}
