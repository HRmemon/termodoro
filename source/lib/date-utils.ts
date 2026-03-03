/** Shared date utility functions for calendar and event handling */

export function getTodayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function parseDateParts(dateStr: string): { year: number; month: number; day: number } {
  const [y, m, d] = dateStr.split('-').map(Number);
  return { year: y!, month: m!, day: d! };
}

export function formatDateStr(year: number, month: number, day?: number): string {
  const d = day ?? 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function getMonthDays(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return localDateStr(d);
}

export function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const MONTH_NAMES_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const MONTH_NAMES_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export function dateToNum(d: string): number {
  return parseInt(d.replace(/-/g, ''), 10);
}

export function getRelativeDateHints(selectedDate?: string): { label: string; date: string }[] {
  const today = getTodayStr();
  const tomorrow = addDays(today, 1);
  const hints = [
    { label: 'Today', date: today },
    { label: 'Tomorrow', date: tomorrow },
  ];
  if (selectedDate && selectedDate !== today && selectedDate !== tomorrow) {
    hints.push({ label: 'Currently Viewed', date: selectedDate });
  }
  return hints;
}

export function getConsecutiveDates(prefix: string, count: number): { label: string; date: string }[] {
  // If prefix is empty, return relative hints
  if (!prefix) return getRelativeDateHints();

  const hints: { label: string; date: string }[] = [];
  
  // Try to parse partial date
  const parts = prefix.split('-');
  const year = parseInt(parts[0]!) || new Date().getFullYear();
  const month = parseInt(parts[1]!) || (new Date().getMonth() + 1);
  const day = parseInt(parts[2]!) || 1;

  // Start from the parsed date and generate count consecutive days
  let currentStr = formatDateStr(year, month, day);
  for (let i = 0; i < count; i++) {
    const d = new Date(currentStr + 'T00:00:00');
    const label = d.toLocaleDateString('en-US', { weekday: 'long' });
    hints.push({ label, date: currentStr });
    currentStr = addDays(currentStr, 1);
  }
  return hints;
}

