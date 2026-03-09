import type { Config } from '../types.js';
import type { EngineFullState } from '../engine/timer-engine.js';
import { localDateStr } from '../lib/date-utils.js';
import { notifyReminder } from '../lib/notify.js';
import { loadReminders, updateReminder } from '../lib/reminders.js';
import { loadTasks } from '../lib/tasks.js';

const CHECK_INTERVAL_MS = 30_000;
function isDueNowOrPreviousMinute(reminderTime: string, now: Date): boolean {
  const m = reminderTime.match(/^(\d{2}):(\d{2})$/);
  if (!m) return false;
  const target = Number(m[1]) * 60 + Number(m[2]);
  const current = now.getHours() * 60 + now.getMinutes();
  const diff = current - target;
  return diff === 0 || diff === 1;
}

export class DaemonReminderChecker {
  private readonly firedKeys = new Set<string>();
  private interval: NodeJS.Timeout | null = null;
  private lastMinuteKey = '';

  constructor(private readonly getConfig: () => Config) {}

  start(): void {
    if (this.interval) return;
    this.checkNow();
    this.interval = setInterval(() => this.checkNow(), CHECK_INTERVAL_MS);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.firedKeys.clear();
    this.lastMinuteKey = '';
  }

  handleEngineState(state: EngineFullState): void {
    if (!state.isRunning || state.isPaused) {
      this.firedKeys.clear();
      this.lastMinuteKey = '';
    }
  }

  private checkNow(): void {
    const config = this.getConfig();
    if (!config.notifications && !config.sound) return;

    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const today = localDateStr(now);
    const minuteKey = `${today}:${currentTime}`;
    if (minuteKey !== this.lastMinuteKey) {
      this.lastMinuteKey = minuteKey;
      this.firedKeys.clear();
    }

    const reminderSoundConfig = {
      ...config.sounds,
      alarmDuration: config.reminderSoundDuration,
      volume: config.reminderVolume,
    };
    const reminderNotifDuration = config.reminderNotificationDuration;

    const reminders = loadReminders();
    for (const r of reminders) {
      if (!r.enabled || !isDueNowOrPreviousMinute(r.time, now)) continue;
      const key = `${minuteKey}:reminder:${r.id}`;
      if (this.firedKeys.has(key)) continue;
      this.firedKeys.add(key);

      let message = r.title;
      if (r.taskId) {
        const task = loadTasks().find(t => t.id === r.taskId);
        if (task) message = `${r.title}\nTask: ${task.text}`;
      }
      notifyReminder(
        r.title,
        message,
        config.sound,
        reminderNotifDuration,
        reminderSoundConfig,
        config.notifications,
      );
      if (!r.recurring) updateReminder(r.id, { enabled: false });
    }

    const tasks = loadTasks();
    for (const t of tasks) {
      if (t.completed || t.date !== today || !t.time || !isDueNowOrPreviousMinute(t.time, now)) continue;
      const key = `${minuteKey}:task:${t.id}`;
      if (this.firedKeys.has(key)) continue;
      this.firedKeys.add(key);
      notifyReminder(
        'Task Reminder',
        t.text,
        config.sound,
        reminderNotifDuration,
        reminderSoundConfig,
        config.notifications,
      );
    }
  }
}
