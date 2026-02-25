import { useState } from 'react';
import { useInput } from 'ink';
import { Box, Text } from 'ink';

interface HelpViewProps {
  onClose: () => void;
}

const page1 = [
  {
    title: 'Global',
    hints: [
      ['1-0', 'Switch view (1=Timer … 0=Goals)'],
      ['/', 'Global search'],
      [':', 'Command palette'],
      ['Ctrl+G', 'Open view in $EDITOR'],
      ['z', 'Toggle Zen mode'],
      ['?', 'This help'],
      ['q', 'Quit'],
    ],
  },
  {
    title: '[1] Timer',
    hints: [
      ['Space', 'Start / Pause / Resume'],
      ['s', 'Skip session'],
      ['z', 'Zen mode'],
      ['t', 'Set custom duration'],
      ['r', 'Reset (log prompt)'],
      ['c', 'Clear active sequence'],
      ['j/k', 'Navigate active tasks'],
      ['Enter', 'Deactivate task'],
      ['x', 'Complete task'],
    ],
  },
  {
    title: '[2] Tasks',
    hints: [
      ['j/k', 'Navigate'],
      ['Enter', 'Toggle active'],
      ['x', 'Complete / Undo'],
      ['a', 'Add task'],
      ['e', 'Edit task'],
      ['d', 'Delete task'],
      ['u', 'Undo last completion'],
      ['/', 'Filter (fuzzy search)'],
    ],
  },
  {
    title: '[3] Reminders',
    hints: [
      ['j/k', 'Navigate'],
      ['a', 'Add reminder'],
      ['e', 'Edit'],
      ['d', 'Delete'],
      ['Enter', 'Toggle on/off'],
      ['r', 'Toggle recurring'],
    ],
  },
  {
    title: '[5] Sequences',
    hints: [
      ['j/k', 'Navigate'],
      ['Enter', 'Activate sequence'],
      ['a', 'New custom sequence'],
      ['e', 'Edit custom'],
      ['d', 'Delete custom'],
      ['c', 'Clear active'],
    ],
  },
];

const page2 = [
  {
    title: '[6] Stats',
    hints: [
      ['h/l', 'Switch tab'],
      ['j/k', 'Switch tab'],
    ],
  },
  {
    title: '[7] Config',
    hints: [
      ['j/k', 'Navigate'],
      ['Enter', 'Edit / toggle'],
      ['s', 'Save to disk'],
      ['p', 'Preview sound'],
    ],
  },
  {
    title: '[8] Web Tracking',
    hints: [
      ['h/l', 'Change time range'],
      ['Tab', 'Domains / Pages tab'],
      ['j/k', 'Scroll'],
      ['R', 'Open HTML report'],
    ],
  },
  {
    title: '[9] Tracker',
    hints: [
      ['hjkl', 'Navigate grid'],
      ['Tab', 'Next day'],
      ['e/Enter', 'Edit slot (picker)'],
      ['.', 'Clear slot'],
      ['r', 'Review suggestions'],
      ['A', 'Accept all pending'],
      ['n', 'New week'],
      ['b', 'Browse past weeks'],
      ['d/w', 'Day / week summary'],
    ],
  },
  {
    title: '[0] Goals',
    hints: [
      ['Tab/h/l', 'Switch goal'],
      ['←/→', 'Navigate dates'],
      ['j/k', 'Prev / next day'],
      ['t', 'Jump to today'],
      ['↑/↓', 'Adjust rate / scroll'],
      ['Enter/x', 'Toggle / rate picker'],
      ['a', 'Add goal'],
      ['e', 'Edit goal'],
      ['d', 'Delete goal'],
    ],
  },
  {
    title: 'Command Palette (:)',
    hints: [
      [':task', 'Create task (#proj /N)'],
      [':remind', 'Quick timer (5m, 1h)'],
      [':reminder', 'Timed reminder (HH:MM)'],
      [':search', 'Search sessions'],
      [':insights', 'Focus score & energy'],
    ],
  },
];

export function HelpView({ onClose }: HelpViewProps) {
  const [page, setPage] = useState(0);
  const pages = [page1, page2];

  useInput((input, key) => {
    if (key.escape) { onClose(); return; }
    if (input === 'l' || key.rightArrow || input === 'j' || key.downArrow) {
      setPage(p => Math.min(p + 1, pages.length - 1));
    }
    if (input === 'h' || key.leftArrow || input === 'k' || key.upArrow) {
      setPage(p => Math.max(0, p - 1));
    }
  });

  const sections = pages[page]!;

  return (
    <Box flexDirection="column" padding={2}>
      <Box marginBottom={1}>
        <Text bold color="white">Keybindings</Text>
        <Text dimColor>  Page {page + 1}/{pages.length}  h/l:page  Esc:close</Text>
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
