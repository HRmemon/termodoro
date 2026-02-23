import React, { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import type { DayPlan, TimeBlock, Session, Task } from '../types.js';
import { getBlocksForTime, getBlockProgress, getDayCompletionRate, createTimeBlock } from '../lib/planner.js';
import { getPlanForDate, savePlanForDate, loadSessions } from '../lib/store.js';
import { loadTasks, saveTasks } from '../lib/tasks.js';
import TextInput from 'ink-text-input';

type Panel = 'timeline' | 'taskpool';

const PRIORITY_COLORS: Record<TimeBlock['priority'], string> = {
  P1: 'red',
  P2: 'yellow',
  P3: 'cyan',
};

function getCurrentTime(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

function renderBar(completed: number, expected: number, width: number): string {
  const fraction = expected > 0 ? Math.min(completed / expected, 1) : 0;
  const filled = Math.round(fraction * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

export function PlannerView() {
  const date = new Date().toISOString().slice(0, 10);
  const [plan, setPlan] = useState<DayPlan>(() => getPlanForDate(date) ?? { date, blocks: [] });
  const [tasks, setTasks] = useState<Task[]>(loadTasks);
  const sessions = loadSessions();
  const [panel, setPanel] = useState<Panel>('timeline');
  const [timelineIdx, setTimelineIdx] = useState(0);
  const [taskIdx, setTaskIdx] = useState(0);
  const [isAddingBlock, setIsAddingBlock] = useState(false);
  const [blockInput, setBlockInput] = useState('');

  const blocks = plan.blocks;
  const unassignedTasks = tasks.filter(t => !t.completed);
  const currentTime = getCurrentTime();
  const activeBlock = getBlocksForTime(blocks, currentTime);

  const refreshTasks = useCallback(() => setTasks(loadTasks()), []);

  useInput((input, key) => {
    if (isAddingBlock) return;

    // Panel switching
    if (input === 'h') { setPanel('timeline'); return; }
    if (input === 'l') { setPanel('taskpool'); return; }

    // Navigation
    if (input === 'j' || key.downArrow) {
      if (panel === 'timeline') {
        setTimelineIdx(i => Math.min(i + 1, blocks.length - 1));
      } else {
        setTaskIdx(i => Math.min(i + 1, unassignedTasks.length - 1));
      }
      return;
    }
    if (input === 'k' || key.upArrow) {
      if (panel === 'timeline') {
        setTimelineIdx(i => Math.max(i - 1, 0));
      } else {
        setTaskIdx(i => Math.max(i - 1, 0));
      }
      return;
    }

    // Assign task to block (Enter from taskpool)
    if (key.return && panel === 'taskpool' && unassignedTasks.length > 0 && blocks.length > 0) {
      const task = unassignedTasks[taskIdx];
      const block = blocks[timelineIdx];
      if (task && block) {
        // Set the task's project to the block label as an assignment
        const allTasks = loadTasks();
        const t = allTasks.find(at => at.id === task.id);
        if (t) {
          t.project = block.label;
          saveTasks(allTasks);
          refreshTasks();
        }
      }
      return;
    }

    // New block
    if (input === 'n' && panel === 'timeline') {
      setIsAddingBlock(true);
      setBlockInput('');
      return;
    }

    // Delete block
    if (input === 'd' && panel === 'timeline' && blocks.length > 0) {
      const updated: DayPlan = {
        ...plan,
        blocks: blocks.filter((_, i) => i !== timelineIdx),
      };
      savePlanForDate(updated);
      setPlan(updated);
      setTimelineIdx(i => Math.max(0, Math.min(i, updated.blocks.length - 1)));
      return;
    }
  });

  const handleAddBlock = useCallback((input: string) => {
    setIsAddingBlock(false);
    if (!input.trim()) return;

    // Parse: "09:00 12:00 Deep Work P1" or "09:00-12:00 Deep Work"
    const match = input.match(/^(\d{2}:\d{2})\s*[-–]?\s*(\d{2}:\d{2})\s+(.+?)(?:\s+(P[123]))?\s*$/);
    if (match) {
      const [, start, end, label, priority] = match;
      const block = createTimeBlock({
        startTime: start!,
        endTime: end!,
        label: label!,
        expectedSessions: Math.ceil(
          ((parseInt(end!.split(':')[0]!) * 60 + parseInt(end!.split(':')[1]!)) -
           (parseInt(start!.split(':')[0]!) * 60 + parseInt(start!.split(':')[1]!))) / 30
        ),
        priority: (priority as 'P1' | 'P2' | 'P3') ?? 'P2',
      });
      const updatedBlocks = [...blocks, block].sort((a, b) => a.startTime.localeCompare(b.startTime));
      const updated: DayPlan = { ...plan, blocks: updatedBlocks };
      savePlanForDate(updated);
      setPlan(updated);
    }
  }, [blocks, plan]);

  const completionRate = getDayCompletionRate(plan, sessions);

  return (
    <Box flexDirection="row" flexGrow={1}>
      {/* Timeline panel */}
      <Box flexDirection="column" width="55%" borderStyle={panel === 'timeline' ? 'single' : undefined} borderColor={panel === 'timeline' ? 'yellow' : 'gray'} paddingX={1}>
        <Box marginBottom={1}>
          <Text bold color={panel === 'timeline' ? 'yellow' : 'white'}>Timeline</Text>
          <Text dimColor> ({blocks.length} blocks, {Math.round(completionRate * 100)}% done)</Text>
        </Box>
        {blocks.length === 0 ? (
          <Text dimColor>No blocks. Press 'n' to add. Format: 09:00 12:00 Label P1</Text>
        ) : (
          blocks.map((block, i) => {
            const isSelected = panel === 'timeline' && i === timelineIdx;
            const isActive = activeBlock?.id === block.id;
            const progress = getBlockProgress(block, sessions);
            const bar = renderBar(progress.completed, progress.expected, 8);

            return (
              <Box key={block.id}>
                <Text color={isActive ? 'green' : isSelected ? 'yellow' : 'gray'} bold={isSelected}>
                  {isActive ? '▶' : isSelected ? '›' : ' '}{' '}
                </Text>
                <Text dimColor={!isSelected}>{block.startTime}–{block.endTime} </Text>
                <Text bold={isSelected}>{block.label} </Text>
                <Text color={PRIORITY_COLORS[block.priority]}>[{block.priority}] </Text>
                <Text dimColor>{progress.completed}/{progress.expected} </Text>
                <Text color={progress.completed >= progress.expected ? 'green' : 'blue'}>{bar}</Text>
              </Box>
            );
          })
        )}
        {isAddingBlock && (
          <Box marginTop={1}>
            <Text color="yellow">{'> '}</Text>
            <TextInput
              value={blockInput}
              onChange={setBlockInput}
              onSubmit={handleAddBlock}
              placeholder="09:00 12:00 Deep Work P1"
            />
          </Box>
        )}
      </Box>

      {/* Task pool panel */}
      <Box flexDirection="column" width="45%" borderStyle={panel === 'taskpool' ? 'single' : undefined} borderColor={panel === 'taskpool' ? 'yellow' : 'gray'} paddingX={1}>
        <Box marginBottom={1}>
          <Text bold color={panel === 'taskpool' ? 'yellow' : 'white'}>Task Pool</Text>
          <Text dimColor> ({unassignedTasks.length})</Text>
        </Box>
        {unassignedTasks.length === 0 ? (
          <Text dimColor>No tasks. Add from Timer view.</Text>
        ) : (
          unassignedTasks.map((task, i) => {
            const isSelected = panel === 'taskpool' && i === taskIdx;
            return (
              <Box key={task.id}>
                <Text color={isSelected ? 'yellow' : 'white'} bold={isSelected}>
                  {isSelected ? '> ' : '  '}{task.text}
                </Text>
                <Text dimColor> [{task.completedPomodoros}/{task.expectedPomodoros}]</Text>
                {task.project && <Text color="cyan"> #{task.project}</Text>}
              </Box>
            );
          })
        )}
        {panel === 'taskpool' && unassignedTasks.length > 0 && blocks.length > 0 && (
          <Box marginTop={1}>
            <Text dimColor>Enter: assign to selected block</Text>
          </Box>
        )}
      </Box>
    </Box>
  );
}
