import { Box, Text } from 'ink';
import type { Task } from '../types.js';
import { colors } from '../lib/theme.js';
import { getPrivacyDisplay } from '../lib/event-icons.js';

interface TasksPanelProps {
  tasks: Task[];
  width: number;
  maxRows: number;
  isGlobalPrivacy?: boolean;
}

export function TasksPanel({ tasks, width, maxRows, isGlobalPrivacy }: TasksPanelProps) {
  const pending = tasks.filter(t => !t.completed);
  const done = tasks.filter(t => t.completed);

  // How many tasks can we show
  const headerLines = 2; // "TASKS" header + separator
  const availLines = maxRows - headerLines;

  return (
    <Box flexDirection="column" width={width}>
      <Text bold color={colors.text}>TASKS</Text>
      <Text color={colors.dim}>{'─'.repeat(width - 1)}</Text>

      {pending.length === 0 && done.length === 0 && (
        <Text dimColor>  No tasks</Text>
      )}

      {pending.slice(0, availLines).map((task) => {
        const name = isGlobalPrivacy ? getPrivacyDisplay(task.text) : task.text;
        const maxLen = width - 5; // icon + space + padding
        const display = name.length > maxLen ? name.slice(0, maxLen - 1) + '…' : name;
        return (
          <Box key={task.id}>
            <Text color={colors.highlight}>{'• '}</Text>
            <Text color={colors.text}>{display}</Text>
            {task.project && <Text dimColor> #{task.project}</Text>}
          </Box>
        );
      })}

      {done.length > 0 && pending.length < availLines && (
        <>
          {done.slice(0, Math.max(0, availLines - pending.length)).map((task) => {
            const name = isGlobalPrivacy ? getPrivacyDisplay(task.text) : task.text;
            const maxLen = width - 5;
            const display = name.length > maxLen ? name.slice(0, maxLen - 1) + '…' : name;
            return (
              <Box key={task.id}>
                <Text color={colors.dim}>{'✔ '}</Text>
                <Text color={colors.dim}>{display}</Text>
              </Box>
            );
          })}
        </>
      )}

      {(() => {
        const pendingShown = Math.min(pending.length, availLines);
        const doneShown = pending.length < availLines ? Math.min(done.length, availLines - pending.length) : 0;
        const hidden = tasks.length - pendingShown - doneShown;
        return hidden > 0 ? <Text dimColor>  +{hidden} more</Text> : null;
      })()}
    </Box>
  );
}
