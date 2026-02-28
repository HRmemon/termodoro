import { Box, Text } from 'ink';
import type { TrackedGoal } from '../../lib/goals.js';
import { ratingToShade } from './GoalSection.js';

interface RatePickerProps {
  goal: TrackedGoal;
  selDateLabel: string;
  pickerValue: number;
}

export function RatePicker({ goal, selDateLabel, pickerValue }: RatePickerProps) {
  const max = goal.rateMax ?? 5;
  const shades = Array.from({ length: max }, (_, i) => ratingToShade(i + 1, max));

  return (
    <Box flexDirection="column" borderStyle="single" borderColor="cyan" paddingX={1} marginTop={1}>
      <Text bold color="cyan">{goal.name} — {selDateLabel}</Text>
      <Box marginTop={1}>
        {shades.map((sh, i) => (
          <Text key={i} color={i + 1 <= pickerValue ? goal.color as any : 'gray'} bold={i + 1 === pickerValue}>
            {' '}{sh}{' '}
          </Text>
        ))}
      </Box>
      <Box>
        {Array.from({ length: max }, (_, i) => (
          <Text key={i} color={i + 1 <= pickerValue ? 'cyan' : 'gray'} bold={i + 1 === pickerValue}>
            {' '}{i + 1}{' '}
          </Text>
        ))}
      </Box>
      <Text dimColor>↑↓:adjust  Enter:confirm  1-{max}:set  0:clear  Esc:cancel</Text>
    </Box>
  );
}
