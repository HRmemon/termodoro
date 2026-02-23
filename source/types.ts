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
  active?: boolean;
  project?: string;
  expectedPomodoros: number;
  completedPomodoros: number;
  createdAt: string;
  completedAt?: string;
}

export interface ScheduledNotification {
  id: string;
  time: string; // HH:MM
  title: string;
  taskId?: string;
  enabled: boolean;
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

export type View = 'timer' | 'plan' | 'stats' | 'config' | 'clock' | 'reminders';

export interface TagInfo {
  label?: string;
  project?: string;
  tag?: string;
  energyLevel?: EnergyLevel;
}

export interface PostSessionInfo {
  distractionScore?: number;
}
