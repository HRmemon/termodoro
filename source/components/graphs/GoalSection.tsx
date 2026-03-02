import { useMemo } from 'react';
import { Box, Text } from 'ink';
import {
  isGoalComplete, computeStreak, getRating, getNote,
  GoalsData, TrackedGoal,
} from '../../lib/goals.js';

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const SHADE_CHARS = ['·', '░', '▒', '▓', '█'];

export function ratingToShade(rating: number, max: number): string {
  if (rating <= 0) return SHADE_CHARS[0]!;
  const ratio = Math.min(rating / max, 1);
  const idx = Math.min(Math.round(ratio * (SHADE_CHARS.length - 1)), SHADE_CHARS.length - 1);
  return SHADE_CHARS[idx]!;
}

export function GoalSection({
  goal, data, weeks, today, selectedDate, compact
}: {
  goal: TrackedGoal;
  data: GoalsData;
  weeks: string[][];
  today: string;
  selectedDate: string;
  compact?: boolean;
}) {
  const isRate = goal.type === 'rate';
  const rateMax = goal.rateMax ?? 5;
  const streak = useMemo(() => computeStreak(goal.id, data), [goal.id, data]);

  const totalDays = useMemo(() => {
    let count = 0;
    for (const week of weeks) {
      for (const date of week) {
        if (isGoalComplete(goal, date, data)) count++;
      }
    }
    return count;
  }, [goal, data, weeks]);

  const avgRating = useMemo(() => {
    if (!isRate) return 0;
    const ratings = data.ratings[goal.id] ?? {};
    const values = Object.values(ratings).filter(v => v > 0);
    if (values.length === 0) return 0;
    return values.reduce((s, v) => s + v, 0) / values.length;
  }, [goal, data, isRate]);

  const thisWeek = weeks[weeks.length - 1] ?? [];
  const thisWeekDone = thisWeek.filter(d => isGoalComplete(goal, d, data)).length;

  // Exact width of the grid content: 5 (day label) + (weeks * 3)
  const gridWidth = 5 + (weeks.length * 3);

  const nameLabel = goal.name.toUpperCase();
  const typeLabel = goal.type === 'auto' ? '(auto)' : '';
  const streakLabel = `Streak: ${streak.current}`;
  
  // ┌── NAME (auto) ─── Streak: 5 ──┐
  // 4 (┌── ) + name + type + 1 ( ) + streak + 3 (──┐)
  const headerMin = 4 + nameLabel.length + (typeLabel ? typeLabel.length + 1 : 0) + 2 + streakLabel.length + 3;
  const statsLabel = `Total: ${totalDays}d  Best: ${streak.best}d  This week: ${thisWeekDone}/7`;
  const footerMin = 4 + statsLabel.length + 3;

  // Total box width including borders, ensuring it doesn't wrap labels
  const totalBoxWidth = Math.max(gridWidth + 4, headerMin, footerMin);

  // Calculate filler for footer: totalBoxWidth - stats - borders
  // └── Total: 24d  Best: 12d  This week: 5/7 ──┘
  const footerUsed = 4 + statsLabel.length + 1 + 3;
  const footerFiller = Math.max(1, totalBoxWidth - footerUsed);

  return (
    <Box flexDirection="column" marginBottom={1}>
      {/* Header Border Row */}
      <Box width={totalBoxWidth}>
        <Text color="gray">┌── </Text>
        <Box flexShrink={0}>
          <Text bold color={goal.color}>{nameLabel}</Text>
          {typeLabel && <Text color="gray"> {typeLabel}</Text>}
        </Box>
        <Box flexGrow={1} />
        <Box flexShrink={0}>
          <Text color="gray">{streakLabel}</Text>
          <Text color="gray">──┐</Text>
        </Box>
      </Box>

      {/* Grid Content with side borders */}
      <Box flexDirection="column" paddingX={1} borderStyle="single" borderTop={false} borderBottom={false} borderColor="gray" width={totalBoxWidth}>
        {/* Week number headers */}
        <Box>
          <Box width={5}><Text> </Text></Box>
          {weeks.map((weekDates, wi) => (
            <Text key={weekDates[0] || wi} color="gray">{`W${wi + 1} `}</Text>
          ))}
        </Box>

        {/* Day rows */}
        {DAY_NAMES.map((dayName) => (
          <Box key={dayName}>
            <Box width={5}><Text color="gray">{dayName}</Text></Box>
            {weeks.map((weekDates, wi) => {
              const date = weekDates[DAY_NAMES.indexOf(dayName)]!;
              const isFuture = date > today;
              const isToday = date === today;
              const isSelected = date === selectedDate;
              const suffix = isSelected ? '◄ ' : isToday ? '* ' : '  ';

              if (isFuture) {
                return <Text key={date || wi} dimColor>{isSelected ? ' ◄ ' : '   '}</Text>;
              }

              if (isRate) {
                const rating = getRating(goal, date, data);
                const shade = ratingToShade(rating, rateMax);
                const hasRating = rating > 0;
                return (
                  <Text key={date || wi} color={hasRating ? goal.color : 'gray'} bold={isSelected}>
                    {shade}{suffix}
                  </Text>
                );
              }

              const done = isGoalComplete(goal, date, data);
              if (done) {
                return <Text key={date || wi} color={goal.color} bold={isSelected}>{'█'}{suffix}</Text>;
              }
              return <Text key={date || wi} color={isSelected ? 'white' : 'gray'} bold={isSelected}>{'·'}{suffix}</Text>;
            })}
          </Box>
        ))}
      </Box>

      {/* Footer Border Row */}
      <Box width={totalBoxWidth}>
        <Text color="gray">└── </Text>
        <Text color="gray">{statsLabel} </Text>
        <Text color="gray">{'─'.repeat(footerFiller)}</Text>
        <Text color="gray">──┘</Text>
      </Box>

      {!compact && (
        <Box flexDirection="column" marginTop={1} paddingX={2}>
          {isRate ? (
            <Text dimColor>{'·'} = none  {'░▒▓█'} = rating intensity  * = today  {'◄'} = selected</Text>
          ) : (
            <Text dimColor>{'·'} = not done  {'█'} = done  * = today  {'◄'} = selected</Text>
          )}
          {isRate && selectedDate && (
            <Text dimColor>Selected: {getRating(goal, selectedDate, data)}/{rateMax}  (Enter to rate)</Text>
          ) || (goal.type === 'note' && selectedDate && (
            <Text dimColor>Note: {getNote(goal, selectedDate, data) || '(empty)'}  (Enter to edit)</Text>
          ))}
        </Box>
      )}
    </Box>
  );
}
