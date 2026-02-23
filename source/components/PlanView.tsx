import React, { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import type { DayPlan, TimeBlock, Session } from '../types.js';
import { getBlocksForTime, getBlockProgress, getDayCompletionRate } from '../lib/planner.js';
import { BlockEditor } from './BlockEditor.js';
import { getPlanForDate, savePlanForDate } from '../lib/store.js';
import { createTimeBlock } from '../lib/planner.js';

interface PlanViewProps {
  date: string;
  sessions: Session[];
  onBack: () => void;
}

const PRIORITY_COLORS: Record<TimeBlock['priority'], string> = {
  P1: 'red',
  P2: 'yellow',
  P3: 'cyan',
};

function renderProgressBar(completed: number, expected: number, width: number): string {
  const fraction = expected > 0 ? Math.min(completed / expected, 1) : 0;
  const filled = Math.round(fraction * width);
  const empty = width - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

function getCurrentTime(): string {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

type EditorMode = 'new' | 'edit';

interface EditorState {
  mode: EditorMode;
  block?: TimeBlock;
}

export function PlanView({ date, sessions, onBack }: PlanViewProps) {
  const [plan, setPlan] = useState<DayPlan>(() => {
    return getPlanForDate(date) ?? { date, blocks: [] };
  });
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [editor, setEditor] = useState<EditorState | null>(null);

  const currentTime = getCurrentTime();
  const blocks = plan.blocks;

  const clampIndex = useCallback((idx: number, length: number): number => {
    if (length === 0) return 0;
    return Math.max(0, Math.min(idx, length - 1));
  }, []);

  useInput((input, key) => {
    if (editor !== null) return;

    // Navigation
    if (input === 'j' || key.downArrow) {
      setSelectedIdx(i => clampIndex(i + 1, blocks.length));
      return;
    }
    if (input === 'k' || key.upArrow) {
      setSelectedIdx(i => clampIndex(i - 1, blocks.length));
      return;
    }

    // New block
    if (input === 'n') {
      setEditor({ mode: 'new' });
      return;
    }

    // Edit selected block
    if (input === 'e' && blocks.length > 0) {
      const block = blocks[clampIndex(selectedIdx, blocks.length)];
      if (block) {
        setEditor({ mode: 'edit', block });
      }
      return;
    }

    // Delete selected block
    if (input === 'd' && blocks.length > 0) {
      const idx = clampIndex(selectedIdx, blocks.length);
      const targetBlock = blocks[idx];
      if (!targetBlock) return;

      const updated: DayPlan = {
        ...plan,
        blocks: blocks.filter(b => b.id !== targetBlock.id),
      };
      savePlanForDate(updated);
      setPlan(updated);
      setSelectedIdx(i => clampIndex(i, updated.blocks.length));
      return;
    }

    if (key.escape) {
      onBack();
    }
  });

  const handleEditorSave = useCallback((blockData: Omit<TimeBlock, 'id'>, existingId?: string) => {
    let updatedBlocks: TimeBlock[];

    if (existingId) {
      // Editing existing block — preserve ID
      updatedBlocks = blocks.map(b =>
        b.id === existingId ? { ...blockData, id: existingId } : b
      );
    } else {
      // New block
      const newBlock = createTimeBlock(blockData);
      updatedBlocks = [...blocks, newBlock].sort((a, b) => a.startTime.localeCompare(b.startTime));
    }

    const updated: DayPlan = { ...plan, blocks: updatedBlocks };
    savePlanForDate(updated);
    setPlan(updated);
    setEditor(null);
    setSelectedIdx(clampIndex(selectedIdx, updatedBlocks.length));
  }, [blocks, plan, selectedIdx, clampIndex]);

  const handleEditorCancel = useCallback(() => {
    setEditor(null);
  }, []);

  const handleThemeChange = useCallback((theme: string) => {
    const updated: DayPlan = { ...plan, theme };
    savePlanForDate(updated);
    setPlan(updated);
  }, [plan]);

  if (editor !== null) {
    return (
      <BlockEditor
        date={date}
        existingBlock={editor.mode === 'edit' ? editor.block : undefined}
        onSave={handleEditorSave}
        onCancel={handleEditorCancel}
        onThemeChange={handleThemeChange}
      />
    );
  }

  const safeSelectedIdx = clampIndex(selectedIdx, blocks.length);
  const activeBlock = getBlocksForTime(blocks, currentTime);
  const completionRate = getDayCompletionRate(plan, sessions);
  const completionPct = Math.round(completionRate * 100);
  const barWidth = 24;
  const dayBarFilled = Math.round(completionRate * barWidth);
  const dayBarEmpty = barWidth - dayBarFilled;
  const dayBar = '█'.repeat(dayBarFilled) + '░'.repeat(dayBarEmpty);

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      {/* Header */}
      <Box marginBottom={1} flexDirection="column">
        <Box>
          <Text bold color="cyan">Day Plan  </Text>
          <Text dimColor>{date}</Text>
        </Box>
        {plan.theme ? (
          <Box>
            <Text dimColor>Theme: </Text>
            <Text color="magenta">{plan.theme}</Text>
          </Box>
        ) : null}
      </Box>

      {/* Block list */}
      {blocks.length === 0 ? (
        <Box marginBottom={1}>
          <Text dimColor>No blocks yet. Press </Text>
          <Text color="green">'n'</Text>
          <Text dimColor> to add one.</Text>
        </Box>
      ) : (
        <Box flexDirection="column" marginBottom={1}>
          {blocks.map((block, idx) => {
            const isSelected = idx === safeSelectedIdx;
            const isActive = activeBlock?.id === block.id;
            const progress = getBlockProgress(block, sessions);
            const bar = renderProgressBar(progress.completed, progress.expected, 10);
            const priorityColor = PRIORITY_COLORS[block.priority];

            return (
              <Box key={block.id} flexDirection="column" marginBottom={isSelected ? 0 : 0}>
                <Box>
                  {/* Selection / active indicator */}
                  <Text color={isActive ? 'green' : isSelected ? 'white' : undefined} bold={isSelected}>
                    {isActive ? '▶ ' : isSelected ? '› ' : '  '}
                  </Text>

                  {/* Time range */}
                  <Text dimColor={!isSelected}>{block.startTime}–{block.endTime}  </Text>

                  {/* Label */}
                  <Text bold={isSelected || isActive}>{block.label}  </Text>

                  {/* Priority badge */}
                  <Text color={priorityColor}>[{block.priority}]  </Text>

                  {/* Project */}
                  {block.project ? (
                    <Text dimColor>@{block.project}  </Text>
                  ) : null}

                  {/* Session progress count */}
                  <Text dimColor>{progress.completed}/{progress.expected} sessions  </Text>

                  {/* Progress bar */}
                  <Text color={progress.completed >= progress.expected ? 'green' : isActive ? 'yellow' : 'blue'}>
                    {bar}
                  </Text>
                </Box>
              </Box>
            );
          })}
        </Box>
      )}

      {/* Day completion */}
      <Box flexDirection="column" marginTop={1} borderStyle="single" borderColor="cyan" paddingX={1}>
        <Box>
          <Text bold>Day Completion  </Text>
          <Text color={completionPct >= 100 ? 'green' : completionPct >= 50 ? 'yellow' : 'red'}>
            {completionPct}%
          </Text>
        </Box>
        <Text color={completionPct >= 100 ? 'green' : 'blue'}>{dayBar}</Text>
      </Box>

      {/* Keybinding hints */}
      <Box marginTop={1}>
        <Text dimColor>
          [n] new  [e] edit  [d] delete  [j/k] navigate  [Esc] back
        </Text>
      </Box>
    </Box>
  );
}
