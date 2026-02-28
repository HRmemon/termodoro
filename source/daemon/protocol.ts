// IPC Protocol types for daemon <-> client communication
// Transport: Unix socket, newline-delimited JSON

import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import type { EngineFullState } from '../engine/timer-engine.js';

// --- Commands (client -> daemon) ---

export type DaemonCommand =
  | { cmd: 'start' }
  | { cmd: 'pause' }
  | { cmd: 'resume' }
  | { cmd: 'toggle' }
  | { cmd: 'skip' }
  | { cmd: 'reset' }
  | { cmd: 'reset-log'; productive: boolean }
  | { cmd: 'abandon' }
  | { cmd: 'status' }
  | { cmd: 'set-project'; project: string }
  | { cmd: 'set-label'; label: string }
  | { cmd: 'set-duration'; minutes: number }
  | { cmd: 'activate-sequence'; name: string }
  | { cmd: 'activate-sequence-inline'; definition: string }
  | { cmd: 'clear-sequence' }
  | { cmd: 'advance-session' }
  | { cmd: 'switch-to-stopwatch' }
  | { cmd: 'stop-stopwatch' }
  | { cmd: 'update-config' }
  | { cmd: 'subscribe' }
  | { cmd: 'ping' }
  | { cmd: 'shutdown' };

// --- Responses (daemon -> client) ---

export interface DaemonOkResponse {
  ok: true;
  state: EngineFullState;
}

export interface DaemonErrorResponse {
  ok: false;
  error: string;
}

export type DaemonResponse = DaemonOkResponse | DaemonErrorResponse;

// --- Events (daemon -> subscribed clients) ---

export type DaemonEventType =
  | 'tick'
  | 'state:change'
  | 'session:start'
  | 'session:complete'
  | 'session:skip'
  | 'session:abandon'
  | 'break:start'
  | 'sequence:advance'
  | 'sequence:complete'
  | 'timer:pause'
  | 'timer:resume';

export interface DaemonEvent {
  event: DaemonEventType;
  data: unknown;
}

// --- Runtime type guards ---

/** Narrow an unknown JSON value to DaemonResponse. */
export function isDaemonResponse(v: unknown): v is DaemonResponse {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return typeof obj.ok === 'boolean';
}

/** Narrow an unknown JSON value to DaemonEvent. */
export function isDaemonEvent(v: unknown): v is DaemonEvent {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return typeof obj.event === 'string';
}

// Socket and PID paths
export const DAEMON_SOCKET_PATH = path.join(os.homedir(), '.local', 'share', 'pomodorocli', 'daemon.sock');
export const DAEMON_PID_PATH = path.join(os.homedir(), '.local', 'share', 'pomodorocli', 'daemon.pid');

/**
 * Returns true if a daemon is actively accepting connections on the given socket.
 *
 * Uses a connect attempt rather than PID file inspection because:
 * - PID recycling can make process.kill(pid, 0) return a false positive.
 * - A socket file can exist without a listener (stale socket after crash).
 * - A connect attempt is the only reliable end-to-end liveness test.
 */
export function isSocketAlive(socketPath: string): Promise<boolean> {
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
