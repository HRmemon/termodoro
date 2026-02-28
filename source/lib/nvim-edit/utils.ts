import { nanoid } from 'nanoid';

export function tmpFile(view: string): string {
  const rand = nanoid(8);
  return `/tmp/pomodorocli-${view}-${rand}.md`;
}

export function fmtMin(minutes: number): string {
  if (minutes < 1) return '0m';
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${Math.round(minutes)}m`;
}

export function barChart(value: number, max: number, width = 16): string {
  if (max <= 0) return '';
  const filled = Math.round((value / max) * width);
  return '█'.repeat(Math.min(filled, width));
}
