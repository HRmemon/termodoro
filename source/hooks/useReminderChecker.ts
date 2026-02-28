import { useEffect, useRef } from 'react';
import type { Config } from '../types.js';
import { loadReminders, updateReminder } from '../lib/reminders.js';
import { loadTasks } from '../lib/tasks.js';
import { notifyReminder } from '../lib/notify.js';

export function useReminderChecker(config: Config): void {
  const firedRemindersRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const checkReminders = () => {
      if (!config.notifications) return;
      const now = new Date();
      const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const today = now.toISOString().slice(0, 10);
      const firedKey = `${today}:${currentTime}`;

      const reminders = loadReminders();
      for (const r of reminders) {
        if (!r.enabled) continue;
        if (r.time === currentTime && !firedRemindersRef.current.has(firedKey + r.id)) {
          firedRemindersRef.current.add(firedKey + r.id);
          let message = r.title;
          if (r.taskId) {
            const tasks = loadTasks();
            const task = tasks.find(t => t.id === r.taskId);
            if (task) message = `${r.title}\nTask: ${task.text}`;
          }
          notifyReminder(r.title, message, config.sound, config.notificationDuration, config.sounds);
          if (!r.recurring) {
            updateReminder(r.id, { enabled: false });
          }
        }
      }
    };

    checkReminders();
    const interval = setInterval(checkReminders, 30_000);
    return () => clearInterval(interval);
  }, [config.notifications, config.notificationDuration]);
}
