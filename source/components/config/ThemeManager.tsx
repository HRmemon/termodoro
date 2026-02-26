import { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import type { Config, ThemeColors } from '../../types.js';
import { PRESETS } from '../../lib/theme.js';
import { saveConfig } from '../../lib/config.js';

interface ThemeManagerProps {
  config: Config;
  onConfigChange: (config: Config) => void;
  setIsTyping: (v: boolean) => void;
  onBack: () => void;
}

const COLOR_KEYS: (keyof ThemeColors)[] = ['focus', 'break', 'highlight', 'text', 'dim', 'bg'];
const HEX_REGEX = /^#[0-9A-Fa-f]{6}$/;
/** Pad a partial hex like `#1A` → `#1A0000` so the preview updates live. */
function padHex(raw: string): string | null {
  if (!raw.startsWith('#')) return null;
  const digits = raw.slice(1).replace(/[^0-9A-Fa-f]/g, '');
  if (digits.length === 0) return null;
  const padded = (digits + '000000').slice(0, 6);
  return `#${padded}`;
}

type EditStep = 'name' | 'focus' | 'break' | 'highlight' | 'text' | 'dim' | 'bg';
const EDIT_STEPS: EditStep[] = ['name', 'focus', 'break', 'highlight', 'text', 'dim', 'bg'];

interface ThemeEntry {
  name: string;
  colors: ThemeColors;
  builtIn: boolean;
}

function getAllThemes(config: Config): ThemeEntry[] {
  const entries: ThemeEntry[] = [];
  for (const [name, colors] of Object.entries(PRESETS)) {
    entries.push({ name, colors, builtIn: true });
  }
  for (const [name, colors] of Object.entries(config.customThemes ?? {})) {
    entries.push({ name, colors, builtIn: false });
  }
  return entries;
}

export function ThemeManager({ config, onConfigChange, setIsTyping, onBack }: ThemeManagerProps) {
  const [cursor, setCursor] = useState(0);
  const [editing, setEditing] = useState<'add' | 'edit' | null>(null);
  const [editStep, setEditStep] = useState<EditStep>('name');
  const [editName, setEditName] = useState('');
  const [editColors, setEditColors] = useState<Record<string, string>>({});
  const [editError, setEditError] = useState('');
  const [originalName, setOriginalName] = useState('');

  const themes = getAllThemes(config);
  const activePreset = config.theme?.preset ?? 'default';

  const saveTheme = useCallback((name: string, colors: ThemeColors, oldName?: string) => {
    const custom = { ...(config.customThemes ?? {}) };
    if (oldName && oldName !== name) delete custom[oldName];
    custom[name] = colors;
    const newConfig = { ...config, customThemes: custom };
    onConfigChange(newConfig);
    saveConfig(newConfig);
  }, [config, onConfigChange]);

  const deleteTheme = useCallback((name: string) => {
    const custom = { ...(config.customThemes ?? {}) };
    delete custom[name];
    const newConfig = { ...config, customThemes: custom };
    // If the deleted theme was active, switch to default
    if (activePreset === name) {
      newConfig.theme = { ...newConfig.theme, preset: 'default' };
    }
    onConfigChange(newConfig);
    saveConfig(newConfig);
  }, [config, onConfigChange, activePreset]);

  const activateTheme = useCallback((name: string) => {
    const newConfig = { ...config, theme: { ...config.theme, preset: name } };
    onConfigChange(newConfig);
    saveConfig(newConfig);
  }, [config, onConfigChange]);

  const startAdd = useCallback(() => {
    setEditing('add');
    setEditStep('name');
    setEditName('');
    setEditColors({});
    setEditError('');
    setOriginalName('');
    setIsTyping(true);
  }, [setIsTyping]);

  const startEdit = useCallback((theme: ThemeEntry) => {
    setEditing('edit');
    setEditStep('name');
    setEditName(theme.name);
    setOriginalName(theme.name);
    setEditColors({ ...theme.colors });
    setEditError('');
    setIsTyping(true);
  }, [setIsTyping]);

  const cancelEdit = useCallback(() => {
    setEditing(null);
    setEditError('');
    setIsTyping(false);
  }, [setIsTyping]);

  const advanceStep = useCallback(() => {
    const idx = EDIT_STEPS.indexOf(editStep);
    if (idx < EDIT_STEPS.length - 1) {
      setEditStep(EDIT_STEPS[idx + 1]!);
      setEditError('');
    }
  }, [editStep]);

  const handleNameSubmit = useCallback((value: string) => {
    const name = value.trim();
    if (!name) { setEditError('Name cannot be empty'); return; }
    const allNames = [
      ...Object.keys(PRESETS),
      ...Object.keys(config.customThemes ?? {}),
    ];
    // Allow keeping the same name when editing
    const isOwnName = editing === 'edit' && name === originalName;
    if (!isOwnName && allNames.includes(name)) {
      setEditError('Name already exists');
      return;
    }
    setEditName(name);
    advanceStep();
  }, [config, editing, originalName, advanceStep]);

  const handleColorSubmit = useCallback((value: string) => {
    const hex = value.trim();
    if (!HEX_REGEX.test(hex)) { setEditError('Invalid hex (use #RRGGBB)'); return; }
    setEditColors(prev => ({ ...prev, [editStep]: hex }));
    const idx = EDIT_STEPS.indexOf(editStep);
    if (idx === EDIT_STEPS.length - 1) {
      // Final step - save
      const finalColors = { ...editColors, [editStep]: hex } as unknown as ThemeColors;
      saveTheme(editName, finalColors, editing === 'edit' ? originalName : undefined);
      setEditing(null);
      setIsTyping(false);
    } else {
      advanceStep();
    }
  }, [editStep, editColors, editName, editing, originalName, saveTheme, advanceStep, setIsTyping]);

  useInput((input, key) => {
    if (editing) {
      if (key.escape) { cancelEdit(); return; }
      return;
    }

    if (key.escape) { onBack(); return; }
    if (input === 'j' || key.downArrow) setCursor(p => Math.min(p + 1, themes.length - 1));
    else if (input === 'k' || key.upArrow) setCursor(p => Math.max(0, p - 1));
    else if (input === 'a') startAdd();
    else if (input === 'e' && themes.length > 0) {
      const theme = themes[cursor]!;
      if (!theme.builtIn) startEdit(theme);
    } else if (input === 'd' && themes.length > 0) {
      const theme = themes[cursor]!;
      if (!theme.builtIn) {
        deleteTheme(theme.name);
        setCursor(p => Math.min(p, themes.length - 2));
      }
    } else if (key.return && themes.length > 0) {
      const theme = themes[cursor]!;
      activateTheme(theme.name);
    }
  });

  // Edit/Add form
  if (editing) {
    const stepIdx = EDIT_STEPS.indexOf(editStep);
    const isColorStep = editStep !== 'name';
    const currentColorKey = isColorStep ? editStep : null;

    return (
      <Box flexDirection="column" flexGrow={1}>
        <Text bold color="cyan">{editing === 'add' ? 'Add' : 'Edit'} Theme</Text>
        <Text dimColor>Esc to cancel</Text>
        <Box marginTop={1} flexDirection="column">
          {/* Show completed fields as context */}
          {stepIdx > 0 && <Text>Name: <Text bold>{editName}</Text></Text>}
          {EDIT_STEPS.slice(1, stepIdx).map(step => (
            <Box key={step}>
              <Text>{step}: </Text>
              <Text color={editColors[step]}>{'\u2588\u2588'}</Text>
              <Text dimColor> {editColors[step]}</Text>
            </Box>
          ))}

          {/* Current step input */}
          {editStep === 'name' ? (
            <Box>
              <Text>Name: </Text>
              <TextInput
                value={editName}
                onChange={v => { setEditName(v); setEditError(''); }}
                onSubmit={handleNameSubmit}
              />
            </Box>
          ) : (
            <Box>
              <Text>{currentColorKey}: </Text>
              <TextInput
                value={editColors[editStep] ?? ''}
                onChange={v => { setEditColors(prev => ({ ...prev, [editStep]: v })); setEditError(''); }}
                onSubmit={handleColorSubmit}
              />
              {(() => {
                const preview = padHex(editColors[editStep] ?? '');
                return preview ? <Text color={preview}> {'\u2588\u2588\u2588\u2588'}</Text> : null;
              })()}
            </Box>
          )}

          {editError && <Text color="red">{editError}</Text>}
          <Text dimColor>Step {stepIdx + 1}/{EDIT_STEPS.length}</Text>
        </Box>
      </Box>
    );
  }

  // List mode
  return (
    <Box flexDirection="column" flexGrow={1}>
      <Text bold color="cyan">Themes</Text>
      <Text dimColor>a:add  e:edit  d:delete  Enter:activate  Esc:back</Text>
      <Box flexDirection="column" marginTop={1}>
        {themes.map((theme, i) => {
          const isSelected = i === cursor;
          const isActive = theme.name === activePreset;
          return (
            <Box key={theme.name}>
              <Text color={isSelected ? 'yellow' : 'gray'} bold={isSelected}>
                {isSelected ? '> ' : '  '}
              </Text>
              <Box width={14}>
                <Text color={isSelected ? 'white' : 'gray'} bold={isActive}>
                  {theme.name}
                </Text>
              </Box>
              {COLOR_KEYS.map(ck => (
                <Text key={ck} color={theme.colors[ck]}>{'\u2588\u2588'}</Text>
              ))}
              {isActive && <Text color="green"> *</Text>}
              {theme.builtIn && <Text dimColor> built-in</Text>}
            </Box>
          );
        })}
        {themes.length === 0 && <Text dimColor>No themes. Press a to add one.</Text>}
      </Box>
    </Box>
  );
}
