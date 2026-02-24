#!/usr/bin/node
import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import Database from 'better-sqlite3';

const dataDir = join(homedir(), '.local', 'share', 'pomodorocli');
mkdirSync(dataDir, { recursive: true });

const dbPath = join(dataDir, 'browser.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS page_visits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL,
    domain TEXT NOT NULL,
    path TEXT NOT NULL DEFAULT '/',
    title TEXT NOT NULL DEFAULT '',
    is_active INTEGER NOT NULL DEFAULT 0,
    is_audible INTEGER NOT NULL DEFAULT 0,
    duration_sec INTEGER NOT NULL DEFAULT 60,
    recorded_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_page_visits_domain ON page_visits(domain);
  CREATE INDEX IF NOT EXISTS idx_page_visits_recorded_at ON page_visits(recorded_at);
`);

const insertStmt = db.prepare(`
  INSERT INTO page_visits (url, domain, path, title, is_active, is_audible, duration_sec, recorded_at)
  VALUES (@url, @domain, @path, @title, @is_active, @is_audible, @duration_sec, @recorded_at)
`);

const insertMany = db.transaction((entries) => {
  for (const entry of entries) {
    insertStmt.run(entry);
  }
});

let buf = Buffer.alloc(0);

function processBuffer() {
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
      if (msg && msg.type === 'tick' && Array.isArray(msg.entries)) {
        insertMany(msg.entries);
      }
    } catch {
      // Skip malformed JSON
    }
  }
}

process.stdin.on('data', (chunk) => {
  buf = Buffer.concat([buf, chunk]);
  processBuffer();
});

process.stdin.on('end', () => {
  db.close();
  process.exit(0);
});

process.stdin.on('error', () => {
  db.close();
  process.exit(0);
});
