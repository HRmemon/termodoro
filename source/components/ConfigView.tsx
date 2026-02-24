import { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import type { Config } from '../types.js';
import { saveConfig } from '../lib/config.js';
import { ALL_SOUND_CHOICES, SOUND_LABELS, previewSound } from '../lib/sounds.js';
import type { SoundEvent } from '../lib/sounds.js';

interface ConfigViewProps {
  config: Config;
  onConfigChange: (config: Config) => void;
  setIsTyping: (isTyping: boolean) => void;
}

type FieldType = 'number' | 'boolean' | 'cycle' | 'sound-event' | 'sound-duration' | 'sound-volume';

interface ConfigField {
  key: string;
  label: string;
  type: FieldType;
  unit?: string;
  values?: string[];
  soundEvent?: SoundEvent;
}

const FIELDS: ConfigField[] = [
  { key: 'workDuration', label: 'Work Duration', type: 'number', unit: 'min' },
  { key: 'shortBreakDuration', label: 'Short Break', type: 'number', unit: 'min' },
  { key: 'longBreakDuration', label: 'Long Break', type: 'number', unit: 'min' },
  { key: 'longBreakInterval', label: 'Long Break After', type: 'number', unit: 'sessions' },
  { key: 'autoStartBreaks', label: 'Auto-start Breaks', type: 'boolean' },
  { key: 'autoStartWork', label: 'Auto-start Work', type: 'boolean' },
  { key: 'strictMode', label: 'Strict Mode', type: 'boolean' },
  { key: 'sound', label: 'Sound', type: 'boolean' },
  { key: 'sound:work-end', label: '  Work End Sound', type: 'sound-event', soundEvent: 'work-end' },
  { key: 'sound:break-end', label: '  Break End Sound', type: 'sound-event', soundEvent: 'break-end' },
  { key: 'sound:reminder', label: '  Reminder Sound', type: 'sound-event', soundEvent: 'reminder' },
  { key: 'sound:alarmDuration', label: '  Alarm Duration', type: 'sound-duration', unit: 'sec' },
  { key: 'sound:volume', label: '  Volume', type: 'sound-volume', unit: '%' },
  { key: 'notifications', label: 'Notifications', type: 'boolean' },
  { key: 'notificationDuration', label: 'Notif Duration', type: 'number', unit: 'sec' },
  { key: 'compactTime', label: 'Compact Time', type: 'boolean' },
  { key: 'vimKeys', label: 'Vim Keys', type: 'boolean' },
  { key: 'timerFormat', label: 'Timer Format', type: 'cycle', values: ['mm:ss', 'hh:mm:ss', 'minutes'] },
];

export function ConfigView({ config, onConfigChange, setIsTyping }: ConfigViewProps) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [saved, setSaved] = useState(false);

  const getFieldValue = (field: ConfigField): string => {
    if (field.type === 'sound-event' && field.soundEvent) {
      const choice = config.sounds[field.soundEvent];
      if (choice === 'custom') {
        const customPath = config.sounds.customPaths[field.soundEvent];
        return customPath ? `Custom: ${customPath}` : 'Custom (no file)';
      }
      return SOUND_LABELS[choice] ?? choice;
    }
    if (field.type === 'sound-duration') {
      return `${config.sounds.alarmDuration} sec`;
    }
    if (field.type === 'sound-volume') {
      return `${config.sounds.volume}%`;
    }
    return String((config as unknown as Record<string, unknown>)[field.key]);
  };

  const cycleSoundChoice = useCallback((field: ConfigField, direction: 1 | -1 = 1) => {
    if (!field.soundEvent) return;
    const current = config.sounds[field.soundEvent];
    const idx = ALL_SOUND_CHOICES.indexOf(current);
    const nextIdx = (idx + direction + ALL_SOUND_CHOICES.length) % ALL_SOUND_CHOICES.length;
    const newChoice = ALL_SOUND_CHOICES[nextIdx]!;
    const newSounds = { ...config.sounds, [field.soundEvent]: newChoice };
    const newConfig = { ...config, sounds: newSounds };
    onConfigChange(newConfig);
    saveConfig(newConfig);
    // Preview the sound
    if (newChoice !== 'none' && newChoice !== 'custom' && config.sound) {
      previewSound(newChoice, config.sounds.volume);
    }
  }, [config, onConfigChange]);

  useInput((input, key) => {
    if (isEditing) {
      if (key.escape) {
        setIsEditing(false);
        setIsTyping(false);
      }
      return;
    }

    if (input === 'j' || key.downArrow) {
      setSelectedIdx(i => Math.min(i + 1, FIELDS.length - 1));
      return;
    }
    if (input === 'k' || key.upArrow) {
      setSelectedIdx(i => Math.max(i - 1, 0));
      return;
    }

    if (key.return) {
      const field = FIELDS[selectedIdx]!;
      if (field.type === 'boolean') {
        const newConfig = { ...config, [field.key]: !(config as unknown as Record<string, unknown>)[field.key] };
        onConfigChange(newConfig);
        saveConfig(newConfig);
      } else if (field.type === 'cycle' && field.values) {
        const currentIdx = field.values.indexOf(String((config as unknown as Record<string, unknown>)[field.key]));
        const nextIdx = (currentIdx + 1) % field.values.length;
        const newConfig = { ...config, [field.key]: field.values[nextIdx] };
        onConfigChange(newConfig);
        saveConfig(newConfig);
      } else if (field.type === 'sound-event') {
        cycleSoundChoice(field);
      } else if (field.type === 'sound-duration') {
        setEditValue(String(config.sounds.alarmDuration));
        setIsEditing(true);
        setIsTyping(true);
      } else if (field.type === 'sound-volume') {
        setEditValue(String(config.sounds.volume));
        setIsEditing(true);
        setIsTyping(true);
      } else {
        setEditValue(String((config as unknown as Record<string, unknown>)[field.key]));
        setIsEditing(true);
        setIsTyping(true);
      }
      return;
    }

    // Allow p to preview sound on sound-event fields
    if (input === 'p') {
      const field = FIELDS[selectedIdx]!;
      if (field.type === 'sound-event' && field.soundEvent && config.sound) {
        const choice = config.sounds[field.soundEvent];
        const customPath = config.sounds.customPaths[field.soundEvent];
        previewSound(choice, config.sounds.volume, customPath);
      }
      return;
    }

    if (input === 's') {
      saveConfig(config);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      return;
    }
  });

  const handleEditSubmit = useCallback((value: string) => {
    const field = FIELDS[selectedIdx]!;
    const num = parseInt(value, 10);
    if (!isNaN(num) && num > 0) {
      if (field.type === 'sound-duration') {
        const clamped = Math.min(Math.max(num, 1), 60);
        const newSounds = { ...config.sounds, alarmDuration: clamped };
        const newConfig = { ...config, sounds: newSounds };
        onConfigChange(newConfig);
        saveConfig(newConfig);
      } else if (field.type === 'sound-volume') {
        const clamped = Math.min(Math.max(num, 0), 100);
        const newSounds = { ...config.sounds, volume: clamped };
        const newConfig = { ...config, sounds: newSounds };
        onConfigChange(newConfig);
        saveConfig(newConfig);
      } else {
        const newConfig = { ...config, [field.key]: num };
        onConfigChange(newConfig);
        saveConfig(newConfig);
      }
    }
    setIsEditing(false);
    setIsTyping(false);
  }, [selectedIdx, config, onConfigChange, setIsTyping]);

  return (
    <Box flexDirection="column" flexGrow={1}>
      {FIELDS.map((field, i) => {
        const isSelected = i === selectedIdx;
        let displayValue: string;
        let valueColor: string;
        if (field.type === 'boolean') {
          const val = (config as unknown as Record<string, unknown>)[field.key];
          displayValue = val ? 'ON' : 'OFF';
          valueColor = val ? 'green' : 'red';
        } else if (field.type === 'cycle') {
          displayValue = String((config as unknown as Record<string, unknown>)[field.key]);
          valueColor = 'cyan';
        } else if (field.type === 'sound-event') {
          displayValue = getFieldValue(field);
          valueColor = 'magenta';
        } else if (field.type === 'sound-duration' || field.type === 'sound-volume') {
          displayValue = getFieldValue(field);
          valueColor = 'cyan';
        } else {
          const val = (config as unknown as Record<string, unknown>)[field.key];
          displayValue = `${val}${field.unit ? ` ${field.unit}` : ''}`;
          valueColor = 'white';
        }

        return (
          <Box key={field.key}>
            <Text color={isSelected ? 'yellow' : 'gray'} bold={isSelected}>
              {isSelected ? '> ' : '  '}
            </Text>
            <Box width={22}>
              <Text color={isSelected ? 'white' : 'gray'}>{field.label}</Text>
            </Box>
            {isEditing && isSelected ? (
              <TextInput
                value={editValue}
                onChange={setEditValue}
                onSubmit={handleEditSubmit}
              />
            ) : (
              <Text color={valueColor} bold={isSelected}>{displayValue}</Text>
            )}
            {isSelected && field.type === 'sound-event' && (
              <Text dimColor>  Enter: cycle  p: preview</Text>
            )}
          </Box>
        );
      })}
      {saved && (
        <Box marginTop={1}>
          <Text color="green" bold>Config saved!</Text>
        </Box>
      )}
    </Box>
  );
}
