import { useEffect, useRef } from 'react';
import type { Config } from '../types.js';
import { loadReminders, updateReminder } from '../lib/reminders.js';
import { loadTasks } from '../lib/tasks.js';
import { notifyReminder } from '../lib/notify.js';
import { localDateStr } from '../lib/date-utils.js';

function isDueNowOrPreviousMinute(reminderTime: string, now: Date): boolean {
  const m = reminderTime.match(/^(\d{2}):(\d{2})$/);
  if (!m) return false;
  const target = Number(m[1]) * 60 + Number(m[2]);
  const current = now.getHours() * 60 + now.getMinutes();
  const diff = current - target;
  return diff === 0 || diff === 1;
}

export function useReminderChecker(config: Config): void {
  const firedRemindersRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const checkReminders = () => {
      if (!config.notifications && !config.sound) return;
      const reminderSoundConfig = {
        ...config.sounds,
        alarmDuration: config.reminderSoundDuration,
        volume: config.reminderVolume,
      };
      const now = new Date();
      const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const today = localDateStr(now);
      const firedKey = `${today}:${currentTime}`;

      const reminders = loadReminders();
      for (const r of reminders) {
        if (!r.enabled) continue;
        if (isDueNowOrPreviousMinute(r.time, now) && !firedRemindersRef.current.has(firedKey + r.id)) {
          firedRemindersRef.current.add(firedKey + r.id);
          let message = r.title;
          if (r.taskId) {
            const tasks = loadTasks();
            const task = tasks.find(t => t.id === r.taskId);
            if (task) message = `${r.title}\nTask: ${task.text}`;
          }
          notifyReminder(
            r.title,
            message,
            config.sound,
            config.reminderNotificationDuration,
            reminderSoundConfig,
            config.notifications,
          );
          if (!r.recurring) {
            updateReminder(r.id, { enabled: false });
          }
        }
      }

      const tasks = loadTasks();
      for (const t of tasks) {
        if (t.completed || !t.date || !t.time) continue;
        if (t.date === today && isDueNowOrPreviousMinute(t.time, now) && !firedRemindersRef.current.has(firedKey + t.id)) {
          firedRemindersRef.current.add(firedKey + t.id);
          notifyReminder(
            'Task Reminder',
            t.text,
            config.sound,
            config.reminderNotificationDuration,
            reminderSoundConfig,
            config.notifications,
          );
        }
      }
    };

    checkReminders();
    const interval = setInterval(checkReminders, 30_000);
    return () => clearInterval(interval);
  }, [
    config.notifications,
    config.reminderNotificationDuration,
    config.reminderSoundDuration,
    config.reminderVolume,
    config.sound,
    config.sounds,
  ]);
}
