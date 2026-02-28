import { useCallback } from 'react';
import { nanoid } from 'nanoid';
import type { Config, View } from '../types.js';
import { addTask } from '../lib/tasks.js';
import { addReminder, updateReminder } from '../lib/reminders.js';
import { notifyReminder } from '../lib/notify.js';
import { parseSequenceString, loadSequences } from '../lib/sequences.js';

interface CommandActions {
  activateSequence: (name: string) => void;
  activateSequenceInline: (str: string) => void;
  abandon: () => void;
}

interface CommandCallbacks {
  setShowCommandPalette: (v: boolean) => void;
  setSearchQuery: (q: string) => void;
  setShowSearch: (v: boolean) => void;
  setShowInsights: (v: boolean) => void;
  setView: (v: View) => void;
}

export function useCommandDispatch(
  actions: CommandActions,
  callbacks: CommandCallbacks,
  config: Config,
  exit: () => void,
): (cmd: string, args: string) => void {
  return useCallback((cmd: string, args: string) => {
    callbacks.setShowCommandPalette(false);
    switch (cmd) {
      case 'stats':
        callbacks.setView('stats');
        break;
      case 'reminders':
        callbacks.setView('reminders');
        break;
      case 'tasks':
        callbacks.setView('tasks');
        break;
      case 'search':
        callbacks.setSearchQuery(args);
        callbacks.setShowSearch(true);
        break;
      case 'insights':
        callbacks.setShowInsights(true);
        break;
      case 'session': {
        const named = loadSequences().find(s => s.name === args.trim());
        if (named) {
          actions.activateSequence(args.trim());
        } else {
          const seq = parseSequenceString(args);
          if (seq) actions.activateSequenceInline(args);
        }
        callbacks.setView('timer');
        break;
      }
      case 'task': {
        if (args.trim()) {
          let text = args.trim();
          let project: string | undefined;
          let expectedPomodoros = 1;

          const pomMatch = text.match(/^(.+?)\s*\/(\d+)\s*$/);
          if (pomMatch) {
            text = pomMatch[1]!.trim();
            expectedPomodoros = parseInt(pomMatch[2]!, 10);
          }
          const projMatch = text.match(/^(.+?)\s+#(\S+)\s*$/);
          if (projMatch) {
            text = projMatch[1]!.trim();
            project = projMatch[2]!;
          }
          addTask(text, expectedPomodoros, project);
          callbacks.setView('tasks');
        }
        break;
      }
      case 'reminder': {
        const reminderMatch = args.trim().match(/^(\d{1,2}:\d{2})\s+(.+)$/);
        if (reminderMatch) {
          const time = reminderMatch[1]!;
          const title = reminderMatch[2]!;
          addReminder({
            id: nanoid(),
            time,
            title,
            enabled: true,
            recurring: false,
          });
          callbacks.setView('reminders');
        }
        break;
      }
      case 'remind': {
        const remindMatch = args.trim().match(/^(\d+)\s*(s|m|h)(?:\s+(.+))?$/i);
        if (remindMatch) {
          const amount = parseInt(remindMatch[1]!, 10);
          const unit = remindMatch[2]!.toLowerCase();
          let ms = 0;
          if (unit === 's') ms = amount * 1000;
          else if (unit === 'm') ms = amount * 60 * 1000;
          else if (unit === 'h') ms = amount * 60 * 60 * 1000;

          const label = remindMatch[3]?.trim() || `${amount}${unit} timer`;
          const fireAt = new Date(Date.now() + ms);
          const fireTime = `${String(fireAt.getHours()).padStart(2, '0')}:${String(fireAt.getMinutes()).padStart(2, '0')}`;
          const reminderId = nanoid();
          addReminder({
            id: reminderId,
            time: fireTime,
            title: label,
            enabled: true,
            recurring: false,
          });

          setTimeout(() => {
            notifyReminder(label, `Timer: ${label}`, config.sound, config.notificationDuration, config.sounds);
            updateReminder(reminderId, { enabled: false });
          }, ms);

          callbacks.setView('reminders');
        }
        break;
      }
      case 'quit':
        actions.abandon();
        exit();
        break;
      default:
        break;
    }
  }, [actions, callbacks, exit, config]);
}
