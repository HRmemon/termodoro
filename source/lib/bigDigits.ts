// Big ASCII digit renderer for the timer display
// Each digit is 5 lines tall, 6 chars wide

const DIGITS: Record<string, string[]> = {
  '0': [
    '██████',
    '█    █',
    '█    █',
    '█    █',
    '██████',
  ],
  '1': [
    '    ██',
    '    ██',
    '    ██',
    '    ██',
    '    ██',
  ],
  '2': [
    '██████',
    '     █',
    '██████',
    '█     ',
    '██████',
  ],
  '3': [
    '██████',
    '     █',
    '██████',
    '     █',
    '██████',
  ],
  '4': [
    '█    █',
    '█    █',
    '██████',
    '     █',
    '     █',
  ],
  '5': [
    '██████',
    '█     ',
    '██████',
    '     █',
    '██████',
  ],
  '6': [
    '██████',
    '█     ',
    '██████',
    '█    █',
    '██████',
  ],
  '7': [
    '██████',
    '     █',
    '     █',
    '     █',
    '     █',
  ],
  '8': [
    '██████',
    '█    █',
    '██████',
    '█    █',
    '██████',
  ],
  '9': [
    '██████',
    '█    █',
    '██████',
    '     █',
    '██████',
  ],
  ':': [
    '      ',
    '  ██  ',
    '      ',
    '  ██  ',
    '      ',
  ],
};

export function formatTimerString(seconds: number, format: 'mm:ss' | 'hh:mm:ss' | 'minutes', countUp = false): string {
  if (format === 'hh:mm:ss') {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  if (format === 'minutes') {
    const mins = countUp ? Math.floor(seconds / 60) : Math.ceil(seconds / 60);
    return String(mins).padStart(2, '0');
  }
  // mm:ss (default)
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function renderBigTime(seconds: number, format: 'mm:ss' | 'hh:mm:ss' | 'minutes' = 'mm:ss', countUp = false): string[] {
  const timeStr = formatTimerString(seconds, format, countUp);

  const lines: string[] = ['', '', '', '', ''];
  for (let i = 0; i < timeStr.length; i++) {
    const ch = timeStr[i]!;
    const glyph = DIGITS[ch];
    if (!glyph) continue;
    for (let row = 0; row < 5; row++) {
      if (i > 0) lines[row] += '  ';
      lines[row] += glyph[row];
    }
  }
  return lines;
}

export function renderBigString(str: string): string[] {
  const lines: string[] = ['', '', '', '', ''];
  for (let i = 0; i < str.length; i++) {
    const ch = str[i]!;
    const glyph = DIGITS[ch];
    if (!glyph) continue;
    for (let row = 0; row < 5; row++) {
      if (i > 0) lines[row] += '  ';
      lines[row] += glyph[row];
    }
  }
  return lines;
}

export function getBigDigitWidth(timeStr: string): number {
  // Each char is 6 wide + 2 gap between chars
  return timeStr.length * 6 + (timeStr.length - 1) * 2;
}
