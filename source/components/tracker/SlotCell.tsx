import { Text } from 'ink';
import { getCategoryByCode } from '../../lib/tracker.js';
import type { PendingSuggestion } from '../../lib/tracker.js';

export const COL_WIDTH = 5;

export function SlotCell({
  code, isActive, isCursor, pending
}: { code: string | undefined; isActive: boolean; isCursor: boolean; pending?: PendingSuggestion }) {
  // Show pending suggestion if no confirmed code
  // Always produce exactly COL_WIDTH (5) visual chars
  if (!code && pending) {
    // pending display: space + up to 3 chars + space = 5 chars total
    const raw = pending.suggested === 'hD' ? '?½D' : `?${pending.suggested}`;
    const capped = raw.slice(0, 3).padEnd(3);
    if (isCursor) {
      return <Text backgroundColor="white" color="black">{` ${capped} `}</Text>;
    }
    return <Text dimColor color="yellow">{` ${capped} `}</Text>;
  }

  const cat = code ? getCategoryByCode(code) : undefined;
  // Filled: space + 2-char code + space + space = 5 chars
  const display = code ? (code === 'hD' ? '\u00bdD' : code.slice(0, 2).padEnd(2)) : ' \u00b7';
  const color = cat?.color as any ?? 'gray';

  if (isCursor) {
    return <Text backgroundColor={isActive ? color : 'white'} color="black">{` ${display.trim().padEnd(2)} `}</Text>;
  }
  if (code) {
    return <Text color={color}>{` ${display.trim().padEnd(2)} `}</Text>;
  }
  return <Text dimColor>{`  \u00b7  `}</Text>;
}
