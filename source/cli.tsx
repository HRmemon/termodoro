#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import meow from 'meow';
import { loadConfig } from './lib/config.js';
import { App } from './app.js';
import type { View } from './types.js';

const cli = meow(`
  Usage
    $ pomodorocli [command]

  Commands
    start       Start Pomodoro (default)
    stats       View stats
    plan        View planner
    backup      Backup session data
    export      Export sessions to CSV
    import      Import sessions from file
    track       Set up Firefox browser tracking

  Options
    --work, -w        Work duration in minutes (default: 25)
    --short-break     Short break duration (default: 5)
    --long-break      Long break duration (default: 15)
    --strict          Enable strict mode (no pause/skip)
    --project, -p     Set initial project tag
    --sequence, -s    Activate a sequence (name or inline e.g. "45w 15b 45w")

  Examples
    $ pomodorocli
    $ pomodorocli start --work 50 --strict
    $ pomodorocli start --project backend --sequence deep-work
    $ pomodorocli stats
`, {
  importMeta: import.meta,
  flags: {
    work: { type: 'number', shortFlag: 'w' },
    shortBreak: { type: 'number' },
    longBreak: { type: 'number' },
    strict: { type: 'boolean' },
    output: { type: 'string', shortFlag: 'o' },
    project: { type: 'string', shortFlag: 'p' },
    sequence: { type: 'string', shortFlag: 's' },
  },
});

const command = cli.input[0] ?? 'start';
const config = loadConfig();

// Apply CLI flag overrides
if (cli.flags.work) config.workDuration = cli.flags.work;
if (cli.flags.shortBreak) config.shortBreakDuration = cli.flags.shortBreak;
if (cli.flags.longBreak) config.longBreakDuration = cli.flags.longBreak;
if (cli.flags.strict) config.strictMode = true;

// Handle non-interactive commands
if (command === 'backup') {
  const { handleBackup } = await import('./lib/data.js');
  handleBackup();
  process.exit(0);
}
if (command === 'export') {
  const { handleExport } = await import('./lib/data.js');
  handleExport(cli.flags.output);
  process.exit(0);
}
if (command === 'track') {
  const { handleTrackSetup } = await import('./lib/track-setup.js');
  handleTrackSetup();
  process.exit(0);
}
if (command === 'import') {
  const file = cli.input[1];
  if (!file) {
    console.error('Usage: pomodorocli import <file>');
    process.exit(1);
  }
  const { handleImport } = await import('./lib/data.js');
  handleImport(file);
  process.exit(0);
}

// Map command to initial view
const viewMap: Record<string, View> = {
  start: 'timer',
  stats: 'stats',
  plan: 'plan',
  config: 'config',
  clock: 'clock',
  web: 'web',
};
const initialView = viewMap[command] ?? 'timer';

render(<App config={config} initialView={initialView} initialProject={cli.flags.project} initialSequence={cli.flags.sequence} />);
