import { nanoid } from 'nanoid';
import type { TimeBlock, DayPlan, Session } from '../types.js';

export function createTimeBlock(block: Omit<TimeBlock, 'id'>): TimeBlock {
  return { ...block, id: nanoid() };
}

function timeToMinutes(time?: string): number {
  if (!time) return 0;
  const [hourStr, minStr] = time.split(':');
  const hour = parseInt(hourStr ?? '0', 10);
  const min = parseInt(minStr ?? '0', 10);
  return hour * 60 + min;
}

export function getBlocksForTime(blocks: TimeBlock[], time: string): TimeBlock | undefined {
  const targetMinutes = timeToMinutes(time);
  return blocks.find(block => {
    const st = block.startTime;
    const et = block.endTime;
    if (!st || !et) return false;
    const start = timeToMinutes(st);
    const end = timeToMinutes(et);
    return targetMinutes >= start && targetMinutes < end;
  });
}

export function getBlockProgress(
  block: TimeBlock,
  sessions: Session[]
): { completed: number; expected: number } {
  const st = block.startTime;
  const et = block.endTime;

  const completed = sessions.filter(session => {
    if (session.type !== 'work' || session.status !== 'completed') return false;

    // If block has no scheduled time, count sessions that match its label/project
    if (!st || !et) {
      return session.project === block.label;
    }

    const sessionTime = session.startedAt.slice(11, 16);
    const sessionMinutes = timeToMinutes(sessionTime);
    const blockStart = timeToMinutes(st);
    const blockEnd = timeToMinutes(et);
    return sessionMinutes >= blockStart && sessionMinutes < blockEnd;
  }).length;

  return { completed, expected: block.expectedSessions };
}

export function getDayCompletionRate(plan: DayPlan, sessions: Session[]): number {
  const totalExpected = plan.blocks.reduce((sum, b) => sum + b.expectedSessions, 0);
  if (totalExpected === 0) return 0;

  const totalCompleted = plan.blocks.reduce((sum, block) => {
    return sum + getBlockProgress(block, sessions).completed;
  }, 0);

  return Math.min(totalCompleted / totalExpected, 1);
}

export function getTimeInBlock(block: TimeBlock): number {
  const st = block.startTime;
  const et = block.endTime;
  if (!st || !et) return 0;
  return timeToMinutes(et) - timeToMinutes(st);
}
