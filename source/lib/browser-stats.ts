import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs';
import Database from 'better-sqlite3';

export interface DomainStats {
  domain: string;
  totalMinutes: number;
  activeMinutes: number;
  audibleMinutes: number;
}

export interface PathStats {
  domain: string;
  path: string;
  title: string;
  totalMinutes: number;
}

export interface BrowserStats {
  domains: DomainStats[];
  topPaths: PathStats[];
  totalMinutes: number;
  activeMinutes: number;
  audibleMinutes: number;
}

const DB_PATH = path.join(os.homedir(), '.local', 'share', 'pomodorocli', 'browser.db');

export function getBrowserStatsForDate(date: string): BrowserStats | null {
  if (!fs.existsSync(DB_PATH)) return null;

  let db: InstanceType<typeof Database> | null = null;
  try {
    db = new Database(DB_PATH, { readonly: true });

    const domains = db.prepare(`
      SELECT
        domain,
        ROUND(SUM(duration_sec) / 60.0, 1) as totalMinutes,
        ROUND(SUM(CASE WHEN is_active = 1 THEN duration_sec ELSE 0 END) / 60.0, 1) as activeMinutes,
        ROUND(SUM(CASE WHEN is_audible = 1 THEN duration_sec ELSE 0 END) / 60.0, 1) as audibleMinutes
      FROM page_visits
      WHERE recorded_at LIKE ? || '%'
      GROUP BY domain
      ORDER BY totalMinutes DESC
      LIMIT 15
    `).all(date) as DomainStats[];

    const topPaths = db.prepare(`
      SELECT
        domain,
        path,
        title,
        ROUND(SUM(duration_sec) / 60.0, 1) as totalMinutes
      FROM page_visits
      WHERE recorded_at LIKE ? || '%'
      GROUP BY domain, path
      ORDER BY totalMinutes DESC
      LIMIT 10
    `).all(date) as PathStats[];

    const totals = db.prepare(`
      SELECT
        ROUND(SUM(duration_sec) / 60.0, 1) as totalMinutes,
        ROUND(SUM(CASE WHEN is_active = 1 THEN duration_sec ELSE 0 END) / 60.0, 1) as activeMinutes,
        ROUND(SUM(CASE WHEN is_audible = 1 THEN duration_sec ELSE 0 END) / 60.0, 1) as audibleMinutes
      FROM page_visits
      WHERE recorded_at LIKE ? || '%'
    `).get(date) as { totalMinutes: number; activeMinutes: number; audibleMinutes: number } | undefined;

    return {
      domains,
      topPaths,
      totalMinutes: totals?.totalMinutes ?? 0,
      activeMinutes: totals?.activeMinutes ?? 0,
      audibleMinutes: totals?.audibleMinutes ?? 0,
    };
  } catch {
    return null;
  } finally {
    db?.close();
  }
}
