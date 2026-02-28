import React, { useState, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { loadSessions } from '../lib/store.js';
import { searchSessions, parseSearchString } from '../lib/search.js';
import type { Session } from '../types.js';
import { formatSeconds } from '../lib/format.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  return iso.slice(0, 16).replace('T', ' ');
}

const TYPE_COLORS: Record<Session['type'], string> = {
  'work': '#00C853',
  'short-break': '#FFB300',
  'long-break': '#FFB300',
};

const STATUS_COLORS: Record<Session['status'], string> = {
  'completed': 'green',
  'skipped': 'yellow',
  'abandoned': 'red',
};

const TYPE_LABELS: Record<Session['type'], string> = {
  'work': 'work',
  'short-break': 'brk',
  'long-break': 'lbrk',
};

// How many results to show in the viewport at once
const PAGE_SIZE = 10;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SearchViewProps {
  onBack: () => void;
  initialQuery?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SearchView({ onBack, initialQuery = '' }: SearchViewProps) {
  const [queryText, setQueryText] = useState(initialQuery);
  const [inputActive, setInputActive] = useState(true);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);

  const allSessions = useMemo(() => loadSessions(), []);

  const results = useMemo(() => {
    const q = parseSearchString(queryText);
    // Show most recent first
    return searchSessions(allSessions, q).slice().reverse();
  }, [queryText, allSessions]);

  // Clamp selection
  const safeSelected = Math.min(selectedIdx, Math.max(0, results.length - 1));

  useInput((_input, key) => {
    if (key.escape) {
      if (!inputActive) {
        onBack();
      } else {
        // First Esc deactivates input, second Esc goes back
        setInputActive(false);
      }
      return;
    }

    if (key.return && inputActive) {
      // Submit query, move focus to results list
      setInputActive(false);
      setSelectedIdx(0);
      setScrollOffset(0);
      return;
    }

    if (!inputActive) {
      if (key.upArrow || _input === 'k') {
        const next = Math.max(0, safeSelected - 1);
        setSelectedIdx(next);
        if (next < scrollOffset) setScrollOffset(next);
        return;
      }
      if (key.downArrow || _input === 'j') {
        const next = Math.min(results.length - 1, safeSelected + 1);
        setSelectedIdx(next);
        if (next >= scrollOffset + PAGE_SIZE) setScrollOffset(next - PAGE_SIZE + 1);
        return;
      }
      if (_input === 'i' || _input === '/') {
        // Re-activate input
        setInputActive(true);
        return;
      }
    }
  });

  const visibleResults = results.slice(scrollOffset, scrollOffset + PAGE_SIZE);

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      {/* Header */}
      <Text bold color="cyan">Search Sessions</Text>
      <Text dimColor>Syntax: project:myapp  tag:bugfix  type:work  status:completed  energy:high  after:YYYY-MM-DD  before:YYYY-MM-DD  min:25  max:60  &lt;free text&gt;</Text>

      {/* Search input */}
      <Box marginTop={1} borderStyle={inputActive ? 'round' : undefined} paddingX={inputActive ? 1 : 0}>
        <Text bold color={inputActive ? 'yellow' : 'white'}>{'/ '}</Text>
        <TextInput
          value={queryText}
          onChange={val => {
            setQueryText(val);
            setSelectedIdx(0);
            setScrollOffset(0);
          }}
          onSubmit={() => {
            setInputActive(false);
            setSelectedIdx(0);
            setScrollOffset(0);
          }}
          placeholder="search sessions…"
          focus={inputActive}
        />
      </Box>

      {/* Result count */}
      <Box marginTop={1}>
        <Text dimColor>
          {results.length === 0
            ? 'No results'
            : `${results.length} result${results.length === 1 ? '' : 's'}`}
          {results.length > PAGE_SIZE && !inputActive
            ? `  (${scrollOffset + 1}–${Math.min(scrollOffset + PAGE_SIZE, results.length)} shown)`
            : ''}
        </Text>
      </Box>

      {/* Results list */}
      {visibleResults.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          {/* Column headings */}
          <Box>
            <Text dimColor>{'  '}</Text>
            <Text dimColor bold>{'Date             '}</Text>
            <Text dimColor bold>{'Type  '}</Text>
            <Text dimColor bold>{'Status     '}</Text>
            <Text dimColor bold>{'Dur   '}</Text>
            <Text dimColor bold>{'Label / Project / Tag'}</Text>
          </Box>

          {visibleResults.map((session, i) => {
            const absoluteIdx = scrollOffset + i;
            const isSelected = !inputActive && absoluteIdx === safeSelected;
            const meta: string[] = [];
            if (session.label) meta.push(session.label);
            if (session.project) meta.push(`[${session.project}]`);
            if (session.tag) meta.push(`#${session.tag}`);

            return (
              <Box key={session.id}>
                <Text color={isSelected ? 'cyan' : undefined}>
                  {isSelected ? '> ' : '  '}
                </Text>
                <Text color={isSelected ? 'cyan' : 'white'}>
                  {formatDate(session.startedAt)}
                  {'  '}
                </Text>
                <Text color={TYPE_COLORS[session.type]}>
                  {TYPE_LABELS[session.type].padEnd(6)}
                </Text>
                <Text color={STATUS_COLORS[session.status]}>
                  {session.status.padEnd(11)}
                </Text>
                <Text color={isSelected ? 'cyan' : 'white'}>
                  {formatSeconds(session.durationActual).padEnd(6)}
                </Text>
                <Text dimColor={!isSelected} color={isSelected ? 'white' : undefined}>
                  {meta.join('  ') || '—'}
                </Text>
              </Box>
            );
          })}
        </Box>
      )}

      {/* Footer hints */}
      <Box marginTop={1}>
        <Text dimColor>
          {inputActive
            ? '[Enter] confirm query  [Esc] back'
            : '[j/k] navigate  [i or /] edit query  [Esc] back'}
        </Text>
      </Box>
    </Box>
  );
}
