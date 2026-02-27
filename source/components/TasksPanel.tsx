import { Box, Text } from 'ink';
import type { Task, CalendarEvent } from '../types.js';
import { colors } from '../lib/theme.js';
import { getPrivacyDisplay, getEventIcon } from '../lib/event-icons.js';
import type { CalendarConfig } from '../types.js';

export type PaneId = 'calendar' | 'today' | 'tasks';

interface TasksPanelProps {
  selectedDate: string;
  selectedEvents: CalendarEvent[];
  selectedTasks: Task[];
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
  selectedDate,
  selectedEvents,
  selectedTasks,
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

  // Selected day items: events + tasks with deadlines on that day
  const dayItems: { type: 'event' | 'task'; event?: CalendarEvent; task?: Task }[] = [];
  for (const e of selectedEvents) {
    dayItems.push({ type: 'event', event: e });
  }
  for (const t of selectedTasks) {
    dayItems.push({ type: 'task', task: t });
  }

  // Only reserve indicator lines when list needs scrolling
  const dayNeedsScroll = dayItems.length > todayContentRows;
  const dayIndicatorCost = dayNeedsScroll ? 2 : 0;
  const todayVisibleCount = Math.max(0, todayContentRows - dayIndicatorCost);
  const todayHasPrev = todayScrollOffset > 0;
  const todayVisible = dayItems.slice(todayScrollOffset, todayScrollOffset + todayVisibleCount);
  const todayHasMore = dayItems.length > todayScrollOffset + todayVisibleCount;

  // All tasks: pending first, then done
  const tasksList = [...allTasks.filter(t => !t.completed), ...allTasks.filter(t => t.completed)];

  // Only reserve indicator lines when list needs scrolling
  const tasksNeedScroll = tasksList.length > tasksContentRows;
  const tasksIndicatorCost = tasksNeedScroll ? 2 : 0;
  const tasksVisibleCount = Math.max(0, tasksContentRows - tasksIndicatorCost);
  const tasksHasPrev = tasksScrollOffset > 0;
  const tasksVisible = tasksList.slice(tasksScrollOffset, tasksScrollOffset + tasksVisibleCount);
  const tasksHasMore = tasksList.length > tasksScrollOffset + tasksVisibleCount;

  // Format date for header: "Feb 27" style
  const dateParts = selectedDate.split('-');
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const dateLabel = dateParts.length === 3
    ? `${monthNames[Number(dateParts[1]) - 1]} ${Number(dateParts[2])}`
    : selectedDate;

  return (
    <Box flexDirection="column" width={width}>
      {/* ─── Selected day box ─── */}
      <Box height={halfRows} flexDirection="column">
        <Text bold color={todayHeader}>
          {isTodayFocused ? '▸ ' : '  '}{dateLabel}{todayCollapsed ? ' [+]' : ''}
        </Text>
        <Text color={colors.dim}>{sep}</Text>

        {!todayCollapsed && (
          <>
            {dayNeedsScroll ? (todayHasPrev ? <Text dimColor>  ↑ more</Text> : <Text> </Text>) : null}
            {dayItems.length === 0 && (
              <Text dimColor>  No events</Text>
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
            {dayNeedsScroll ? (todayHasMore ? <Text dimColor>  ↓ more</Text> : <Text> </Text>) : null}
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
            {tasksNeedScroll ? (tasksHasPrev ? <Text dimColor>  ↑ more</Text> : <Text> </Text>) : null}
            {tasksList.length === 0 && (
              <Text dimColor>  No tasks</Text>
            )}
            {tasksVisible.map((task) => (
              <TaskItem
                key={task.id}
                task={task}
                width={width}
                isGlobalPrivacy={isGlobalPrivacy}
                done={task.completed}
              />
            ))}
            {tasksNeedScroll ? (tasksHasMore ? <Text dimColor>  ↓ more</Text> : <Text> </Text>) : null}
          </>
        )}
      </Box>
    </Box>
  );
}

/** Get total item count for a pane (used by CalendarView to clamp scroll) */
export function getDayItemCount(events: CalendarEvent[], tasks: Task[]): number {
  return events.length + tasks.length;
}

export function getTasksItemCount(allTasks: Task[]): number {
  return allTasks.length;
}
