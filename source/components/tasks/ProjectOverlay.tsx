import { Box, Text } from 'ink';
import { FilterInput } from '../FilterInput.js';

interface ProjectOverlayProps {
  projectList: string[];
  projectCursor: number;
  projectCounts: Map<string, { open: number; done: number }>;
  deleteConfirm: 'prompt' | null;
  projectEditing: 'add' | 'rename' | null;
  projectInput: string;
  setProjectInput: (v: string) => void;
  onProjectAddSubmit: (v: string) => void;
  onProjectRenameSubmit: (v: string) => void;
}

export function ProjectOverlay({
  projectList, projectCursor, projectCounts,
  deleteConfirm, projectEditing, projectInput, setProjectInput,
  onProjectAddSubmit, onProjectRenameSubmit,
}: ProjectOverlayProps) {
  return (
    <Box flexDirection="column" flexGrow={1} padding={1}>
      <Box borderStyle="round" flexDirection="column" paddingX={2} paddingY={1}>
        <Text bold color="white">Projects</Text>
        <Box marginTop={1} flexDirection="column">
          {projectList.length === 0 && (
            <Text dimColor>No projects yet. Press 'a' to add one.</Text>
          )}
          {projectList.map((proj, i) => {
            const isSelected = i === projectCursor;
            const counts = projectCounts.get(proj) || { open: 0, done: 0 };
            return (
              <Box key={proj}>
                <Text color={isSelected ? 'yellow' : 'gray'} bold={isSelected}>
                  {isSelected ? '> ' : '  '}
                </Text>
                <Box width={20}>
                  <Text color={isSelected ? 'white' : 'gray'} bold={isSelected}>{proj}</Text>
                </Box>
                <Text dimColor>{counts.open} open | {counts.done} done</Text>
              </Box>
            );
          })}
        </Box>

        {deleteConfirm === 'prompt' && (
          <Box marginTop={1}>
            <Text color="red" bold>Delete "{projectList[projectCursor]}"? </Text>
            <Text dimColor>u:untag tasks  d:delete tasks  Esc:cancel</Text>
          </Box>
        )}

        {projectEditing === 'add' && (
          <Box marginTop={1}>
            <FilterInput
              label="New project: "
              value={projectInput}
              onChange={setProjectInput}
              onSubmit={onProjectAddSubmit}
              placeholder="Project name"
            />
          </Box>
        )}
        {projectEditing === 'rename' && (
          <Box marginTop={1}>
            <FilterInput
              label="Rename: "
              value={projectInput}
              onChange={setProjectInput}
              onSubmit={onProjectRenameSubmit}
              placeholder="New name"
            />
          </Box>
        )}

        {!projectEditing && !deleteConfirm && (
          <Box marginTop={1}>
            <Text dimColor>a:add  e:rename  d:delete  Enter:filter  Esc:close</Text>
          </Box>
        )}
      </Box>
    </Box>
  );
}
