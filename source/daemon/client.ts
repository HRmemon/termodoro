import * as net from 'node:net';
import * as fs from 'node:fs';
import type { DaemonCommand, DaemonResponse, DaemonEvent } from './protocol.js';
import { DAEMON_SOCKET_PATH, DAEMON_PID_PATH } from './protocol.js';
import type { EngineFullState } from '../engine/timer-engine.js';

export function isDaemonRunning(): boolean {
  try {
    if (!fs.existsSync(DAEMON_PID_PATH)) return false;
    const pid = parseInt(fs.readFileSync(DAEMON_PID_PATH, 'utf-8').trim(), 10);
    // Check if process is alive
    process.kill(pid, 0);
    return fs.existsSync(DAEMON_SOCKET_PATH);
  } catch {
    return false;
  }
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
          resolve(JSON.parse(line) as DaemonResponse);
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

  constructor(callbacks: SubscriptionCallbacks) {
    this.callbacks = callbacks;
  }

  connect(): void {
    if (this.disposed) return;

    this.socket = net.createConnection(DAEMON_SOCKET_PATH);

    this.socket.on('connect', () => {
      this.buffer = '';
      // Subscribe to events
      this.socket!.write(JSON.stringify({ cmd: 'subscribe' }) + '\n');
    });

    this.socket.on('data', (data) => {
      this.buffer += data.toString();
      let newlineIdx: number;
      while ((newlineIdx = this.buffer.indexOf('\n')) !== -1) {
        const line = this.buffer.slice(0, newlineIdx).trim();
        this.buffer = this.buffer.slice(newlineIdx + 1);
        if (!line) continue;

        try {
          const msg = JSON.parse(line);
          if ('ok' in msg) {
            // Initial state response from subscribe
            const resp = msg as DaemonResponse;
            if (resp.ok) {
              this.callbacks.onState(resp.state);
            }
          } else if ('event' in msg) {
            // Event broadcast
            const evt = msg as DaemonEvent;
            if (evt.event === 'tick' || evt.event === 'state:change') {
              this.callbacks.onState(evt.data as EngineFullState);
            }
            this.callbacks.onEvent(evt.event, evt.data);
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
    }
  }

  private scheduleReconnect(): void {
    if (this.disposed || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 2000);
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
