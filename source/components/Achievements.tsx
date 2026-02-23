import React from 'react';
import { Box, Text } from 'ink';
import { getAchievementProgress } from '../lib/achievements.js';
import { loadUnlockedAchievements } from '../lib/store.js';

interface AchievementsProps {
  showAll?: boolean;
}

function formatProgressBar(current: number, target: number, width: number = 20): string {
  const ratio = target > 0 ? Math.min(current / target, 1) : 0;
  const filled = Math.round(ratio * width);
  const empty = width - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

function formatMinutes(minutes: number): string {
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${Math.round(minutes)}m`;
}

function formatProgress(current: number, target: number, id: string): string {
  // Format based on achievement type
  if (id.startsWith('focus_')) {
    return `${formatMinutes(current)} / ${formatMinutes(target)}`;
  }
  if (id.startsWith('streak_')) {
    return `${Math.floor(current)} / ${target} days`;
  }
  if (id.startsWith('sessions_')) {
    return `${Math.floor(current)} / ${target}`;
  }
  if (id === 'five_hours_one_day') {
    return `${formatMinutes(current)} / ${formatMinutes(target)}`;
  }
  return `${Math.floor(current)} / ${target}`;
}

export function Achievements({ showAll = false }: AchievementsProps) {
  const progress = getAchievementProgress();
  const unlocked = loadUnlockedAchievements();

  const unlockedItems = progress.filter(p => p.unlocked);
  const lockedItems = progress.filter(p => !p.unlocked);

  // Show only the next few locked achievements as progress items
  const inProgressItems = lockedItems.slice(0, showAll ? lockedItems.length : 3);

  return (
    <Box flexDirection="column">
      {/* Unlocked achievements */}
      {unlockedItems.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text bold>Milestones</Text>
          {unlockedItems.map(item => (
            <Box key={item.definition.id} marginTop={0}>
              <Text color="green">  + </Text>
              <Text bold>{item.definition.name}</Text>
              <Text dimColor>  {item.definition.description}</Text>
            </Box>
          ))}
        </Box>
      )}

      {/* In-progress achievements */}
      {inProgressItems.length > 0 && (
        <Box flexDirection="column">
          <Text bold dimColor>In Progress</Text>
          {inProgressItems.map(item => {
            const pct = item.target > 0 ? Math.min(item.progress / item.target, 1) : 0;
            const bar = formatProgressBar(item.progress, item.target, 18);
            const label = formatProgress(item.progress, item.target, item.definition.id);

            return (
              <Box key={item.definition.id} flexDirection="column" marginTop={0} marginLeft={2}>
                <Box>
                  <Text>{item.definition.name}</Text>
                  <Text dimColor>  {item.definition.description}</Text>
                </Box>
                <Box>
                  <Text color="cyan">{bar}</Text>
                  <Text dimColor>  {label}</Text>
                  <Text dimColor>  {Math.round(pct * 100)}%</Text>
                </Box>
              </Box>
            );
          })}
        </Box>
      )}

      {unlockedItems.length === 0 && inProgressItems.length === 0 && (
        <Box>
          <Text dimColor>No achievements yet. Complete your first session to start.</Text>
        </Box>
      )}
    </Box>
  );
}
