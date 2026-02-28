import { Box, Text } from 'ink';
import { DAY_NAMES } from '../../lib/tracker.js';
import type { WeekData } from '../../lib/tracker.js';
import { SlotCell, COL_WIDTH } from './SlotCell.js';

interface TrackerGridViewProps {
  week: WeekData;
  weekDates: string[];
  visibleSlots: string[];
  scrollOffset: number;
  cursorRow: number;
  cursorCol: number;
}

export function TrackerGridView({
  week, weekDates, visibleSlots, scrollOffset, cursorRow, cursorCol,
}: TrackerGridViewProps) {
  return (
    <>
      {/* Column headers + divider */}
      <Text>{' '}</Text>
      <Text dimColor>{'Time  ' + DAY_NAMES.map(n => n.padEnd(COL_WIDTH)).join('')}</Text>
      <Text dimColor>{'      ' + DAY_NAMES.map(() => '\u2500'.repeat(COL_WIDTH)).join('')}</Text>

      {/* Grid rows */}
      <Box flexDirection="column">
        {visibleSlots.map((time, visIdx) => {
          const rowIdx = scrollOffset + visIdx;
          return (
            <Box key={time}>
              <Text dimColor>{time}  </Text>
              {weekDates.map((date, colIdx) => {
                const slotCode = week.slots[date]?.[time];
                const isCursor = rowIdx === cursorRow && colIdx === cursorCol;
                const pend = week.pending[date]?.[time];
                return (
                  <Box key={date} width={COL_WIDTH}>
                    <SlotCell code={slotCode} isActive={!!slotCode} isCursor={isCursor} pending={pend} />
                  </Box>
                );
              })}
            </Box>
          );
        })}
      </Box>
    </>
  );
}
