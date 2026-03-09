import notifier from 'node-notifier';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
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
  notifier.notify({
    title: msg.title,
    message: msg.message,
    timeout: durationSeconds,
  });
}

export function sendReminderNotification(title: string, message: string, durationSeconds = 5): void {
  notifier.notify({
    title,
    message,
    timeout: durationSeconds,
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

export function notifyReminder(
  title: string,
  message: string,
  soundEnabled: boolean,
  durationSeconds = 5,
  soundConfig?: SoundConfig,
  notificationsEnabled = true,
): void {
  if (!shouldDispatchReminder(title, message)) return;

  if (soundEnabled) {
    if (soundConfig) {
      playSoundForEvent('reminder', soundConfig);
    } else {
      ringBell();
    }
  }
  if (notificationsEnabled) {
    sendReminderNotification(title, message, durationSeconds);
  }
}

function shouldDispatchReminder(title: string, message: string): boolean {
  const now = new Date();
  const minuteBucket = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const hash = createHash('sha1').update(`${minuteBucket}|${title}|${message}`).digest('hex');
  const stampPath = path.join(os.tmpdir(), `pomodorocli-reminder-${hash}.stamp`);
  try {
    const stat = fs.statSync(stampPath);
    const ageMs = Date.now() - stat.mtimeMs;
    if (ageMs < 90_000) return false;
  } catch {
    // stamp missing; proceed
  }
  try {
    fs.writeFileSync(stampPath, minuteBucket);
  } catch {
    // ignore stamp write failures; best-effort dedupe
  }
  return true;
}
