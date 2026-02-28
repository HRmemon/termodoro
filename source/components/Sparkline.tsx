import React from 'react';
import { Text } from 'ink';

const SPARK_CHARS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'] as const;

interface SparklineProps {
  values: number[];
  color?: string;
  showTrend?: boolean;
}

function renderSparkline(values: number[]): string {
  if (values.length === 0) return '';

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;

  return values
    .map(v => {
      if (range === 0) return SPARK_CHARS[3]; // middle char when flat
      const normalized = (v - min) / range;
      const idx = Math.min(
        Math.floor(normalized * SPARK_CHARS.length),
        SPARK_CHARS.length - 1,
      );
      return SPARK_CHARS[idx];
    })
    .join('');
}

function getTrendArrow(values: number[]): { arrow: string; color: string } {
  if (values.length < 2) return { arrow: '→', color: 'white' };

  const half = Math.floor(values.length / 2);
  const firstHalf = values.slice(0, half);
  const secondHalf = values.slice(values.length - half);

  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const diff = avg(secondHalf) - avg(firstHalf);
  const threshold = avg([...firstHalf, ...secondHalf]) * 0.05;

  if (diff > threshold) return { arrow: '↑', color: 'green' };
  if (diff < -threshold) return { arrow: '↓', color: 'red' };
  return { arrow: '→', color: 'yellow' };
}

export const Sparkline = React.memo(function Sparkline({ values, color = 'cyan', showTrend = false }: SparklineProps) {
  const spark = renderSparkline(values);
  const { arrow, color: arrowColor } = getTrendArrow(values);

  return (
    <>
      <Text color={color}>{spark}</Text>
      {showTrend && <Text color={arrowColor}>{arrow}</Text>}
    </>
  );
});
