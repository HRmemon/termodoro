import { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import type { CalendarEvent } from '../types.js';
import { colors } from '../lib/theme.js';

type FormStep = 'title' | 'date' | 'time' | 'frequency' | 'status';

interface EventFormProps {
  initialDate?: string;
  editEvent?: CalendarEvent;
  onSubmit: (data: Omit<CalendarEvent, 'id' | 'source'>) => void;
  onCancel: () => void;
  setIsTyping: (v: boolean) => void;
}

const FREQUENCIES = ['once', 'daily', 'weekly', 'monthly', 'yearly'] as const;
const STATUSES = ['normal', 'important'] as const;

export function EventForm({ initialDate, editEvent, onSubmit, onCancel, setIsTyping }: EventFormProps) {
  const [step, setStep] = useState<FormStep>('title');
  const [title, setTitle] = useState(editEvent?.title ?? '');
  const [date, setDate] = useState(editEvent?.date ?? initialDate ?? new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState(editEvent?.time ?? '');
  const [freqIdx, setFreqIdx] = useState(
    editEvent?.frequency ? FREQUENCIES.indexOf(editEvent.frequency as typeof FREQUENCIES[number]) : 0
  );
  const [statusIdx, setStatusIdx] = useState(
    editEvent?.status === 'important' ? 1 : 0
  );

  useInput((input, key) => {
    if (key.escape) {
      setIsTyping(false);
      onCancel();
      return;
    }

    if (step === 'frequency') {
      if (input === 'h' || key.leftArrow) setFreqIdx(Math.max(0, freqIdx - 1));
      if (input === 'l' || key.rightArrow) setFreqIdx(Math.min(FREQUENCIES.length - 1, freqIdx + 1));
      if (key.return) setStep('status');
      return;
    }

    if (step === 'status') {
      if (input === 'h' || key.leftArrow) setStatusIdx(Math.max(0, statusIdx - 1));
      if (input === 'l' || key.rightArrow) setStatusIdx(Math.min(STATUSES.length - 1, statusIdx + 1));
      if (key.return) {
        setIsTyping(false);
        onSubmit({
          title,
          date,
          time: time || undefined,
          status: STATUSES[statusIdx]!,
          privacy: editEvent?.privacy ?? false,
          frequency: FREQUENCIES[freqIdx],
          endDate: editEvent?.endDate,
          endTime: editEvent?.endTime,
          repeatCount: editEvent?.repeatCount,
          rrule: editEvent?.rrule,
          icon: editEvent?.icon,
          calendarId: editEvent?.calendarId,
          color: editEvent?.color,
        });
      }
      return;
    }
  });

  const handleTitleSubmit = (val: string) => {
    if (!val.trim()) return;
    setTitle(val.trim());
    setStep('date');
  };

  const handleDateSubmit = (val: string) => {
    // Validate YYYY-MM-DD and check it's a real date
    if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
      const parsed = new Date(val + 'T00:00:00');
      if (!isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === val) {
        setDate(val);
      }
    }
    setStep('time');
  };

  const handleTimeSubmit = (val: string) => {
    // Validate HH:MM with valid hours/minutes
    if (/^\d{2}:\d{2}$/.test(val)) {
      const [h, m] = val.split(':').map(Number);
      if (h! >= 0 && h! <= 23 && m! >= 0 && m! <= 59) {
        setTime(val);
      } else {
        setTime('');
      }
    } else {
      setTime('');
    }
    setStep('frequency');
  };

  const isTextStep = step === 'title' || step === 'date' || step === 'time';

  // Sync typing state with parent via effect (not during render)
  useEffect(() => {
    setIsTyping(isTextStep);
  }, [isTextStep, setIsTyping]);

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={colors.highlight} paddingX={2} paddingY={1}>
      <Box marginBottom={1}>
        <Text bold color={colors.text}>
          {editEvent ? '─ Edit Event ' : '─ Add Event '}
        </Text>
      </Box>

      {/* Title */}
      <Box>
        <Text color={step === 'title' ? colors.highlight : colors.text}>  Title: </Text>
        {step === 'title' ? (
          <TextInput value={title} onChange={setTitle} onSubmit={handleTitleSubmit} />
        ) : (
          <Text color={colors.text}>{title}</Text>
        )}
      </Box>

      {/* Date */}
      {step !== 'title' && (
        <Box>
          <Text color={step === 'date' ? colors.highlight : colors.text}>  Date:  </Text>
          {step === 'date' ? (
            <TextInput value={date} onChange={setDate} onSubmit={handleDateSubmit} />
          ) : (
            <Text color={colors.text}>{date}</Text>
          )}
        </Box>
      )}

      {/* Time */}
      {(step === 'time' || step === 'frequency' || step === 'status') && (
        <Box>
          <Text color={step === 'time' ? colors.highlight : colors.text}>  Time:  </Text>
          {step === 'time' ? (
            <TextInput value={time} onChange={setTime} onSubmit={handleTimeSubmit} placeholder="HH:MM (optional)" />
          ) : (
            <Text color={colors.text}>{time || '(all day)'}</Text>
          )}
        </Box>
      )}

      {/* Frequency */}
      {(step === 'frequency' || step === 'status') && (
        <Box>
          <Text color={step === 'frequency' ? colors.highlight : colors.text}>  Repeat: </Text>
          {FREQUENCIES.map((f, i) => (
            <Text key={f} color={i === freqIdx ? colors.highlight : colors.dim}>
              {i === freqIdx ? '● ' : '○ '}{f}{'  '}
            </Text>
          ))}
        </Box>
      )}

      {/* Status */}
      {step === 'status' && (
        <Box>
          <Text color={colors.highlight}>  Status: </Text>
          {STATUSES.map((s, i) => (
            <Text key={s} color={i === statusIdx ? colors.highlight : colors.dim}>
              {i === statusIdx ? '● ' : '○ '}{s}{'  '}
            </Text>
          ))}
        </Box>
      )}

      {/* Hints */}
      <Box marginTop={1}>
        <Text dimColor>
          {isTextStep
            ? 'Enter:confirm  Esc:cancel'
            : 'h/l:select  Enter:confirm  Esc:cancel'}
        </Text>
      </Box>
    </Box>
  );
}
