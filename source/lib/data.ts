import * as fs from 'node:fs';
import * as path from 'node:path';
import { loadSessions, getDataDir, getSessionsPath, getSessionsDbPath } from './store.js';
import { importSessions } from './session-db.js';
import type { Session } from '../types.js';

// --- CSV / Import Safety Helpers ---

const FORMULA_PREFIXES = /^[=+\-@\t\r]/;

function escapeCSVField(value: string): string {
  let safe = value;
  if (FORMULA_PREFIXES.test(safe)) {
    safe = "'" + safe;
  }
  return '"' + safe.replace(/"/g, '""') + '"';
}

function stripFormulaPrefix(value: string): string {
  return value.startsWith("'") && FORMULA_PREFIXES.test(value.slice(1))
    ? value.slice(1) : value;
}

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let i = 0;
  while (i <= line.length) {
    if (i === line.length) { fields.push(''); break; }
    if (line[i] === '"') {
      let value = '';
      i++; // skip opening quote
      while (i < line.length) {
        if (line[i] === '"') {
          if (line[i + 1] === '"') { value += '"'; i += 2; }
          else { i++; break; }
        } else { value += line[i]!; i++; }
      }
      fields.push(value);
      if (line[i] === ',') i++;
    } else {
      const next = line.indexOf(',', i);
      if (next === -1) { fields.push(line.slice(i)); break; }
      fields.push(line.slice(i, next));
      i = next + 1;
    }
  }
  return fields;
}

// --- Session Validation ---

const VALID_TYPES = new Set(['work', 'short-break', 'long-break']);
const VALID_STATUSES = new Set(['completed', 'skipped', 'abandoned']);
const VALID_ENERGY = new Set(['high', 'medium', 'low']);
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

interface ValidationResult { valid: boolean; errors: string[]; }

function validateSession(data: unknown): ValidationResult {
  const errors: string[] = [];
  if (typeof data !== 'object' || data === null)
    return { valid: false, errors: ['Session is not an object'] };
  const s = data as Record<string, unknown>;

  // Required strings
  if (typeof s['id'] !== 'string' || s['id'].length === 0)
    errors.push('id: required non-empty string');
  if (!VALID_TYPES.has(s['type'] as string))
    errors.push(`type: must be one of ${[...VALID_TYPES].join(', ')}`);
  if (!VALID_STATUSES.has(s['status'] as string))
    errors.push(`status: must be one of ${[...VALID_STATUSES].join(', ')}`);
  if (typeof s['startedAt'] !== 'string' || !ISO_DATE_RE.test(s['startedAt']))
    errors.push('startedAt: required ISO date string');
  if (typeof s['endedAt'] !== 'string' || !ISO_DATE_RE.test(s['endedAt']))
    errors.push('endedAt: required ISO date string');

  // Required numbers
  if (typeof s['durationPlanned'] !== 'number' || !Number.isFinite(s['durationPlanned']) || s['durationPlanned'] < 0)
    errors.push('durationPlanned: required non-negative finite number');
  if (typeof s['durationActual'] !== 'number' || !Number.isFinite(s['durationActual']) || s['durationActual'] < 0)
    errors.push('durationActual: required non-negative finite number');

  // Optional strings
  for (const field of ['label', 'project', 'tag'] as const) {
    if (s[field] !== undefined && typeof s[field] !== 'string')
      errors.push(`${field}: must be a string if present`);
  }

  // Optional energyLevel
  if (s['energyLevel'] !== undefined && !VALID_ENERGY.has(s['energyLevel'] as string))
    errors.push(`energyLevel: must be one of ${[...VALID_ENERGY].join(', ')} if present`);

  // Optional distractionScore
  if (s['distractionScore'] !== undefined) {
    if (typeof s['distractionScore'] !== 'number' || !Number.isInteger(s['distractionScore'])
        || s['distractionScore'] < 0 || s['distractionScore'] > 10)
      errors.push('distractionScore: must be an integer 0-10 if present');
  }

  // intervals array
  if (s['intervals'] !== undefined) {
    if (!Array.isArray(s['intervals']))
      errors.push('intervals: must be an array');
    else
      (s['intervals'] as unknown[]).forEach((iv: unknown, idx: number) => {
        if (typeof iv !== 'object' || iv === null) {
          errors.push(`intervals[${idx}]: not an object`);
          return;
        }
        const w = iv as Record<string, unknown>;
        if (typeof w['start'] !== 'string' || !ISO_DATE_RE.test(w['start']))
          errors.push(`intervals[${idx}].start: must be ISO date string`);
        if (w['end'] !== null && (typeof w['end'] !== 'string' || !ISO_DATE_RE.test(w['end'])))
          errors.push(`intervals[${idx}].end: must be ISO date string or null`);
      });
  }

  return { valid: errors.length === 0, errors };
}

