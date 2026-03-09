import { useState, useCallback, useMemo, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import type { Config } from '../../types.js';
import { saveConfig } from '../../lib/config.js';
import { ALL_SOUND_CHOICES, SOUND_LABELS, previewSound } from '../../lib/sounds.js';
import type { SoundEvent, SoundChoice } from '../../lib/sounds.js';
import { SoundPicker } from './SoundPicker.js';
import { ConfigNavEntry } from './ConfigNavEntry.js';
import { type Keymap, kmMatches } from '../../lib/keymap.js';
import { useFullScreen } from '../../hooks/useFullScreen.js';

type FieldType = 'number' | 'boolean' | 'cycle' | 'sound-event' | 'sound-duration' | 'sound-volume';

interface ConfigField {
  key: string;
  label: string;
  type: FieldType;
  unit?: string;
  values?: string[];
  soundEvent?: SoundEvent;
  category: string;
  description: string;
}

export const FIELDS: ConfigField[] = [
  // Pomodoro
  { key: 'workDuration', label: 'Work Duration', type: 'number', unit: 'min', category: 'Pomodoro', description: 'Length of a work session' },
  { key: 'shortBreakDuration', label: 'Short Break', type: 'number', unit: 'min', category: 'Pomodoro', description: 'Length of a short break' },
  { key: 'longBreakDuration', label: 'Long Break', type: 'number', unit: 'min', category: 'Pomodoro', description: 'Length of a long break' },
  { key: 'longBreakInterval', label: 'Long Break After', type: 'number', unit: 'sessions', category: 'Pomodoro', description: 'Number of work sessions before a long break' },
  { key: 'autoStartBreaks', label: 'Auto-start Breaks', type: 'boolean', category: 'Pomodoro', description: 'Automatically start breaks when work finishes' },
  { key: 'autoStartWork', label: 'Auto-start Work', type: 'boolean', category: 'Pomodoro', description: 'Automatically start work when break finishes' },
  { key: 'strictMode', label: 'Strict Mode', type: 'boolean', category: 'Pomodoro', description: 'Disable pausing and skipping sessions' },

  // Sound & Notifications
  { key: 'sound', label: 'Sound', type: 'boolean', category: 'Sound & Notifications', description: 'Enable or disable all sounds' },
  { key: 'sound:work-end', label: '  Work End Sound', type: 'sound-event', soundEvent: 'work-end', category: 'Sound & Notifications', description: 'Sound to play when work ends' },
  { key: 'sound:break-end', label: '  Break End Sound', type: 'sound-event', soundEvent: 'break-end', category: 'Sound & Notifications', description: 'Sound to play when a break ends' },
  { key: 'sound:reminder', label: '  Reminder Sound', type: 'sound-event', soundEvent: 'reminder', category: 'Sound & Notifications', description: 'Sound to play for scheduled reminders' },
  { key: 'reminderNotificationDuration', label: '  Reminder Notif Duration', type: 'number', unit: 'sec', category: 'Sound & Notifications', description: 'How long reminder desktop notifications stay visible' },
  { key: 'reminderSoundDuration', label: '  Reminder Sound Duration', type: 'number', unit: 'sec', category: 'Sound & Notifications', description: 'How long reminder sound plays before stopping' },
  { key: 'reminderVolume', label: '  Reminder Volume', type: 'number', unit: '%', category: 'Sound & Notifications', description: 'Reminder sound volume override' },
  { key: 'sound:alarmDuration', label: '  Alarm Duration', type: 'sound-duration', unit: 'sec', category: 'Sound & Notifications', description: 'How long sounds play before stopping' },
  { key: 'sound:volume', label: '  Volume', type: 'sound-volume', unit: '%', category: 'Sound & Notifications', description: 'Sound volume level' },
  { key: 'notifications', label: 'Notifications', type: 'boolean', category: 'Sound & Notifications', description: 'Enable OS-level desktop notifications' },
  { key: 'notificationDuration', label: 'Notif Duration', type: 'number', unit: 'sec', category: 'Sound & Notifications', description: 'How long OS notifications stay on screen' },

  // UI & Layout
  { key: 'timerFormat', label: 'Timer Format', type: 'cycle', values: ['mm:ss', 'hh:mm:ss', 'minutes'], category: 'UI & Layout', description: 'How the main timer is displayed' },
  { key: 'layout.sidebar', label: 'Sidebar', type: 'cycle', values: ['visible', 'hidden', 'auto'], category: 'UI & Layout', description: 'Sidebar visibility mode' },
  { key: 'sidebarWidth', label: 'Sidebar Width', type: 'number', unit: 'chars', category: 'UI & Layout', description: 'Width of the sidebar in characters' },
  { key: 'layout.showKeysBar', label: 'Keys Bar', type: 'boolean', category: 'UI & Layout', description: 'Show the keyboard shortcuts bar at the bottom' },
  { key: 'layout.compact', label: 'Compact Mode', type: 'boolean', category: 'UI & Layout', description: 'Reduce UI padding and spacing' },
  { key: 'compactTime', label: 'Compact Time Entry', type: 'boolean', category: 'UI & Layout', description: 'Allow typing "930" instead of "09:30" for times' },
  { key: 'vimKeys', label: 'Vim Keys', type: 'boolean', category: 'UI & Layout', description: 'Use hjkl for navigation' },

  // Calendar
  { key: 'calendar.showSessionHeatmap', label: 'Heatmap', type: 'boolean', category: 'Calendar', description: 'Show session activity heatmap in calendar' },
  { key: 'calendar.weekStartsOn', label: 'Week Start', type: 'cycle', values: ['1', '0'], category: 'Calendar', description: '0 for Sunday, 1 for Monday' },
  { key: 'calendar.showWeekNumbers', label: 'Week Numbers', type: 'boolean', category: 'Calendar', description: 'Show week numbers in month view' },
  { key: 'calendar.defaultView', label: 'Default View', type: 'cycle', values: ['monthly', 'daily'], category: 'Calendar', description: 'Initial calendar view' },
  { key: 'calendar.privacyMode', label: 'Privacy Mode', type: 'boolean', category: 'Calendar', description: 'Hide event titles by default' },
  { key: 'calendar.showTaskDeadlines', label: 'Task Deadlines', type: 'boolean', category: 'Calendar', description: 'Show tasks with deadlines in calendar' },
  { key: 'calendar.showReminders', label: 'Reminders', type: 'boolean', category: 'Calendar', description: 'Show scheduled reminders in calendar' },

  // Browser Tracking
  { key: 'browserTracking', label: 'Browser Tracking', type: 'boolean', category: 'Browser Tracking', description: 'Track active browser tabs during sessions' },
  { key: 'webDomainLimit', label: 'Web Domain Limit', type: 'number', unit: 'domains', category: 'Browser Tracking', description: 'Max number of domains to track' },
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

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> {
  const parts = path.split('.');
  if (parts.length === 1) return { ...obj, [parts[0]!]: value };
  const [head, ...rest] = parts;
  return { ...obj, [head!]: setNestedValue((obj[head!] ?? {}) as Record<string, unknown>, rest.join('.'), value) };
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
  // Cast config once for dynamic key access via getNestedValue/setNestedValue
  const cfg = config as unknown as Record<string, unknown>;
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [saved, setSaved] = useState(false);
  const [soundPickerEvent, setSoundPickerEvent] = useState<SoundEvent | null>(null);

  const { rows: termRows } = useFullScreen();
  const WINDOW_SIZE = Math.max(4, termRows - 16);
  const [scrollTop, setScrollTop] = useState(0);

  const allRows = useMemo(() => {
    const r: Array<{ type: 'header' | 'field' | 'manager-header' | 'manager'; data: any; selectableIdx?: number }> = [];
    let lastCat = '';
    FIELDS.forEach((field, i) => {
      if (field.category !== lastCat) {
        r.push({ type: 'header', data: field.category });
        lastCat = field.category;
      }
      r.push({ type: 'field', data: field, selectableIdx: i });
    });

    r.push({ type: 'manager-header', data: 'Data Managers' });
    r.push({ type: 'manager', data: { label: 'Tracker Categories', detail: `${catCount} categories` }, selectableIdx: FIELDS.length });
    r.push({ type: 'manager', data: { label: 'Domain Rules', detail: `${ruleCount} rules` }, selectableIdx: FIELDS.length + 1 });
    r.push({ type: 'manager', data: { label: 'Sequences', detail: `${seqCount} sequences` }, selectableIdx: FIELDS.length + 2 });
    r.push({ type: 'manager', data: { label: 'Keybindings', detail: keybindingCount > 0 ? `${keybindingCount} custom` : 'defaults' }, selectableIdx: FIELDS.length + 3 });
    r.push({ type: 'manager', data: { label: 'Themes', detail: themeCount > 0 ? `${themeCount} custom` : 'built-in only' }, selectableIdx: FIELDS.length + 4 });
    return r;
  }, [catCount, ruleCount, seqCount, keybindingCount, themeCount]);

  const selectedRowIdx = allRows.findIndex(row => row.selectableIdx === selectedIdx);

  useEffect(() => {
    if (selectedRowIdx < scrollTop) {
      setScrollTop(selectedRowIdx);
    } else if (selectedRowIdx >= scrollTop + WINDOW_SIZE) {
      setScrollTop(selectedRowIdx - WINDOW_SIZE + 1);
    }
  }, [selectedRowIdx, scrollTop, WINDOW_SIZE]);

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
    return String(getNestedValue(cfg, field.key));
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
    if (!isNaN(num)) {
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
        if (num <= 0 && field.type === 'number' && field.key !== 'reminderVolume') {
          setIsEditing(false);
          setIsTyping(false);
          return;
        }
        // Clamp specific fields to valid ranges
        let clamped = num;
        if (field.key === 'sidebarWidth') clamped = Math.min(Math.max(num, 8), 30);
        else if (field.key === 'webDomainLimit') clamped = Math.min(Math.max(num, 10), 500);
        else if (field.key === 'reminderNotificationDuration') clamped = Math.min(Math.max(num, 1), 60);
        else if (field.key === 'reminderSoundDuration') clamped = Math.min(Math.max(num, 1), 60);
        else if (field.key === 'reminderVolume') clamped = Math.min(Math.max(num, 0), 100);
        const newConfig = setNestedValue(config as unknown as Record<string, unknown>, field.key, clamped) as unknown as Config;
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
    if ((kmMatches(km, 'nav.down', input, key)) || key.downArrow) {
      setSelectedIdx(i => Math.min(i + 1, totalItems - 1));
      return;
    }
    if ((kmMatches(km, 'nav.up', input, key)) || key.upArrow) {
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
        const current = getNestedValue(cfg, field.key);
        const newConfig = setNestedValue(cfg, field.key, !current) as unknown as Config;
        onConfigChange(newConfig);
        saveConfig(newConfig);
      } else if (field.type === 'cycle' && field.values) {
        const currentIdx = field.values.indexOf(String(getNestedValue(cfg, field.key)));
        const nextIdx = (currentIdx + 1) % field.values.length;
        const newConfig = setNestedValue(cfg, field.key, field.values[nextIdx]) as unknown as Config;
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
        setEditValue(String(getNestedValue(cfg, field.key)));
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

    if (kmMatches(km, 'config.save', input, key)) {
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

  const visibleRows = allRows.slice(scrollTop, scrollTop + WINDOW_SIZE);
  const hasMoreAbove = scrollTop > 0;
  const hasMoreBelow = scrollTop + WINDOW_SIZE < allRows.length;

  return (
    <Box flexDirection="column" flexGrow={1}>
      {hasMoreAbove && (
        <Box paddingLeft={2} flexShrink={0}>
          <Text dimColor>↑ more above</Text>
        </Box>
      )}

      {visibleRows.map((row, i) => {
        if (row.type === 'header') {
          return (
            <Box key={`header-${row.data}`} marginTop={0} marginBottom={0} flexShrink={0}>
              <Text color="blue" bold>--- {row.data} ---</Text>
            </Box>
          );
        }

        if (row.type === 'manager-header') {
          return (
            <Box key="manager-header" marginTop={0} marginBottom={0} flexShrink={0}>
              <Text color="blue" bold>--- {row.data} ---</Text>
            </Box>
          );
        }

        if (row.type === 'manager') {
          const isSelected = row.selectableIdx === selectedIdx;
          return (
            <Box key={row.data.label} flexShrink={0}>
              <ConfigNavEntry
                label={row.data.label}
                detail={row.data.detail}
                isSelected={isSelected}
                hint="Enter to manage"
              />
            </Box>
          );
        }

        const field = row.data as ConfigField;
        const iInFields = row.selectableIdx!;
        const isSelected = iInFields === selectedIdx;
        let displayValue: string;
        let valueColor: string;

        if (field.type === 'boolean') {
          const val = getNestedValue(cfg, field.key);
          displayValue = val ? 'ON' : 'OFF';
          valueColor = val ? 'green' : 'red';
        } else if (field.type === 'cycle') {
          displayValue = String(getNestedValue(cfg, field.key));
          valueColor = 'cyan';
        } else if (field.type === 'sound-event') {
          displayValue = getFieldValue(field);
          valueColor = 'magenta';
        } else if (field.type === 'sound-duration' || field.type === 'sound-volume') {
          displayValue = getFieldValue(field);
          valueColor = 'cyan';
        } else {
          const val = getNestedValue(cfg, field.key);
          displayValue = `${val}${field.unit ? ` ${field.unit}` : ''}`;
          valueColor = 'white';
        }

        return (
          <Box key={field.key} flexDirection="column" flexShrink={0}>
            <Box flexDirection="column">
              <Box flexDirection="row">
                <Text color={isSelected ? 'yellow' : 'gray'} bold={isSelected}>
                  {isSelected ? '> ' : '  '}
                </Text>
                <Box width={26}>
                  <Text color={isSelected ? 'white' : 'gray'}>{field.label}</Text>
                </Box>
                {isSelected && field.type === 'sound-event' && (
                  <Text dimColor>  Enter: cycle  p: preview</Text>
                )}
                {isSelected && field.type === 'sound-event' && (
                  <Text dimColor>  Enter: cycle  p: preview</Text>
                )}
              </Box>
              {isSelected && (
                <Box paddingLeft={4}>
                  <Text dimColor italic>
                    └ {field.description}
                  </Text>
                </Box>
              )}
            </Box>
          </Box>
        );
      })}

      {hasMoreBelow && (
        <Box paddingLeft={2}>
          <Text dimColor>↓ more below</Text>
        </Box>
      )}

      {saved && (
        <Box marginTop={1}>
          <Text color="green" bold>Config saved!</Text>
        </Box>
      )}
    </Box>
  );
}
