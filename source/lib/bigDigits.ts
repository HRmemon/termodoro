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

export function renderBigTime(seconds: number): string[] {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const timeStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

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
