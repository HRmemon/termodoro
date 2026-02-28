import { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import type { Config } from '../../types.js';
import { saveConfig } from '../../lib/config.js';
import { ALL_SOUND_CHOICES, SOUND_LABELS, previewSound } from '../../lib/sounds.js';
import type { SoundEvent, SoundChoice } from '../../lib/sounds.js';
import { SoundPicker } from './SoundPicker.js';
import { ConfigNavEntry } from './ConfigNavEntry.js';
import type { Keymap } from '../../lib/keymap.js';

type FieldType = 'number' | 'boolean' | 'cycle' | 'sound-event' | 'sound-duration' | 'sound-volume';

interface ConfigField {
  key: string;
  label: string;
  type: FieldType;
  unit?: string;
  values?: string[];
  soundEvent?: SoundEvent;
}

export const FIELDS: ConfigField[] = [
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
  { key: 'browserTracking', label: 'Browser Tracking', type: 'boolean' },
  { key: 'webDomainLimit', label: 'Web Domain Limit', type: 'number', unit: 'domains' },
  { key: 'sidebarWidth', label: 'Sidebar Width', type: 'number', unit: 'chars' },
  { key: 'layout.sidebar', label: 'Sidebar', type: 'cycle', values: ['visible', 'hidden'] },
  { key: 'layout.showKeysBar', label: 'Keys Bar', type: 'boolean' },
  { key: 'layout.compact', label: 'Compact Mode', type: 'boolean' },
  { key: 'calendar.showSessionHeatmap', label: 'Cal: Heatmap', type: 'boolean' },
  { key: 'calendar.weekStartsOn', label: 'Cal: Week Start', type: 'cycle', values: ['1', '0'] },
  { key: 'calendar.showWeekNumbers', label: 'Cal: Week Numbers', type: 'boolean' },
  { key: 'calendar.defaultView', label: 'Cal: Default View', type: 'cycle', values: ['monthly', 'daily'] },
  { key: 'calendar.privacyMode', label: 'Cal: Privacy Mode', type: 'boolean' },
];

interface ConfigFieldListProps {
  config: Config;
  onConfigChange: (config: Config) => void;
  setIsTyping: (v: boolean) => void;
  catCount: number;
  ruleCount: number;
  seqCount: number;
  onOpenCategories: () => void;
  onOpenRules: () => void;
  onOpenSequences: () => void;
  onOpenKeybindings: () => void;
  onOpenThemes: () => void;
  keybindingCount: number;
  themeCount: number;
  keymap?: Keymap;
}

function getNestedValue(obj: Record<string, any>, path: string): any {
  const parts = path.split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

function setNestedValue(obj: Record<string, any>, path: string, value: any): Record<string, any> {
  const parts = path.split('.');
  if (parts.length === 1) return { ...obj, [parts[0]!]: value };
  const [head, ...rest] = parts;
  return { ...obj, [head!]: setNestedValue(obj[head!] ?? {}, rest.join('.'), value) };
}

export function ConfigFieldList({
  config,
  onConfigChange,
  setIsTyping,
  catCount,
  ruleCount,
  seqCount,
  onOpenCategories,
  onOpenRules,
  onOpenSequences,
  onOpenKeybindings,
  onOpenThemes,
  keybindingCount,
  themeCount,
  keymap,
}: ConfigFieldListProps) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [saved, setSaved] = useState(false);
  const [soundPickerEvent, setSoundPickerEvent] = useState<SoundEvent | null>(null);

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
    return String(getNestedValue(config as any, field.key));
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
    if (newChoice !== 'none' && newChoice !== 'custom' && config.sound) {
      previewSound(newChoice, config.sounds.volume);
    }
  }, [config, onConfigChange]);

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
        // Clamp specific fields to valid ranges
        let clamped = num;
        if (field.key === 'sidebarWidth') clamped = Math.min(Math.max(num, 8), 30);
        else if (field.key === 'webDomainLimit') clamped = Math.min(Math.max(num, 10), 500);
        const newConfig = setNestedValue(config as any, field.key, clamped) as Config;
        onConfigChange(newConfig);
        saveConfig(newConfig);
      }
    }
    setIsEditing(false);
    setIsTyping(false);
  }, [selectedIdx, config, onConfigChange, setIsTyping]);

  // FIELDS + Tracker Categories + Domain Rules + Sequences + Keybindings + Themes
  const totalItems = FIELDS.length + 5;

  useInput((input, key) => {
    // If sound picker is open, let it handle input
    if (soundPickerEvent !== null) return;

    if (isEditing) {
      if (key.escape) {
        setIsEditing(false);
        setIsTyping(false);
      }
      return;
    }

    const km = keymap;
    if ((km ? km.matches('nav.down', input, key) : input === 'j') || key.downArrow) {
      setSelectedIdx(i => Math.min(i + 1, totalItems - 1));
      return;
    }
    if ((km ? km.matches('nav.up', input, key) : input === 'k') || key.upArrow) {
      setSelectedIdx(i => Math.max(i - 1, 0));
      return;
    }

    if (key.return) {
      if (selectedIdx === FIELDS.length) { onOpenCategories(); return; }
      if (selectedIdx === FIELDS.length + 1) { onOpenRules(); return; }
      if (selectedIdx === FIELDS.length + 2) { onOpenSequences(); return; }
      if (selectedIdx === FIELDS.length + 3) { onOpenKeybindings(); return; }
      if (selectedIdx === FIELDS.length + 4) { onOpenThemes(); return; }

      const field = FIELDS[selectedIdx]!;
      if (field.type === 'boolean') {
        const current = getNestedValue(config as any, field.key);
        const newConfig = setNestedValue(config as any, field.key, !current) as Config;
        onConfigChange(newConfig);
        saveConfig(newConfig);
      } else if (field.type === 'cycle' && field.values) {
        const currentIdx = field.values.indexOf(String(getNestedValue(config as any, field.key)));
        const nextIdx = (currentIdx + 1) % field.values.length;
        const newConfig = setNestedValue(config as any, field.key, field.values[nextIdx]) as Config;
        onConfigChange(newConfig);
        saveConfig(newConfig);
      } else if (field.type === 'sound-event') {
        if (field.soundEvent) {
          setSoundPickerEvent(field.soundEvent);
        } else {
          cycleSoundChoice(field);
        }
      } else if (field.type === 'sound-duration') {
        setEditValue(String(config.sounds.alarmDuration));
        setIsEditing(true);
        setIsTyping(true);
      } else if (field.type === 'sound-volume') {
        setEditValue(String(config.sounds.volume));
        setIsEditing(true);
        setIsTyping(true);
      } else {
        setEditValue(String(getNestedValue(config as any, field.key)));
        setIsEditing(true);
        setIsTyping(true);
      }
      return;
    }

    if (input === 'p') {
      const field = FIELDS[selectedIdx]!;
      if (field?.type === 'sound-event' && field.soundEvent && config.sound) {
        const choice = config.sounds[field.soundEvent];
        const customPath = config.sounds.customPaths[field.soundEvent];
        previewSound(choice, config.sounds.volume, customPath);
      }
      return;
    }

    if (km ? km.matches('config.save', input, key) : input === 's') {
      saveConfig(config);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      return;
    }
  });

  const handleSoundPickerSelect = useCallback((choice: SoundChoice, customPath?: string) => {
    if (!soundPickerEvent) return;
    const newSounds = { ...config.sounds, [soundPickerEvent]: choice };
    if (customPath !== undefined) {
      newSounds.customPaths = { ...newSounds.customPaths, [soundPickerEvent]: customPath };
    }
    const newConfig = { ...config, sounds: newSounds };
    onConfigChange(newConfig);
    saveConfig(newConfig);
    setSoundPickerEvent(null);
  }, [soundPickerEvent, config, onConfigChange]);

  // When sound picker is open, render it in place of the field list
  if (soundPickerEvent !== null) {
    const currentChoice = config.sounds[soundPickerEvent];
    const customPath = config.sounds.customPaths[soundPickerEvent];
    return (
      <Box flexDirection="column" flexGrow={1}>
        <SoundPicker
          soundEvent={soundPickerEvent}
          currentChoice={currentChoice}
          volume={config.sounds.volume}
          customPath={customPath}
          onSelect={handleSoundPickerSelect}
          onCancel={() => setSoundPickerEvent(null)}
          keymap={keymap}
        />
      </Box>
    );
  }

  return (
    <Box flexDirection="column" flexGrow={1}>
      {FIELDS.map((field, i) => {
        const isSelected = i === selectedIdx;
        let displayValue: string;
        let valueColor: string;
        if (field.type === 'boolean') {
          const val = getNestedValue(config as any, field.key);
          displayValue = val ? 'ON' : 'OFF';
          valueColor = val ? 'green' : 'red';
        } else if (field.type === 'cycle') {
          displayValue = String(getNestedValue(config as any, field.key));
          valueColor = 'cyan';
        } else if (field.type === 'sound-event') {
          displayValue = getFieldValue(field);
          valueColor = 'magenta';
        } else if (field.type === 'sound-duration' || field.type === 'sound-volume') {
          displayValue = getFieldValue(field);
          valueColor = 'cyan';
        } else {
          const val = getNestedValue(config as any, field.key);
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

      <ConfigNavEntry label="Tracker Categories" detail={`${catCount} categories`} isSelected={selectedIdx === FIELDS.length} hint="Enter to manage" />
      <ConfigNavEntry label="Domain Rules" detail={`${ruleCount} rules`} isSelected={selectedIdx === FIELDS.length + 1} hint="Enter to manage" />
      <ConfigNavEntry label="Sequences" detail={`${seqCount} sequences`} isSelected={selectedIdx === FIELDS.length + 2} hint="Enter to manage" />
      <ConfigNavEntry label="Keybindings" detail={keybindingCount > 0 ? `${keybindingCount} custom` : 'defaults'} isSelected={selectedIdx === FIELDS.length + 3} hint="Enter to manage" />
      <ConfigNavEntry label="Themes" detail={themeCount > 0 ? `${themeCount} custom` : 'built-in only'} isSelected={selectedIdx === FIELDS.length + 4} hint="Enter to manage" />

      {saved && (
        <Box marginTop={1}>
          <Text color="green" bold>Config saved!</Text>
        </Box>
      )}
    </Box>
  );
}
