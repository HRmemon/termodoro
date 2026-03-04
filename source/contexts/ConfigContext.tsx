import { createContext, useContext } from 'react';
import type { Config } from '../types.js';
import type { Keymap } from '../lib/keymap.js';

export interface ConfigContextType {
  config: Config;
  setConfig: (config: Config) => void;
  keymap: Keymap;
}

export const ConfigContext = createContext<ConfigContextType | null>(null);

export function useConfig() {
  const ctx = useContext(ConfigContext);
  if (!ctx) {
    throw new Error('useConfig must be used within a ConfigProvider');
  }
  return ctx;
}
