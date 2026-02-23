import React, { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import type { Config } from '../types.js';
import { saveConfig } from '../lib/config.js';

interface ConfigViewProps {
  config: Config;
  onConfigChange: (config: Config) => void;
}

interface ConfigField {
  key: keyof Config;
  label: string;
  type: 'number' | 'boolean';
  unit?: string;
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
  { key: 'notifications', label: 'Notifications', type: 'boolean' },
  { key: 'vimKeys', label: 'Vim Keys', type: 'boolean' },
];

export function ConfigView({ config, onConfigChange }: ConfigViewProps) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [saved, setSaved] = useState(false);

  useInput((input, key) => {
    if (isEditing) return;

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
        // Toggle boolean
        const newConfig = { ...config, [field.key]: !config[field.key] };
        onConfigChange(newConfig);
      } else {
        // Edit number
        setEditValue(String(config[field.key]));
        setIsEditing(true);
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
      const newConfig = { ...config, [field.key]: num };
      onConfigChange(newConfig);
    }
    setIsEditing(false);
  }, [selectedIdx, config, onConfigChange]);

  return (
    <Box flexDirection="column" flexGrow={1}>
      {FIELDS.map((field, i) => {
        const isSelected = i === selectedIdx;
        const value = config[field.key];
        const displayValue = field.type === 'boolean'
          ? (value ? 'ON' : 'OFF')
          : `${value}${field.unit ? ` ${field.unit}` : ''}`;
        const valueColor = field.type === 'boolean'
          ? (value ? 'green' : 'red')
          : 'white';

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
