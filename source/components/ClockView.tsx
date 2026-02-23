import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { renderBigString } from '../lib/bigDigits.js';

function formatDate(): string {
  const now = new Date();
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${days[now.getDay()]}, ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;
}

function getTimeString(): string {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

function getSeconds(): string {
  return String(new Date().getSeconds()).padStart(2, '0');
}

export function ClockView() {
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

  return (
    <Box flexDirection="column" alignItems="center" flexGrow={1} justifyContent="center">
      <Box marginBottom={1}>
        <Text dimColor>{formatDate()}</Text>
      </Box>
      {lines.map((line, i) => (
        <Text key={i} color="white" bold>
          {line}
        </Text>
      ))}
      <Box marginTop={1}>
        <Text dimColor>{time}:</Text>
        <Text dimColor>{secs}</Text>
      </Box>
    </Box>
  );
}
