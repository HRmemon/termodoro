import { nanoid } from 'nanoid';
import type { TimeBlock, DayPlan, Session } from '../types.js';

/**
 * Creates a new TimeBlock by assigning a nanoid.
 */
export function createTimeBlock(block: Omit<TimeBlock, 'id'>): TimeBlock {
  return { ...block, id: nanoid() };
}

/**
 * Converts a "HH:MM" string to total minutes since midnight.
 */
function timeToMinutes(time: string): number {
  const [hourStr, minStr] = time.split(':');
  const hour = parseInt(hourStr ?? '0', 10);
  const min = parseInt(minStr ?? '0', 10);
  return hour * 60 + min;
}

/**
 * Returns the TimeBlock that is active at the given "HH:MM" time,
 * or undefined if no block covers that time.
 */
export function getBlocksForTime(blocks: TimeBlock[], time: string): TimeBlock | undefined {
  const targetMinutes = timeToMinutes(time);
  return blocks.find(block => {
    const start = timeToMinutes(block.startTime);
    const end = timeToMinutes(block.endTime);
    return targetMinutes >= start && targetMinutes < end;
  });
}

/**
 * Counts how many completed work sessions fall within the given block's
 * time range on the same calendar date the sessions were started.
 */
export function getBlockProgress(
  block: TimeBlock,
  sessions: Session[]
): { completed: number; expected: number } {
  const blockStart = timeToMinutes(block.startTime);
  const blockEnd = timeToMinutes(block.endTime);

  const completed = sessions.filter(session => {
    if (session.type !== 'work' || session.status !== 'completed') return false;

    // Extract "HH:MM" from the ISO startedAt timestamp
    const sessionTime = session.startedAt.slice(11, 16);
    const sessionMinutes = timeToMinutes(sessionTime);
    return sessionMinutes >= blockStart && sessionMinutes < blockEnd;
  }).length;

  return { completed, expected: block.expectedSessions };
}

/**
 * Returns overall plan completion as a value between 0 and 1.
 * Calculated as: sum of completed sessions / sum of expected sessions.
 * Returns 0 if the plan has no expected sessions.
 */
export function getDayCompletionRate(plan: DayPlan, sessions: Session[]): number {
  const totalExpected = plan.blocks.reduce((sum, b) => sum + b.expectedSessions, 0);
  if (totalExpected === 0) return 0;

  const totalCompleted = plan.blocks.reduce((sum, block) => {
    return sum + getBlockProgress(block, sessions).completed;
  }, 0);

  return Math.min(totalCompleted / totalExpected, 1);
}

/**
 * Returns the duration of a time block in minutes.
 */
export function getTimeInBlock(block: TimeBlock): number {
  return timeToMinutes(block.endTime) - timeToMinutes(block.startTime);
}