// --- Export / Import ---

export function handleExport(outputPath?: string): void {
  const sessions = loadSessions();
  if (sessions.length === 0) {
    console.log('No sessions to export.');
    return;
  }

  const headers = [
    'id', 'type', 'status', 'label', 'project', 'tag',
    'energyLevel', 'distractionScore', 'startedAt', 'endedAt',
    'durationPlanned', 'durationActual', 'intervals',
  ];

  const rows = sessions.map(s => [
    s.id, s.type, s.status, s.label ?? '', s.project ?? '', s.tag ?? '',
    s.energyLevel ?? '', s.distractionScore?.toString() ?? '', s.startedAt, s.endedAt,
    s.durationPlanned.toString(), s.durationActual.toString(),
    JSON.stringify(s.intervals ?? []),
  ]);

  const csv = [
    headers.join(','),
    ...rows.map(r => r.map(v => escapeCSVField(String(v))).join(',')),
  ].join('\n');
  const out = outputPath ?? 'sessions.csv';
  fs.writeFileSync(out, csv + '\n', 'utf-8');
  console.log(`Exported ${sessions.length} sessions to ${out}`);
}

export function handleImport(filePath: string): void {
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.json') {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    if (!Array.isArray(raw)) {
      console.error('JSON file must contain an array of sessions.');
      process.exit(1);
    }
    const validSessions: Session[] = [];
    let skipped = 0;

    for (let i = 0; i < raw.length; i++) {
      const result = validateSession(raw[i]);
      if (!result.valid) {
        console.error(`Session at index ${i} is invalid, skipping:`);
        result.errors.forEach(e => console.error(`  - ${e}`));
        skipped++;
        continue;
      }
      const session = raw[i] as Session;
      session.intervals = session.intervals ?? [];
      validSessions.push(session);
    }
    const imported = importSessions(validSessions);
    skipped += validSessions.length - imported;
    console.log(`Imported ${imported} sessions (${skipped} skipped).`);
  } else if (ext === '.csv') {
    const lines = fs.readFileSync(filePath, 'utf-8').trim().split('\n');
    if (lines.length < 2) {
      console.log('CSV file is empty or has no data rows.');
      return;
    }
    const headers = parseCSVLine(lines[0]!);
    const validSessions: Session[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]!);
      const obj: Record<string, string> = {};
      headers.forEach((h, idx) => { obj[h] = values[idx] ?? ''; });

      // Strip formula prefixes from string fields
      for (const field of ['label', 'project', 'tag']) {
        if (obj[field]) obj[field] = stripFormulaPrefix(obj[field]!);
      }

      let intervals: Session['intervals'] = [];
      if (obj['intervals']) {
        try { intervals = JSON.parse(obj['intervals']); } catch { intervals = []; }
      }
      const session: Session = {
        id: obj['id']!,
        type: obj['type'] as Session['type'],
        status: obj['status'] as Session['status'],
        label: obj['label'] || undefined,
        project: obj['project'] || undefined,
        tag: obj['tag'] || undefined,
        energyLevel: (obj['energyLevel'] || undefined) as Session['energyLevel'],
        distractionScore: obj['distractionScore'] ? parseInt(obj['distractionScore'], 10) : undefined,
        startedAt: obj['startedAt']!,
        endedAt: obj['endedAt']!,
        durationPlanned: parseInt(obj['durationPlanned']!, 10),
        durationActual: parseInt(obj['durationActual']!, 10),
        intervals,
      };

      const result = validateSession(session);
      if (!result.valid) {
        console.error(`Row ${i} invalid, skipping: ${result.errors.join('; ')}`);
        continue;
      }

      validSessions.push(session);
    }

    const imported = importSessions(validSessions);
    console.log(`Imported ${imported} sessions from CSV.`);
  } else {
    console.error('Unsupported file format. Use .json or .csv');
    process.exit(1);
  }
}

export function handleBackup(): void {
  const dataDir = getDataDir();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupDir = path.join(dataDir, 'backups');
  fs.mkdirSync(backupDir, { recursive: true });

  let backed = false;

  // Back up SQLite database
  const dbPath = getSessionsDbPath();
  if (fs.existsSync(dbPath)) {
    const dest = path.join(backupDir, `sessions-${timestamp}.db`);
    fs.copyFileSync(dbPath, dest);
    console.log(`Backup created: ${dest}`);
    backed = true;
  }

  // Also back up legacy JSON if it still exists
  const sessionsPath = getSessionsPath();
  if (fs.existsSync(sessionsPath)) {
    const dest = path.join(backupDir, `sessions-${timestamp}.json`);
    fs.copyFileSync(sessionsPath, dest);
    console.log(`Backup created: ${dest}`);
    backed = true;
  }

  if (!backed) {
    console.log('No session data to back up.');
  }
}
