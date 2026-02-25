#!/usr/bin/node
import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync, readFileSync } from 'node:fs';
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

const STATUS_PATH = '/tmp/pomodorocli-status.json';
const CONFIG_PATH = join(dataDir, 'tracker-config.json');

function isWorkSessionActive() {
  try {
    const raw = readFileSync(STATUS_PATH, 'utf-8');
    const s = JSON.parse(raw);
    return s.isRunning && !s.isPaused && s.sessionType === 'work';
  } catch {
    return false;
  }
}

function loadDomainRules() {
  try {
    const raw = readFileSync(CONFIG_PATH, 'utf-8');
    const cfg = JSON.parse(raw);
    return Array.isArray(cfg.domainRules) ? cfg.domainRules : [];
  } catch {
    return [];
  }
}

function globToRegex(pattern) {
  return pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
}

function matchDomain(domain, rules) {
  for (const rule of rules) {
    if (rule.pattern.includes('/')) continue;
    const regex = new RegExp(`^${globToRegex(rule.pattern)}$`, 'i');
    if (regex.test(domain)) return rule.category;
  }
  return null;
}

function matchUrl(domain, path, rules) {
  for (const rule of rules) {
    if (rule.pattern.includes('/')) {
      const slashIdx = rule.pattern.indexOf('/');
      const domainPart = rule.pattern.slice(0, slashIdx);
      const pathPart = rule.pattern.slice(slashIdx);
      const domainRe = new RegExp(`^${globToRegex(domainPart)}$`, 'i');
      const pathRe = new RegExp(`^${globToRegex(pathPart)}`, 'i');
      if (domainRe.test(domain) && pathRe.test(path)) return rule.category;
    } else {
      const regex = new RegExp(`^${globToRegex(rule.pattern)}$`, 'i');
      if (regex.test(domain)) return rule.category;
    }
  }
  return null;
}

function sendMessage(msg) {
  const json = Buffer.from(JSON.stringify(msg), 'utf-8');
  const len = Buffer.alloc(4);
  len.writeUInt32LE(json.length, 0);
  process.stdout.write(len);
  process.stdout.write(json);
}

function handleCheck(msg) {
  if (!isWorkSessionActive()) return;
  const rules = loadDomainRules();
  const category = msg.path
    ? matchUrl(msg.domain, msg.path, rules)
    : matchDomain(msg.domain, rules);
  if (category === 'W') {
    sendMessage({ type: 'warn', domain: msg.domain });
  }
}

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
      } else if (msg && msg.type === 'check' && msg.domain) {
        handleCheck(msg);
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
