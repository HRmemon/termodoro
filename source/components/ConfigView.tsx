import React, { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import type { Config } from '../types.js';
import { saveConfig } from '../lib/config.js';

interface ConfigViewProps {
  config: Config;
  onConfigChange: (config: Config) => void;
  setIsTyping: (isTyping: boolean) => void;
}

interface ConfigField {
  key: keyof Config;
  label: string;
  type: 'number' | 'boolean' | 'cycle';
  unit?: string;
  values?: string[]; // for cycle type
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
        const newConfig = { ...config, [field.key]: !config[field.key] };
        onConfigChange(newConfig);
        saveConfig(newConfig);
      } else if (field.type === 'cycle' && field.values) {
        const currentIdx = field.values.indexOf(String(config[field.key]));
        const nextIdx = (currentIdx + 1) % field.values.length;
        const newConfig = { ...config, [field.key]: field.values[nextIdx] };
        onConfigChange(newConfig);
        saveConfig(newConfig);
      } else {
        setEditValue(String(config[field.key]));
        setIsEditing(true);
        setIsTyping(true);
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
      saveConfig(newConfig);
    }
    setIsEditing(false);
    setIsTyping(false);
  }, [selectedIdx, config, onConfigChange, setIsTyping]);

  return (
    <Box flexDirection="column" flexGrow={1}>
      {FIELDS.map((field, i) => {
        const isSelected = i === selectedIdx;
        const value = config[field.key];
        let displayValue: string;
        let valueColor: string;
        if (field.type === 'boolean') {
          displayValue = value ? 'ON' : 'OFF';
          valueColor = value ? 'green' : 'red';
        } else if (field.type === 'cycle') {
          displayValue = String(value);
          valueColor = 'cyan';
        } else {
          displayValue = `${value}${field.unit ? ` ${field.unit}` : ''}`;
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
