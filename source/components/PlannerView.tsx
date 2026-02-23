import React, { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import type { DayPlan, Task } from '../types.js';
import { getBlocksForTime, getBlockProgress, getDayCompletionRate, createTimeBlock } from '../lib/planner.js';
import { getPlanForDate, savePlanForDate, loadSessions } from '../lib/store.js';
import { loadTasks, saveTasks } from '../lib/tasks.js';
import TextInput from 'ink-text-input';

type Panel = 'timeline' | 'taskpool';

interface PlannerViewProps {
  setIsTyping: (isTyping: boolean) => void;
}

function getCurrentTime(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

export function PlannerView({ setIsTyping }: PlannerViewProps) {
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
    if (isAddingBlock) {
      if (key.escape) {
        setIsAddingBlock(false);
        setIsTyping(false);
      }
      return;
    }

    // Panel switching
    if (input === 'h') { setPanel('timeline'); return; }
    if (input === 'l') { setPanel('taskpool'); return; }

    // Navigation
    if (input === 'j' || key.downArrow) {
      if (panel === 'timeline') setTimelineIdx(i => Math.min(i + 1, blocks.length - 1));
      else setTaskIdx(i => Math.min(i + 1, unassignedTasks.length - 1));
      return;
    }
    if (input === 'k' || key.upArrow) {
      if (panel === 'timeline') setTimelineIdx(i => Math.max(i - 1, 0));
      else setTaskIdx(i => Math.max(i - 1, 0));
      return;
    }

    // Assign task
    if (key.return && panel === 'taskpool' && unassignedTasks.length > 0 && blocks.length > 0) {
      const task = unassignedTasks[taskIdx];
      const block = blocks[timelineIdx];
      if (task && block) {
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
      setIsTyping(true);
      setBlockInput('');
      return;
    }

    // Delete block
    if (input === 'd' && panel === 'timeline' && blocks.length > 0) {
      const updated: DayPlan = { ...plan, blocks: blocks.filter((_, i) => i !== timelineIdx) };
      savePlanForDate(updated);
      setPlan(updated);
      setTimelineIdx(i => Math.max(0, Math.min(i, updated.blocks.length - 1)));
      return;
    }
  });

  const handleAddBlock = useCallback((input: string) => {
    setIsAddingBlock(false);
    setIsTyping(false);
    if (!input.trim()) return;

    let start: string | undefined;
    let end: string | undefined;
    let label = input.trim();
    let expected = 1;

    // Check if input starts with times: "09:00 11:00 Deep Work"
    const timeMatch = label.match(/^(\d{2}:\d{2})\s*[-–]?\s*(\d{2}:\d{2})\s+(.*)/);
    if (timeMatch) {
      start = timeMatch[1];
      end = timeMatch[2];
      label = timeMatch[3]!;
      const startMins = parseInt(start!.split(':')[0]!) * 60 + parseInt(start!.split(':')[1]!);
      const endMins = parseInt(end!.split(':')[0]!) * 60 + parseInt(end!.split(':')[1]!);
      if (endMins > startMins) expected = Math.ceil((endMins - startMins) / 30);
    }

    // Check for manual pomodoro count: "Deep Work /4"
    const pomoMatch = label.match(/(.*)\s+\/(\d+)$/);
    if (pomoMatch) {
      label = pomoMatch[1]!.trim();
      expected = parseInt(pomoMatch[2]!, 10);
    }

    const block = createTimeBlock({
      startTime: start,
      endTime: end,
      label: label || 'Untitled',
      expectedSessions: expected,
      priority: 'P2',
    });

    const updatedBlocks = [...blocks, block].sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
    const updated: DayPlan = { ...plan, blocks: updatedBlocks };
    savePlanForDate(updated);
    setPlan(updated);
  }, [blocks, plan, setIsTyping]);

  return (
    <Box flexDirection="row" flexGrow={1}>
      {/* Timeline Panel */}
      <Box flexDirection="column" width="55%" paddingRight={2}>
        <Box marginBottom={1}>
          <Text bold color={panel === 'timeline' ? 'white' : 'gray'}>Timeline</Text>
        </Box>

        {blocks.length === 0 ? (
          <Text dimColor>No blocks. Press 'n' to add.</Text>
        ) : (
          blocks.map((block, i) => {
            const isSelected = panel === 'timeline' && i === timelineIdx;
            const isActive = activeBlock?.id === block.id;
            const progress = getBlockProgress(block, sessions);
            const timeStr = block.startTime && block.endTime
              ? `${block.startTime}-${block.endTime}`
              : 'Pool block ';

            return (
              <Box key={block.id}>
                <Text color={isActive ? 'green' : isSelected ? 'yellow' : 'gray'} bold={isSelected}>
                  {isActive ? '▶' : isSelected ? '>' : ' '}
                </Text>
                <Text color={isSelected ? 'white' : 'gray'} dimColor={!isSelected && !isActive}>
                  {' ['}
                  {progress.completed}/{progress.expected}
                  {'] '}
                  {timeStr.padEnd(12)}
                  {block.label}
                </Text>
              </Box>
            );
          })
        )}

        {isAddingBlock && (
          <Box marginTop={1} borderStyle="round" borderColor="yellow" paddingX={1} width={45}>
            <Text color="yellow">Add: </Text>
            <TextInput
              value={blockInput}
              onChange={setBlockInput}
              onSubmit={handleAddBlock}
              placeholder="Deep Work /4   or   09:00 11:00 Emails"
            />
          </Box>
        )}
      </Box>

      {/* Task Pool Panel */}
      <Box flexDirection="column" width="45%">
        <Box marginBottom={1}>
          <Text bold color={panel === 'taskpool' ? 'white' : 'gray'}>Task Pool</Text>
        </Box>

        {unassignedTasks.length === 0 ? (
          <Text dimColor>No pending tasks.</Text>
        ) : (
          unassignedTasks.map((task, i) => {
            const isSelected = panel === 'taskpool' && i === taskIdx;
            return (
              <Box key={task.id}>
                <Text color={isSelected ? 'yellow' : 'gray'} bold={isSelected}>
                  {isSelected ? '> ' : '  '}
                </Text>
                <Text color={isSelected ? 'white' : 'gray'} dimColor={!isSelected}>
                  [{task.completedPomodoros}/{task.expectedPomodoros}] {task.text}
                </Text>
              </Box>
            );
          })
        )}
      </Box>
    </Box>
  );
}
