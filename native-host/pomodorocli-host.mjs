#!/usr/bin/node
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DAEMON_SOCKET_PATH = join(tmpdir(), 'pomodorocli-daemon.sock');

// The extension owns reconnects and sends a fresh snapshot after reconnecting.
const sock = net.createConnection(DAEMON_SOCKET_PATH);
sock.on('error', () => process.exit(1));
sock.on('close', () => process.exit(0));

let buf = Buffer.alloc(0);

process.stdin.on('data', (chunk) => {
  buf = Buffer.concat([buf, chunk]);
  while (true) {
    if (buf.length < 4) return;

    const msgLen = buf.readUInt32LE(0);
    if (msgLen === 0 || msgLen > 1024 * 1024) {
      buf = buf.subarray(4);
      continue;
    }

    if (buf.length < 4 + msgLen) return;

    const msgBytes = buf.subarray(4, 4 + msgLen);
    buf = buf.subarray(4 + msgLen);

    try {
      const msg = JSON.parse(msgBytes.toString('utf-8'));
      sock.write(JSON.stringify(msg) + '\n');
    } catch {
      // Skip malformed JSON
    }
  }
});

process.stdin.on('end', () => {
  sock.end();
  process.exit(0);
});

process.stdin.on('error', () => {
  sock.end();
  process.exit(0);
});
