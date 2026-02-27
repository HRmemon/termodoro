import { useState, useMemo } from 'react';
import { useInput, useStdout } from 'ink';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import type { Keymap } from '../lib/keymap.js';
import { colors } from '../lib/theme.js';

interface HelpViewProps {
  onClose: () => void;
  keymap: Keymap;
  setIsTyping: (v: boolean) => void;
}

interface HelpSection {
  title: string;
  hints: [string, string][]; // [key, label]
}

function buildSections(km: Keymap): HelpSection[] {
  return [
    {
      title: 'Global',
      hints: [
        ['0-9', 'Switch view'],
        [km.label('global.search'), 'Search'],
        [km.label('global.command_palette'), 'Commands'],
        [km.label('global.editor'), 'Open in $EDITOR'],
        [km.label('global.zen'), 'Zen mode'],
        [km.label('global.help'), 'Help'],
        [km.label('global.quit'), 'Close / quit'],
        [km.label('global.toggle_sidebar'), 'Toggle sidebar'],
      ],
    },
    {
      title: '[1] Timer',
      hints: [
        [km.label('timer.toggle'), 'Start / Pause'],
        [km.label('timer.skip'), 'Skip session'],
        [km.label('timer.set_duration'), 'Set duration'],
        [km.label('timer.set_project'), 'Set project'],
        [km.label('timer.clear_project'), 'Clear project'],
        [km.label('timer.sequences'), 'Pick sequence'],
        ['m', 'Timer/Stopwatch'],
        [km.label('timer.reset'), 'Reset (log)'],
        [km.label('timer.clear_sequence'), 'Clear sequence'],
      ],
    },
    {
      title: '[2] Tasks',
      hints: [
        [km.label('nav.down') + '/' + km.label('nav.up'), 'Navigate'],
        ['Enter', 'View description'],
        [km.label('list.toggle'), 'Complete / Undo'],
        [km.label('list.add'), 'Add task'],
        [km.label('list.edit'), 'Edit task'],
        [km.label('list.delete'), 'Delete task'],
        ['u', 'Undo completion'],
        [km.label('list.filter'), 'Filter'],
        ['P', 'Projects manager'],
      ],
    },
    {
      title: '[3] Reminders',
      hints: [
        [km.label('nav.down') + '/' + km.label('nav.up'), 'Navigate'],
        [km.label('list.add'), 'Add'],
        [km.label('list.edit'), 'Edit'],
        [km.label('list.delete'), 'Delete'],
        ['Enter', 'Toggle on/off'],
        ['r', 'Toggle recurring'],
      ],
    },
    {
      title: '[0] Calendar',
      hints: [
        [km.label('nav.left') + '/' + km.label('nav.right'), 'Prev / next day'],
        [km.label('nav.down') + '/' + km.label('nav.up'), 'Prev / next week'],
        [km.label('calendar.toggle_view'), 'Monthly / daily'],
        ['Enter', 'Open daily view'],
        [km.label('calendar.goto_today'), 'Go to today'],
        [km.label('calendar.toggle_heatmap'), 'Toggle heatmap'],
        [km.label('list.add'), 'Add event'],
        [km.label('list.edit'), 'Edit event'],
        [km.label('list.delete'), 'Delete event'],
        [km.label('calendar.toggle_done'), 'Toggle done'],
        [km.label('calendar.toggle_important'), 'Toggle important'],
        [km.label('calendar.toggle_privacy'), 'Toggle privacy'],
        [km.label('calendar.toggle_global_privacy'), 'Global privacy'],
        [km.label('calendar.reload_ics'), 'Reload ICS'],
        ['Tab', 'Switch pane'],
      ],
    },
    {
      title: '[5] Stats',
      hints: [
        [km.label('stats.prev_tab') + '/' + km.label('stats.next_tab'), 'Switch tab'],
        [km.label('nav.down') + '/' + km.label('nav.up'), 'Navigate'],
      ],
    },
    {
      title: '[6] Config',
      hints: [
        [km.label('nav.down') + '/' + km.label('nav.up'), 'Navigate'],
        ['Enter', 'Edit / toggle'],
        [km.label('config.save'), 'Save to disk'],
        ['p', 'Preview sound'],
      ],
    },
    {
      title: '[7] Web Tracking',
      hints: [
        [km.label('nav.left') + '/' + km.label('nav.right'), 'Time range'],
        ['Tab', 'Domains / Pages'],
        [km.label('nav.down') + '/' + km.label('nav.up'), 'Scroll'],
        ['R', 'HTML report'],
      ],
    },
    {
      title: '[8] Tracker',
      hints: [
        ['hjkl', 'Navigate grid'],
        ['Tab', 'Next day'],
        [km.label('tracker.pick'), 'Edit slot'],
        [km.label('tracker.clear'), 'Clear slot'],
        [km.label('tracker.review'), 'Review suggestions'],
        ['A', 'Accept all pending'],
        [km.label('tracker.new_week'), 'New week'],
        [km.label('tracker.browse'), 'Browse weeks'],
        [km.label('tracker.day_summary') + '/' + km.label('tracker.week_summary'), 'Day / week summary'],
      ],
    },
    {
      title: '[9] Goals',
      hints: [
        ['Tab/' + km.label('nav.left') + '/' + km.label('nav.right'), 'Switch goal'],
        [km.label('nav.down') + '/' + km.label('nav.up'), 'Navigate dates'],
        [km.label('calendar.goto_today'), 'Jump to today'],
        ['Enter/' + km.label('calendar.toggle_done'), 'Toggle / rate'],
        [km.label('list.add'), 'Add goal'],
        [km.label('list.edit'), 'Edit goal'],
        [km.label('list.delete'), 'Delete goal'],
      ],
    },
    {
      title: 'Commands (:)',
      hints: [
        [':task', 'Create task'],
        [':remind', 'Quick timer'],
        [':reminder', 'Timed reminder'],
        [':search', 'Search sessions'],
        [':insights', 'Focus & energy'],
      ],
    },
  ];
}

