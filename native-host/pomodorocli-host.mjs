#!/usr/bin/node
import net from 'node:net';
import { homedir } from 'node:os';
import { join } from 'node:path';

const DAEMON_SOCKET_PATH = join(homedir(), '.local', 'share', 'pomodorocli', 'daemon.sock');

let sock = null;

function connectSocket() {
  if (sock) return;
  sock = net.createConnection(DAEMON_SOCKET_PATH);
  sock.on('error', () => {
    sock = null;
  });
  sock.on('close', () => {
    sock = null;
  });
}

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
      if (!sock) connectSocket();
      if (sock) {
        sock.write(JSON.stringify(msg) + '\n');
      }
    } catch {
      // Skip malformed JSON
    }
  }
});

process.stdin.on('end', () => {
  if (sock) sock.end();
  process.exit(0);
});

process.stdin.on('error', () => {
  if (sock) sock.end();
  process.exit(0);
});

connectSocket();
