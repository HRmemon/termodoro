#!/usr/bin/env node
import * as net from 'node:net';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PomodoroEngine } from '../engine/timer-engine.js';
import { loadConfig } from '../lib/config.js';
import { loadTimerState, clearTimerState, loadStickyProject } from '../lib/store.js';
import { loadSequences, parseSequenceString } from '../lib/sequences.js';
import type { DaemonCommand, DaemonResponse, DaemonEvent, DaemonEventType } from './protocol.js';
import { DAEMON_SOCKET_PATH, DAEMON_PID_PATH } from './protocol.js';
import { validateCommand } from './validate-command.js';
import { writeStatusFile, clearStatusFile, invalidateTodayStats, initStatusFile } from './status-writer.js';
import { executeHook } from './hooks.js';
import type { EngineFullState } from '../engine/timer-engine.js';

// Set of subscribed client sockets
const subscribers = new Set<net.Socket>();
const MAX_SUBSCRIBERS = 64;
const SOCKET_HIGHWATER_BYTES = 256 * 1024; // 256 KB

function send(socket: net.Socket, msg: DaemonResponse | DaemonEvent): void {
  if (socket.destroyed) {
    subscribers.delete(socket);
    return;
  }
  // H3: Drop slow subscribers that aren't draining
  if (socket.writableLength > SOCKET_HIGHWATER_BYTES) {
    subscribers.delete(socket);
    socket.destroy();
    return;
  }
  try {
    socket.write(JSON.stringify(msg) + '\n');
  } catch {
    // Client disconnected
    subscribers.delete(socket);
  }
}

function broadcast(event: DaemonEventType, data: unknown): void {
  const msg: DaemonEvent = { event, data };
  for (const sock of subscribers) {
    send(sock, msg);
  }
}

function resolveSequence(name: string) {
  return loadSequences().find(s => s.name === name) ?? null;
}

/**
 * Attempt to connect to the daemon socket.
 * Returns true if a process is actively accepting connections on the socket.
 * Returns false for any error: ENOENT (no socket), ECONNREFUSED (socket exists but
 * no listener), EACCES (permission denied), or timeout.
 *
 * This is more reliable than process.kill(pid, 0) because:
 * - It cannot be fooled by PID recycling.
 * - It directly verifies a listener is present, not just that a PID exists.
 */
