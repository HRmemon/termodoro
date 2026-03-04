import { useInput } from 'ink';
import { useUI } from '../contexts/UIContext.js';
import { useConfig } from '../contexts/ConfigContext.js';
import { kmMatches, type KeyAction } from '../lib/keymap.js';
import type { Key } from 'ink';

export function useHotkeys(
  action: KeyAction | KeyAction[],
  callback: (input: string, key: Key) => void,
  options?: { isActive?: boolean }
) {
  const { isTyping } = useUI();
  const { keymap } = useConfig();
  const isActive = options?.isActive ?? true;

  useInput((input, key) => {
    if (isTyping || !isActive) return;

    const actions = Array.isArray(action) ? action : [action];
    for (const act of actions) {
      if (kmMatches(keymap, act, input, key)) {
        callback(input, key);
        return;
      }
    }
  });
}
