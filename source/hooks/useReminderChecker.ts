import { useEffect, useRef } from 'react';
import type { Config } from '../types.js';
import { loadReminders, updateReminder } from '../lib/reminders.js';
import { loadTasks } from '../lib/tasks.js';
import { notifyReminder } from '../lib/notify.js';
import { localDateStr } from '../lib/date-utils.js';

export function useReminderChecker(config: Config): void {
  const firedRemindersRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const checkReminders = () => {
      if (!config.notifications) return;
      const now = new Date();
      const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const today = localDateStr(now);
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

      const tasks = loadTasks();
      for (const t of tasks) {
        if (t.completed || !t.date || !t.time) continue;
        if (t.date === today && t.time === currentTime && !firedRemindersRef.current.has(firedKey + t.id)) {
          firedRemindersRef.current.add(firedKey + t.id);
          notifyReminder('Task Reminder', t.text, config.sound, config.notificationDuration, config.sounds);
        }
      }
    };

    checkReminders();
    const interval = setInterval(checkReminders, 30_000);
    return () => clearInterval(interval);
  }, [config.notifications, config.notificationDuration, config.sound, config.sounds]);
}
