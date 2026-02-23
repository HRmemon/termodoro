import React from 'react';
import { Box, Text } from 'ink';

export interface BarChartItem {
  label: string;
  value: number;
  maxValue?: number;
}

interface BarChartProps {
  items: BarChartItem[];
  maxBarWidth?: number;
  unit?: string;
  color?: string;
}

const BAR_CHAR = '█';
const EMPTY_CHAR = '░';

function formatValue(value: number, unit: string): string {
  if (unit === 'min') {
    if (value >= 60) {
      const h = Math.floor(value / 60);
      const m = Math.round(value % 60);
      return m > 0 ? `${h}h ${m}m` : `${h}h`;
    }
    return `${Math.round(value)}m`;
  }
  return `${Math.round(value)}${unit ? ' ' + unit : ''}`;
}

export function BarChart({ items, maxBarWidth = 30, unit = '', color = 'cyan' }: BarChartProps) {
  if (items.length === 0) {
    return (
      <Box>
        <Text dimColor>no data</Text>
      </Box>
    );
  }

  const globalMax = Math.max(...items.map(i => i.maxValue ?? i.value), 1);
  const labelWidth = Math.max(...items.map(i => i.label.length), 1);

  return (
    <Box flexDirection="column">
      {items.map(item => {
        const effectiveMax = item.maxValue ?? globalMax;
        const ratio = effectiveMax > 0 ? item.value / effectiveMax : 0;
        const filled = Math.round(ratio * maxBarWidth);
        const empty = maxBarWidth - filled;
        const bar = BAR_CHAR.repeat(filled) + EMPTY_CHAR.repeat(empty);
        const paddedLabel = item.label.padEnd(labelWidth, ' ');
        const valueStr = formatValue(item.value, unit);

        return (
          <Box key={item.label} marginBottom={0}>
            <Text dimColor>{paddedLabel} </Text>
            <Text color={color}>{bar}</Text>
            <Text dimColor> {valueStr}</Text>
          </Box>
        );
      })}
    </Box>
  );
}
