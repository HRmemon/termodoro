import React from 'react';
import { Box, Text } from 'ink';
import type { HeatmapDay } from '../lib/stats.js';

interface HeatmapProps {
  days: HeatmapDay[];
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

// Thresholds in minutes for intensity levels
const THRESHOLDS = [0, 30, 60, 120, 180] as const;
const BLOCKS = ['·', '░', '▒', '▓', '█'] as const;

function getBlock(focusMinutes: number): { char: string; color: string; dim: boolean } {
  if (focusMinutes <= 0) return { char: BLOCKS[0], color: 'white', dim: true };
  if (focusMinutes < THRESHOLDS[2]) return { char: BLOCKS[1], color: 'green', dim: true };
  if (focusMinutes < THRESHOLDS[3]) return { char: BLOCKS[2], color: 'green', dim: false };
  if (focusMinutes < THRESHOLDS[4]) return { char: BLOCKS[3], color: 'green', dim: false };
  return { char: BLOCKS[4], color: 'green', dim: false };
}

function formatDate(dateStr: string): string {
  const [, , d] = dateStr.split('-');
  return d ?? '';
}

export const Heatmap = React.memo(function Heatmap({ days }: HeatmapProps) {
  // Pad to 7 days if fewer provided
  const paddedDays: (HeatmapDay | null)[] = [...days];
  while (paddedDays.length < 7) paddedDays.push(null);

  return (
    <Box flexDirection="column">
      {/* Day labels row */}
      <Box>
        {DAY_LABELS.map((label, i) => (
          <Box key={label} width={6}>
            <Text dimColor>{label}</Text>
          </Box>
        ))}
      </Box>
      {/* Block row */}
      <Box>
        {paddedDays.map((day, i) => {
          if (!day) {
            return (
              <Box key={i} width={6}>
                <Text dimColor>·</Text>
              </Box>
            );
          }
          const { char, color, dim } = getBlock(day.focusMinutes);
          const dateNum = formatDate(day.date);
          return (
            <Box key={day.date} width={6} flexDirection="column" alignItems="flex-start">
              <Text color={color} dimColor={dim}>
                {char}
              </Text>
              <Text dimColor>{dateNum}</Text>
            </Box>
          );
        })}
      </Box>
      {/* Legend */}
      <Box marginTop={1}>
        <Text dimColor>less </Text>
        {BLOCKS.map((b, i) => {
          const { color, dim } = i === 0
            ? { color: 'white', dim: true }
            : { color: 'green', dim: i < 2 };
          return (
            <Text key={b} color={color} dimColor={dim}>{b}</Text>
          );
        })}
        <Text dimColor> more</Text>
      </Box>
    </Box>
  );
});
