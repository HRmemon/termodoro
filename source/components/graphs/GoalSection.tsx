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

  return (
    <Box flexDirection="column" marginBottom={compact ? 1 : 0}>
      <Box>
        <Text bold color={goal.color}>{'── '}{goal.name}</Text>
        <Text dimColor> ({goal.type}{isRate ? ` 0-${rateMax}` : ''}){compact ? `  ${totalDays}d  streak:${streak.current}d  best:${streak.best}d${isRate ? `  avg:${avgRating.toFixed(1)}` : ''}` : ''}</Text>
      </Box>

      {/* Heatmap grid */}
      <Box flexDirection="column" marginTop={compact ? 0 : 1}>
        {/* Week number headers */}
        <Box>
          <Box width={5}><Text> </Text></Box>
          {weeks.map((_, wi) => (
            <Text key={wi} dimColor>{`W${wi + 1} `}</Text>
          ))}
        </Box>

        {/* Day rows */}
        {DAY_NAMES.map((dayName, dayIdx) => (
          <Box key={dayName}>
            <Box width={5}><Text dimColor>{dayName}</Text></Box>
            {weeks.map((weekDates, wi) => {
              const date = weekDates[dayIdx]!;
              const isFuture = date > today;
              const isToday = date === today;
              const isSelected = date === selectedDate;
              const suffix = isSelected ? '◄ ' : isToday ? '* ' : '  ';

              if (isFuture) {
                return <Text key={wi} dimColor>{isSelected ? ' ◄ ' : '   '}</Text>;
              }

              if (isRate) {
                const rating = getRating(goal, date, data);
                const shade = ratingToShade(rating, rateMax);
                const hasRating = rating > 0;
                return (
                  <Text key={wi} color={hasRating ? goal.color : undefined} dimColor={!hasRating} bold={isSelected}>
                    {shade}{suffix}
                  </Text>
                );
              }

              const done = isGoalComplete(goal, date, data);
              if (done) {
                return <Text key={wi} color={goal.color} bold={isSelected}>{'█'}{suffix}</Text>;
              }
              return <Text key={wi} color={isSelected ? 'white' : undefined} dimColor={!isSelected} bold={isSelected}>{'·'}{suffix}</Text>;
            })}
          </Box>
        ))}
      </Box>

      {!compact && (
        <Box flexDirection="column" marginTop={1}>
          {isRate ? (
            <Text dimColor>{'·'} = none  {'░▒▓█'} = rating intensity  * = today  {'◄'} = selected</Text>
          ) : (
            <Text dimColor>{'·'} = not done  {'█'} = done  * = today  {'◄'} = selected</Text>
          )}
          <Box marginTop={1}>
            <Text>Total: <Text bold>{totalDays}d</Text></Text>
            <Text>{'  '}Streak: <Text bold color={streak.current > 0 ? 'green' : undefined}>{streak.current}d</Text></Text>
            <Text>{'  '}Best: <Text bold>{streak.best}d</Text></Text>
            {isRate && <Text>{'  '}Avg: <Text bold color="yellow">{avgRating.toFixed(1)}/{rateMax}</Text></Text>}
          </Box>
          <Text>This week: <Text bold>{thisWeekDone}/7</Text></Text>
          {isRate && selectedDate && (
            <Text dimColor>Selected: {getRating(goal, selectedDate, data)}/{rateMax}  (Enter to rate)</Text>
          )}
          {goal.type === 'note' && selectedDate && (
            <Text dimColor>Note: {getNote(goal, selectedDate, data) || '(empty)'}  (Enter to edit)</Text>
          )}
        </Box>
      )}
    </Box>
  );
}
