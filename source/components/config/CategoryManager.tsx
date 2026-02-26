import { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { loadTrackerConfig, saveTrackerConfig, SlotCategory } from '../../lib/tracker.js';

interface CategoryManagerProps {
  setIsTyping: (v: boolean) => void;
  onBack: () => void;
}

type CatEditStep = 'code' | 'label' | 'color' | 'key';

const CAT_COLORS = ['cyan', 'blueBright', 'green', 'yellow', 'blue', 'gray', 'red', 'redBright', 'magenta', 'white'];

export function CategoryManager({ setIsTyping, onBack }: CategoryManagerProps) {
  const [catList, setCatList] = useState<SlotCategory[]>(() => loadTrackerConfig().categories);
  const [catCursor, setCatCursor] = useState(0);
  const [catEditing, setCatEditing] = useState<'add' | 'edit' | null>(null);
  const [catEditStep, setCatEditStep] = useState<CatEditStep>('code');
  const [catEditCode, setCatEditCode] = useState('');
  const [catEditLabel, setCatEditLabel] = useState('');
  const [catEditColor, setCatEditColor] = useState('cyan');
  const [catEditKey, setCatEditKey] = useState('');

  const saveCats = useCallback((cats: SlotCategory[]) => {
    setCatList(cats);
    saveTrackerConfig({ categories: cats });
  }, []);

  const handleCatEditFinish = useCallback(() => {
    if (!catEditCode.trim()) { setCatEditing(null); setIsTyping(false); return; }
    const newCat: SlotCategory = {
      code: catEditCode.trim(),
      label: catEditLabel.trim() || catEditCode.trim(),
      color: catEditColor,
      key: catEditKey.trim() || null,
    };
    if (catEditing === 'add') {
      saveCats([...catList, newCat]);
    } else if (catEditing === 'edit') {
      const newList = [...catList];
      newList[catCursor] = newCat;
      saveCats(newList);
    }
    setCatEditing(null);
    setIsTyping(false);
  }, [catEditing, catEditCode, catEditLabel, catEditColor, catEditKey, catList, catCursor, saveCats, setIsTyping]);

  useInput((input, key) => {
    // Category edit sub-flow
    if (catEditing) {
      if (key.escape) { setCatEditing(null); setIsTyping(false); return; }
      if (catEditStep === 'code') return;
      if (catEditStep === 'label') return;
      if (catEditStep === 'color') {
        if (input === 'h' || key.leftArrow) {
          setCatEditColor(c => {
            const idx = CAT_COLORS.indexOf(c);
            return CAT_COLORS[(idx - 1 + CAT_COLORS.length) % CAT_COLORS.length]!;
          });
        } else if (input === 'l' || key.rightArrow) {
          setCatEditColor(c => {
            const idx = CAT_COLORS.indexOf(c);
            return CAT_COLORS[(idx + 1) % CAT_COLORS.length]!;
          });
        } else if (key.return) {
          setCatEditStep('key');
          setIsTyping(true);
        }
        return;
      }
      if (catEditStep === 'key') return;
      return;
    }

    // List mode
    if (key.escape) { onBack(); return; }
    if (input === 'j' || key.downArrow) setCatCursor(p => Math.min(p + 1, catList.length - 1));
    else if (input === 'k' || key.upArrow) setCatCursor(p => Math.max(0, p - 1));
    else if (input === 'a') {
      setCatEditing('add');
      setCatEditStep('code');
      setCatEditCode('');
      setCatEditLabel('');
      setCatEditColor('cyan');
      setCatEditKey('');
      setIsTyping(true);
    } else if (input === 'e' && catList.length > 0) {
      const cat = catList[catCursor]!;
      setCatEditing('edit');
      setCatEditStep('code');
      setCatEditCode(cat.code);
      setCatEditLabel(cat.label);
      setCatEditColor(cat.color);
      setCatEditKey(cat.key ?? '');
      setIsTyping(true);
    } else if (input === 'd' && catList.length > 0) {
      const newList = catList.filter((_, i) => i !== catCursor);
      saveCats(newList);
      setCatCursor(p => Math.min(p, newList.length - 1));
    }
  });

  // Category editor form
  if (catEditing) {
    return (
      <Box flexDirection="column" flexGrow={1}>
        <Text bold color="cyan">{catEditing === 'add' ? 'Add' : 'Edit'} Category</Text>
        <Text dimColor>Esc to cancel</Text>
        <Box marginTop={1} flexDirection="column">
          {catEditStep === 'code' && (
            <Box>
              <Text>Code: </Text>
              <TextInput
                value={catEditCode}
                onChange={setCatEditCode}
                onSubmit={() => { if (catEditCode.trim()) setCatEditStep('label'); }}
              />
            </Box>
          )}
          {catEditStep === 'label' && (
            <Box flexDirection="column">
              <Text>Code: <Text bold>{catEditCode}</Text></Text>
              <Box>
                <Text>Label: </Text>
                <TextInput
                  value={catEditLabel}
                  onChange={setCatEditLabel}
                  onSubmit={() => { setCatEditStep('color'); setIsTyping(false); }}
                />
              </Box>
            </Box>
          )}
          {catEditStep === 'color' && (
            <Box flexDirection="column">
              <Text>Code: <Text bold>{catEditCode}</Text>  Label: <Text bold>{catEditLabel}</Text></Text>
              <Box marginTop={1}>
                <Text>Color: </Text>
                {CAT_COLORS.map((c) => (
                  <Text key={c} color={c as any} bold={c === catEditColor}>
                    {c === catEditColor ? '[' : ' '}{'\u2588'}{c === catEditColor ? ']' : ' '}
                  </Text>
                ))}
              </Box>
              <Text dimColor>h/l to select, Enter to continue</Text>
            </Box>
          )}
          {catEditStep === 'key' && (
            <Box flexDirection="column">
              <Text>Code: <Text bold>{catEditCode}</Text>  Label: <Text bold>{catEditLabel}</Text>  Color: <Text color={catEditColor as any}>{'\u2588'}</Text></Text>
              <Box>
                <Text>Shortcut key (empty for none): </Text>
                <TextInput
                  value={catEditKey}
                  onChange={setCatEditKey}
                  onSubmit={handleCatEditFinish}
                />
              </Box>
            </Box>
          )}
        </Box>
      </Box>
    );
  }

  // Category list
  return (
    <Box flexDirection="column" flexGrow={1}>
      <Text bold color="cyan">Tracker Categories</Text>
      <Text dimColor>a:add  e:edit  d:delete  Esc:back</Text>
      <Box flexDirection="column" marginTop={1}>
        {catList.map((cat, i) => (
          <Box key={`${cat.code}-${i}`}>
            <Text color={i === catCursor ? 'yellow' : 'gray'} bold={i === catCursor}>
              {i === catCursor ? '> ' : '  '}
            </Text>
            <Text dimColor>[</Text>
            <Text color={cat.key ? 'white' : 'gray'} bold={!!cat.key}>
              {cat.key ?? ' '}
            </Text>
            <Text dimColor>] </Text>
            <Box width={5}><Text color={cat.color as any}>{cat.code}</Text></Box>
            <Box width={16}><Text>{cat.label}</Text></Box>
            <Text color={cat.color as any}>{'\u2588\u2588'}</Text>
          </Box>
        ))}
        {catList.length === 0 && <Text dimColor>No categories. Press a to add one.</Text>}
      </Box>
    </Box>
  );
}
