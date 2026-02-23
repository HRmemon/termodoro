import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import type { TagInfo, PostSessionInfo, EnergyLevel } from '../types.js';

interface PreSessionTaggerProps {
  mode: 'pre';
  onSubmit: (info: TagInfo) => void;
  onSkip: () => void;
}

interface PostSessionTaggerProps {
  mode: 'post';
  onSubmit: (info: PostSessionInfo) => void;
  onSkip: () => void;
}

type SessionTaggerProps = PreSessionTaggerProps | PostSessionTaggerProps;

type PreStep = 'label' | 'project' | 'tag' | 'energy';
type PostStep = 'distraction';

const ENERGY_OPTIONS: EnergyLevel[] = ['high', 'medium', 'low'];
const ENERGY_COLORS: Record<EnergyLevel, string> = { high: 'green', medium: 'yellow', low: 'red' };

export function SessionTagger(props: SessionTaggerProps) {
  if (props.mode === 'pre') {
    return <PreTagger onSubmit={props.onSubmit} onSkip={props.onSkip} />;
  }
  return <PostTagger onSubmit={props.onSubmit} onSkip={props.onSkip} />;
}

function PreTagger({ onSubmit, onSkip }: { onSubmit: (info: TagInfo) => void; onSkip: () => void }) {
  const [step, setStep] = useState<PreStep>('label');
  const [label, setLabel] = useState('');
  const [project, setProject] = useState('');
  const [tag, setTag] = useState('');
  const [energyIdx, setEnergyIdx] = useState(0);

  useInput((input, key) => {
    if (key.escape) {
      onSkip();
      return;
    }

    if (step === 'energy') {
      if (input === 'j' || key.downArrow) {
        setEnergyIdx(i => Math.min(i + 1, ENERGY_OPTIONS.length - 1));
      } else if (input === 'k' || key.upArrow) {
        setEnergyIdx(i => Math.max(i - 1, 0));
      } else if (key.return) {
        onSubmit({
          label: label || undefined,
          project: project || undefined,
          tag: tag || undefined,
          energyLevel: ENERGY_OPTIONS[energyIdx],
        });
      }
    }
  });

  const handleLabelSubmit = () => { setStep('project'); };
  const handleProjectSubmit = () => { setStep('tag'); };
  const handleTagSubmit = () => { setStep('energy'); };

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Text bold color="cyan">Session Setup</Text>
      <Text dimColor>(press Esc to skip)</Text>
      <Box marginTop={1} />

      {step === 'label' && (
        <Box>
          <Text>Label: </Text>
          <TextInput value={label} onChange={setLabel} onSubmit={handleLabelSubmit} placeholder="e.g. Debug auth flow" />
        </Box>
      )}

      {step === 'project' && (
        <Box>
          <Text>Project: </Text>
          <TextInput value={project} onChange={setProject} onSubmit={handleProjectSubmit} placeholder="e.g. myapp" />
        </Box>
      )}

      {step === 'tag' && (
        <Box>
          <Text>Tag: </Text>
          <TextInput value={tag} onChange={setTag} onSubmit={handleTagSubmit} placeholder="e.g. bugfix, feature, review" />
        </Box>
      )}

      {step === 'energy' && (
        <Box flexDirection="column">
          <Text>Energy Level:</Text>
          {ENERGY_OPTIONS.map((e, i) => (
            <Text key={e} color={i === energyIdx ? ENERGY_COLORS[e] : undefined}>
              {i === energyIdx ? '> ' : '  '}{e}
            </Text>
          ))}
          <Text dimColor>(j/k or arrows, Enter to confirm)</Text>
        </Box>
      )}
    </Box>
  );
}

function PostTagger({ onSubmit, onSkip }: { onSubmit: (info: PostSessionInfo) => void; onSkip: () => void }) {
  const [score, setScore] = useState(1);

  useInput((input, key) => {
    if (key.escape) {
      onSkip();
      return;
    }
    const num = parseInt(input, 10);
    if (num >= 1 && num <= 5) {
      setScore(num);
    }
    if (key.return) {
      onSubmit({ distractionScore: score });
    }
    if (input === 'j' || key.downArrow) {
      setScore(s => Math.min(s + 1, 5));
    } else if (input === 'k' || key.upArrow) {
      setScore(s => Math.max(s - 1, 1));
    }
  });

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Text bold color="green">Session Complete!</Text>
      <Text dimColor>(press Esc to skip)</Text>
      <Box marginTop={1} flexDirection="column">
        <Text>Distraction score (1=focused, 5=distracted):</Text>
        <Box marginTop={1}>
          {[1, 2, 3, 4, 5].map(n => (
            <Text key={n} color={n === score ? 'cyan' : undefined} bold={n === score}>
              {n === score ? `[${n}]` : ` ${n} `}
              {' '}
            </Text>
          ))}
        </Box>
        <Text dimColor>(1-5, j/k, Enter to confirm)</Text>
      </Box>
    </Box>
  );
}
