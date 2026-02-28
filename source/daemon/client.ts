import * as net from 'node:net';
import type { DaemonCommand, DaemonResponse } from './protocol.js';
import { DAEMON_SOCKET_PATH, isDaemonResponse, isDaemonEvent, isSocketAlive } from './protocol.js';
import type { EngineFullState } from '../engine/timer-engine.js';

/** Returns true if a daemon is actively accepting connections on the socket. */
export function isDaemonRunning(): Promise<boolean> {
  return isSocketAlive(DAEMON_SOCKET_PATH);
}

export function sendCommand(cmd: DaemonCommand): Promise<DaemonResponse> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(DAEMON_SOCKET_PATH);
    let buffer = '';
    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error('Daemon command timed out'));
    }, 5000);

    socket.on('connect', () => {
      socket.write(JSON.stringify(cmd) + '\n');
    });

    socket.on('data', (data) => {
      buffer += data.toString();
      const newlineIdx = buffer.indexOf('\n');
      if (newlineIdx !== -1) {
        clearTimeout(timeout);
        const line = buffer.slice(0, newlineIdx);
        socket.destroy();
        try {
          const parsed: unknown = JSON.parse(line);
          if (!isDaemonResponse(parsed)) {
            reject(new Error('Malformed response from daemon'));
            return;
          }
          resolve(parsed);
        } catch {
          reject(new Error('Invalid response from daemon'));
        }
      }
    });

    socket.on('error', (err) => {
      clearTimeout(timeout);
      reject(new Error(`Cannot connect to daemon: ${err.message}`));
    });
  });
}

export interface SubscriptionCallbacks {
  onState: (state: EngineFullState) => void;
  onEvent: (event: string, data: unknown) => void;
  onError: (err: Error) => void;
  onClose: () => void;
}

export class DaemonSubscription {
  private socket: net.Socket | null = null;
  private buffer = '';
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private callbacks: SubscriptionCallbacks;
  private disposed = false;
  private reconnectAttempt = 0;
  private pendingCommands: DaemonCommand[] = [];

  private static readonly MAX_RECONNECT_ATTEMPTS = 10;
  private static readonly BASE_DELAY_MS = 500;
  private static readonly MAX_DELAY_MS = 30_000;
  private static readonly MAX_PENDING = 16;
  private static readonly MAX_BUFFER_CHARS = 1 * 1024 * 1024; // 1 M chars

  constructor(callbacks: SubscriptionCallbacks) {
    this.callbacks = callbacks;
  }

  connect(): void {
    if (this.disposed) return;

    // H6: Destroy any lingering socket before creating a new one
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.destroy();
      this.socket = null;
    }

    this.socket = net.createConnection(DAEMON_SOCKET_PATH);

    this.socket.on('connect', () => {
      this.reconnectAttempt = 0;
      this.buffer = '';
      // Subscribe to events
      this.socket!.write(JSON.stringify({ cmd: 'subscribe' }) + '\n');
      // Flush any commands that arrived while disconnected
      for (const queued of this.pendingCommands) {
        this.socket!.write(JSON.stringify(queued) + '\n');
      }
      this.pendingCommands = [];
    });

    this.socket.on('data', (data) => {
      this.buffer += data.toString();

      // H5: Prevent unbounded buffer growth from misbehaving daemon
      if (this.buffer.length > DaemonSubscription.MAX_BUFFER_CHARS) {
        this.buffer = '';
        this.socket?.destroy();
        return;
      }

      let newlineIdx: number;
      while ((newlineIdx = this.buffer.indexOf('\n')) !== -1) {
        const line = this.buffer.slice(0, newlineIdx).trim();
        this.buffer = this.buffer.slice(newlineIdx + 1);
        if (!line) continue;

        try {
          const msg: unknown = JSON.parse(line);
          if (isDaemonResponse(msg)) {
            // Initial state response from subscribe
            if (msg.ok) {
              this.callbacks.onState(msg.state);
            }
          } else if (isDaemonEvent(msg)) {
            // Event broadcast
            if (msg.event === 'tick' || msg.event === 'state:change') {
              this.callbacks.onState(msg.data as EngineFullState);
            }
            this.callbacks.onEvent(msg.event, msg.data);
          }
        } catch {
          // Skip malformed messages
        }
      }
    });

    this.socket.on('close', () => {
      if (!this.disposed) {
        this.callbacks.onClose();
        this.scheduleReconnect();
      }
    });

    this.socket.on('error', (err) => {
      this.callbacks.onError(err);
      if (!this.disposed) {
        this.scheduleReconnect();
      }
    });
  }

  // Send a command through the existing subscription socket
  sendCommand(cmd: DaemonCommand): void {
    if (this.socket && !this.socket.destroyed) {
      this.socket.write(JSON.stringify(cmd) + '\n');
    } else if (this.pendingCommands.length < DaemonSubscription.MAX_PENDING) {
      this.pendingCommands.push(cmd);
    }
  }

  private scheduleReconnect(): void {
    if (this.disposed || this.reconnectTimer) return;

    if (this.reconnectAttempt >= DaemonSubscription.MAX_RECONNECT_ATTEMPTS) {
      this.pendingCommands = [];
      this.callbacks.onError(new Error('Daemon unreachable: max reconnect attempts exceeded'));
      return;
    }

    const delay = Math.min(
      DaemonSubscription.BASE_DELAY_MS * 2 ** this.reconnectAttempt,
      DaemonSubscription.MAX_DELAY_MS,
    );
    this.reconnectAttempt++;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  dispose(): void {
    this.disposed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
  }
}
