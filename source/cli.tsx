#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import meow from 'meow';
import { loadConfig } from './lib/config.js';
import { App } from './app.js';
import type { View } from './types.js';
import { isDaemonRunning, sendCommand } from './daemon/client.js';
import { startDaemon } from './daemon/server.js';
import { DAEMON_PID_PATH, DAEMON_SOCKET_PATH } from './daemon/protocol.js';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

const cli = meow(`
  Usage
    $ pomodorocli [command]

  Commands
    start         Start TUI (default)
    stats         View stats
    plan          View planner
    backup        Backup session data
    export        Export sessions to CSV
    import        Import sessions from file
    track         Set up Firefox browser tracking

  Timer Control
    pause         Pause the timer
    resume        Resume the timer
    toggle        Toggle start/pause
    skip          Skip current session
    reset         Reset current session
    status        Print timer state as JSON
    project <name>  Set current project

  Daemon Management
    daemon start  Start the daemon in foreground
    daemon stop   Stop the daemon
    daemon status Check if daemon is running
    daemon install  Install systemd user service

  Options
    --work, -w        Work duration in minutes (default: 25)
    --short-break     Short break duration (default: 5)
    --long-break      Long break duration (default: 15)
    --strict          Enable strict mode (no pause/skip)
    --project, -p     Set initial project tag
    --sequence, -s    Activate a sequence (name or inline e.g. "45w 15b 45w")
    --format, -f      Output format for status (json, short)

  Examples
    $ pomodorocli
    $ pomodorocli start --project backend --sequence deep-work
    $ pomodorocli toggle
    $ pomodorocli status --format short
    $ pomodorocli project backend
    $ pomodorocli daemon install
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
    format: { type: 'string', shortFlag: 'f' },
  },
});

const command = cli.input[0] ?? 'start';
const config = loadConfig();

// Apply CLI flag overrides
if (cli.flags.work) config.workDuration = cli.flags.work;
if (cli.flags.shortBreak) config.shortBreakDuration = cli.flags.shortBreak;
if (cli.flags.longBreak) config.longBreakDuration = cli.flags.longBreak;
if (cli.flags.strict) config.strictMode = true;

// Auto-start daemon in background if not running. Returns when daemon is ready.
async function ensureDaemon(): Promise<void> {
  if (isDaemonRunning()) return;

  // Resolve absolute path to the script
  const thisScript = path.resolve(process.argv[1]!);
  const isTsx = thisScript.endsWith('.tsx') || thisScript.endsWith('.ts');

  let child;
  if (isTsx) {
    // Dev mode: find tsx binary in node_modules and use it directly
    const tsxBin = path.resolve(path.dirname(thisScript), '..', 'node_modules', '.bin', 'tsx');
    child = spawn(process.execPath, [tsxBin, thisScript, 'daemon', 'start'], {
      detached: true,
      stdio: 'ignore',
    });
  } else {
    // Production: use node directly
    child = spawn(process.execPath, [thisScript, 'daemon', 'start'], {
      detached: true,
      stdio: 'ignore',
    });
  }
  child.unref();

  // Wait for the socket to appear (max 5s)
  for (let i = 0; i < 50; i++) {
    await new Promise(r => setTimeout(r, 100));
    if (fs.existsSync(DAEMON_SOCKET_PATH)) {
      // Give the server a moment to start accepting connections
      await new Promise(r => setTimeout(r, 100));
      return;
    }
  }

  console.error('Failed to auto-start daemon. Try: pomodorocli daemon start');
  process.exit(1);
}

// --- Non-interactive commands ---

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

// --- Daemon management ---

if (command === 'daemon') {
  const subcommand = cli.input[1] ?? 'start';

  if (subcommand === 'start') {
    if (isDaemonRunning()) {
      console.log('Daemon is already running.');
      process.exit(0);
    }
    // startDaemon() starts the server and keeps the process alive.
    startDaemon();
    await new Promise(() => {});
  } else if (subcommand === 'stop') {
    if (!isDaemonRunning()) {
      console.log('Daemon is not running.');
      process.exit(0);
    }
    try {
      const resp = await sendCommand({ cmd: 'shutdown' });
      console.log(resp.ok ? 'Daemon stopped.' : `Error: ${(resp as { error: string }).error}`);
    } catch (err) {
      console.error('Failed to stop daemon:', err);
    }
    process.exit(0);
  } else if (subcommand === 'status') {
    if (isDaemonRunning()) {
      const pid = fs.readFileSync(DAEMON_PID_PATH, 'utf-8').trim();
      console.log(`Daemon is running (PID: ${pid})`);
    } else {
      console.log('Daemon is not running.');
    }
    process.exit(0);
  } else if (subcommand === 'install') {
    // Install systemd user service
    const os = await import('node:os');
    const serviceDir = path.join(os.default.homedir(), '.config', 'systemd', 'user');
    fs.mkdirSync(serviceDir, { recursive: true });

    // Always use compiled dist/cli.js for systemd (not tsx source)
    const nodeExec = process.execPath;
    const resolvedScript = path.resolve(process.argv[1]!);
    const distCli = resolvedScript.replace(/\/source\/cli\.tsx$/, '/dist/cli.js')
      .replace(/\/source\/cli\.ts$/, '/dist/cli.js');

    const serviceContent = `[Unit]
Description=pomodorocli Timer Daemon
After=default.target

[Service]
Type=simple
ExecStart=${nodeExec} ${distCli} daemon start
Restart=on-failure
RestartSec=3
Environment=NODE_ENV=production

[Install]
WantedBy=default.target
`;

    const servicePath = path.join(serviceDir, 'pomodorocli.service');
    fs.writeFileSync(servicePath, serviceContent);
    console.log(`Service installed at ${servicePath}`);
    console.log('');
    console.log('Enable and start with:');
    console.log('  systemctl --user daemon-reload');
    console.log('  systemctl --user enable pomodorocli');
    console.log('  systemctl --user start pomodorocli');
    process.exit(0);
  } else {
    console.error(`Unknown daemon subcommand: ${subcommand}`);
    process.exit(1);
  }
}

// --- Timer control commands (sent to daemon) ---

const timerCommands: Record<string, () => Promise<void>> = {
  async pause() {
    const resp = await sendCommand({ cmd: 'pause' });
    if (resp.ok) console.log('Paused.');
    else console.error((resp as { error: string }).error);
  },
  async resume() {
    const resp = await sendCommand({ cmd: 'resume' });
    if (resp.ok) console.log('Resumed.');
    else console.error((resp as { error: string }).error);
  },
  async toggle() {
    const resp = await sendCommand({ cmd: 'toggle' });
    if (resp.ok) {
      const s = resp.state;
      console.log(s.isRunning && !s.isPaused ? 'Running.' : s.isPaused ? 'Paused.' : 'Started.');
    } else {
      console.error((resp as { error: string }).error);
    }
  },
  async skip() {
    const resp = await sendCommand({ cmd: 'skip' });
    if (resp.ok) console.log('Skipped.');
    else console.error((resp as { error: string }).error);
  },
  async reset() {
    const resp = await sendCommand({ cmd: 'reset' });
    if (resp.ok) console.log('Reset.');
    else console.error((resp as { error: string }).error);
  },
  async status() {
    const resp = await sendCommand({ cmd: 'status' });
    if (!resp.ok) {
      console.error((resp as { error: string }).error);
      return;
    }
    const s = resp.state;
    if (cli.flags.format === 'short') {
      const label = s.sessionType === 'work' ? 'F' : 'B';
      const m = Math.floor(s.secondsLeft / 60);
      const sec = s.secondsLeft % 60;
      const time = `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
      let text: string;
      if (!s.isRunning && !s.isPaused) {
        text = 'idle';
      } else {
        text = `${label} ${time}`;
        if (s.currentProject) text += ` #${s.currentProject}`;
        if (s.isPaused) text += ' [paused]';
      }
      console.log(text);
    } else {
      console.log(JSON.stringify(s, null, 2));
    }
  },
  async project() {
    const name = cli.input[1] ?? '';
    const resp = await sendCommand({ cmd: 'set-project', project: name });
    if (resp.ok) console.log(name ? `Project set to #${name}` : 'Project cleared.');
    else console.error((resp as { error: string }).error);
  },
};

if (command in timerCommands) {
  await ensureDaemon();
  try {
    await timerCommands[command]!();
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
  process.exit(0);
}

// --- Interactive TUI commands ---

await ensureDaemon();

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
