import { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { ALL_SOUND_CHOICES, SOUND_LABELS, previewSound } from '../../lib/sounds.js';
import type { SoundEvent, SoundChoice } from '../../lib/sounds.js';
import type { Keymap } from '../../lib/keymap.js';

interface SoundPickerProps {
  soundEvent: SoundEvent;
  currentChoice: SoundChoice;
  volume: number;
  customPath?: string;
  onSelect: (choice: SoundChoice, customPath?: string) => void;
  onCancel: () => void;
  keymap?: Keymap;
}

export function SoundPicker({ soundEvent, currentChoice, volume, customPath, onSelect, onCancel, keymap: km }: SoundPickerProps) {
  const [cursor, setCursor] = useState(() => {
    const idx = ALL_SOUND_CHOICES.indexOf(currentChoice);
    return idx >= 0 ? idx : 0;
  });
  const [customInput, setCustomInput] = useState(customPath ?? '');
  const [showCustomInput, setShowCustomInput] = useState(currentChoice === 'custom');

  useInput((input, key) => {
    if (showCustomInput) {
      if (key.escape) {
        setShowCustomInput(false);
        // Revert cursor away from custom if no path
        if (!customInput.trim()) {
          const prevIdx = ALL_SOUND_CHOICES.indexOf(currentChoice);
          if (currentChoice !== 'custom') setCursor(prevIdx >= 0 ? prevIdx : 0);
        }
      }
      // TextInput handles the rest
      return;
    }

    if (key.escape) {
      onCancel();
      return;
    }

    if ((km ? km.matches('nav.up', input, key) : input === 'k') || key.upArrow) {
      setCursor(c => Math.max(0, c - 1));
      return;
    }
    if ((km ? km.matches('nav.down', input, key) : input === 'j') || key.downArrow) {
      setCursor(c => Math.min(ALL_SOUND_CHOICES.length - 1, c + 1));
      return;
    }

    if (input === 'p') {
      const choice = ALL_SOUND_CHOICES[cursor];
      if (choice && choice !== 'none' && choice !== 'custom') {
        previewSound(choice, volume);
      } else if (choice === 'custom' && customPath) {
        previewSound('custom', volume, customPath);
      }
      return;
    }

    if (key.return) {
      const choice = ALL_SOUND_CHOICES[cursor];
      if (!choice) return;
      if (choice === 'custom') {
        setShowCustomInput(true);
        return;
      }
      onSelect(choice);
      return;
    }
  });

  const handleCustomSubmit = (value: string) => {
    onSelect('custom', value.trim() || undefined);
  };

  const eventLabel = soundEvent === 'work-end' ? 'Work End' : soundEvent === 'break-end' ? 'Break End' : 'Reminder';

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="magenta" paddingX={1}>
      <Box marginBottom={1}>
        <Text bold color="magenta">Sound Picker — {eventLabel}</Text>
        <Text dimColor>  j/k:nav  Enter:select  p:preview  Esc:cancel</Text>
      </Box>

      {ALL_SOUND_CHOICES.map((choice, i) => {
        const isSelected = i === cursor;
        const isCurrent = choice === currentChoice;
        return (
          <Box key={choice}>
            <Text color={isSelected ? 'cyan' : 'gray'} bold={isSelected}>
              {isSelected ? '> ' : '  '}
            </Text>
            <Text color={isSelected ? 'white' : 'gray'} bold={isCurrent}>
              {SOUND_LABELS[choice]}
              {isCurrent ? ' ✓' : ''}
            </Text>
          </Box>
        );
      })}

      {showCustomInput && (
        <Box marginTop={1} flexDirection="column">
          <Text color="yellow">Custom file path:</Text>
          <Box>
            <Text color="yellow">{'> '}</Text>
            <TextInput
              value={customInput}
              onChange={setCustomInput}
              onSubmit={handleCustomSubmit}
              placeholder="/path/to/sound.wav"
            />
          </Box>
          <Text dimColor>Enter to confirm, Esc to go back</Text>
        </Box>
      )}
    </Box>
  );
}