function isSocketLive(socketPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = net.createConnection(socketPath);
    const timer = setTimeout(() => {
      sock.destroy();
      resolve(false);
    }, 1000);
    sock.on('connect', () => {
      clearTimeout(timer);
      sock.destroy();
      resolve(true);
    });
    sock.on('error', () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}

export function startDaemon(): void {
  const config = loadConfig();

  // Build initial state from persisted data
  const snapshot = loadTimerState();
  const stickyProject = loadStickyProject();

  let initialState: import('../engine/timer-engine.js').EngineRestoreState | undefined;

  if (snapshot) {
    if (snapshot.isPaused) {
      initialState = {
        sessionType: snapshot.sessionType,
        sessionNumber: snapshot.sessionNumber,
        totalWorkSessions: snapshot.totalWorkSessions,
        label: snapshot.label,
        project: snapshot.project ?? stickyProject,
        overrideDuration: snapshot.overrideDuration,
        startedAt: snapshot.startedAt,
        secondsLeft: snapshot.pausedSecondsLeft ?? snapshot.totalSeconds,
        isRunning: true,
        isPaused: true,
        timerMode: snapshot.timerMode,
        stopwatchElapsed: snapshot.stopwatchElapsed,
        accumulatedElapsed: snapshot.accumulatedElapsed,
        sequenceName: snapshot.sequenceName,
        sequenceBlocks: snapshot.sequenceBlocks,
        sequenceBlockIndex: snapshot.sequenceBlockIndex,
      };
    } else {
      // Running timer — check if expired
      const elapsed = Math.floor((Date.now() - new Date(snapshot.startedAt).getTime()) / 1000);
      const remaining = snapshot.totalSeconds - elapsed;

      if (remaining > 0 || snapshot.timerMode === 'stopwatch') {
        initialState = {
          sessionType: snapshot.sessionType,
          sessionNumber: snapshot.sessionNumber,
          totalWorkSessions: snapshot.totalWorkSessions,
          label: snapshot.label,
          project: snapshot.project ?? stickyProject,
          overrideDuration: snapshot.overrideDuration,
          startedAt: snapshot.startedAt,
          secondsLeft: snapshot.timerMode === 'stopwatch' ? snapshot.totalSeconds : remaining,
          isRunning: true,
          isPaused: false,
          timerMode: snapshot.timerMode,
          stopwatchElapsed: snapshot.stopwatchElapsed,
          accumulatedElapsed: snapshot.accumulatedElapsed,
          sequenceName: snapshot.sequenceName,
          sequenceBlocks: snapshot.sequenceBlocks,
          sequenceBlockIndex: snapshot.sequenceBlockIndex,
        };
      } else {
        // Timer expired while daemon was down — engine will handle this in restoreAndReconcile
        initialState = {
          sessionType: snapshot.sessionType,
          sessionNumber: snapshot.sessionNumber,
          totalWorkSessions: snapshot.totalWorkSessions,
          label: snapshot.label,
          project: snapshot.project ?? stickyProject,
          overrideDuration: snapshot.overrideDuration,
          startedAt: snapshot.startedAt,
          secondsLeft: 0,
          isRunning: true,
          isPaused: false,
          accumulatedElapsed: snapshot.accumulatedElapsed,
          sequenceName: snapshot.sequenceName,
          sequenceBlocks: snapshot.sequenceBlocks,
          sequenceBlockIndex: snapshot.sequenceBlockIndex,
        };
      }
    }
  } else if (stickyProject) {
    initialState = { project: stickyProject };
  }

  const engine = new PomodoroEngine(config, initialState);

  // Wire engine events to broadcasting + hooks + status file
  const engineEvents: DaemonEventType[] = [
    'tick', 'state:change', 'session:start', 'session:complete',
    'session:skip', 'session:abandon', 'break:start',
    'sequence:advance', 'sequence:complete', 'timer:pause', 'timer:resume',
  ];

  for (const eventName of engineEvents) {
    engine.on(eventName, (...args: unknown[]) => {
      broadcast(eventName, args[0] ?? null);
    });
  }

  // Write status file on every tick and state change
  engine.on('tick', (state: EngineFullState) => {
    writeStatusFile(state);
  });
  engine.on('state:change', (state: EngineFullState) => {
    writeStatusFile(state);
  });

  // Execute hooks on lifecycle events
  engine.on('session:start', (data) => {
    executeHook('on-session-start', data as Record<string, unknown>);
  });
  engine.on('session:complete', (data) => {
    invalidateTodayStats();
    executeHook('on-session-complete', data as Record<string, unknown>);
  });
  engine.on('session:skip', (data) => {
    invalidateTodayStats();
    executeHook('on-session-skip', data as Record<string, unknown>);
  });
  engine.on('session:abandon', (data) => {
    invalidateTodayStats();
    executeHook('on-session-abandon', data as Record<string, unknown>);
  });
  engine.on('break:start', (data) => {
    executeHook('on-break-start', data as Record<string, unknown>);
  });
  engine.on('timer:pause', () => {
    executeHook('on-pause', {});
  });
  engine.on('timer:resume', () => {
    executeHook('on-resume', {});
  });

  // Harden permissions on any pre-existing status file
  initStatusFile();

  // Restore/reconcile timer state (handles expired timers)
  engine.restoreAndReconcile();

  // Write initial status
  writeStatusFile(engine.getState());

  // Handle commands
  function handleCommand(cmd: DaemonCommand): DaemonResponse {
    try {
      switch (cmd.cmd) {
        case 'start':
          engine.start();
          return { ok: true, state: engine.getState() };

        case 'pause':
          engine.pause();
          return { ok: true, state: engine.getState() };

        case 'resume':
          engine.start(); // start handles resume when paused
          return { ok: true, state: engine.getState() };

        case 'toggle':
          engine.toggle();
          return { ok: true, state: engine.getState() };

        case 'skip':
          engine.skip();
          return { ok: true, state: engine.getState() };

        case 'reset':
          engine.reset();
          return { ok: true, state: engine.getState() };

        case 'reset-log':
          engine.resetAndLog(cmd.productive);
          return { ok: true, state: engine.getState() };

        case 'abandon':
          engine.abandon();
          return { ok: true, state: engine.getState() };

        case 'status':
          return { ok: true, state: engine.getState() };

        case 'set-project':
          engine.setProject(cmd.project);
          return { ok: true, state: engine.getState() };

        case 'set-label':
          engine.setLabel(cmd.label);
          return { ok: true, state: engine.getState() };

        case 'set-duration':
          engine.setDuration(cmd.minutes);
          return { ok: true, state: engine.getState() };

        case 'activate-sequence': {
          const seq = resolveSequence(cmd.name);
          if (!seq) return { ok: false, error: `Unknown sequence: ${cmd.name}` };
          engine.activateSequence(seq);
          return { ok: true, state: engine.getState() };
        }

        case 'activate-sequence-inline': {
          const seq = parseSequenceString(cmd.definition);
          if (!seq) return { ok: false, error: `Invalid sequence format: ${cmd.definition}` };
          engine.activateSequence(seq);
          return { ok: true, state: engine.getState() };
        }

        case 'clear-sequence':
          engine.clearSequence();
          return { ok: true, state: engine.getState() };

        case 'switch-to-stopwatch':
          engine.switchToStopwatch();
          return { ok: true, state: engine.getState() };

        case 'stop-stopwatch':
          engine.stopStopwatch();
          return { ok: true, state: engine.getState() };

        case 'advance-session':
          engine.advanceToNextSession();
          return { ok: true, state: engine.getState() };

        case 'update-config': {
          const newConfig = loadConfig();
          engine.updateConfig(newConfig);
          return { ok: true, state: engine.getState() };
        }

        case 'ping':
          return { ok: true, state: engine.getState() };

        case 'shutdown':
          // Handled directly in socket data handler for proper flush
          return { ok: true, state: engine.getState() };

        default:
          return { ok: false, error: `Unknown command: ${(cmd as { cmd: string }).cmd}` };
      }
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  }

  // Create Unix socket server
  const server = net.createServer((socket) => {
    let buffer = '';

    socket.on('data', (data) => {
      buffer += data.toString();

      // Prevent unbounded buffer growth from misbehaving clients
      if (buffer.length > 65536) {
        socket.destroy();
        return;
      }

      let newlineIdx: number;
      while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newlineIdx).trim();
        buffer = buffer.slice(newlineIdx + 1);
        if (!line) continue;

        try {
          const parsed = JSON.parse(line);
          const validated = validateCommand(parsed);

          if (typeof validated === 'string') {
            send(socket, { ok: false, error: validated });
            continue;
          }

          const cmd = validated;

          // Subscribe is special — add to subscribers set
          if (cmd.cmd === 'subscribe') {
            if (subscribers.size >= MAX_SUBSCRIBERS) {
              send(socket, { ok: false, error: 'Subscriber limit reached' });
              socket.destroy();
              continue;
            }
            subscribers.add(socket);
            send(socket, { ok: true, state: engine.getState() });
            continue;
          }

          // Shutdown: flush response before exiting
          if (cmd.cmd === 'shutdown') {
            const resp = JSON.stringify({ ok: true, state: engine.getState() }) + '\n';
            socket.write(resp, () => shutdown());
            continue;
          }

          const response = handleCommand(cmd);
          send(socket, response);
        } catch {
          send(socket, { ok: false, error: 'Invalid JSON' });
        }
      }
    });

    socket.on('close', () => {
      subscribers.delete(socket);
    });

    socket.on('error', () => {
      subscribers.delete(socket);
    });
  });

  // Ensure parent directory exists
  fs.mkdirSync(path.dirname(DAEMON_SOCKET_PATH), { recursive: true });

  // Async IIFE so we can await the socket liveness check.
  (async () => {
    // --- Liveness check: connect to the existing socket if any ---
    // This is the authoritative check. process.kill(pid, 0) is NOT used because:
    // 1. It cannot distinguish a live daemon from a recycled PID.
    // 2. It does not verify the socket is actually accepting connections.
    const live = await isSocketLive(DAEMON_SOCKET_PATH);
    if (live) {
      console.error('Another daemon is already running. Stop it first (pomo stop).');
      process.exit(1);
    }

    // No live daemon. Remove any leftover socket file before binding.
    try {
      fs.unlinkSync(DAEMON_SOCKET_PATH);
    } catch {
      // ENOENT is expected when no socket file exists.
    }

    // Write PID file BEFORE listening to close the window where concurrent
    // startups could both pass the liveness check and race to bind.
    try {
      fs.writeFileSync(DAEMON_PID_PATH, String(process.pid), { mode: 0o600 });
    } catch (err) {
      console.error('Failed to write PID file:', err);
      process.exit(1);
    }

    server.on('error', (err: NodeJS.ErrnoException) => {
      // Clean up our PID file if we failed to bind
      try { fs.unlinkSync(DAEMON_PID_PATH); } catch { /* ignore */ }
      console.error('Daemon server error:', err.message);
      process.exit(1);
    });

    server.listen(DAEMON_SOCKET_PATH, () => {
      // Overwrite PID file now that we have definitively won the bind.
      fs.writeFileSync(DAEMON_PID_PATH, String(process.pid), { mode: 0o600 });
      try { fs.chmodSync(DAEMON_SOCKET_PATH, 0o600); } catch { /* ignore */ }
      console.log(`Daemon listening on ${DAEMON_SOCKET_PATH} (PID: ${process.pid})`);
    });
  })().catch((err: unknown) => {
    console.error('Daemon startup failed:', err);
    process.exit(1);
  });

  function shutdown(): void {
    console.log('Daemon shutting down...');
    engine.dispose();
    server.close();
    clearStatusFile();
    try { fs.unlinkSync(DAEMON_SOCKET_PATH); } catch { /* ignore */ }
    try { fs.unlinkSync(DAEMON_PID_PATH); } catch { /* ignore */ }
    process.exit(0);
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

// Run directly
if (process.argv[1] && (process.argv[1].endsWith('server.js') || process.argv[1].endsWith('server.ts'))) {
  startDaemon();
}
