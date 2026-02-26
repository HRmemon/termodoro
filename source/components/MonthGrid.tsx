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
  maxRows: number;             // available rows for the grid
}

const DAY_NAMES_MON = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_NAMES_SUN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const HEATMAP_BLOCKS = ['·', '░', '▒', '▓', '█'] as const;

function getHeatmapBlock(minutes: number): { char: string; color: string; dim: boolean } {
  if (minutes <= 0) return { char: '', color: 'white', dim: true };
  if (minutes < 30) return { char: HEATMAP_BLOCKS[1]!, color: 'green', dim: true };
  if (minutes < 60) return { char: HEATMAP_BLOCKS[2]!, color: 'green', dim: false };
  if (minutes < 120) return { char: HEATMAP_BLOCKS[3]!, color: 'green', dim: false };
  return { char: HEATMAP_BLOCKS[4]!, color: 'green', dim: false };
}

function getWeekNumber(date: Date): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const yearStart = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d.getTime() - yearStart.getTime()) / 86400000 - 3 + ((yearStart.getDay() + 6) % 7)) / 7);
}

function getMonthDays(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function getDayOfWeek(year: number, month: number, day: number, mondayStart: boolean): number {
  const d = new Date(year, month - 1, day).getDay(); // 0=Sun
  if (mondayStart) return (d + 6) % 7; // 0=Mon
  return d;
}

function formatDateStr(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function MonthGrid({
  year,
  month,
  eventsByDate,
  sessionMinutesByDate,
  selectedDate,
  today,
  showWeekNumbers,
  calendarConfig,
  isGlobalPrivacy,
  contentWidth,
  maxRows,
}: MonthGridProps) {
  const mondayStart = (calendarConfig?.weekStartsOn ?? 1) === 1;
  const dayNames = mondayStart ? DAY_NAMES_MON : DAY_NAMES_SUN;
  const showHeatmap = calendarConfig?.showSessionHeatmap !== false;

  const wnWidth = showWeekNumbers ? 4 : 0;
  const availWidth = contentWidth - wnWidth - 1;
  const cellWidth = Math.max(5, Math.floor(availWidth / 7));
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

  // How many event lines can fit per cell
  // Header row (month) + day names row + (weeks × lines per week)
  // Each week row = 1 (day number) + eventLines
  const headerRows = 2; // month title + day names
  const availForWeeks = maxRows - headerRows;
  const linesPerWeek = Math.max(1, Math.floor(availForWeeks / weeks.length));
  const eventLines = Math.max(0, linesPerWeek - 1); // subtract day number row

  return (
    <Box flexDirection="column">
      {/* Month header */}
      <Box justifyContent="center" marginBottom={0}>
        <Text color={colors.dim}>{'◀ '}</Text>
        <Text bold color={colors.text}>{MONTH_NAMES[month - 1]} {year}</Text>
        <Text color={colors.dim}>{' ▶'}</Text>
      </Box>

      {/* Day names row */}
      <Box>
        {showWeekNumbers && <Box width={wnWidth}><Text dimColor>{'Wk '}</Text></Box>}
        {dayNames.map((name, i) => (
          <Box key={name} width={cellWidth}>
            <Text color={i >= 5 ? colors.dim : colors.text} bold>{name.slice(0, cellWidth - 1)}</Text>
          </Box>
        ))}
      </Box>

      {/* Week rows */}
      {weeks.map((week, wi) => {
        // Week number
        const firstDayInWeek = week.find(d => d !== null);
        const wn = firstDayInWeek
          ? getWeekNumber(new Date(year, month - 1, firstDayInWeek.day))
          : 0;

        return (
          <Box key={wi} flexDirection="column">
            {/* Day numbers row */}
            <Box>
              {showWeekNumbers && (
                <Box width={wnWidth}>
                  <Text dimColor>{wn > 0 ? String(wn).padStart(2, ' ') + ' ' : '   '}</Text>
                </Box>
              )}
              {week.map((cell, ci) => {
                if (!cell) {
                  return <Box key={`empty-${ci}`} width={cellWidth} />;
                }

                const isToday = cell.dateStr === today;
                const isSelected = cell.dateStr === selectedDate;
                const isWeekend = mondayStart ? ci >= 5 : (ci === 0 || ci === 6);

                // Heatmap indicator
                const focusMin = sessionMinutesByDate.get(cell.dateStr) ?? 0;
                const hm = showHeatmap ? getHeatmapBlock(focusMin) : null;

                let dayColor = isWeekend ? colors.dim : colors.text;
                if (isToday) dayColor = colors.focus;
                if (isSelected) dayColor = colors.highlight;

                const dayStr = String(cell.day);
                const prefix = isSelected ? '[' : isToday ? '•' : ' ';
                const suffix = isSelected ? ']' : ' ';

                return (
                  <Box key={cell.dateStr} width={cellWidth}>
                    <Text color={dayColor} bold={isToday || isSelected}>
                      {prefix}{dayStr}{suffix}
                    </Text>
                    {hm && hm.char && (
                      <Text color={hm.color} dimColor={hm.dim}>{hm.char}</Text>
                    )}
                  </Box>
                );
              })}
            </Box>

            {/* Event lines for this week */}
            {Array.from({ length: eventLines }).map((_, lineIdx) => (
              <Box key={`events-${wi}-${lineIdx}`}>
                {showWeekNumbers && <Box width={wnWidth} />}
                {week.map((cell, ci) => {
                  if (!cell) {
                    return <Box key={`empty-ev-${ci}`} width={cellWidth} />;
                  }

                  const events = eventsByDate.get(cell.dateStr) ?? [];
                  const event = events[lineIdx];

                  if (!event && lineIdx === eventLines - 1 && events.length > eventLines) {
                    // Overflow indicator
                    return (
                      <Box key={`overflow-${cell.dateStr}`} width={cellWidth}>
                        <Text dimColor>{`+${events.length - eventLines + 1}`}</Text>
                      </Box>
                    );
                  }

                  if (!event) {
                    return <Box key={`no-ev-${ci}-${lineIdx}`} width={cellWidth} />;
                  }

                  const icon = getEventIcon(event, calendarConfig, isGlobalPrivacy);
                  const maxTitleLen = cellWidth - 3; // icon + space + truncation
                  let display: string;
                  if (isGlobalPrivacy || event.privacy) {
                    display = getPrivacyDisplay(event.title).slice(0, maxTitleLen);
                  } else {
                    display = event.title.slice(0, maxTitleLen);
                  }

                  // Multi-day continuation
                  const isStart = cell.dateStr === event.date;
                  const isContinuation = !isStart && event.endDate;

                  let eventColor = event.color ?? colors.highlight;
                  if (event.status === 'done') eventColor = colors.dim;
                  if (event.status === 'important') eventColor = colors.focus;
                  if (event.source === 'ics') eventColor = colors.break;

                  return (
                    <Box key={`ev-${cell.dateStr}-${lineIdx}`} width={cellWidth}>
                      <Text color={eventColor}>
                        {isContinuation ? '→' : icon}{' '}{display}
                      </Text>
                    </Box>
                  );
                })}
              </Box>
            ))}
          </Box>
        );
      })}
    </Box>
  );
}
