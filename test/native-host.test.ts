import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

test('native bridge forwards framed snapshots and exits on daemon disconnect', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pomodoro-bridge-test-'));
  const server = net.createServer();
  server.listen(path.join(dir, 'pomodorocli-daemon.sock'));
  await once(server, 'listening');
  const connection = once(server, 'connection');
  const host = spawn(process.execPath, ['native-host/pomodorocli-host.mjs'], {
    env: { ...process.env, TMPDIR: dir }, stdio: ['pipe', 'pipe', 'pipe'],
  });
  t.after(() => { host.kill(); server.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const [socket] = await connection as [net.Socket];
  const received = once(socket, 'data');
  const message = JSON.stringify({ cmd: 'browser-event', trigger: 'heartbeat' });
  const header = Buffer.alloc(4);
  header.writeUInt32LE(Buffer.byteLength(message));
  host.stdin.write(header.subarray(0, 2));
  host.stdin.write(Buffer.concat([header.subarray(2), Buffer.from(message)]));
  const [data] = await received;
  assert.equal(data.toString(), message + '\n');
  const exited = once(host, 'exit');
  socket.destroy();
  assert.deepEqual(await exited, [0, null]);
});
