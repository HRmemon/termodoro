import React, { useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import { loadSessions } from '../lib/store.js';
import {
  calculateFocusScore,
  detectBurnout,
  detectEnergyPatterns,
  getProductivityByHour,
} from '../lib/insights.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatHour(h: number): string {
  const ampm = h < 12 ? 'AM' : 'PM';
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${String(display).padStart(2)}${ampm}`;
}

/** Renders a simple horizontal bar scaled to maxWidth columns. */
function bar(value: number, max: number, maxWidth: number): string {
  if (max === 0) return '';
  const filled = Math.round((value / max) * maxWidth);
  return '█'.repeat(filled);
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface InsightsViewProps {
  onBack: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function InsightsView({ onBack }: InsightsViewProps) {
  useInput((_input, key) => {
    if (key.escape || _input === 'q') {
      onBack();
    }
  });

  const sessions = useMemo(() => loadSessions(), []);

  const focusScore = useMemo(() => calculateFocusScore(sessions), [sessions]);
  const burnout = useMemo(() => detectBurnout(sessions), [sessions]);
  const energyPatterns = useMemo(() => detectEnergyPatterns(sessions), [sessions]);
  const byHour = useMemo(() => getProductivityByHour(sessions), [sessions]);

  // Only show hours that have at least one session
  const activeHours = byHour.filter(h => h.avgFocusMinutes > 0);
  const maxFocusMinutes = Math.max(...activeHours.map(h => h.avgFocusMinutes), 1);

  // Focus score visual
  const scoreColor =
    focusScore >= 200 ? 'green' : focusScore >= 100 ? 'yellow' : focusScore >= 0 ? 'white' : 'red';

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      {/* Title */}
      <Text bold color="cyan">Insights</Text>

      {/* ------------------------------------------------------------------ */}
      {/* Focus Score                                                          */}
      {/* ------------------------------------------------------------------ */}
      <Box marginTop={1} flexDirection="column">
        <Text bold>Focus Score</Text>
        <Box>
          <Text bold color={scoreColor} >
            {focusScore >= 0 ? focusScore : `${focusScore}`}
          </Text>
          <Text dimColor>
            {'  '}pts  (focus_minutes × consistency − skipped×5)
          </Text>
        </Box>
      </Box>

      {/* ------------------------------------------------------------------ */}
      {/* Burnout Warning                                                      */}
      {/* ------------------------------------------------------------------ */}
      {burnout.warning && (
        <Box marginTop={1} borderStyle="round" paddingX={1} borderColor="yellow">
          <Text color="yellow" bold>Burnout Warning  </Text>
          <Text color="yellow">{burnout.message}</Text>
        </Box>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Energy Patterns                                                      */}
      {/* ------------------------------------------------------------------ */}
      <Box marginTop={1} flexDirection="column">
        <Text bold>Energy Patterns</Text>
        <Box>
          <Text dimColor>Best hours:  </Text>
          <Text color="green">{energyPatterns.bestHours}</Text>
        </Box>
        <Box>
          <Text dimColor>Worst hours: </Text>
          <Text color="red">{energyPatterns.worstHours}</Text>
        </Box>
        <Box marginTop={1} flexDirection="column">
          {energyPatterns.insights.map((insight, i) => (
            <Box key={i}>
              <Text dimColor>• </Text>
              <Text>{insight}</Text>
            </Box>
          ))}
        </Box>
      </Box>

      {/* ------------------------------------------------------------------ */}
      {/* Productivity by Hour — simple bar chart                             */}
      {/* ------------------------------------------------------------------ */}
      {activeHours.length > 0 && (
        <Box marginTop={1} flexDirection="column">
          <Text bold>Productivity by Hour</Text>
          <Text dimColor>{'  (avg focus minutes per session started at that hour)'}</Text>
          <Box marginTop={1} flexDirection="column">
            {activeHours.map(h => {
              const distrColor =
                h.avgDistraction === 0
                  ? 'white'
                  : h.avgDistraction <= 2
                    ? 'green'
                    : h.avgDistraction <= 3
                      ? 'yellow'
                      : 'red';

              return (
                <Box key={h.hour}>
                  <Text dimColor>{formatHour(h.hour)} </Text>
                  <Text color="cyan">{bar(h.avgFocusMinutes, maxFocusMinutes, 20).padEnd(20)}</Text>
                  <Text dimColor> {String(h.avgFocusMinutes).padStart(3)}m</Text>
                  {h.avgDistraction > 0 && (
                    <>
                      <Text dimColor>  distraction: </Text>
                      <Text color={distrColor}>{h.avgDistraction.toFixed(1)}</Text>
                    </>
                  )}
                </Box>
              );
            })}
          </Box>
        </Box>
      )}

      {sessions.length === 0 && (
        <Box marginTop={1}>
          <Text dimColor>No sessions recorded yet. Complete some Pomodoros to see insights.</Text>
        </Box>
      )}

      {/* Footer */}
      <Box marginTop={1}>
        <Text dimColor>[Esc or q] back</Text>
      </Box>
    </Box>
  );
}
