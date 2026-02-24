import { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { loadTasks } from '../lib/tasks.js';
import { loadReminders } from '../lib/reminders.js';
import { PRESET_SEQUENCES } from '../hooks/useSequence.js';
import { loadCustomSequences } from '../lib/sequences.js';
import { fuzzyMatch, fuzzyMatchAny } from '../lib/fuzzy.js';
import type { View } from '../types.js';

type ResultType = 'task' | 'sequence' | 'reminder';

interface SearchResult {
  type: ResultType;
  id: string;
  label: string;
  sublabel: string;
  view: View;
  score: number;
}

interface GlobalSearchProps {
  onNavigate: (view: View, focusId: string, type: ResultType) => void;
  onDismiss: () => void;
}

/** Parse prefix tokens from query: task:, seq:, rem:, #project */
function parseQuery(raw: string): { text: string; typeFilter: ResultType | null; projectFilter: string | null } {
  let text = raw.trim();
  let typeFilter: ResultType | null = null;
  let projectFilter: string | null = null;

  // Extract type prefix
  if (text.startsWith('task:')) {
    typeFilter = 'task';
    text = text.slice(5).trim();
  } else if (text.startsWith('seq:')) {
    typeFilter = 'sequence';
    text = text.slice(4).trim();
  } else if (text.startsWith('rem:')) {
    typeFilter = 'reminder';
    text = text.slice(4).trim();
  }

  // Extract #project filter
  const hashMatch = text.match(/#(\S+)/);
  if (hashMatch) {
    projectFilter = hashMatch[1]!;
    text = text.replace(/#\S+/, '').trim();
  }

  return { text, typeFilter, projectFilter };
}

export function GlobalSearch({ onNavigate, onDismiss }: GlobalSearchProps) {
  const [query, setQuery] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);

  const results: SearchResult[] = (() => {
    if (!query.trim()) return [];
    const { text, typeFilter, projectFilter } = parseQuery(query);
    const out: SearchResult[] = [];

    // Tasks
    if (!typeFilter || typeFilter === 'task') {
      const tasks = loadTasks().filter(t => !t.completed);
      for (const t of tasks) {
        // If project filter, fuzzy match project
        if (projectFilter) {
          const projScore = fuzzyMatch(projectFilter, t.project ?? '');
          if (projScore === null) continue;
        }
        // Fuzzy match text and project
        if (text) {
          const score = fuzzyMatchAny(text, t.text, t.project);
          if (score === null) continue;
          out.push({
            type: 'task',
            id: t.id,
            label: t.text,
            sublabel: `Task [${t.completedPomodoros}/${t.expectedPomodoros}]${t.active ? ' ▶' : ''}${t.project ? ` #${t.project}` : ''}`,
            view: 'tasks',
            score,
          });
        } else {
          // No text query but has project filter — show all matching tasks
          out.push({
            type: 'task',
            id: t.id,
            label: t.text,
            sublabel: `Task [${t.completedPomodoros}/${t.expectedPomodoros}]${t.active ? ' ▶' : ''}${t.project ? ` #${t.project}` : ''}`,
            view: 'tasks',
            score: 0,
          });
        }
      }
    }

    // Sequences
    if (!typeFilter || typeFilter === 'sequence') {
      if (!projectFilter) {
        const allSeqs = [...Object.values(PRESET_SEQUENCES), ...loadCustomSequences()];
        for (const s of allSeqs) {
          if (!text) {
            out.push({ type: 'sequence', id: s.name, label: s.name, sublabel: 'Sequence', view: 'plan', score: 0 });
          } else {
            const score = fuzzyMatch(text, s.name);
            if (score !== null) {
              out.push({ type: 'sequence', id: s.name, label: s.name, sublabel: 'Sequence', view: 'plan', score });
            }
          }
        }
      }
    }

    // Reminders
    if (!typeFilter || typeFilter === 'reminder') {
      if (!projectFilter) {
        const reminders = loadReminders();
        for (const r of reminders) {
          if (!text) {
            out.push({
              type: 'reminder', id: r.id, label: `${r.time} ${r.title}`,
              sublabel: r.enabled ? 'Reminder' : 'Reminder (off)', view: 'reminders', score: 0,
            });
          } else {
            const score = fuzzyMatchAny(text, r.title, r.time);
            if (score !== null) {
              out.push({
                type: 'reminder', id: r.id, label: `${r.time} ${r.title}`,
                sublabel: r.enabled ? 'Reminder' : 'Reminder (off)', view: 'reminders', score,
              });
            }
          }
        }
      }
    }

    // Sort by score (lower = better)
    out.sort((a, b) => a.score - b.score);
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
          placeholder="task: seq: rem: #project — fuzzy search"
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
