import notifier from 'node-notifier';
import type { SessionType } from '../types.js';

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

export function sendNotification(type: SessionType): void {
  const msg = MESSAGES[type];
  notifier.notify({
    title: msg.title,
    message: msg.message,
    sound: true,
  });
}

export function ringBell(): void {
  process.stdout.write('\x07');
}

export function notifySessionEnd(type: SessionType, soundEnabled: boolean, notificationsEnabled: boolean): void {
  if (soundEnabled) {
    ringBell();
  }
  if (notificationsEnabled) {
    sendNotification(type);
  }
}
