import notifier from 'node-notifier';
import type { SessionType } from '../types.js';
import type { SoundConfig, SoundEvent } from './sounds.js';
import { playSoundForEvent } from './sounds.js';

const MESSAGES: Record<SessionType, { title: string; message: string }> = {
  'work': {
    title: 'Focus session complete!',
    message: 'Time for a break. Great work!',
  },
  'short-break': {
    title: 'Break is over',
    message: 'Ready to focus again?',
  },
  'long-break': {
    title: 'Long break is over',
    message: 'Feeling refreshed? Let\'s go!',
  },
};

export function sendNotification(type: SessionType, durationSeconds = 5): void {
  const msg = MESSAGES[type];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (notifier as any).notify({
    title: msg.title,
    message: msg.message,
    sound: false,
    expire: durationSeconds * 1000,
  });
}

export function sendReminderNotification(title: string, message: string, durationSeconds = 5): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (notifier as any).notify({
    title,
    message,
    sound: false,
    expire: durationSeconds * 1000,
  });
}

export function ringBell(): void {
  process.stdout.write('\x07');
}

function sessionTypeToSoundEvent(type: SessionType): SoundEvent {
  return type === 'work' ? 'work-end' : 'break-end';
}

export function notifySessionEnd(type: SessionType, soundEnabled: boolean, notificationsEnabled: boolean, durationSeconds = 5, soundConfig?: SoundConfig): void {
  if (soundEnabled) {
    if (soundConfig) {
      playSoundForEvent(sessionTypeToSoundEvent(type), soundConfig);
    } else {
      ringBell();
    }
  }
  if (notificationsEnabled) {
    sendNotification(type, durationSeconds);
  }
}

export function notifyReminder(title: string, message: string, soundEnabled: boolean, durationSeconds = 5, soundConfig?: SoundConfig): void {
  if (soundEnabled) {
    if (soundConfig) {
      playSoundForEvent('reminder', soundConfig);
    } else {
      ringBell();
    }
  }
  sendReminderNotification(title, message, durationSeconds);
}
