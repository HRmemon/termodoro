import { Box, Text } from 'ink';
import type { CalendarEvent, CalendarConfig } from '../types.js';
import { colors } from '../lib/theme.js';
import { getEventIcon, getPrivacyDisplay } from '../lib/event-icons.js';

interface MonthGridProps {
  year: number;
  month: number;               // 1-indexed
  eventsByDate: Map<string, CalendarEvent[]>;
  sessionMinutesByDate: Map<string, number>;
  selectedDate: string;        // YYYY-MM-DD
  today: string;               // YYYY-MM-DD
  showWeekNumbers?: boolean;
  calendarConfig?: CalendarConfig;
  isGlobalPrivacy?: boolean;
  contentWidth: number;
  maxRows: number;
}

const FULL_DAY_NAMES_MON = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
const FULL_DAY_NAMES_SUN = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function getMonthDays(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function getDayOfWeek(year: number, month: number, day: number, mondayStart: boolean): number {
  const d = new Date(year, month - 1, day).getDay();
  if (mondayStart) return (d + 6) % 7;
  return d;
}

function formatDateStr(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function getWeekNumber(date: Date): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const yearStart = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d.getTime() - yearStart.getTime()) / 86400000 - 3 + ((yearStart.getDay() + 6) % 7)) / 7);
}

