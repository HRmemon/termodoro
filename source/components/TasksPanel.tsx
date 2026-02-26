import { Box, Text } from 'ink';
import type { Task, CalendarEvent } from '../types.js';
import { colors } from '../lib/theme.js';
import { getPrivacyDisplay, getEventIcon } from '../lib/event-icons.js';
import type { CalendarConfig } from '../types.js';

export type PaneId = 'calendar' | 'today' | 'tasks';

interface TasksPanelProps {
  todayEvents: CalendarEvent[];
  todayTasks: Task[];
  allTasks: Task[];
  width: number;
  maxRows: number;
  isGlobalPrivacy?: boolean;
  focusedPane: PaneId;
  todayCollapsed: boolean;
  tasksCollapsed: boolean;
  calendarConfig?: CalendarConfig;
}

function TaskItem({ task, width, isGlobalPrivacy, done }: { task: Task; width: number; isGlobalPrivacy?: boolean; done?: boolean }) {
  const name = isGlobalPrivacy ? getPrivacyDisplay(task.text) : task.text;
  const maxLen = width - 5;
  const display = name.length > maxLen ? name.slice(0, maxLen - 1) + '…' : name;
  return (
    <Box>
      <Text color={done ? colors.dim : colors.highlight}>{done ? '✔ ' : '• '}</Text>
      <Text color={done ? colors.dim : colors.text}>{display}</Text>
      {task.project && <Text dimColor> #{task.project}</Text>}
    </Box>
  );
}

export function TasksPanel({
  todayEvents,
  todayTasks,
  allTasks,
  width,
  maxRows,
  isGlobalPrivacy,
  focusedPane,
  todayCollapsed,
  tasksCollapsed,
  calendarConfig,
}: TasksPanelProps) {
  const isTodayFocused = focusedPane === 'today';
  const isTasksFocused = focusedPane === 'tasks';

  // Header styling based on focus
  const todayHeader = isTodayFocused ? colors.highlight : colors.dim;
  const tasksHeader = isTasksFocused ? colors.highlight : colors.dim;

  // Split available rows between the two boxes
  const headerCost = 2; // header + separator per box
  const todayHeaderLines = headerCost;
  const tasksHeaderLines = headerCost;

  let todayAvail = 0;
  let tasksAvail = 0;

  if (todayCollapsed && tasksCollapsed) {
    // Both collapsed — just headers
  } else if (todayCollapsed) {
    tasksAvail = maxRows - todayHeaderLines - tasksHeaderLines;
  } else if (tasksCollapsed) {
    todayAvail = maxRows - todayHeaderLines - tasksHeaderLines;
  } else {
    // Split roughly 40/60 (today gets less since it's one day)
    const usable = maxRows - todayHeaderLines - tasksHeaderLines;
    todayAvail = Math.max(2, Math.floor(usable * 0.4));
    tasksAvail = Math.max(2, usable - todayAvail);
  }

  const sep = '─'.repeat(width - 1);

  // Today items: events + tasks with deadlines today
  const todayItems: { type: 'event' | 'task'; event?: CalendarEvent; task?: Task }[] = [];
  for (const e of todayEvents) {
    todayItems.push({ type: 'event', event: e });
  }
  for (const t of todayTasks) {
    todayItems.push({ type: 'task', task: t });
  }

  // All tasks split
  const pending = allTasks.filter(t => !t.completed);
  const done = allTasks.filter(t => t.completed);

  return (
    <Box flexDirection="column" width={width}>
      {/* Today box */}
      <Text bold color={todayHeader}>
        {isTodayFocused ? '▸ ' : '  '}TODAY{todayCollapsed ? ' [+]' : ''}
      </Text>
      <Text color={colors.dim}>{sep}</Text>

      {!todayCollapsed && (
        <>
          {todayItems.length === 0 && (
            <Text dimColor>  No events today</Text>
          )}
          {todayItems.slice(0, todayAvail).map((item, i) => {
            if (item.type === 'event' && item.event) {
              const e = item.event;
              const icon = getEventIcon(e, calendarConfig, isGlobalPrivacy);
              const title = isGlobalPrivacy || e.privacy
                ? getPrivacyDisplay(e.title)
                : e.title;
              const maxLen = width - 5;
              const display = title.length > maxLen ? title.slice(0, maxLen - 1) + '…' : title;
              let eventColor = e.color ?? colors.highlight;
              if (e.status === 'done') eventColor = colors.dim;
              if (e.source === 'ics') eventColor = colors.break;
              return (
                <Box key={`te-${i}`}>
                  <Text color={eventColor}>{icon} {display}</Text>
                  {e.time && <Text dimColor> {e.time}</Text>}
                </Box>
              );
            }
            if (item.type === 'task' && item.task) {
              return <TaskItem key={`tt-${i}`} task={item.task} width={width} isGlobalPrivacy={isGlobalPrivacy} done={item.task.completed} />;
            }
            return null;
          })}
          {todayItems.length > todayAvail && (
            <Text dimColor>  +{todayItems.length - todayAvail} more</Text>
          )}
        </>
      )}

      {/* Spacing between boxes */}
      <Text> </Text>

      {/* Tasks box */}
      <Text bold color={tasksHeader}>
        {isTasksFocused ? '▸ ' : '  '}TASKS{tasksCollapsed ? ' [+]' : ''}
      </Text>
      <Text color={colors.dim}>{sep}</Text>

      {!tasksCollapsed && (
        <>
          {pending.length === 0 && done.length === 0 && (
            <Text dimColor>  No tasks</Text>
          )}
          {pending.slice(0, tasksAvail).map(task => (
            <TaskItem key={task.id} task={task} width={width} isGlobalPrivacy={isGlobalPrivacy} />
          ))}
          {done.length > 0 && pending.length < tasksAvail && (
            done.slice(0, Math.max(0, tasksAvail - pending.length)).map(task => (
              <TaskItem key={task.id} task={task} width={width} isGlobalPrivacy={isGlobalPrivacy} done />
            ))
          )}
          {(() => {
            const pendingShown = Math.min(pending.length, tasksAvail);
            const doneShown = pending.length < tasksAvail ? Math.min(done.length, tasksAvail - pending.length) : 0;
            const hidden = allTasks.length - pendingShown - doneShown;
            return hidden > 0 ? <Text dimColor>  +{hidden} more</Text> : null;
          })()}
        </>
      )}
    </Box>
  );
}
