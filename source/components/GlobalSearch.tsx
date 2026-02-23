import { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { loadTasks } from '../lib/tasks.js';
import { loadReminders } from '../lib/reminders.js';
import { PRESET_SEQUENCES } from '../hooks/useSequence.js';
import { loadCustomSequences } from '../lib/sequences.js';
import type { View } from '../types.js';

type ResultType = 'task' | 'sequence' | 'reminder';

interface SearchResult {
  type: ResultType;
  id: string;
  label: string;
  sublabel: string;
  view: View;
}

interface GlobalSearchProps {
  onNavigate: (view: View, focusId: string, type: ResultType) => void;
  onDismiss: () => void;
}

export function GlobalSearch({ onNavigate, onDismiss }: GlobalSearchProps) {
  const [query, setQuery] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);

  const results: SearchResult[] = (() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    const out: SearchResult[] = [];

    // Tasks
    const tasks = loadTasks().filter(t => !t.completed && t.text.toLowerCase().includes(q));
    for (const t of tasks) {
      out.push({
        type: 'task',
        id: t.id,
        label: t.text,
        sublabel: `Task [${t.completedPomodoros}/${t.expectedPomodoros}]${t.active ? ' ▶' : ''}`,
        view: 'tasks',
      });
    }

    // Sequences
    const allSeqs = [...Object.values(PRESET_SEQUENCES), ...loadCustomSequences()];
    for (const s of allSeqs) {
      if (s.name.toLowerCase().includes(q)) {
        out.push({ type: 'sequence', id: s.name, label: s.name, sublabel: 'Sequence', view: 'plan' });
      }
    }

    // Reminders
    const reminders = loadReminders().filter(r => r.title.toLowerCase().includes(q) || r.time.includes(q));
    for (const r of reminders) {
      out.push({
        type: 'reminder',
        id: r.id,
        label: `${r.time} ${r.title}`,
        sublabel: r.enabled ? 'Reminder' : 'Reminder (off)',
        view: 'reminders',
      });
    }

    return out;
  })();

  const typeColor = (t: ResultType): string => t === 'task' ? 'cyan' : t === 'sequence' ? 'magenta' : 'yellow';

  const handleNavigate = useCallback(() => {
    if (results.length > 0) {
      const r = results[selectedIdx];
      if (r) onNavigate(r.view, r.id, r.type);
    }
  }, [results, selectedIdx, onNavigate]);

  useInput((_input, key) => {
    const input = _input;
    if (key.escape) { onDismiss(); return; }
    if (input === 'j' || key.downArrow) { setSelectedIdx(i => Math.min(i + 1, results.length - 1)); return; }
    if (input === 'k' || key.upArrow) { setSelectedIdx(i => Math.max(i - 1, 0)); return; }
    if (key.return && results.length > 0) {
      handleNavigate();
      return;
    }
  });

  return (
    <Box flexDirection="column" padding={2}>
      <Box marginBottom={1}>
        <Text bold color="white">Search</Text>
        <Text dimColor>  Esc: close  Enter: navigate  j/k: select</Text>
      </Box>
      <Box marginBottom={1}>
        <Text color="yellow">{'/ '}</Text>
        <TextInput
          value={query}
          onChange={(v) => { setQuery(v); setSelectedIdx(0); }}
          onSubmit={handleNavigate}
          placeholder="Search tasks, sequences, reminders..."
        />
      </Box>

      {query && results.length === 0 && (
        <Text dimColor>No results for "{query}"</Text>
      )}

      {results.map((r, i) => {
        const isSelected = i === selectedIdx;
        return (
          <Box key={`${r.type}-${r.id}`}>
            <Text color={isSelected ? 'yellow' : 'gray'} bold={isSelected}>{isSelected ? '> ' : '  '}</Text>
            <Box width={10}><Text color={typeColor(r.type)} dimColor={!isSelected}>[{r.type}]</Text></Box>
            <Box width={40}><Text color={isSelected ? 'white' : 'gray'} bold={isSelected}>{r.label}</Text></Box>
            <Text dimColor>{r.sublabel}</Text>
          </Box>
        );
      })}
    </Box>
  );
}
