import React from 'react';
import { useInput } from 'ink';
import { Box, Text } from 'ink';

interface HelpViewProps {
  onClose: () => void;
}

export function HelpView({ onClose }: HelpViewProps) {
  useInput((_input, key) => {
    if (key.escape) onClose();
  });

  const sections = [
    {
      title: 'Global',
      hints: [
        ['1-7', 'Switch view'],
        ['/', 'Search'],
        [':', 'Command palette'],
        ['?', 'This help'],
        ['q', 'Quit'],
      ],
    },
    {
      title: '[1] Timer',
      hints: [
        ['Space', 'Start / Pause / Resume'],
        ['s', 'Skip session'],
        ['z', 'Toggle Zen mode'],
        ['t', 'Set custom duration (min)'],
        ['r', 'Reset (with log prompt for work)'],
        ['c', 'Clear active sequence'],
        ['j/k', 'Navigate active tasks'],
        ['Enter', 'Deactivate selected task'],
        ['x', 'Complete selected task'],
      ],
    },
    {
      title: '[2] Tasks',
      hints: [
        ['j/k', 'Navigate'],
        ['Enter', 'Toggle active'],
        ['x', 'Complete / Undo completed'],
        ['a', 'Add task'],
        ['e', 'Edit task'],
        ['d', 'Delete task'],
        ['u', 'Undo last completion'],
      ],
    },
    {
      title: '[3] Reminders',
      hints: [
        ['j/k', 'Navigate'],
        ['a', 'Add reminder'],
        ['e', 'Edit reminder'],
        ['d', 'Delete reminder'],
        ['Enter', 'Toggle on/off'],
        ['r', 'Toggle recurring / one-shot'],
      ],
    },
    {
      title: '[5] Sequences',
      hints: [
        ['j/k', 'Navigate'],
        ['Enter', 'Activate sequence'],
        ['a', 'New custom sequence'],
        ['e', 'Edit custom sequence'],
        ['d', 'Delete custom sequence'],
        ['c', 'Clear active sequence'],
      ],
    },
    {
      title: '[6] Stats',
      hints: [['j/k', 'Scroll']],
    },
    {
      title: '[7] Config',
      hints: [
        ['j/k', 'Navigate'],
        ['Enter', 'Edit / toggle value'],
        ['s', 'Save config to disk'],
      ],
    },
  ];

  return (
    <Box flexDirection="column" padding={2}>
      <Box marginBottom={1}>
        <Text bold color="white">Keybindings</Text>
        <Text dimColor>  Esc: close</Text>
      </Box>
      <Box flexDirection="row" flexWrap="wrap">
        {sections.map(section => (
          <Box key={section.title} flexDirection="column" marginRight={4} marginBottom={1}>
            <Text bold color="yellow">{section.title}</Text>
            {section.hints.map(([key, label]) => (
              <Box key={key}>
                <Box width={12}><Text color="cyan">{key}</Text></Box>
                <Text dimColor>{label}</Text>
              </Box>
            ))}
          </Box>
        ))}
      </Box>
    </Box>
  );
}
