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
  todayScrollOffset: number;
  tasksScrollOffset: number;
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
  todayScrollOffset,
  tasksScrollOffset,
  calendarConfig,
}: TasksPanelProps) {
  const isTodayFocused = focusedPane === 'today';
  const isTasksFocused = focusedPane === 'tasks';

  const todayHeader = isTodayFocused ? colors.highlight : colors.dim;
  const tasksHeader = isTasksFocused ? colors.highlight : colors.dim;

  // Fixed 50/50 split: each box gets half of maxRows
  // Each box: 1 header + 1 separator + content lines
  const boxHeaderCost = 2;
  const halfRows = Math.floor(maxRows / 2);
  const todayContentRows = todayCollapsed ? 0 : halfRows - boxHeaderCost;
  const tasksContentRows = tasksCollapsed ? 0 : halfRows - boxHeaderCost;

  const sep = '─'.repeat(width - 1);

  // Today items: events + tasks with deadlines today
  const todayItems: { type: 'event' | 'task'; event?: CalendarEvent; task?: Task }[] = [];
  for (const e of todayEvents) {
    todayItems.push({ type: 'event', event: e });
  }
  for (const t of todayTasks) {
    todayItems.push({ type: 'task', task: t });
  }

  // Visible slice of today items (scrolled)
  const todayVisible = todayItems.slice(todayScrollOffset, todayScrollOffset + todayContentRows);
  const todayHasMore = todayItems.length > todayScrollOffset + todayContentRows;
  const todayHasPrev = todayScrollOffset > 0;

  // All tasks: pending first, then done
  const tasksList = [...allTasks.filter(t => !t.completed), ...allTasks.filter(t => t.completed)];

  // Visible slice of tasks (scrolled)
  const tasksVisible = tasksList.slice(tasksScrollOffset, tasksScrollOffset + tasksContentRows);
  const tasksHasMore = tasksList.length > tasksScrollOffset + tasksContentRows;
  const tasksHasPrev = tasksScrollOffset > 0;

  return (
    <Box flexDirection="column" width={width}>
      {/* ─── TODAY box ─── */}
      <Box height={halfRows} flexDirection="column">
        <Text bold color={todayHeader}>
          {isTodayFocused ? '▸ ' : '  '}TODAY{todayCollapsed ? ' [+]' : ''}
        </Text>
        <Text color={colors.dim}>{sep}</Text>

        {!todayCollapsed && (
          <>
            {todayHasPrev && <Text dimColor>  ↑ more</Text>}
            {todayItems.length === 0 && (
              <Text dimColor>  No events today</Text>
            )}
            {todayVisible.map((item, i) => {
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
            {todayHasMore && <Text dimColor>  ↓ more</Text>}
          </>
        )}
      </Box>

      {/* ─── TASKS box ─── */}
      <Box height={halfRows} flexDirection="column">
        <Text bold color={tasksHeader}>
          {isTasksFocused ? '▸ ' : '  '}TASKS{tasksCollapsed ? ' [+]' : ''}
        </Text>
        <Text color={colors.dim}>{sep}</Text>

        {!tasksCollapsed && (
          <>
            {tasksHasPrev && <Text dimColor>  ↑ more</Text>}
            {tasksList.length === 0 && (
              <Text dimColor>  No tasks</Text>
            )}
            {tasksVisible.map((task, i) => (
              <TaskItem
                key={task.id}
                task={task}
                width={width}
                isGlobalPrivacy={isGlobalPrivacy}
                done={task.completed}
              />
            ))}
            {tasksHasMore && <Text dimColor>  ↓ more</Text>}
          </>
        )}
      </Box>
    </Box>
  );
}

/** Get total item count for a pane (used by CalendarView to clamp scroll) */
export function getTodayItemCount(todayEvents: CalendarEvent[], todayTasks: Task[]): number {
  return todayEvents.length + todayTasks.length;
}

export function getTasksItemCount(allTasks: Task[]): number {
  return allTasks.length;
}
