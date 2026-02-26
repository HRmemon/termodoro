import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { Config } from '../types.js';
import { DEFAULT_SOUND_CONFIG } from './sounds.js';

const CONFIG_DIR = path.join(os.homedir(), '.config', 'pomodorocli');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');

const DEFAULT_CONFIG: Config = {
  workDuration: 25,
  shortBreakDuration: 5,
  longBreakDuration: 15,
  longBreakInterval: 4,
  autoStartBreaks: true,
  autoStartWork: false,
  strictMode: false,
  sound: true,
  notifications: true,
  notificationDuration: 5,
  vimKeys: false,
  compactTime: false,
  timerFormat: 'mm:ss',
  sounds: { ...DEFAULT_SOUND_CONFIG },
  browserTracking: false,
  webDomainLimit: 50,
  sidebarWidth: 20,
  theme: { preset: 'default' },
  layout: { sidebar: 'visible', showKeysBar: true, compact: false },
};

function deepMerge<T extends Record<string, any>>(base: T, override: Partial<T>): T {
  const result = { ...base } as any;
  for (const key of Object.keys(override)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    const val = (override as any)[key];
    if (val && typeof val === 'object' && !Array.isArray(val) && typeof (base as any)[key] === 'object') {
      result[key] = deepMerge((base as any)[key], val);
    } else if (val !== undefined) {
      result[key] = val;
    }
  }
  return result;
}

export function loadConfig(): Config {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
      const userConfig = JSON.parse(raw) as Partial<Config>;
      return deepMerge(DEFAULT_CONFIG, userConfig);
    }
  } catch {
    // Fall through to defaults
  }
  return { ...DEFAULT_CONFIG };
}

export function saveConfig(config: Config): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  const tmp = CONFIG_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  fs.renameSync(tmp, CONFIG_PATH);
}

export function getDefaultConfig(): Config {
  return { ...DEFAULT_CONFIG };
}
