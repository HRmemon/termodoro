import { useState, useEffect, useMemo } from 'react';
import type { Config } from '../types.js';
import { loadTrackerConfig, loadTrackerConfigFull } from '../lib/tracker.js';
import { loadSequences } from '../lib/sequences.js';
import { CategoryManager } from './config/CategoryManager.js';
import { DomainRuleManager } from './config/DomainRuleManager.js';
import { SequenceManager } from './config/SequenceManager.js';
import { KeybindingsManager } from './config/KeybindingsManager.js';
import { ThemeManager } from './config/ThemeManager.js';
import { ConfigFieldList } from './config/ConfigFieldList.js';
import type { Keymap } from '../lib/keymap.js';
import { setConfigSubMode } from '../lib/nvim-edit/index.js';

interface ConfigViewProps {
  config: Config;
  onConfigChange: (config: Config) => void;
  setIsTyping: (isTyping: boolean) => void;
  initialSeqMode?: boolean;
  onSeqModeConsumed?: () => void;
  keymap?: Keymap;
}

type SubMode = 'main' | 'categories' | 'rules' | 'sequences' | 'keybindings' | 'themes';

export function ConfigView({ config, onConfigChange, setIsTyping, initialSeqMode, onSeqModeConsumed, keymap }: ConfigViewProps) {
  const [subMode, setSubMode] = useState<SubMode>(initialSeqMode ? 'sequences' : 'main');

  // Consume initialSeqMode flag after opening
  useEffect(() => {
    if (initialSeqMode && onSeqModeConsumed) {
      onSeqModeConsumed();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep nvim-edit in sync with config sub-mode
  useEffect(() => {
    setConfigSubMode(subMode);
  }, [subMode]);

  // Load counts for display in main list (recalculated when returning from sub-modes)
  const { catCount, ruleCount, seqCount, keybindingCount, themeCount } = useMemo(() => ({
    catCount: loadTrackerConfig().categories.length,
    ruleCount: loadTrackerConfigFull().domainRules.length,
    seqCount: loadSequences().length,
    keybindingCount: Object.keys(config.keybindings ?? {}).length,
    themeCount: Object.keys(config.customThemes ?? {}).length,
  }), [subMode, config.keybindings, config.customThemes]);

  switch (subMode) {
    case 'categories':
      return (
        <CategoryManager
          setIsTyping={setIsTyping}
          onBack={() => setSubMode('main')}
        />
      );
    case 'rules':
      return (
        <DomainRuleManager
          setIsTyping={setIsTyping}
          onBack={() => setSubMode('main')}
        />
      );
    case 'sequences':
      return (
        <SequenceManager
          setIsTyping={setIsTyping}
          onBack={() => setSubMode('main')}
        />
      );
    case 'keybindings':
      return (
        <KeybindingsManager
          config={config}
          onConfigChange={onConfigChange}
          setIsTyping={setIsTyping}
          onBack={() => setSubMode('main')}
        />
      );
    case 'themes':
      return (
        <ThemeManager
          config={config}
          onConfigChange={onConfigChange}
          setIsTyping={setIsTyping}
          onBack={() => setSubMode('main')}
        />
      );
    default:
      return (
        <ConfigFieldList
          config={config}
          onConfigChange={onConfigChange}
          setIsTyping={setIsTyping}
          catCount={catCount}
          ruleCount={ruleCount}
          seqCount={seqCount}
          onOpenCategories={() => setSubMode('categories')}
          onOpenRules={() => setSubMode('rules')}
          onOpenSequences={() => setSubMode('sequences')}
          onOpenKeybindings={() => setSubMode('keybindings')}
          onOpenThemes={() => setSubMode('themes')}
          keybindingCount={keybindingCount}
          themeCount={themeCount}
          keymap={keymap}
        />
      );
  }
}
