import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';

// ---------------------------------------------------------------------------
// Available commands
// ---------------------------------------------------------------------------

interface CommandDef {
  name: string;
  args: boolean;
  description: string;
}

const COMMANDS: CommandDef[] = [
  { name: 'stats',     args: false, description: 'View session statistics' },
  { name: 'tasks',     args: false, description: 'Navigate to tasks view' },
  { name: 'task',      args: true,  description: 'Create a task (e.g. :task Fix bug #work /3)' },
  { name: 'reminders', args: false, description: 'Navigate to reminders view' },
  { name: 'reminder',  args: true,  description: 'Create a reminder (e.g. :reminder 09:30 Standup)' },
  { name: 'remind',   args: true,  description: 'Quick timer (e.g. :remind 3m, :remind 30s, :remind 1h coffee)' },
  { name: 'search',    args: true,  description: 'Search sessions (e.g. :search project:myapp)' },
  { name: 'export',    args: false, description: 'Export sessions to CSV' },
  { name: 'backup',    args: false, description: 'Backup session data' },
  { name: 'insights',  args: false, description: 'Show energy patterns and focus score' },
  { name: 'config',    args: false, description: 'Open configuration' },
  { name: 'quit',      args: false, description: 'Quit pomodorocli' },
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface CommandPaletteProps {
  onCommand: (cmd: string, args: string) => void;
  onDismiss: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CommandPalette({ onCommand, onDismiss }: CommandPaletteProps) {
  const [input, setInput] = useState('');
  const [inputKey, setInputKey] = useState(0);

  // Derive which commands match the current input
  const trimmed = input.trimStart();
  const [cmdToken, ...rest] = trimmed.split(/\s+/);
  const cmdName = cmdToken ?? '';
  const argsText = rest.join(' ');

  const suggestions = COMMANDS.filter(c =>
    c.name.startsWith(cmdName.toLowerCase()) || cmdName.length === 0,
  );

  // Currently highlighted command (exact match first, then first suggestion)
  const exactMatch = COMMANDS.find(c => c.name === cmdName.toLowerCase());
  const highlighted = exactMatch ?? suggestions[0];

  useInput((_inputChar, key) => {
    if (key.escape) {
      onDismiss();
      return;
    }
    // Tab autocomplete: fill in the highlighted suggestion
    if (key.tab && highlighted) {
      const completed = highlighted.args ? highlighted.name + ' ' : highlighted.name;
      setInput(completed);
      setInputKey(k => k + 1);
    }
  });

  const handleSubmit = (value: string) => {
    const parts = value.trim().split(/\s+/);
    const cmd = parts[0] ?? '';
    const args = parts.slice(1).join(' ');

    if (cmd.length === 0) {
      onDismiss();
      return;
    }

    const matched = COMMANDS.find(c => c.name === cmd.toLowerCase());
    if (matched) {
      onCommand(matched.name, args);
    } else {
      // Unknown command — dismiss with a no-op (could also show error)
      onDismiss();
    }
  };

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      {/* Title */}
      <Text bold color="cyan">Command Palette</Text>
      <Text dimColor>(Tab to autocomplete, Esc to dismiss)</Text>

      {/* Input row */}
      <Box marginTop={1}>
        <Text bold color="yellow">:</Text>
        <TextInput
          key={inputKey}
          value={input}
          onChange={setInput}
          onSubmit={handleSubmit}
          placeholder="type a command…"
        />
      </Box>

      {/* Suggestions list */}
      {suggestions.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          {suggestions.map(cmd => {
            const isHighlighted = cmd === highlighted;
            return (
              <Box key={cmd.name}>
                <Text color={isHighlighted ? 'cyan' : undefined} bold={isHighlighted}>
                  {isHighlighted ? '> ' : '  '}
                </Text>
                <Text color={isHighlighted ? 'cyan' : undefined} bold={isHighlighted}>
                  {cmd.name}
                  {cmd.args ? ' <args>' : ''}
                </Text>
                <Text dimColor>{'  '}{cmd.description}</Text>
              </Box>
            );
          })}
        </Box>
      )}

      {suggestions.length === 0 && cmdName.length > 0 && (
        <Box marginTop={1}>
          <Text color="red">Unknown command: {cmdName}</Text>
        </Box>
      )}

      {/* Show parsed args when a command with args is matched */}
      {exactMatch?.args && argsText.length > 0 && (
        <Box marginTop={1}>
          <Text dimColor>args: </Text>
          <Text color="white">{argsText}</Text>
        </Box>
      )}
    </Box>
  );
}
