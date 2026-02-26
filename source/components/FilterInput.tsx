import { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';

interface FilterInputProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onSubmit: (v: string) => void;
  placeholder?: string;
  items?: string[];
  submitHighlighted?: boolean;
}

export function FilterInput({ label, value, onChange, onSubmit, placeholder, items, submitHighlighted }: FilterInputProps) {
  const [highlightIdx, setHighlightIdx] = useState(0);
  const [inputKey, setInputKey] = useState(0);

  const filtered = items && value.length > 0
    ? items.filter(item => item.toLowerCase().includes(value.toLowerCase()))
    : (items ?? []);

  const safeIdx = filtered.length > 0 ? Math.min(highlightIdx, filtered.length - 1) : 0;

  useInput((_input, key) => {
    if (!items || items.length === 0) return;

    if (key.downArrow || (_input === 'j' && key.ctrl)) {
      setHighlightIdx(i => Math.min(i + 1, filtered.length - 1));
      return;
    }
    if (key.upArrow || (_input === 'k' && key.ctrl)) {
      setHighlightIdx(i => Math.max(i - 1, 0));
      return;
    }
    if (key.tab && filtered.length > 0) {
      const pick = filtered[safeIdx];
      if (pick) {
        onChange(pick);
        setInputKey(k => k + 1);
      }
      return;
    }
  });

  const handleChange = (v: string) => {
    onChange(v);
    setHighlightIdx(0);
  };

  const handleSubmit = (v: string) => {
    if (submitHighlighted && items && items.length > 0 && filtered.length > 0) {
      onSubmit(filtered[safeIdx]!);
    } else {
      onSubmit(v);
    }
  };

  return (
    <Box flexDirection="column">
      <Box>
        <Text>{label}</Text>
        <TextInput
          key={inputKey}
          value={value}
          onChange={handleChange}
          onSubmit={handleSubmit}
          placeholder={placeholder}
        />
      </Box>
      {items && items.length > 0 && filtered.length > 0 && (
        <Box flexDirection="column">
          {filtered.slice(0, 8).map((item, i) => (
            <Text key={item} color={i === safeIdx ? 'cyan' : 'gray'} bold={i === safeIdx}>
              {i === safeIdx ? '> ' : '  '}{item}
            </Text>
          ))}
          {filtered.length > 8 && <Text dimColor>  ...{filtered.length - 8} more</Text>}
        </Box>
      )}
    </Box>
  );
}
