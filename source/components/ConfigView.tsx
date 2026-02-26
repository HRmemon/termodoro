import { useState, useEffect, useMemo } from 'react';
import type { Config } from '../types.js';
import { loadTrackerConfig, loadTrackerConfigFull } from '../lib/tracker.js';
import { loadSequences } from '../lib/sequences.js';
import { CategoryManager } from './config/CategoryManager.js';
import { DomainRuleManager } from './config/DomainRuleManager.js';
import { SequenceManager } from './config/SequenceManager.js';
import { ConfigFieldList } from './config/ConfigFieldList.js';

interface ConfigViewProps {
  config: Config;
  onConfigChange: (config: Config) => void;
  setIsTyping: (isTyping: boolean) => void;
  initialSeqMode?: boolean;
  onSeqModeConsumed?: () => void;
}

type SubMode = 'main' | 'categories' | 'rules' | 'sequences';

export function ConfigView({ config, onConfigChange, setIsTyping, initialSeqMode, onSeqModeConsumed }: ConfigViewProps) {
  const [subMode, setSubMode] = useState<SubMode>(initialSeqMode ? 'sequences' : 'main');

  // Consume initialSeqMode flag after opening
  useEffect(() => {
    if (initialSeqMode && onSeqModeConsumed) {
      onSeqModeConsumed();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load counts for display in main list (recalculated when returning from sub-modes)
  const { catCount, ruleCount, seqCount } = useMemo(() => ({
    catCount: loadTrackerConfig().categories.length,
    ruleCount: loadTrackerConfigFull().domainRules.length,
    seqCount: loadSequences().length,
  }), [subMode]);

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
        />
      );
  }
}
