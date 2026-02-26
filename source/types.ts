export interface Session {
  id: string;
  type: 'work' | 'short-break' | 'long-break';
  status: 'completed' | 'skipped' | 'abandoned';
  label?: string;
  project?: string;
  tag?: string;
  energyLevel?: 'high' | 'medium' | 'low';
  distractionScore?: number;
  startedAt: string;
  endedAt: string;
  durationPlanned: number;
  durationActual: number;
}

export interface Config {
  workDuration: number;
  shortBreakDuration: number;
  longBreakDuration: number;
  longBreakInterval: number;
  autoStartBreaks: boolean;
  autoStartWork: boolean;
  strictMode: boolean;
  sound: boolean;
  notifications: boolean;
  notificationDuration: number;
  vimKeys: boolean;
  compactTime: boolean;
  timerFormat: 'mm:ss' | 'hh:mm:ss' | 'minutes';
  sounds: import('./lib/sounds.js').SoundConfig;
  browserTracking: boolean;
  webDomainLimit: number;
  sidebarWidth: number;
  theme?: ThemeConfig;
  customThemes?: Record<string, ThemeColors>;
  layout?: LayoutConfig;
  views?: ViewEntry[];
  keybindings?: import('./lib/keymap.js').KeybindingConfig;
  calendar?: CalendarConfig;
}

export interface TimeBlock {
  id: string;
  startTime?: string;
  endTime?: string;
  label: string;
  expectedSessions: number;
  priority: 'P1' | 'P2' | 'P3';
  project?: string;
}

export interface DayPlan {
  date: string;
  theme?: string;
  blocks: TimeBlock[];
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  unlockedAt?: string;
}

export interface Task {
  id: string;
  text: string;
  completed: boolean;
  description?: string;
  project?: string;
  expectedPomodoros: number;
  completedPomodoros: number;
  createdAt: string;
  completedAt?: string;
  deadline?: string;  // YYYY-MM-DD
}

export interface ScheduledNotification {
  id: string;
  time: string; // HH:MM
  title: string;
  taskId?: string;
  enabled: boolean;
  recurring: boolean;
}

export interface SequenceBlock {
  type: 'work' | 'short-break' | 'long-break';
  durationMinutes: number;
}

export interface SessionSequence {
  name: string;
  blocks: SequenceBlock[];
}

export type SessionType = Session['type'];
export type SessionStatus = Session['status'];
export type EnergyLevel = NonNullable<Session['energyLevel']>;
export type Priority = TimeBlock['priority'];

export type View = 'calendar' | 'timer' | 'stats' | 'config' | 'clock' | 'reminders' | 'tasks' | 'web' | 'tracker' | 'graphs';

export interface ThemeColors {
  focus: string;
  break: string;
  highlight: string;
  text: string;
  dim: string;
  bg: string;
}

export interface ThemeConfig {
  colors?: Partial<ThemeColors>;
  preset?: string;
}

export interface LayoutConfig {
  sidebar: 'visible' | 'hidden' | 'auto';
  showKeysBar: boolean;
  compact: boolean;
}

export interface ViewEntry {
  id: View;
  label: string;
  shortcut?: string;
  hidden?: boolean;
}

export interface CalendarEvent {
  id: string;
  title: string;
  date: string;           // YYYY-MM-DD
  endDate?: string;       // YYYY-MM-DD for multi-day events
  time?: string;          // HH:MM
  endTime?: string;       // HH:MM
  status: 'normal' | 'done' | 'important';
  privacy: boolean;
  frequency?: 'once' | 'daily' | 'weekly' | 'monthly' | 'yearly';
  repeatCount?: number;   // 0 = infinite
  rrule?: string;         // RFC 5545 RRULE for .ics imports
  icon?: string;          // override auto-icon
  calendarId?: string;    // for ICS calendar grouping
  color?: string;         // per-event color override
  source: 'user' | 'ics';
}

export interface CalendarConfig {
  icsFiles?: string[];
  defaultView?: 'monthly' | 'daily';
  weekStartsOn?: 0 | 1;          // 0=Sunday, 1=Monday
  showWeekNumbers?: boolean;
  showSessionHeatmap?: boolean;
  showTaskDeadlines?: boolean;
  showReminders?: boolean;
  privacyMode?: boolean;
  icons?: Record<string, string>;
  icsColors?: string[];
}

export interface TagInfo {
  label?: string;
  project?: string;
  tag?: string;
  energyLevel?: EnergyLevel;
}

export interface PostSessionInfo {
  distractionScore?: number;
}
