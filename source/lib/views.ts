import type { Config, View, ViewEntry } from '../types.js';

export type { ViewEntry };

export const DEFAULT_VIEWS: ViewEntry[] = [
  { id: 'calendar',  label: 'Calendar',  shortcut: '0' },
  { id: 'timer',     label: 'Timer',     shortcut: '1' },
  { id: 'tasks',     label: 'Tasks',     shortcut: '2' },
  { id: 'reminders', label: 'Reminders', shortcut: '3' },
  { id: 'clock',     label: 'Clock',     shortcut: '4' },
  { id: 'stats',     label: 'Stats',     shortcut: '5' },
  { id: 'config',    label: 'Config',    shortcut: '6' },
  { id: 'web',       label: 'Web Time',  shortcut: '7' },
  { id: 'tracker',   label: 'Tracker',   shortcut: '8' },
  { id: 'graphs',    label: 'Goals',     shortcut: '9' },
];

const VALID_VIEW_IDS = new Set(DEFAULT_VIEWS.map(v => v.id));

export function getViewConfig(config: Config): ViewEntry[] {
  if (!config.views) return DEFAULT_VIEWS;
  // Filter out entries with unknown view IDs to prevent crashes
  return config.views.filter(v => VALID_VIEW_IDS.has(v.id));
}

export function getVisibleViews(config: Config): ViewEntry[] {
  return getViewConfig(config).filter(v => !v.hidden);
}

export function getShortcutMap(config: Config): Map<string, View> {
  const map = new Map<string, View>();
  for (const v of getViewConfig(config)) {
    if (v.shortcut) map.set(v.shortcut, v.id);
  }
  return map;
}

export function getViewLabel(config: Config, view: View): string {
  const entry = getViewConfig(config).find(v => v.id === view);
  return entry?.label ?? view;
}

export function getViewNum(config: Config, view: View): string {
  const entry = getViewConfig(config).find(v => v.id === view);
  return entry?.shortcut ?? '';
}
