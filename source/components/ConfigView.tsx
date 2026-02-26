import { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import type { Config, SessionSequence } from '../types.js';
import { saveConfig } from '../lib/config.js';
import { ALL_SOUND_CHOICES, SOUND_LABELS, previewSound } from '../lib/sounds.js';
import type { SoundEvent } from '../lib/sounds.js';
import { loadTrackerConfig, saveTrackerConfig, SlotCategory, DomainRule, loadTrackerConfigFull, saveTrackerConfigFull, getCategoryByCode } from '../lib/tracker.js';
import { getAllDomains, getAllDomainPaths } from '../lib/browser-stats.js';
import { loadSequences, saveSequence, deleteSequence as deleteSeq, importDefaultSequences } from '../lib/sequences.js';
import { parseSequenceString } from '../hooks/useSequence.js';
import { FilterInput } from './FilterInput.js';

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
  { key: 'browserTracking', label: 'Browser Tracking', type: 'boolean' },
];

type CatEditStep = 'code' | 'label' | 'color' | 'key';

export function ConfigView({ config, onConfigChange, setIsTyping }: ConfigViewProps) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [saved, setSaved] = useState(false);

  // Tracker categories sub-mode
  const [catMode, setCatMode] = useState(false);
  const [catList, setCatList] = useState<SlotCategory[]>(() => loadTrackerConfig().categories);
  const [catCursor, setCatCursor] = useState(0);
  const [catEditing, setCatEditing] = useState<'add' | 'edit' | null>(null);
  const [catEditStep, setCatEditStep] = useState<CatEditStep>('code');
  const [catEditCode, setCatEditCode] = useState('');
  const [catEditLabel, setCatEditLabel] = useState('');
  const [catEditColor, setCatEditColor] = useState('cyan');
  const [catEditKey, setCatEditKey] = useState('');

  // Domain rules sub-mode
  const [ruleMode, setRuleMode] = useState(false);
  const [ruleList, setRuleList] = useState<DomainRule[]>(() => loadTrackerConfigFull().domainRules);
  const [ruleCursor, setRuleCursor] = useState(0);
  const [ruleEditing, setRuleEditing] = useState<'add' | 'edit' | null>(null);
  const [ruleEditStep, setRuleEditStep] = useState<'pattern' | 'category'>('pattern');
  const [ruleEditPattern, setRuleEditPattern] = useState('');
  const [ruleEditCatIdx, setRuleEditCatIdx] = useState(0);
  const [knownDomains] = useState<string[]>(() => [...getAllDomains(), ...getAllDomainPaths()]);
  const [domainSugIdx, setDomainSugIdx] = useState(0);

  // Sequence CRUD sub-mode
  const [seqMode, setSeqMode] = useState(false);
  const [seqList, setSeqList] = useState<SessionSequence[]>(() => loadSequences());
  const [seqCursor, setSeqCursor] = useState(0);
  const [seqEditing, setSeqEditing] = useState<'add' | 'edit' | null>(null);
  const [seqEditStep, setSeqEditStep] = useState<'name' | 'blocks'>('name');
  const [seqEditName, setSeqEditName] = useState('');
  const [seqEditBlocks, setSeqEditBlocks] = useState('');
  const [seqError, setSeqError] = useState('');

  const refreshSeqs = useCallback(() => {
    setSeqList(loadSequences());
  }, []);

  const saveRules = useCallback((rules: DomainRule[]) => {
    setRuleList(rules);
    const full = loadTrackerConfigFull();
    saveTrackerConfigFull({ ...full, domainRules: rules });
  }, []);

  const CAT_COLORS = ['cyan', 'blueBright', 'green', 'yellow', 'blue', 'gray', 'red', 'redBright', 'magenta', 'white'];

  const saveCats = useCallback((cats: SlotCategory[]) => {
    setCatList(cats);
    saveTrackerConfig({ categories: cats });
  }, []);

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
    if (newChoice !== 'none' && newChoice !== 'custom' && config.sound) {
      previewSound(newChoice, config.sounds.volume);
    }
  }, [config, onConfigChange]);

  useInput((input, key) => {
    // Category edit sub-flow (add/edit form)
    if (catEditing) {
      if (key.escape) { setCatEditing(null); setIsTyping(false); return; }

      if (catEditStep === 'code') {
        // TextInput handles
        return;
      }
      if (catEditStep === 'label') {
        return;
      }
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
      if (catEditStep === 'key') {
        // TextInput handles
        return;
      }
      return;
    }

    // Domain rule edit sub-flow
    if (ruleEditing) {
      if (key.escape) { setRuleEditing(null); setIsTyping(false); return; }
      if (ruleEditStep === 'pattern') {
        if (key.downArrow) { setDomainSugIdx(i => i + 1); return; }
        if (key.upArrow) { setDomainSugIdx(i => Math.max(0, i - 1)); return; }
        return;
      }
      if (ruleEditStep === 'category') {
        if (input === 'h' || key.leftArrow) {
          setRuleEditCatIdx(i => (i - 1 + catList.length) % catList.length);
        } else if (input === 'l' || key.rightArrow) {
          setRuleEditCatIdx(i => (i + 1) % catList.length);
        } else if (key.return) {
          // Finish
          if (ruleEditPattern.trim()) {
            const rule: DomainRule = {
              pattern: ruleEditPattern.trim(),
              category: catList[ruleEditCatIdx]?.code ?? 'D',
            };
            if (ruleEditing === 'add') {
              saveRules([...ruleList, rule]);
            } else {
              const newList = [...ruleList];
              newList[ruleCursor] = rule;
              saveRules(newList);
            }
          }
          setRuleEditing(null);
          setIsTyping(false);
        }
        return;
      }
      return;
    }

    // Sequence edit sub-flow
    if (seqEditing) {
      if (key.escape) { setSeqEditing(null); setIsTyping(false); setSeqError(''); return; }
      return; // FilterInput handles input
    }

    // Sequence list mode
    if (seqMode) {
      if (key.escape) { setSeqMode(false); return; }
      if (input === 'j' || key.downArrow) setSeqCursor(p => Math.min(p + 1, seqList.length - 1));
      else if (input === 'k' || key.upArrow) setSeqCursor(p => Math.max(0, p - 1));
      else if (input === 'a') {
        setSeqEditing('add');
        setSeqEditStep('name');
        setSeqEditName('');
        setSeqEditBlocks('');
        setSeqError('');
        setIsTyping(true);
      } else if (input === 'e' && seqList.length > 0) {
        const seq = seqList[seqCursor]!;
        setSeqEditing('edit');
        setSeqEditStep('blocks');
        setSeqEditName(seq.name);
        setSeqEditBlocks(seq.blocks.map(b => `${b.durationMinutes}${b.type === 'work' ? 'w' : 'b'}`).join(' '));
        setSeqError('');
        setIsTyping(true);
      } else if (input === 'd' && seqList.length > 0) {
        const seq = seqList[seqCursor]!;
        deleteSeq(seq.name);
        refreshSeqs();
        setSeqCursor(p => Math.min(p, Math.max(0, seqList.length - 2)));
      } else if (input === 'i') {
        importDefaultSequences();
        refreshSeqs();
      }
      return;
    }

    // Domain rule list mode
    if (ruleMode) {
      if (key.escape) { setRuleMode(false); return; }
      if (input === 'j' || key.downArrow) setRuleCursor(p => Math.min(p + 1, ruleList.length - 1));
      else if (input === 'k' || key.upArrow) setRuleCursor(p => Math.max(0, p - 1));
      else if (input === 'a') {
        setRuleEditing('add');
        setRuleEditStep('pattern');
        setRuleEditPattern('');
        setRuleEditCatIdx(0);
        setIsTyping(true);
      } else if (input === 'e' && ruleList.length > 0) {
        const rule = ruleList[ruleCursor]!;
        setRuleEditing('edit');
        setRuleEditStep('pattern');
        setRuleEditPattern(rule.pattern);
        setRuleEditCatIdx(Math.max(0, catList.findIndex(c => c.code === rule.category)));
        setIsTyping(true);
      } else if (input === 'd' && ruleList.length > 0) {
        const newList = ruleList.filter((_, i) => i !== ruleCursor);
        saveRules(newList);
        setRuleCursor(p => Math.min(p, newList.length - 1));
      }
      return;
    }

    // Category list mode
    if (catMode) {
      if (key.escape) { setCatMode(false); return; }
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
      return;
    }

    if (isEditing) {
      if (key.escape) {
        setIsEditing(false);
        setIsTyping(false);
      }
      return;
    }

    // Total items = FIELDS.length + 3 (Tracker Categories, Domain Rules, Sequences)
    const totalItems = FIELDS.length + 3;

    if (input === 'j' || key.downArrow) {
      setSelectedIdx(i => Math.min(i + 1, totalItems - 1));
      return;
    }
    if (input === 'k' || key.upArrow) {
      setSelectedIdx(i => Math.max(i - 1, 0));
      return;
    }

    if (key.return) {
      // Check if on the "Tracker Categories" row
      if (selectedIdx === FIELDS.length) {
        setCatMode(true);
        setCatCursor(0);
        setCatList(loadTrackerConfig().categories);
        return;
      }
      // Check if on the "Domain Rules" row
      if (selectedIdx === FIELDS.length + 1) {
        setRuleMode(true);
        setRuleCursor(0);
        setRuleList(loadTrackerConfigFull().domainRules);
        return;
      }
      // Check if on the "Sequences" row
      if (selectedIdx === FIELDS.length + 2) {
        setSeqMode(true);
        setSeqCursor(0);
        refreshSeqs();
        return;
      }
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

    if (input === 'p') {
      const field = FIELDS[selectedIdx]!;
      if (field?.type === 'sound-event' && field.soundEvent && config.sound) {
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

  // ─── Sequence Name Submit ────────────────────────────────────────────────────

  const handleSeqNameSubmit = useCallback((value: string) => {
    const name = value.trim();
    if (!name) { setSeqError('Name cannot be empty'); return; }
    setSeqEditName(name);
    setSeqEditStep('blocks');
    setSeqEditBlocks('');
    setSeqError('');
  }, []);

  const handleSeqBlocksSubmit = useCallback((value: string) => {
    const seq = parseSequenceString(value.trim());
    if (!seq) { setSeqError('Invalid format. Use: 45w 15b 45w'); return; }

    if (seqEditing === 'add') {
      seq.name = seqEditName;
      saveSequence(seq);
    } else if (seqEditing === 'edit') {
      const existing = seqList[seqCursor];
      if (existing) {
        seq.name = existing.name;
        saveSequence(seq);
      }
    }

    refreshSeqs();
    setSeqEditing(null);
    setIsTyping(false);
    setSeqError('');
  }, [seqEditing, seqEditName, seqCursor, seqList, refreshSeqs, setIsTyping]);

  // ─── Sequence Editor Sub-mode ──────────────────────────────────────────────

  if (seqEditing) {
    return (
      <Box flexDirection="column" flexGrow={1}>
        <Text bold color="cyan">{seqEditing === 'add' ? 'Add' : 'Edit'} Sequence</Text>
        <Text dimColor>Esc to cancel</Text>
        <Box marginTop={1} flexDirection="column">
          {seqEditStep === 'name' && (
            <FilterInput
              label="Name: "
              value={seqEditName}
              onChange={setSeqEditName}
              onSubmit={handleSeqNameSubmit}
              placeholder="my-flow"
            />
          )}
          {seqEditStep === 'blocks' && (
            <Box flexDirection="column">
              <Text>Name: <Text bold>{seqEditName}</Text></Text>
              <FilterInput
                label="Blocks: "
                value={seqEditBlocks}
                onChange={setSeqEditBlocks}
                onSubmit={handleSeqBlocksSubmit}
                placeholder="e.g. 45w 15b 45w"
              />
            </Box>
          )}
        </Box>
        {seqError !== '' && (
          <Box marginTop={1}><Text color="red">{seqError}</Text></Box>
        )}
      </Box>
    );
  }

  // ─── Sequence List Sub-mode ────────────────────────────────────────────────

  if (seqMode) {
    return (
      <Box flexDirection="column" flexGrow={1}>
        <Text bold color="cyan">Sequences</Text>
        <Text dimColor>a:add  e:edit  d:delete  i:import presets  Esc:back</Text>
        <Box flexDirection="column" marginTop={1}>
          {seqList.map((seq, i) => {
            const formatBlocks = seq.blocks.map(b => `${b.durationMinutes}${b.type === 'work' ? 'w' : 'b'}`).join(' ');
            const total = seq.blocks.reduce((s, b) => s + b.durationMinutes, 0);
            return (
              <Box key={seq.name}>
                <Text color={i === seqCursor ? 'yellow' : 'gray'} bold={i === seqCursor}>
                  {i === seqCursor ? '> ' : '  '}
                </Text>
                <Box width={14}><Text color={i === seqCursor ? 'white' : 'gray'} bold={i === seqCursor}>{seq.name}</Text></Box>
                <Box width={36}><Text dimColor>{formatBlocks}</Text></Box>
                <Text dimColor>{total}m</Text>
              </Box>
            );
          })}
          {seqList.length === 0 && <Text dimColor>  No sequences. Press i to import presets or a to add one.</Text>}
        </Box>
      </Box>
    );
  }

  // ─── Domain Rule Editor Sub-mode ─────────────────────────────────────────────

  if (ruleEditing) {
    return (
      <Box flexDirection="column" flexGrow={1}>
        <Text bold color="cyan">{ruleEditing === 'add' ? 'Add' : 'Edit'} Domain Rule</Text>
        <Text dimColor>Esc to cancel</Text>
        <Box marginTop={1} flexDirection="column">
          {ruleEditStep === 'pattern' && (() => {
            const filtered = ruleEditPattern.length > 0
              ? knownDomains.filter(d => d.toLowerCase().includes(ruleEditPattern.toLowerCase()))
              : knownDomains;
            const activeIdx = domainSugIdx % Math.max(1, filtered.length);
            const startIdx = Math.max(0, Math.min(activeIdx - 3, filtered.length - 8));
            const shown = filtered.slice(startIdx, startIdx + 8);
            return (
              <Box flexDirection="column">
                <Box>
                  <Text>Domain pattern: </Text>
                  <TextInput
                    value={ruleEditPattern}
                    onChange={(v) => { setRuleEditPattern(v); setDomainSugIdx(0); }}
                    onSubmit={() => {
                      // If a suggestion is highlighted and differs from input, fill it first
                      if (filtered.length > 0) {
                        const pick = filtered[activeIdx];
                        if (pick && pick !== ruleEditPattern) {
                          setRuleEditPattern(pick);
                          return;
                        }
                      }
                      if (ruleEditPattern.trim()) { setRuleEditStep('category'); setIsTyping(false); }
                    }}
                  />
                </Box>
                {shown.length > 0 && (
                  <Box flexDirection="column" marginTop={1}>
                    <Text dimColor>↑/↓ select, Enter to fill/confirm</Text>
                    {shown.map((d) => {
                      const realIdx = filtered.indexOf(d);
                      return (
                        <Text key={d} color={realIdx === activeIdx ? 'cyan' : 'gray'} bold={realIdx === activeIdx}>
                          {realIdx === activeIdx ? '> ' : '  '}{d}
                        </Text>
                      );
                    })}
                    {filtered.length > 8 && <Text dimColor>  ...{filtered.length - 8} more</Text>}
                  </Box>
                )}
              </Box>
            );
          })()}
          {ruleEditStep === 'category' && (
            <Box flexDirection="column">
              <Text>Pattern: <Text bold>{ruleEditPattern}</Text></Text>
              <Box marginTop={1}>
                <Text>Category: </Text>
                {catList.map((cat, i) => (
                  <Text key={cat.code} color={i === ruleEditCatIdx ? 'cyan' : 'gray'} bold={i === ruleEditCatIdx}>
                    {i === ruleEditCatIdx ? '[' : ' '}{cat.code}{i === ruleEditCatIdx ? ']' : ' '}
                  </Text>
                ))}
              </Box>
              <Text dimColor>h/l to select, Enter to save</Text>
            </Box>
          )}
        </Box>
      </Box>
    );
  }

  // ─── Domain Rule List Sub-mode ─────────────────────────────────────────────

  if (ruleMode) {
    return (
      <Box flexDirection="column" flexGrow={1}>
        <Text bold color="cyan">Domain Rules</Text>
        <Text dimColor>a:add  e:edit  d:delete  Esc:back</Text>
        <Box flexDirection="column" marginTop={1}>
          {ruleList.map((rule, i) => (
            <Box key={`${rule.pattern}-${i}`}>
              <Text color={i === ruleCursor ? 'yellow' : 'gray'} bold={i === ruleCursor}>
                {i === ruleCursor ? '> ' : '  '}
              </Text>
              <Box width={25}><Text>{rule.pattern}</Text></Box>
              <Text color="cyan">{' → '}</Text>
              <Text color={getCategoryByCode(rule.category)?.color as any ?? 'white'}>{rule.category}</Text>
            </Box>
          ))}
          {ruleList.length === 0 && <Text dimColor>No domain rules. Press a to add one.</Text>}
        </Box>
      </Box>
    );
  }

  // ─── Category Editor Sub-mode ───────────────────────────────────────────────

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

  // ─── Category List Sub-mode ─────────────────────────────────────────────────

  if (catMode) {
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

  // ─── Main Config View ───────────────────────────────────────────────────────

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

      {/* Tracker Categories entry */}
      <Box>
        <Text color={selectedIdx === FIELDS.length ? 'yellow' : 'gray'} bold={selectedIdx === FIELDS.length}>
          {selectedIdx === FIELDS.length ? '> ' : '  '}
        </Text>
        <Box width={22}>
          <Text color={selectedIdx === FIELDS.length ? 'white' : 'gray'}>Tracker Categories</Text>
        </Box>
        <Text color="cyan" bold={selectedIdx === FIELDS.length}>{catList.length} categories</Text>
        {selectedIdx === FIELDS.length && <Text dimColor>  Enter to manage</Text>}
      </Box>

      {/* Domain Rules entry */}
      <Box>
        <Text color={selectedIdx === FIELDS.length + 1 ? 'yellow' : 'gray'} bold={selectedIdx === FIELDS.length + 1}>
          {selectedIdx === FIELDS.length + 1 ? '> ' : '  '}
        </Text>
        <Box width={22}>
          <Text color={selectedIdx === FIELDS.length + 1 ? 'white' : 'gray'}>Domain Rules</Text>
        </Box>
        <Text color="cyan" bold={selectedIdx === FIELDS.length + 1}>{ruleList.length} rules</Text>
        {selectedIdx === FIELDS.length + 1 && <Text dimColor>  Enter to manage</Text>}
      </Box>

      {/* Sequences entry */}
      <Box>
        <Text color={selectedIdx === FIELDS.length + 2 ? 'yellow' : 'gray'} bold={selectedIdx === FIELDS.length + 2}>
          {selectedIdx === FIELDS.length + 2 ? '> ' : '  '}
        </Text>
        <Box width={22}>
          <Text color={selectedIdx === FIELDS.length + 2 ? 'white' : 'gray'}>Sequences</Text>
        </Box>
        <Text color="cyan" bold={selectedIdx === FIELDS.length + 2}>{seqList.length} sequences</Text>
        {selectedIdx === FIELDS.length + 2 && <Text dimColor>  Enter to manage</Text>}
      </Box>

      {saved && (
        <Box marginTop={1}>
          <Text color="green" bold>Config saved!</Text>
        </Box>
      )}
    </Box>
  );
}
