import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs';
import Database from 'better-sqlite3';
import type { Session, WorkInterval } from '../types.js';

const DATA_DIR = path.join(os.homedir(), '.local', 'share', 'pomodorocli');
const DB_PATH = path.join(DATA_DIR, 'sessions.db');
const JSON_PATH = path.join(DATA_DIR, 'sessions.json');

let _db: InstanceType<typeof Database> | null = null;

function getDb(): InstanceType<typeof Database> {
  if (_db) return _db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('busy_timeout = 5000');
  _db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      status TEXT NOT NULL,
      label TEXT,
      project TEXT,
      tag TEXT,
      energy_level TEXT,
      distraction_score REAL,
      started_at TEXT NOT NULL,
      ended_at TEXT NOT NULL,
      duration_planned INTEGER NOT NULL,
      duration_actual INTEGER NOT NULL,
      intervals_json TEXT NOT NULL DEFAULT '[]'
    )
  `);
  _db.exec('CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions(started_at)');
  return _db;
}

function sessionToRow(s: Session) {
  return {
    id: s.id,
    type: s.type,
    status: s.status,
    label: s.label ?? null,
    project: s.project ?? null,
    tag: s.tag ?? null,
    energy_level: s.energyLevel ?? null,
    distraction_score: s.distractionScore ?? null,
    started_at: s.startedAt,
    ended_at: s.endedAt,
    duration_planned: s.durationPlanned,
    duration_actual: s.durationActual,
    intervals_json: JSON.stringify(s.intervals ?? []),
  };
}

function rowToSession(row: Record<string, unknown>): Session {
  let intervals: WorkInterval[] = [];
  try {
    intervals = JSON.parse(row['intervals_json'] as string);
  } catch { /* empty */ }

  return {
    id: row['id'] as string,
    type: row['type'] as Session['type'],
    status: row['status'] as Session['status'],
    label: (row['label'] as string) ?? undefined,
    project: (row['project'] as string) ?? undefined,
    tag: (row['tag'] as string) ?? undefined,
    energyLevel: (row['energy_level'] as Session['energyLevel']) ?? undefined,
    distractionScore: row['distraction_score'] != null ? (row['distraction_score'] as number) : undefined,
    startedAt: row['started_at'] as string,
    endedAt: row['ended_at'] as string,
    durationPlanned: row['duration_planned'] as number,
    durationActual: row['duration_actual'] as number,
    intervals,
  };
}

export function insertSession(session: Session): void {
  const db = getDb();
  const row = sessionToRow(session);
  db.prepare(`
    INSERT OR IGNORE INTO sessions
      (id, type, status, label, project, tag, energy_level, distraction_score,
       started_at, ended_at, duration_planned, duration_actual, intervals_json)
    VALUES
      (@id, @type, @status, @label, @project, @tag, @energy_level, @distraction_score,
       @started_at, @ended_at, @duration_planned, @duration_actual, @intervals_json)
  `).run(row);
}

export function getAllSessions(): Session[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM sessions ORDER BY started_at').all() as Record<string, unknown>[];
  return rows.map(rowToSession);
}

export function replaceAllSessions(sessions: Session[]): void {
  const db = getDb();
  const insert = db.prepare(`
    INSERT INTO sessions
      (id, type, status, label, project, tag, energy_level, distraction_score,
       started_at, ended_at, duration_planned, duration_actual, intervals_json)
    VALUES
      (@id, @type, @status, @label, @project, @tag, @energy_level, @distraction_score,
       @started_at, @ended_at, @duration_planned, @duration_actual, @intervals_json)
  `);

  db.transaction(() => {
    db.exec('DELETE FROM sessions');
    for (const s of sessions) {
      insert.run(sessionToRow(s));
    }
  })();
}

export function importSessions(sessions: Session[]): number {
  const db = getDb();
  const insert = db.prepare(`
    INSERT OR IGNORE INTO sessions
      (id, type, status, label, project, tag, energy_level, distraction_score,
       started_at, ended_at, duration_planned, duration_actual, intervals_json)
    VALUES
      (@id, @type, @status, @label, @project, @tag, @energy_level, @distraction_score,
       @started_at, @ended_at, @duration_planned, @duration_actual, @intervals_json)
  `);

  let imported = 0;
  db.transaction(() => {
    for (const s of sessions) {
      const result = insert.run(sessionToRow(s));
      if (result.changes > 0) imported++;
    }
  })();
  return imported;
}

export function updateSession(session: Session): void {
  const db = getDb();
  const row = sessionToRow(session);
  db.prepare(`
    UPDATE sessions SET
      type = @type, status = @status, label = @label, project = @project,
      tag = @tag, energy_level = @energy_level, distraction_score = @distraction_score,
      started_at = @started_at, ended_at = @ended_at,
      duration_planned = @duration_planned, duration_actual = @duration_actual,
      intervals_json = @intervals_json
    WHERE id = @id
  `).run(row);
}

export function migrateFromJson(): { migrated: number; skipped: boolean } {
  const db = getDb();

  // Only migrate if JSON exists AND SQLite table is empty
  if (!fs.existsSync(JSON_PATH)) {
    return { migrated: 0, skipped: true };
  }

  const count = (db.prepare('SELECT COUNT(*) as cnt FROM sessions').get() as { cnt: number }).cnt;
  if (count > 0) {
    return { migrated: 0, skipped: true };
  }

  let sessions: Session[];
  try {
    const raw = JSON.parse(fs.readFileSync(JSON_PATH, 'utf-8'));
    if (!Array.isArray(raw)) return { migrated: 0, skipped: true };
    // Normalize legacy sessions missing intervals field
    sessions = raw.map((s: Session) => s.intervals ? s : { ...s, intervals: [] });
  } catch {
    return { migrated: 0, skipped: true };
  }

  const insert = db.prepare(`
    INSERT OR IGNORE INTO sessions
      (id, type, status, label, project, tag, energy_level, distraction_score,
       started_at, ended_at, duration_planned, duration_actual, intervals_json)
    VALUES
      (@id, @type, @status, @label, @project, @tag, @energy_level, @distraction_score,
       @started_at, @ended_at, @duration_planned, @duration_actual, @intervals_json)
  `);

  let migrated = 0;
  db.transaction(() => {
    for (const s of sessions) {
      const result = insert.run(sessionToRow(s));
      if (result.changes > 0) migrated++;
    }
  })();

  // Rename JSON as backup
  try {
    fs.renameSync(JSON_PATH, JSON_PATH + '.migrated');
  } catch { /* ignore */ }

  return { migrated, skipped: false };
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}

export function getDbPath(): string {
  return DB_PATH;
}