export function MonthGrid({
  year,
  month,
  eventsByDate,
  selectedDate,
  today,
  showWeekNumbers,
  calendarConfig,
  isGlobalPrivacy,
  contentWidth,
  maxRows,
  sessionMinutesByDate,
}: MonthGridProps) {
  const mondayStart = (calendarConfig?.weekStartsOn ?? 1) === 1;
  const dayNames = mondayStart ? FULL_DAY_NAMES_MON : FULL_DAY_NAMES_SUN;
  const showHeatmap = calendarConfig?.showSessionHeatmap !== false;

  const wnWidth = showWeekNumbers ? 4 : 0;
  const gridWidth = contentWidth - wnWidth;
  const cellWidth = Math.max(4, Math.floor(gridWidth / 7));
  const totalDays = getMonthDays(year, month);
  const firstDow = getDayOfWeek(year, month, 1, mondayStart);

  // Build week rows
  type DayCell = { day: number; dateStr: string } | null;
  const weeks: DayCell[][] = [];
  let currentWeek: DayCell[] = Array(firstDow).fill(null) as DayCell[];

  for (let d = 1; d <= totalDays; d++) {
    const dateStr = formatDateStr(year, month, d);
    currentWeek.push({ day: d, dateStr });
    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }
  if (currentWeek.length > 0) {
    while (currentWeek.length < 7) currentWeek.push(null);
    weeks.push(currentWeek);
  }

  // Calculate how many event lines fit per cell
  const headerRows = 2; // month title + day names
  const availForWeeks = maxRows - headerRows;
  // Each week: 1 border + 1 day number + event lines. Plus 1 final border
  const bordersUsed = weeks.length + 1;
  const rowsPerWeek = Math.max(2, Math.floor((availForWeeks - bordersUsed) / weeks.length));
  const eventLines = Math.max(0, rowsPerWeek - 1);

  // Build horizontal border line
  const hBorder = buildHBorder(cellWidth, showWeekNumbers);

  return (
    <Box flexDirection="column">
      {/* Month + Year header */}
      <Box>
        {showWeekNumbers && <Box width={wnWidth}><Text> </Text></Box>}
        <Text bold color={colors.text}>
          {MONTH_NAMES[month - 1]} {year}
        </Text>
      </Box>

      {/* Day names row */}
      <Box>
        {showWeekNumbers && <Box width={wnWidth}><Text dimColor>{'    '}</Text></Box>}
        {dayNames.map((name, i) => {
          const isWeekend = mondayStart ? i >= 5 : (i === 0 || i === 6);
          const truncName = name.slice(0, cellWidth - 1);
          const pad = ' '.repeat(Math.max(0, cellWidth - truncName.length));
          return (
            <Text key={name} color={isWeekend ? colors.break : colors.dim}>
              {truncName}{pad}
            </Text>
          );
        })}
      </Box>

      {/* Top border */}
      <Text color={colors.dim}>{hBorder}</Text>

      {/* Week rows */}
      {weeks.map((week, wi) => {
        const firstDayInWeek = week.find(d => d !== null);
        const wn = firstDayInWeek
          ? getWeekNumber(new Date(year, month - 1, firstDayInWeek.day))
          : 0;

        return (
          <Box key={wi} flexDirection="column">
            {/* Day numbers row */}
            <Box>
              {showWeekNumbers && (
                <Text dimColor>{wn > 0 ? String(wn).padStart(3, ' ') + '│' : '   │'}</Text>
              )}
              {week.map((cell, ci) => {
                if (!cell) {
                  return (
                    <Text key={`empty-${ci}`}>
                      {' '.repeat(cellWidth - 1)}{'│'}
                    </Text>
                  );
                }

                const isToday = cell.dateStr === today;
                const isSelected = cell.dateStr === selectedDate;
                const isWeekend = mondayStart ? ci >= 5 : (ci === 0 || ci === 6);

                let dayColor = isWeekend ? colors.break : colors.text;
                if (isToday) dayColor = colors.focus;
                if (isSelected) dayColor = colors.highlight;

                const dayStr = String(cell.day);
                const todayMark = isToday && !isSelected ? '•' : '';

                // Heatmap indicator
                const focusMin = sessionMinutesByDate.get(cell.dateStr) ?? 0;
                const hmChar = showHeatmap && focusMin > 0
                  ? (focusMin < 30 ? '░' : focusMin < 60 ? '▒' : focusMin < 120 ? '▓' : '█')
                  : '';

                const labelLen = dayStr.length + todayMark.length + hmChar.length;
                const padLen = Math.max(0, cellWidth - 1 - labelLen);

                return (
                  <Text key={cell.dateStr}>
                    <Text color={dayColor} bold={isToday || isSelected}>{dayStr}{todayMark}</Text>
                    {hmChar && <Text color="green">{hmChar}</Text>}
                    <Text>{' '.repeat(padLen)}</Text>
                    <Text color={colors.dim}>│</Text>
                  </Text>
                );
              })}
            </Box>

            {/* Event lines inside cells */}
            {Array.from({ length: eventLines }).map((_, lineIdx) => (
              <Box key={`ev-${wi}-${lineIdx}`}>
                {showWeekNumbers && <Text>{'   │'}</Text>}
                {week.map((cell, ci) => {
                  if (!cell) {
                    return (
                      <Text key={`empty-ev-${ci}`}>
                        {' '.repeat(cellWidth - 1)}{'│'}
                      </Text>
                    );
                  }

                  const events = eventsByDate.get(cell.dateStr) ?? [];

                  // Overflow indicator: replace last slot when more events exist
                  if (lineIdx === eventLines - 1 && events.length > eventLines) {
                    const hidden = events.length - eventLines + 1;
                    const overflow = `+${hidden}`;
                    const pad = ' '.repeat(Math.max(0, cellWidth - 1 - overflow.length));
                    return (
                      <Text key={`overflow-${cell.dateStr}`}>
                        <Text dimColor>{overflow}{pad}</Text>
                        <Text color={colors.dim}>│</Text>
                      </Text>
                    );
                  }

                  const event = events[lineIdx];
                  if (!event) {
                    return (
                      <Text key={`noev-${ci}-${lineIdx}`}>
                        {' '.repeat(cellWidth - 1)}{'│'}
                      </Text>
                    );
                  }

                  const icon = getEventIcon(event, calendarConfig, isGlobalPrivacy);
                  const maxLen = cellWidth - 3; // icon + space + border
                  let display: string;
                  if (isGlobalPrivacy || event.privacy) {
                    display = getPrivacyDisplay(event.title).slice(0, maxLen);
                  } else {
                    display = event.title.slice(0, maxLen);
                  }

                  const isStart = cell.dateStr === event.date;
                  const prefix = (!isStart && event.endDate) ? '→' : icon;

                  let eventColor = event.color ?? colors.highlight;
                  if (event.status === 'done') eventColor = colors.dim;
                  if (event.status === 'important') eventColor = colors.focus;
                  if (event.source === 'ics') eventColor = colors.break;

                  const content = `${prefix} ${display}`;
                  const pad = ' '.repeat(Math.max(0, cellWidth - 1 - content.length));

                  return (
                    <Text key={`ev-${cell.dateStr}-${lineIdx}`}>
                      <Text color={eventColor}>{content}</Text>
                      <Text>{pad}</Text>
                      <Text color={colors.dim}>│</Text>
                    </Text>
                  );
                })}
              </Box>
            ))}

            {/* Horizontal border after each week */}
            <Text color={colors.dim}>{hBorder}</Text>
          </Box>
        );
      })}
    </Box>
  );
}

function buildHBorder(cellWidth: number, showWeekNumbers?: boolean): string {
  const prefix = showWeekNumbers ? '───┼' : '';
  const cellLine = '─'.repeat(cellWidth - 1) + '┼';
  const cells = cellLine.repeat(6) + '─'.repeat(cellWidth - 1) + '┤';
  return prefix + cells;
}
