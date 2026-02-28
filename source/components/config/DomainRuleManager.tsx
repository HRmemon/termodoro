import { useState, useCallback, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import {
  DomainRule, loadTrackerConfigFull, saveTrackerConfigFull,
  loadTrackerConfig, getCategoryByCode,
} from '../../lib/tracker.js';
import { getAllDomains, getAllDomainPaths } from '../../lib/browser-stats.js';

interface DomainRuleManagerProps {
  setIsTyping: (v: boolean) => void;
  onBack: () => void;
}

export function DomainRuleManager({ setIsTyping, onBack }: DomainRuleManagerProps) {
  const [ruleList, setRuleList] = useState<DomainRule[]>(() => loadTrackerConfigFull().domainRules);
  const [ruleCursor, setRuleCursor] = useState(0);
  const [ruleEditing, setRuleEditing] = useState<'add' | 'edit' | null>(null);
  const [ruleEditStep, setRuleEditStep] = useState<'pattern' | 'category'>('pattern');
  const [ruleEditPattern, setRuleEditPattern] = useState('');
  const [ruleEditCatIdx, setRuleEditCatIdx] = useState(0);
  const [knownDomains] = useState<string[]>(() => [...getAllDomains(), ...getAllDomainPaths()]);
  const [domainSugIdx, setDomainSugIdx] = useState(0);

  // Load categories for picker (memoized to avoid disk read on every render)
  const catList = useMemo(() => loadTrackerConfig().categories, []);

  const saveRules = useCallback((rules: DomainRule[]) => {
    setRuleList(rules);
    const full = loadTrackerConfigFull();
    saveTrackerConfigFull({ ...full, domainRules: rules });
  }, []);

  useInput((input, key) => {
    // Rule edit sub-flow
    if (ruleEditing) {
      if (key.escape) { setRuleEditing(null); setIsTyping(false); return; }
      if (ruleEditStep === 'pattern') {
        const filtered = ruleEditPattern.length > 0
          ? knownDomains.filter(d => d.toLowerCase().includes(ruleEditPattern.toLowerCase()))
          : knownDomains;
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

    // List mode
    if (key.escape) { onBack(); return; }
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
  });

  // Rule editor form
  if (ruleEditing) {
    const filtered = ruleEditPattern.length > 0
      ? knownDomains.filter(d => d.toLowerCase().includes(ruleEditPattern.toLowerCase()))
      : knownDomains;
    const activeIdx = domainSugIdx % Math.max(1, filtered.length);
    const startIdx = Math.max(0, Math.min(activeIdx - 3, filtered.length - 8));
    const shown = filtered.slice(startIdx, startIdx + 8);

    return (
      <Box flexDirection="column" flexGrow={1}>
        <Text bold color="cyan">{ruleEditing === 'add' ? 'Add' : 'Edit'} Domain Rule</Text>
        <Text dimColor>Esc to cancel</Text>
        <Box marginTop={1} flexDirection="column">
          {ruleEditStep === 'pattern' && (
            <Box flexDirection="column">
              <Box>
                <Text>Domain pattern: </Text>
                <TextInput
                  value={ruleEditPattern}
                  onChange={(v) => { setRuleEditPattern(v); setDomainSugIdx(0); }}
                  onSubmit={() => {
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
          )}
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

  // Rule list
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
            <Text color={getCategoryByCode(rule.category)?.color ?? 'white'}>{rule.category}</Text>
          </Box>
        ))}
        {ruleList.length === 0 && <Text dimColor>No domain rules. Press a to add one.</Text>}
      </Box>
    </Box>
  );
}
