import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { Config } from '../types.js';
import { ALL_SOUND_CHOICES, DEFAULT_SOUND_CONFIG } from './sounds.js';
import { atomicWriteJSON } from './fs-utils.js';

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

function deepMerge<T extends object>(base: T, override: Partial<T>): T {
  const result = { ...base } as Record<string, unknown>;
  for (const key of Object.keys(override)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    const val = (override as Record<string, unknown>)[key];
    if (val && typeof val === 'object' && !Array.isArray(val) && typeof (base as Record<string, unknown>)[key] === 'object') {
      result[key] = deepMerge((base as Record<string, unknown>)[key] as Record<string, unknown>, val as Partial<Record<string, unknown>>);
    } else if (val !== undefined) {
      result[key] = val;
    }
  }
  return result as T;
}

const TIMER_FORMAT_VALUES = ['mm:ss', 'hh:mm:ss', 'minutes'] as const;
const SIDEBAR_VALUES = ['visible', 'hidden', 'auto'] as const;
const CALENDAR_VIEW_VALUES = ['monthly', 'daily'] as const;

export function validateConfig(raw: Config): Config {
  const c = { ...raw };
  const warnings: string[] = [];

  function clampNum(
    field: keyof Config,
    min: number,
    max: number,
    defaultVal: number,
  ): number {
    const v = c[field] as unknown;
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      warnings.push(`config.${field}: expected number, got ${JSON.stringify(v)}; using default ${defaultVal}`);
      return defaultVal;
    }
    const clamped = Math.min(Math.max(Math.round(v), min), max);
    if (clamped !== v) {
      warnings.push(`config.${field}: ${v} is out of range [${min}, ${max}]; clamped to ${clamped}`);
    }
    return clamped;
  }

  function ensureBool(field: keyof Config, defaultVal: boolean): boolean {
    const v = c[field] as unknown;
    if (typeof v !== 'boolean') {
      warnings.push(`config.${field}: expected boolean, got ${JSON.stringify(v)}; using default ${defaultVal}`);
      return defaultVal;
    }
    return v;
  }

  function ensureEnum<T extends string>(
    label: string,
    value: unknown,
    allowed: readonly T[],
    defaultVal: T,
  ): T {
    if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) {
      return value as T;
    }
    warnings.push(`config.${label}: invalid value ${JSON.stringify(value)}; using default "${defaultVal}"`);
    return defaultVal;
  }

  // --- Numeric fields ---
  c.workDuration         = clampNum('workDuration',         1,  480, DEFAULT_CONFIG.workDuration);
  c.shortBreakDuration   = clampNum('shortBreakDuration',   1,   60, DEFAULT_CONFIG.shortBreakDuration);
  c.longBreakDuration    = clampNum('longBreakDuration',    1,  120, DEFAULT_CONFIG.longBreakDuration);
  c.longBreakInterval    = clampNum('longBreakInterval',    1,  100, DEFAULT_CONFIG.longBreakInterval);
  c.notificationDuration = clampNum('notificationDuration', 1,   60, DEFAULT_CONFIG.notificationDuration);
  c.webDomainLimit       = clampNum('webDomainLimit',      10,  500, DEFAULT_CONFIG.webDomainLimit);
  c.sidebarWidth         = clampNum('sidebarWidth',         8,   30, DEFAULT_CONFIG.sidebarWidth);

  // --- Boolean fields ---
  c.autoStartBreaks = ensureBool('autoStartBreaks', DEFAULT_CONFIG.autoStartBreaks);
  c.autoStartWork   = ensureBool('autoStartWork',   DEFAULT_CONFIG.autoStartWork);
  c.strictMode      = ensureBool('strictMode',      DEFAULT_CONFIG.strictMode);
  c.sound           = ensureBool('sound',           DEFAULT_CONFIG.sound);
  c.notifications   = ensureBool('notifications',   DEFAULT_CONFIG.notifications);
  c.vimKeys         = ensureBool('vimKeys',         DEFAULT_CONFIG.vimKeys);
  c.compactTime     = ensureBool('compactTime',     DEFAULT_CONFIG.compactTime);
  c.browserTracking = ensureBool('browserTracking', DEFAULT_CONFIG.browserTracking);

  // --- Enum fields ---
  c.timerFormat = ensureEnum(
    'timerFormat',
    c.timerFormat,
    TIMER_FORMAT_VALUES,
    DEFAULT_CONFIG.timerFormat,
  );

  // --- Nested: sounds ---
  if (c.sounds && typeof c.sounds === 'object') {
    const s = { ...c.sounds };
    s['work-end']  = ensureEnum('sounds.work-end',  s['work-end'],  ALL_SOUND_CHOICES, DEFAULT_SOUND_CONFIG['work-end']);
    s['break-end'] = ensureEnum('sounds.break-end', s['break-end'], ALL_SOUND_CHOICES, DEFAULT_SOUND_CONFIG['break-end']);
    s['reminder']  = ensureEnum('sounds.reminder',  s['reminder'],  ALL_SOUND_CHOICES, DEFAULT_SOUND_CONFIG['reminder']);
    if (typeof s.alarmDuration !== 'number' || !Number.isFinite(s.alarmDuration)) {
      warnings.push(`config.sounds.alarmDuration: invalid; using default ${DEFAULT_SOUND_CONFIG.alarmDuration}`);
      s.alarmDuration = DEFAULT_SOUND_CONFIG.alarmDuration;
    } else {
      s.alarmDuration = Math.min(Math.max(Math.round(s.alarmDuration), 1), 60);
    }
    if (typeof s.volume !== 'number' || !Number.isFinite(s.volume)) {
      warnings.push(`config.sounds.volume: invalid; using default ${DEFAULT_SOUND_CONFIG.volume}`);
      s.volume = DEFAULT_SOUND_CONFIG.volume;
    } else {
      s.volume = Math.min(Math.max(Math.round(s.volume), 0), 100);
    }
    if (typeof s.customPaths !== 'object' || s.customPaths === null || Array.isArray(s.customPaths)) {
      s.customPaths = {};
    }
    c.sounds = s;
  } else {
    warnings.push('config.sounds: missing or invalid; using defaults');
    c.sounds = { ...DEFAULT_SOUND_CONFIG };
  }

  // --- Nested: layout (optional) ---
  if (c.layout !== undefined) {
    if (typeof c.layout !== 'object' || c.layout === null) {
      warnings.push('config.layout: invalid; using defaults');
      c.layout = DEFAULT_CONFIG.layout;
    } else {
      const l = { ...c.layout };
      l.sidebar = ensureEnum('layout.sidebar', l.sidebar, SIDEBAR_VALUES, 'visible');
      if (typeof l.showKeysBar !== 'boolean') { l.showKeysBar = true; }
      if (typeof l.compact !== 'boolean') { l.compact = false; }
      c.layout = l;
    }
  }

  // --- Nested: calendar (optional) ---
  if (c.calendar !== undefined) {
    if (typeof c.calendar !== 'object' || c.calendar === null) {
      warnings.push('config.calendar: invalid; ignoring');
      c.calendar = undefined;
    } else {
      const cal = { ...c.calendar };
      if (cal.weekStartsOn !== undefined && cal.weekStartsOn !== 0 && cal.weekStartsOn !== 1) {
        warnings.push('config.calendar.weekStartsOn: must be 0 or 1; using 1');
        cal.weekStartsOn = 1;
      }
      if (cal.defaultView !== undefined) {
        cal.defaultView = ensureEnum('calendar.defaultView', cal.defaultView, CALENDAR_VIEW_VALUES, 'monthly');
      }
      if (cal.maxEventLines !== undefined) {
        if (typeof cal.maxEventLines !== 'number' || !Number.isFinite(cal.maxEventLines) || cal.maxEventLines < 1) {
          warnings.push('config.calendar.maxEventLines: invalid; using 3');
          cal.maxEventLines = 3;
        } else {
          cal.maxEventLines = Math.min(Math.max(Math.round(cal.maxEventLines), 1), 20);
        }
      }
      c.calendar = cal;
    }
  }

  if (warnings.length > 0) {
    process.stderr.write(
      `[pomodorocli] Config warnings (${warnings.length}):\n` +
      warnings.map(w => `  - ${w}`).join('\n') + '\n'
    );
  }

  return c;
}

export function loadConfig(): Config {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
      const userConfig = JSON.parse(raw) as Partial<Config>;
      const merged = deepMerge(DEFAULT_CONFIG, userConfig);
      return validateConfig(merged);
    }
  } catch {
    // Fall through to defaults
  }
  return { ...DEFAULT_CONFIG };
}

export function saveConfig(config: Config): void {
  atomicWriteJSON(CONFIG_PATH, config);
}

export function getDefaultConfig(): Config {
  return { ...DEFAULT_CONFIG };
}
