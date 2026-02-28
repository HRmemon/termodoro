import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import { GOAL_COLORS } from '../../lib/goals.js';

type AddStep = 'name' | 'type' | 'project' | 'rateMax' | 'color';

interface GoalFormViewProps {
  isEdit: boolean;
  addStep: AddStep;
  newName: string;
  setNewName: (v: string) => void;
  newType: 'manual' | 'auto' | 'rate' | 'note';
  newProject: string;
  setNewProject: (v: string) => void;
  newRateMax: string;
  setNewRateMax: (v: string) => void;
  newColorIdx: number;
  projSuggestions: string[];
  projSuggIdx: number;
  onNameSubmit: () => void;
  onRateMaxSubmit: () => void;
  onProjectSubmit: () => void;
}

export function GoalFormView({
  isEdit, addStep,
  newName, setNewName,
  newType,
  newProject, setNewProject,
  newRateMax, setNewRateMax,
  newColorIdx,
  projSuggestions, projSuggIdx,
  onNameSubmit, onRateMaxSubmit, onProjectSubmit,
}: GoalFormViewProps) {
  return (
    <Box flexDirection="column" flexGrow={1}>
      <Text bold color="cyan">{isEdit ? 'Edit Goal' : 'Add New Goal'}</Text>
      <Text dimColor>Esc to cancel</Text>
      <Box marginTop={1} flexDirection="column">
        {addStep === 'name' && (
          <Box>
            <Text>Name: </Text>
            <TextInput
              value={newName}
              onChange={setNewName}
              onSubmit={onNameSubmit}
            />
          </Box>
        )}
        {addStep === 'type' && (
          <Box flexDirection="column">
            <Text>Name: <Text bold>{newName}</Text></Text>
            <Box marginTop={1}>
              <Text>Type: </Text>
              <Text color={newType === 'manual' ? 'cyan' : 'gray'} bold={newType === 'manual'}>[m] manual</Text>
              <Text>  </Text>
              <Text color={newType === 'auto' ? 'cyan' : 'gray'} bold={newType === 'auto'}>[a] auto</Text>
              <Text>  </Text>
              <Text color={newType === 'rate' ? 'cyan' : 'gray'} bold={newType === 'rate'}>[r] rate</Text>
              <Text>  </Text>
              <Text color={newType === 'note' ? 'cyan' : 'gray'} bold={newType === 'note'}>[n] note</Text>
            </Box>
            <Text dimColor>Tab to toggle, Enter to confirm</Text>
          </Box>
        )}
        {addStep === 'rateMax' && (
          <Box flexDirection="column">
            <Text>Name: <Text bold>{newName}</Text>  Type: <Text bold>rate</Text></Text>
            <Box marginTop={1}>
              <Text>Max rating (1-9, default 5): </Text>
              <TextInput
                value={newRateMax}
                onChange={setNewRateMax}
                onSubmit={onRateMaxSubmit}
              />
            </Box>
          </Box>
        )}
        {addStep === 'project' && (
          <Box flexDirection="column">
            <Text>Name: <Text bold>{newName}</Text>  Type: <Text bold>auto</Text></Text>
            <Box marginTop={1}>
              <Text>#project: </Text>
              <TextInput
                value={newProject}
                onChange={setNewProject}
                onSubmit={onProjectSubmit}
              />
            </Box>
            {projSuggestions.length > 0 && (
              <Box flexDirection="column" marginTop={1}>
                {projSuggestions.map((p, i) => (
                  <Text key={p} color={i === projSuggIdx ? 'cyan' : 'gray'} bold={i === projSuggIdx}>
                    {i === projSuggIdx ? '> ' : '  '}{p}
                  </Text>
                ))}
                <Text dimColor>Up/Down to navigate, Tab to accept</Text>
              </Box>
            )}
          </Box>
        )}
        {addStep === 'color' && (
          <Box flexDirection="column">
            <Text>Name: <Text bold>{newName}</Text>  Type: <Text bold>{newType}</Text></Text>
            <Box marginTop={1}>
              <Text>Color: </Text>
              {GOAL_COLORS.map((c, i) => (
                <Text key={c} color={c} bold={i === newColorIdx}>
                  {i === newColorIdx ? '[' : ' '}{'\u2588'}{i === newColorIdx ? ']' : ' '}
                </Text>
              ))}
            </Box>
            <Text dimColor>h/l to select, Enter to save</Text>
          </Box>
        )}
      </Box>
    </Box>
  );
}
