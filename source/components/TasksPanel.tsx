import { Box, Text } from 'ink';
import type { Task, CalendarEvent } from '../types.js';
import { colors } from '../lib/theme.js';
import { getPrivacyDisplay, getEventIcon } from '../lib/event-icons.js';
import type { CalendarConfig } from '../types.js';

interface DayPanelProps {
  selectedDate: string;
  selectedEvents: CalendarEvent[];
  selectedTasks: Task[];
  width: number;
  maxRows: number;
  isGlobalPrivacy?: boolean;
  isFocused: boolean;
  collapsed: boolean;
  scrollOffset: number;
  calendarConfig?: CalendarConfig;
}

export function DayPanel({
  selectedDate,
  selectedEvents,
  selectedTasks,
  width,
  maxRows,
  isGlobalPrivacy,
  isFocused,
  collapsed,
  scrollOffset,
  calendarConfig,
}: DayPanelProps) {
  const headerColor = isFocused ? colors.highlight : colors.dim;

  const boxHeaderCost = 2; // header + separator
  const contentRows = collapsed ? 0 : maxRows - boxHeaderCost;

  const sep = '─'.repeat(Math.max(0, width - 2));

  // Merge events + task deadlines into a single list
  type DayItem = { type: 'event'; event: CalendarEvent } | { type: 'task'; task: Task };
  const dayItems: DayItem[] = [];
  for (const e of selectedEvents) {
    dayItems.push({ type: 'event', event: e });
  }
  for (const t of selectedTasks) {
    dayItems.push({ type: 'task', task: t });
  }

  // Scroll indicators
  const hasPrev = scrollOffset > 0;
  const topCost = hasPrev ? 1 : 0;
  const tentative = Math.max(0, contentRows - topCost);
  const hasMore = dayItems.length > scrollOffset + tentative;
  const bottomCost = hasMore ? 1 : 0;
  const visibleCount = Math.max(0, contentRows - topCost - bottomCost);
  const visible = dayItems.slice(scrollOffset, scrollOffset + visibleCount);
  const hasMoreFinal = dayItems.length > scrollOffset + visibleCount;

  // Count content lines for padding
  let contentLines = 0;
  if (!collapsed) {
    contentLines += topCost;
    contentLines += dayItems.length === 0 ? 1 : visible.length;
    contentLines += hasMoreFinal ? 1 : 0;
  }
  const padLines = Math.max(0, (collapsed ? maxRows - boxHeaderCost : contentRows) - contentLines);

  // Format date for header: "Feb 27" style
  const dateParts = selectedDate.split('-');
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const dateLabel = dateParts.length === 3
    ? `${monthNames[Number(dateParts[1]) - 1]} ${Number(dateParts[2])}`
    : selectedDate;

  const border = colors.dim;
  const innerWidth = width - 1;

  return (
    <Box flexDirection="column" width={width} height={maxRows} overflow="hidden">
      <Box flexShrink={0}>
        <Text color={border}>│</Text>
        <Text bold color={headerColor}>
          {isFocused ? '▸ ' : ' '}{dateLabel}{collapsed ? ' [+]' : ''}
        </Text>
      </Box>
      <Box flexShrink={0}>
        <Text color={border}>├{sep}</Text>
      </Box>

      {!collapsed && (
        <>
          {hasPrev && (
            <Box flexShrink={0}>
              <Text color={border}>│</Text>
              <Text dimColor> ↑ more</Text>
            </Box>
          )}
          {dayItems.length === 0 && (
            <Box flexShrink={0}>
              <Text color={border}>│</Text>
              <Text dimColor> No events</Text>
            </Box>
          )}
          {visible.map((item, i) => {
            if (item.type === 'event') {
              const e = item.event;
              const icon = getEventIcon(e, calendarConfig, isGlobalPrivacy);
              const title = isGlobalPrivacy || e.privacy
                ? getPrivacyDisplay(e.title)
                : e.title;

              const timeStr = e.time ? ` ${e.time}` : '';
              const iconStr = `${icon} `;

              const maxLen = Math.max(0, innerWidth - iconStr.length - timeStr.length);
              const display = title.length > maxLen ? title.slice(0, Math.max(0, maxLen - 1)) + '…' : title;

              let eventColor = e.color ?? colors.highlight;
              if (e.status === 'done') eventColor = colors.dim;
              if (e.source === 'ics') eventColor = colors.break;
              return (
                <Box key={`e-${i}`} flexShrink={0}>
                  <Text color={border}>│</Text>
                  <Text color={eventColor}>{iconStr}{display}</Text>
                  {e.time && <Text dimColor>{timeStr}</Text>}
                </Box>
              );
            }
            // task deadline
            const t = item.task;
            const name = isGlobalPrivacy ? getPrivacyDisplay(t.text) : t.text;
            const projectStr = t.project ? ` #${t.project}` : '';
            const bulletStr = t.completed ? '✔ ' : '• ';
            const maxLen = Math.max(0, innerWidth - bulletStr.length - projectStr.length);
            const display = name.length > maxLen ? name.slice(0, Math.max(0, maxLen - 1)) + '…' : name;
            return (
              <Box key={`t-${i}`} flexShrink={0}>
                <Text color={border}>│</Text>
                <Text color={t.completed ? colors.dim : colors.highlight}>{bulletStr}</Text>
                <Text color={t.completed ? colors.dim : colors.text}>{display}</Text>
                {t.project && <Text dimColor>{projectStr}</Text>}
              </Box>
            );
          })}
          {hasMoreFinal && (
            <Box flexShrink={0}>
              <Text color={border}>│</Text>
              <Text dimColor> ↓ more</Text>
            </Box>
          )}
        </>
      )}
      {Array.from({ length: padLines }).map((_, i) => (
        <Box key={`pad-${i}`} flexShrink={0}><Text color={border}>│</Text></Box>
      ))}
    </Box>
  );
}

/** Get total item count for scroll clamping */
export function getDayItemCount(events: CalendarEvent[], tasks: Task[]): number {
  return events.length + tasks.length;
}
