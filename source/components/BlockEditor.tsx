import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import type { TimeBlock } from '../types.js';
import { listTemplates, applyTemplate } from '../lib/templates.js';

type Step = 'startTime' | 'endTime' | 'label' | 'sessions' | 'priority' | 'project' | 'template';

const PRIORITY_OPTIONS: TimeBlock['priority'][] = ['P1', 'P2', 'P3'];
const PRIORITY_COLORS: Record<TimeBlock['priority'], string> = {
  P1: 'red',
  P2: 'yellow',
  P3: 'cyan',
};

const PRIORITY_DESCRIPTIONS: Record<TimeBlock['priority'], string> = {
  P1: 'High — must do',
  P2: 'Medium — should do',
  P3: 'Low — nice to have',
};

interface BlockEditorProps {
  date: string;
  existingBlock?: TimeBlock;
  onSave: (block: Omit<TimeBlock, 'id'>, existingId?: string) => void;
  onCancel: () => void;
  onThemeChange: (theme: string) => void;
}

export function BlockEditor({ date, existingBlock, onSave, onCancel, onThemeChange }: BlockEditorProps) {
  const isEditing = existingBlock !== undefined;

  const [step, setStep] = useState<Step>(isEditing ? 'startTime' : 'template');

  // Template selection state
  const templates = listTemplates();
  const [templateIdx, setTemplateIdx] = useState(0);

  // Field state — pre-populated when editing
  const [startTime, setStartTime] = useState(existingBlock?.startTime ?? '09:00');
  const [endTime, setEndTime] = useState(existingBlock?.endTime ?? '10:00');
  const [label, setLabel] = useState(existingBlock?.label ?? '');
  const [sessionsStr, setSessionsStr] = useState(String(existingBlock?.expectedSessions ?? '2'));
  const [priorityIdx, setPriorityIdx] = useState<number>(
    existingBlock ? PRIORITY_OPTIONS.indexOf(existingBlock.priority) : 0
  );
  const [project, setProject] = useState(existingBlock?.project ?? '');

  // Validation error message
  const [error, setError] = useState('');

  // ------- Helpers -------

  function validateTime(t: string): boolean {
    return /^\d{2}:\d{2}$/.test(t) &&
      parseInt(t.slice(0, 2), 10) < 24 &&
      parseInt(t.slice(3), 10) < 60;
  }

  // ------- Input handler -------

  useInput((input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }

    // Template step — arrow / enter selection only (no text input active)
    if (step === 'template') {
      if (input === 'j' || key.downArrow) {
        // +1 because index 0 = "skip / manual" option rendered first
        setTemplateIdx(i => Math.min(i + 1, templates.length));
        return;
      }
      if (input === 'k' || key.upArrow) {
        setTemplateIdx(i => Math.max(i - 1, 0));
        return;
      }
      if (key.return) {
        if (templateIdx === 0) {
          // Manual entry — proceed to start time step
          setStep('startTime');
        } else {
          const chosen = templates[templateIdx - 1];
          if (chosen) {
            const applied = applyTemplate(chosen.name, date);
            onThemeChange(applied.theme ?? chosen.name);
            // Persist each block through onSave calls would require looping.
            // Instead we emit a synthetic save for each block via the parent.
            // We call onSave once per block — the parent's handleEditorSave
            // appends blocks sequentially when existingId is undefined.
            for (const block of applied.blocks) {
              const { id: _id, ...rest } = block;
              onSave(rest, undefined);
            }
          }
        }
        return;
      }
    }

    // Priority step — arrow / enter only (no text input active)
    if (step === 'priority') {
      if (input === 'j' || key.downArrow) {
        setPriorityIdx(i => Math.min(i + 1, PRIORITY_OPTIONS.length - 1));
        return;
      }
      if (input === 'k' || key.upArrow) {
        setPriorityIdx(i => Math.max(i - 1, 0));
        return;
      }
      if (key.return) {
        setError('');
        setStep('project');
        return;
      }
    }
  });

  // ------- Submit handlers for TextInput fields -------

  function handleStartTimeSubmit() {
    if (!validateTime(startTime)) {
      setError('Invalid time — use HH:MM (e.g. 09:00)');
      return;
    }
    setError('');
    setStep('endTime');
  }

  function handleEndTimeSubmit() {
    if (!validateTime(endTime)) {
      setError('Invalid time — use HH:MM (e.g. 11:00)');
      return;
    }
    const startMins = parseInt(startTime.slice(0, 2), 10) * 60 + parseInt(startTime.slice(3), 10);
    const endMins = parseInt(endTime.slice(0, 2), 10) * 60 + parseInt(endTime.slice(3), 10);
    if (endMins <= startMins) {
      setError('End time must be after start time');
      return;
    }
    setError('');
    setStep('label');
  }

  function handleLabelSubmit() {
    if (!label.trim()) {
      setError('Label is required');
      return;
    }
    setError('');
    setStep('sessions');
  }

  function handleSessionsSubmit() {
    const n = parseInt(sessionsStr, 10);
    if (isNaN(n) || n < 1) {
      setError('Enter a whole number >= 1');
      return;
    }
    setError('');
    setStep('priority');
  }

  function handleProjectSubmit() {
    // Project is optional — always valid
    const n = parseInt(sessionsStr, 10);
    const blockData: Omit<TimeBlock, 'id'> = {
      startTime,
      endTime,
      label: label.trim(),
      expectedSessions: n,
      priority: PRIORITY_OPTIONS[priorityIdx] ?? 'P2',
      project: project.trim() || undefined,
    };
    onSave(blockData, existingBlock?.id);
  }

  // ------- Render -------

  const currentPriority = PRIORITY_OPTIONS[priorityIdx] ?? 'P2';

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      {/* Title */}
      <Box marginBottom={1}>
        <Text bold color="cyan">
          {isEditing ? 'Edit Block' : 'New Block'}
        </Text>
        <Text dimColor>  (Esc to cancel)</Text>
      </Box>

      {/* Step: Template */}
      {step === 'template' && (
        <Box flexDirection="column">
          <Text bold>Start from a template?</Text>
          <Box marginTop={1} flexDirection="column">
            <Text color={templateIdx === 0 ? 'white' : undefined} bold={templateIdx === 0}>
              {templateIdx === 0 ? '> ' : '  '}Manual entry
            </Text>
            {templates.map((t, i) => {
              const listIdx = i + 1;
              const isSelected = listIdx === templateIdx;
              return (
                <Box key={t.name} flexDirection="column">
                  <Text color={isSelected ? 'green' : undefined} bold={isSelected}>
                    {isSelected ? '> ' : '  '}{t.name}
                  </Text>
                  {isSelected && (
                    <Text dimColor>    {t.description}</Text>
                  )}
                </Box>
              );
            })}
          </Box>
          <Box marginTop={1}>
            <Text dimColor>(j/k or arrows, Enter to select)</Text>
          </Box>
        </Box>
      )}

      {/* Step: Start time */}
      {step === 'startTime' && (
        <Box flexDirection="column">
          <Box>
            <Text>Start time (HH:MM): </Text>
            <TextInput
              value={startTime}
              onChange={setStartTime}
              onSubmit={handleStartTimeSubmit}
              placeholder="09:00"
            />
          </Box>
          {error ? <Text color="red">{error}</Text> : null}
        </Box>
      )}

      {/* Step: End time */}
      {step === 'endTime' && (
        <Box flexDirection="column">
          <Text dimColor>Start: {startTime}</Text>
          <Box>
            <Text>End time (HH:MM):   </Text>
            <TextInput
              value={endTime}
              onChange={setEndTime}
              onSubmit={handleEndTimeSubmit}
              placeholder="11:00"
            />
          </Box>
          {error ? <Text color="red">{error}</Text> : null}
        </Box>
      )}

      {/* Step: Label */}
      {step === 'label' && (
        <Box flexDirection="column">
          <Text dimColor>{startTime}–{endTime}</Text>
          <Box>
            <Text>Label: </Text>
            <TextInput
              value={label}
              onChange={setLabel}
              onSubmit={handleLabelSubmit}
              placeholder="e.g. Deep Work"
            />
          </Box>
          {error ? <Text color="red">{error}</Text> : null}
        </Box>
      )}

      {/* Step: Expected sessions */}
      {step === 'sessions' && (
        <Box flexDirection="column">
          <Text dimColor>{startTime}–{endTime}  {label}</Text>
          <Box>
            <Text>Expected sessions: </Text>
            <TextInput
              value={sessionsStr}
              onChange={setSessionsStr}
              onSubmit={handleSessionsSubmit}
              placeholder="2"
            />
          </Box>
          {error ? <Text color="red">{error}</Text> : null}
        </Box>
      )}

      {/* Step: Priority */}
      {step === 'priority' && (
        <Box flexDirection="column">
          <Text dimColor>{startTime}–{endTime}  {label}</Text>
          <Box marginTop={1} flexDirection="column">
            <Text>Priority:</Text>
            {PRIORITY_OPTIONS.map((p, i) => {
              const isSelected = i === priorityIdx;
              return (
                <Text key={p} color={isSelected ? PRIORITY_COLORS[p] : undefined} bold={isSelected}>
                  {isSelected ? '> ' : '  '}{p}  {PRIORITY_DESCRIPTIONS[p]}
                </Text>
              );
            })}
          </Box>
          <Box marginTop={1}>
            <Text dimColor>(j/k or arrows, Enter to confirm)</Text>
          </Box>
        </Box>
      )}

      {/* Step: Project */}
      {step === 'project' && (
        <Box flexDirection="column">
          <Text dimColor>
            {startTime}–{endTime}  {label}  <Text color={PRIORITY_COLORS[currentPriority]}>[{currentPriority}]</Text>
          </Text>
          <Box>
            <Text>Project (optional): </Text>
            <TextInput
              value={project}
              onChange={setProject}
              onSubmit={handleProjectSubmit}
              placeholder="e.g. myapp"
            />
          </Box>
        </Box>
      )}

      {/* Progress indicator */}
      <Box marginTop={1}>
        {['startTime', 'endTime', 'label', 'sessions', 'priority', 'project'].map(s => (
          <Text
            key={s}
            color={step === s ? 'cyan' : undefined}
            dimColor={step !== s}
          >
            {'● '}
          </Text>
        ))}
      </Box>
    </Box>
  );
}
