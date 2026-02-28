import { Box, Text } from 'ink';
import { DAY_NAMES, getCategoryByCode, getCategories } from '../../lib/tracker.js';
import type { WeekData } from '../../lib/tracker.js';
import { formatHours } from '../../lib/format.js';

interface DaySummaryProps {
  currentDate: string;
  cursorCol: number;
  dayStats: Record<string, number>;
  dayTotal: number;
}

export function DaySummaryPanel({ currentDate, cursorCol, dayStats, dayTotal }: DaySummaryProps) {
  return (
    <Box flexDirection="column" borderStyle="single" borderColor="yellow" paddingX={1} marginTop={1}>
      <Text bold color="yellow">{DAY_NAMES[cursorCol]} {currentDate}</Text>
      {Object.entries(dayStats).length === 0 && <Text dimColor>No slots filled yet.</Text>}
      {Object.entries(dayStats).map(([code, hours]) => {
        const cat = getCategoryByCode(code);
        return (
          <Box key={code}>
            <Box width={6}><Text color={cat?.color}>{code}</Text></Box>
            <Text>{formatHours(hours)}</Text>
          </Box>
        );
      })}
      <Box marginTop={1}>
        <Text dimColor>Total tracked: {formatHours(dayTotal)}</Text>
      </Box>
      <Text dimColor>Esc or d to close</Text>
    </Box>
  );
}

interface WeekSummaryProps {
  week: WeekData;
  weekDates: string[];
}

export function WeekSummaryPanel({ week, weekDates }: WeekSummaryProps) {
  const categories = getCategories();
  return (
    <Box flexDirection="column" borderStyle="single" borderColor="yellow" paddingX={1} marginTop={1}>
      <Text bold color="yellow">Week of {week.start}</Text>
      <Box>
        <Box width={6}><Text dimColor> </Text></Box>
        {DAY_NAMES.map(d => <Box key={d} width={6}><Text dimColor>{d}</Text></Box>)}
        <Box width={7}><Text dimColor>Total</Text></Box>
      </Box>
      {categories.map(cat => {
        const perDay = weekDates.map(date => (week.slots[date] ?? {}));
        const dayCounts = perDay.map(daySlots =>
          Object.values(daySlots).filter(c => c === cat.code).length * 0.5
        );
        const total = dayCounts.reduce((s, h) => s + h, 0);
        if (total === 0) return null;
        return (
          <Box key={cat.code}>
            <Box width={6}><Text color={cat.color}>{cat.code}</Text></Box>
            {dayCounts.map((h, i) => (
              <Box key={i} width={6}>
                <Text color={cat.color}>{h > 0 ? formatHours(h) : '\u00b7'}</Text>
              </Box>
            ))}
            <Box width={7}><Text bold>{formatHours(total)}</Text></Box>
          </Box>
        );
      })}
      <Text dimColor>Esc or w to close</Text>
    </Box>
  );
}
