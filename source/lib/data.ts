import * as fs from 'node:fs';
import * as path from 'node:path';
import { loadSessions, saveSessions, getDataDir, getSessionsPath } from './store.js';
import type { Session } from '../types.js';

export function handleExport(outputPath?: string): void {
  const sessions = loadSessions();
  if (sessions.length === 0) {
    console.log('No sessions to export.');
    return;
  }

  const headers = [
    'id', 'type', 'status', 'label', 'project', 'tag',
    'energyLevel', 'distractionScore', 'startedAt', 'endedAt',
    'durationPlanned', 'durationActual',
  ];

  const rows = sessions.map(s => [
    s.id, s.type, s.status, s.label ?? '', s.project ?? '', s.tag ?? '',
    s.energyLevel ?? '', s.distractionScore?.toString() ?? '', s.startedAt, s.endedAt,
    s.durationPlanned.toString(), s.durationActual.toString(),
  ]);

  const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${v}"`).join(','))].join('\n');
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
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Session[];
    const existing = loadSessions();
    const existingIds = new Set(existing.map(s => s.id));
    const newSessions = data.filter(s => !existingIds.has(s.id));
    saveSessions([...existing, ...newSessions]);
    console.log(`Imported ${newSessions.length} new sessions (${data.length - newSessions.length} duplicates skipped).`);
  } else if (ext === '.csv') {
    const lines = fs.readFileSync(filePath, 'utf-8').trim().split('\n');
    if (lines.length < 2) {
      console.log('CSV file is empty or has no data rows.');
      return;
    }
    const headers = lines[0]!.split(',');
    const existing = loadSessions();
    const existingIds = new Set(existing.map(s => s.id));
    let imported = 0;

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i]!.match(/(".*?"|[^,]+)/g)?.map(v => v.replace(/^"|"$/g, '')) ?? [];
      const obj: Record<string, string> = {};
      headers.forEach((h, idx) => { obj[h] = values[idx] ?? ''; });

      if (existingIds.has(obj['id']!)) continue;

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
      };
      existing.push(session);
      imported++;
    }

    saveSessions(existing);
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

  const sessionsPath = getSessionsPath();
  if (fs.existsSync(sessionsPath)) {
    const dest = path.join(backupDir, `sessions-${timestamp}.json`);
    fs.copyFileSync(sessionsPath, dest);
    console.log(`Backup created: ${dest}`);
  } else {
    console.log('No session data to back up.');
  }
}