export function HelpView({ onClose, keymap, setIsTyping }: HelpViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [scrollOffset, setScrollOffset] = useState(0);

  const { stdout } = useStdout();

  const sections = useMemo(() => buildSections(keymap), [keymap]);

  // Filter sections by search query
  const filtered = useMemo(() => {
    if (!searchQuery) return sections;
    const q = searchQuery.toLowerCase();
    const result: HelpSection[] = [];
    for (const s of sections) {
      const matchingHints = s.hints.filter(
        ([key, label]) => key.toLowerCase().includes(q) || label.toLowerCase().includes(q)
      );
      if (matchingHints.length > 0 || s.title.toLowerCase().includes(q)) {
        result.push({ title: s.title, hints: matchingHints.length > 0 ? matchingHints : s.hints });
      }
    }
    return result;
  }, [sections, searchQuery]);

  // Build display lines: each section has a header + rows of 3 hint columns
  const lines = useMemo(() => {
    const out: ({ type: 'header'; title: string } | { type: 'hints'; items: [string, string][] })[] = [];

    for (const section of filtered) {
      out.push({ type: 'header', title: section.title });
      // Group hints into rows of 3
      for (let i = 0; i < section.hints.length; i += 3) {
        out.push({ type: 'hints', items: section.hints.slice(i, i + 3) });
      }
    }
    return out;
  }, [filtered]);

  // Reset scroll when search changes
  useMemo(() => { setScrollOffset(0); }, [searchQuery]);

  useInput((input, key) => {
    if (isSearching) {
      if (key.escape) {
        if (searchQuery) {
          setSearchQuery('');
        } else {
          setIsSearching(false);
          setIsTyping(false);
        }
        return;
      }
      if (key.return) {
        setIsSearching(false);
        setIsTyping(false);
        return;
      }
      return; // TextInput handles typing
    }

    if (key.escape || input === 'q') { onClose(); return; }
    if (input === '/' || input === 'f') {
      setIsSearching(true);
      setIsTyping(true);
      return;
    }
    if (input === 'j' || key.downArrow) {
      setScrollOffset(o => Math.min(o + 1, Math.max(0, renderLines.length - 1)));
      return;
    }
    if (input === 'k' || key.upArrow) {
      setScrollOffset(o => Math.max(o - 1, 0));
      return;
    }
    // Page down/up
    if (input === 'd') {
      setScrollOffset(o => Math.min(o + 10, Math.max(0, renderLines.length - 1)));
      return;
    }
    if (input === 'u') {
      setScrollOffset(o => Math.max(o - 10, 0));
      return;
    }
    if (input === 'g') {
      setScrollOffset(0);
      return;
    }
    if (input === 'G') {
      setScrollOffset(Math.max(0, renderLines.length - 1));
      return;
    }
  });

  // Column width for key:label pairs (roughly 1/3 of terminal)
  const termRows = stdout?.rows ?? 24;
  const termCols = stdout?.columns ?? 80;
  const colWidth = Math.floor((termCols - 8) / 3);

  // Build flat text lines for rendering
  const renderLines: string[][] = useMemo(() => {
    const out: string[][] = [];
    for (let li = 0; li < lines.length; li++) {
      const line = lines[li]!;
      if (line.type === 'header') {
        // Add blank line before headers (except first)
        if (li > 0) out.push(['blank']);
        out.push(['header', line.title]);
      } else {
        out.push(['hints', ...line.items.flatMap(([k, l]) => [k, l])]);
      }
    }
    return out;
  }, [lines]);

  // Total content height + 1 for search bar
  const contentHeight = termRows;
  const bodyHeight = contentHeight - 1; // 1 for search bar
  const totalLines = renderLines.length;
  const visibleCount = Math.min(bodyHeight, totalLines);
  const maxScroll = Math.max(0, totalLines - visibleCount);

  // Clamp scroll
  const clampedOffset = Math.min(scrollOffset, maxScroll);
  const visible = renderLines.slice(clampedOffset, clampedOffset + visibleCount);
  const canScrollUp = clampedOffset > 0;
  const canScrollDown = clampedOffset < maxScroll;

  return (
    <Box flexDirection="column" height={contentHeight} overflow="hidden">
      {/* Search bar - always at top */}
      <Box flexShrink={0}>
        <Text>  </Text>
        {isSearching ? (
          <>
            <Text color={colors.highlight}>/</Text>
            <TextInput value={searchQuery} onChange={setSearchQuery} placeholder="search..." />
          </>
        ) : (
          <>
            <Text bold color={colors.highlight}>Keybindings</Text>
            {searchQuery ? (
              <Text color={colors.focus}>  /{searchQuery}</Text>
            ) : (
              <Text dimColor>  /:search  j/k:scroll  Esc:close</Text>
            )}
          </>
        )}
      </Box>

      {/* Scrollable content */}
      <Box flexDirection="column" flexGrow={1} overflow="hidden">
        {canScrollUp && (
          <Box flexShrink={0}><Text dimColor>  ↑ more</Text></Box>
        )}
        {visible.map((row, i) => {
          if (row[0] === 'blank') {
            return <Box key={`b-${i}`} flexShrink={0}><Text> </Text></Box>;
          }
          if (row[0] === 'header') {
            const title = row[1]!;
            return (
              <Box key={`h-${i}`} flexShrink={0}>
                <Text bold color={colors.highlight}>  ── {title} </Text>
                <Text color={colors.dim}>{'─'.repeat(Math.max(0, termCols - title.length - 12))}</Text>
              </Box>
            );
          }
          // hints: pairs of [key, label, key, label, ...]
          const pairs: [string, string][] = [];
          for (let p = 1; p < row.length; p += 2) {
            pairs.push([row[p]!, row[p + 1]!]);
          }
          return (
            <Box key={`r-${i}`} flexShrink={0}>
              <Text>  </Text>
              {pairs.map(([k, label], j) => (
                <Box key={j} width={colWidth}>
                  <Text color="cyan" bold>{k}</Text>
                  <Text color={colors.dim}>:{label}</Text>
                </Box>
              ))}
            </Box>
          );
        })}
        {canScrollDown && (
          <Box flexShrink={0}><Text dimColor>  ↓ more</Text></Box>
        )}
        {filtered.length === 0 && (
          <Box flexShrink={0}><Text dimColor>  No matches for "{searchQuery}"</Text></Box>
        )}
      </Box>
    </Box>
  );
}
