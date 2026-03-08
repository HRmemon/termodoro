import React, { useState, useMemo, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import { Modal } from './Modal.js';
import { getAvailableBrowserDates } from '../lib/browser-stats.js';
import { getMonthDays, formatDateStr, MONTH_NAMES_FULL, getTodayStr } from '../lib/date-utils.js';

interface WebDatePickerModalProps {
  onDismiss: () => void;
  onSelect: (date: string) => void;
  setIsTyping: (v: boolean) => void;
  initialDate?: string;
}

export function WebDatePickerModal({ onDismiss, onSelect, setIsTyping, initialDate }: WebDatePickerModalProps) {
  React.useEffect(() => {
    setIsTyping(true);
    return () => setIsTyping(false);
  }, [setIsTyping]);

  const availableDates = useMemo(() => new Set(getAvailableBrowserDates()), []);
  const today = getTodayStr();

  // If initialDate isn't provided, start at the most recent available date, or today
  const startDate = initialDate || (availableDates.size > 0 ? Array.from(availableDates).pop()! : today);
  const [startYear, startMonth, startDay] = startDate.split('-').map(Number);

  const [year, setYear] = useState(startYear!);
  const [month, setMonth] = useState(startMonth!); // 1-indexed
  const [day, setDay] = useState(startDay!);

  const handlePrevMonth = useCallback(() => {
    setMonth(m => {
      if (m === 1) { setYear(y => y - 1); return 12; }
      return m - 1;
    });
  }, []);

  const handleNextMonth = useCallback(() => {
    setMonth(m => {
      if (m === 12) { setYear(y => y + 1); return 1; }
      return m + 1;
    });
  }, []);

  useInput((input, key) => {
    if (key.escape) {
      onDismiss();
      return;
    }

    if (key.return) {
      const selected = formatDateStr(year, month, day);
      if (availableDates.has(selected) || selected === today) {
        onSelect(selected);
      }
      return;
    }

    if (input === 'h' || key.leftArrow) {
      setDay(d => {
        if (d > 1) return d - 1;
        handlePrevMonth();
        const prevMonth = month === 1 ? 12 : month - 1;
        const prevYear = month === 1 ? year - 1 : year;
        return getMonthDays(prevYear, prevMonth);
      });
    } else if (input === 'l' || key.rightArrow) {
      const maxDays = getMonthDays(year, month);
      setDay(d => {
        if (d < maxDays) return d + 1;
        handleNextMonth();
        return 1;
      });
    } else if (input === 'k' || key.upArrow) {
      setDay(d => {
        if (d > 7) return d - 7;
        handlePrevMonth();
        const prevMonth = month === 1 ? 12 : month - 1;
        const prevYear = month === 1 ? year - 1 : year;
        const prevMax = getMonthDays(prevYear, prevMonth);
        return Math.max(1, prevMax - (7 - d));
      });
    } else if (input === 'j' || key.downArrow) {
      const maxDays = getMonthDays(year, month);
      setDay(d => {
        if (d + 7 <= maxDays) return d + 7;
        handleNextMonth();
        return Math.min(getMonthDays(month === 12 ? year + 1 : year, month === 12 ? 1 : month + 1), d + 7 - maxDays);
      });
    } else if (input === '[') {
      handlePrevMonth();
      setDay(1);
    } else if (input === ']') {
      handleNextMonth();
      setDay(1);
    }
  });

  // Ensure day is valid for month
  const maxDays = getMonthDays(year, month);
  if (day > maxDays) setDay(maxDays);

  const selectedDateStr = formatDateStr(year, month, day);
  const isValidSelection = availableDates.has(selectedDateStr) || selectedDateStr === today;

  // Build grid
  const firstDow = new Date(year, month - 1, 1).getDay(); // 0 = Sunday
  const mondayStart = true;
  const startOffset = mondayStart ? (firstDow === 0 ? 6 : firstDow - 1) : firstDow;
  
  const cells: { d: number | null, str: string | null }[] = Array(startOffset).fill({ d: null, str: null });
  for (let i = 1; i <= maxDays; i++) {
    cells.push({ d: i, str: formatDateStr(year, month, i) });
  }
  while (cells.length % 7 !== 0) cells.push({ d: null, str: null });

  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }

  const dayNames = mondayStart ? ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] : ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

  return (
    <Modal title="Select Date" footer="h/j/k/l: move  [/]: month  Enter: select  Esc: cancel">
      <Box flexDirection="column" alignItems="center">
        <Box marginBottom={1}>
          <Text bold>{MONTH_NAMES_FULL[month - 1]} {year}</Text>
        </Box>
        <Box>
          {dayNames.map(n => <Box key={n} width={4}><Text dimColor>{n}</Text></Box>)}
        </Box>
        {weeks.map((w, wi) => (
          <Box key={wi}>
            {w.map((cell, ci) => {
              if (!cell.d || !cell.str) {
                return <Box key={`empty-${ci}`} width={4}><Text> </Text></Box>;
              }
              const isSelected = cell.d === day;
              const hasData = availableDates.has(cell.str);
              const isToday = cell.str === today;
              
              let color = 'gray';
              if (hasData) color = 'white';
              if (isToday && !isSelected) color = 'cyan';
              if (isSelected) color = isValidSelection ? 'magenta' : 'red';

              return (
                <Box key={cell.d} width={4}>
                  <Text color={color} bold={isSelected}>
                    {isSelected ? '[' : ' '}{String(cell.d).padStart(2, '0')}{isSelected ? ']' : ' '}
                  </Text>
                </Box>
              );
            })}
          </Box>
        ))}
        <Box marginTop={1}>
          {!isValidSelection ? (
            <Text color="red">No data for this date.</Text>
          ) : (
            <Text color="green">Data available.</Text>
          )}
        </Box>
      </Box>
    </Modal>
  );
}
