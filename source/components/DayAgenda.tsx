import { Box, Text } from 'ink';
import type { CalendarEvent, CalendarConfig, Task, ScheduledNotification, Session } from '../types.js';
import { colors } from '../lib/theme.js';
import { getEventIcon, getPrivacyDisplay } from '../lib/event-icons.js';

interface DayAgendaProps {
  date: string;               // YYYY-MM-DD
  events: CalendarEvent[];
  tasks: Task[];              // tasks with deadlines on this date
  reminders: ScheduledNotification[];
  sessions: Session[];        // work sessions for this date
  calendarConfig?: CalendarConfig;
  isGlobalPrivacy?: boolean;
  selectedIdx: number;        // cursor for event selection
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function formatDateHeader(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const dayName = DAY_NAMES[d.getDay()]!;
  const monthName = MONTH_NAMES[d.getMonth()]!;
  return `${dayName}, ${monthName} ${d.getDate()} ${d.getFullYear()}`;
}

function formatFrequency(event: CalendarEvent): string {
  if (!event.frequency || event.frequency === 'once') return '';
  return `[${event.frequency}]`;
}

function SectionHeader({ title }: { title: string }) {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold color={colors.text}>{title}</Text>
      <Text color={colors.dim}>{'─'.repeat(30)}</Text>
    </Box>
  );
}

export function DayAgenda({
  date,
  events,
  tasks,
  reminders,
  sessions,
  calendarConfig,
  isGlobalPrivacy,
  selectedIdx,
}: DayAgendaProps) {
  // Sort events: timed first (by time), then all-day
  const sortedEvents = [...events].sort((a, b) => {
    if (a.time && b.time) return a.time.localeCompare(b.time);
    if (a.time) return -1;
    if (b.time) return 1;
    return 0;
  });

  // Focus summary
  const workSessions = sessions.filter(s => s.type === 'work' && s.status === 'completed');
  const totalFocusMin = Math.round(workSessions.reduce((sum, s) => sum + s.durationActual, 0) / 60);

  // Project breakdown
  const projectMinutes = new Map<string, number>();
  for (const s of workSessions) {
    const proj = s.project ?? 'untagged';
    projectMinutes.set(proj, (projectMinutes.get(proj) ?? 0) + Math.round(s.durationActual / 60));
  }

  // Pre-compute index offsets for unified cursor
  const taskIdxOffset = sortedEvents.length;

  return (
    <Box flexDirection="column">
      {/* Date header */}
      <Box marginBottom={1}>
        <Text bold color={colors.text}>{formatDateHeader(date)}</Text>
      </Box>

      {/* Events section */}
      {sortedEvents.length > 0 && (
        <>
          <SectionHeader title="EVENTS" />
          {sortedEvents.map((event, i) => {
            const currentIdx = i;
            const isSelected = currentIdx === selectedIdx;
            const icon = getEventIcon(event, calendarConfig, isGlobalPrivacy);

            let title: string;
            if (isGlobalPrivacy || event.privacy) {
              title = getPrivacyDisplay(event.title);
            } else {
              title = event.title;
            }

            let eventColor = event.color ?? colors.highlight;
            if (event.status === 'done') eventColor = colors.dim;
            if (event.status === 'important') eventColor = colors.focus;
            if (event.source === 'ics') eventColor = colors.break;

            const freq = formatFrequency(event);
            const timeStr = event.time ?? '     ';

            // Multi-day indicator
            let multiDay = '';
            if (event.endDate && event.endDate !== event.date) {
              const startD = new Date(event.date + 'T00:00:00');
              const endD = new Date(event.endDate + 'T00:00:00');
              const curD = new Date(date + 'T00:00:00');
              const totalDays = Math.round((endD.getTime() - startD.getTime()) / 86400000) + 1;
              const curDay = Math.round((curD.getTime() - startD.getTime()) / 86400000) + 1;
              multiDay = ` (day ${curDay}/${totalDays})`;
            }

            return (
              <Box key={event.id + '-' + i}>
                <Text color={isSelected ? colors.highlight : colors.dim}>
                  {isSelected ? '▸ ' : '  '}
                </Text>
                <Text dimColor>{timeStr}  </Text>
                <Text color={eventColor}>{icon} {title}</Text>
                {freq && <Text dimColor>  {freq}</Text>}
                {multiDay && <Text dimColor>{multiDay}</Text>}
                {event.status === 'done' && <Text color={colors.dim}> ✔</Text>}
              </Box>
            );
          })}
        </>
      )}

      {/* Task deadlines section */}
      {tasks.length > 0 && (
        <>
          <SectionHeader title="TASK DEADLINES" />
          {tasks.map((task, i) => {
            const currentIdx = taskIdxOffset + i;
            const isSelected = currentIdx === selectedIdx;
            return (
              <Box key={task.id}>
                <Text color={isSelected ? colors.highlight : colors.dim}>
                  {isSelected ? '▸ ' : '  '}
                </Text>
                <Text color={colors.break}>⚑ </Text>
                <Text color={task.completed ? colors.dim : colors.text}>
                  {isGlobalPrivacy ? getPrivacyDisplay(task.text) : task.text}
                </Text>
                {task.project && <Text dimColor>  #{task.project}</Text>}
                {task.completed && <Text color={colors.dim}> ✔</Text>}
              </Box>
            );
          })}
        </>
      )}

      {/* Reminders section */}
      {reminders.length > 0 && (
        <>
          <SectionHeader title="REMINDERS" />
          {reminders.map((rem) => (
            <Box key={rem.id}>
              <Text>  </Text>
              <Text dimColor>{rem.time}  </Text>
              <Text color={rem.enabled ? colors.text : colors.dim}>
                {isGlobalPrivacy ? getPrivacyDisplay(rem.title) : rem.title}
              </Text>
              {rem.recurring && <Text dimColor>  recurring</Text>}
            </Box>
          ))}
        </>
      )}

      {/* Focus summary */}
      {workSessions.length > 0 && (
        <>
          <SectionHeader title="FOCUS TODAY" />
          <Box>
            <Text>  </Text>
            {/* Progress bar */}
            <Text color={colors.focus}>
              {'█'.repeat(Math.min(16, Math.round(totalFocusMin / 15)))}
            </Text>
            <Text color={colors.dim}>
              {'░'.repeat(Math.max(0, 16 - Math.round(totalFocusMin / 15)))}
            </Text>
            <Text color={colors.text}>  {formatTime(totalFocusMin)}</Text>
            <Text dimColor>  ({workSessions.length} sessions)</Text>
          </Box>
          {projectMinutes.size > 0 && (
            <Box>
              <Text>  </Text>
              {Array.from(projectMinutes.entries()).map(([proj, mins], i) => (
                <Text key={proj}>
                  {i > 0 && <Text>  </Text>}
                  <Text color={colors.highlight}>#{proj}</Text>
                  <Text dimColor> {formatTime(mins)}</Text>
                </Text>
              ))}
            </Box>
          )}
        </>
      )}

      {/* Empty state */}
      {sortedEvents.length === 0 && tasks.length === 0 && reminders.length === 0 && workSessions.length === 0 && (
        <Box marginTop={1}>
          <Text dimColor>  No events for this day</Text>
        </Box>
      )}
    </Box>
  );
}

function formatTime(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}
