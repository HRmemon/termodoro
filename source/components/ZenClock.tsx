import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { renderBigString } from '../lib/bigDigits.js';
import { useFullScreen } from '../hooks/useFullScreen.js';

function formatDate(): string {
  const now = new Date();
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${days[now.getDay()]}, ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;
}

function getTimeString(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

function getSeconds(): string {
  return String(new Date().getSeconds()).padStart(2, '0');
}

export function ZenClock() {
  const { columns, rows } = useFullScreen();
  const [time, setTime] = useState(getTimeString);
  const [secs, setSecs] = useState(getSeconds);

  useEffect(() => {
    const interval = setInterval(() => {
      setTime(getTimeString());
      setSecs(getSeconds());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const lines = renderBigString(time);
  const contentHeight = 1 + 5 + 1 + 1 + 2; // date + digits + time + gap + hint
  const topPad = Math.max(0, Math.floor((rows - contentHeight) / 2));

  return (
    <Box flexDirection="column" width={columns} height={rows} alignItems="center">
      <Box height={topPad} />
      <Box marginBottom={1}>
        <Text dimColor>{formatDate()}</Text>
      </Box>
      {lines.map((line, i) => (
        <Box key={i} justifyContent="center">
          <Text color="white" bold>{line}</Text>
        </Box>
      ))}
      <Box marginTop={1}>
        <Text dimColor>{time}:</Text>
        <Text dimColor>{secs}</Text>
      </Box>
      <Box marginTop={2} justifyContent="center">
        <Text dimColor>Esc: Exit Zen</Text>
      </Box>
    </Box>
  );
}
