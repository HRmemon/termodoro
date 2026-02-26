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

export interface SlotDomainBreakdown {
  time: string;        // "09:00", "09:30"
  domain: string;      // dominant domain
  path?: string;       // dominant path in slot
  activeMinutes: number;
}

export function getAllDomains(): string[] {
  if (!fs.existsSync(DB_PATH)) return [];

  let db: InstanceType<typeof Database> | null = null;
  try {
    db = new Database(DB_PATH, { readonly: true });
    const rows = db.prepare(`
      SELECT domain, SUM(duration_sec) as total
      FROM page_visits
      GROUP BY domain
      ORDER BY total DESC
    `).all() as { domain: string; total: number }[];
    return rows.map(r => r.domain);
  } catch {
    return [];
  } finally {
    db?.close();
  }
}

export function getSlotDomainBreakdown(date: string): SlotDomainBreakdown[] {
  if (!fs.existsSync(DB_PATH)) return [];

  let db: InstanceType<typeof Database> | null = null;
  try {
    db = new Database(DB_PATH, { readonly: true });

    // Group by 30-min time slots, find dominant domain+path per slot
    const rows = db.prepare(`
      SELECT
        PRINTF('%02d:', CAST(strftime('%H', recorded_at) AS INTEGER)) ||
        CASE WHEN CAST(strftime('%M', recorded_at) AS INTEGER) < 30 THEN '00' ELSE '30' END as time_slot,
        domain,
        path,
        ROUND(SUM(CASE WHEN is_active = 1 THEN duration_sec ELSE 0 END) / 60.0, 1) as activeMinutes
      FROM page_visits
      WHERE recorded_at LIKE ? || '%'
      GROUP BY time_slot, domain, path
      ORDER BY time_slot, activeMinutes DESC
    `).all(date) as { time_slot: string; domain: string; path: string; activeMinutes: number }[];

    // Pick dominant domain+path per slot
    const slotMap = new Map<string, SlotDomainBreakdown>();
    for (const row of rows) {
      if (!slotMap.has(row.time_slot) || row.activeMinutes > slotMap.get(row.time_slot)!.activeMinutes) {
        slotMap.set(row.time_slot, {
          time: row.time_slot,
          domain: row.domain,
          path: row.path,
          activeMinutes: row.activeMinutes,
        });
      }
    }

    return [...slotMap.values()];
  } catch {
    return [];
  } finally {
    db?.close();
  }
}

export function getBrowserStatsForRange(startDate: string, endDate: string): BrowserStats | null {
  if (!fs.existsSync(DB_PATH)) return null;

  let db: InstanceType<typeof Database> | null = null;
  try {
    // Create index for performance (requires write access, separate from readonly query connection)
    try {
      const writeDb = new Database(DB_PATH);
      writeDb.exec(`CREATE INDEX IF NOT EXISTS idx_page_visits_recorded_at ON page_visits(recorded_at)`);
      writeDb.close();
    } catch { /* index creation is best-effort */ }

    db = new Database(DB_PATH, { readonly: true });

    // For all-time queries (startDate = '2000-01-01'), omit WHERE clause to skip full-table date scan.
    // For date ranges, use string comparison (ISO format) which allows index usage.
    const isAllTime = startDate === '2000-01-01';
    const nextDay = (() => {
      const d = new Date(endDate + 'T00:00:00');
      d.setDate(d.getDate() + 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    })();

    const whereClause = isAllTime ? '' : `WHERE recorded_at >= ? AND recorded_at < ?`;
    const params = isAllTime ? [] : [startDate, nextDay];

    const domains = db.prepare(`
      SELECT
        domain,
        ROUND(SUM(duration_sec) / 60.0, 1) as totalMinutes,
        ROUND(SUM(CASE WHEN is_active = 1 THEN duration_sec ELSE 0 END) / 60.0, 1) as activeMinutes,
        ROUND(SUM(CASE WHEN is_audible = 1 THEN duration_sec ELSE 0 END) / 60.0, 1) as audibleMinutes
      FROM page_visits
      ${whereClause}
      GROUP BY domain
      ORDER BY totalMinutes DESC
    `).all(...params) as DomainStats[];

    const topPaths = db.prepare(`
      SELECT
        domain,
        path,
        title,
        ROUND(SUM(duration_sec) / 60.0, 1) as totalMinutes
      FROM page_visits
      ${whereClause}
      GROUP BY domain, path
      ORDER BY totalMinutes DESC
    `).all(...params) as PathStats[];

    const totals = db.prepare(`
      SELECT
        ROUND(SUM(duration_sec) / 60.0, 1) as totalMinutes,
        ROUND(SUM(CASE WHEN is_active = 1 THEN duration_sec ELSE 0 END) / 60.0, 1) as activeMinutes,
        ROUND(SUM(CASE WHEN is_audible = 1 THEN duration_sec ELSE 0 END) / 60.0, 1) as audibleMinutes
      FROM page_visits
      ${whereClause}
    `).get(...params) as { totalMinutes: number; activeMinutes: number; audibleMinutes: number } | undefined;

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

export function getPathPatternStats(startDate: string, endDate: string, patterns: string[]): DomainStats[] {
  if (!fs.existsSync(DB_PATH) || patterns.length === 0) return [];

  let db: InstanceType<typeof Database> | null = null;
  try {
    db = new Database(DB_PATH, { readonly: true });

    const results: DomainStats[] = [];
    for (const pattern of patterns) {
      const slashIdx = pattern.indexOf('/');
      if (slashIdx < 0) continue;
      const domainPart = pattern.slice(0, slashIdx);
      const pathPart = pattern.slice(slashIdx);

      // Convert glob to SQL LIKE pattern
      const domainLike = domainPart.replace(/\*/g, '%');
      const pathLike = pathPart.replace(/\*/g, '%');

      const row = db.prepare(`
        SELECT
          ROUND(SUM(duration_sec) / 60.0, 1) as totalMinutes,
          ROUND(SUM(CASE WHEN is_active = 1 THEN duration_sec ELSE 0 END) / 60.0, 1) as activeMinutes,
          ROUND(SUM(CASE WHEN is_audible = 1 THEN duration_sec ELSE 0 END) / 60.0, 1) as audibleMinutes
        FROM page_visits
        WHERE date(recorded_at) BETWEEN ? AND ?
          AND domain LIKE ?
          AND path LIKE ?
      `).get(startDate, endDate, domainLike, pathLike) as { totalMinutes: number; activeMinutes: number; audibleMinutes: number } | undefined;

      if (row && row.totalMinutes > 0) {
        results.push({
          domain: pattern.replace(/\/\*$/, '').replace(/\*/, ''),
          totalMinutes: row.totalMinutes,
          activeMinutes: row.activeMinutes,
          audibleMinutes: row.audibleMinutes,
        });
      }
    }
    return results;
  } catch {
    return [];
  } finally {
    db?.close();
  }
}

export function getAllDomainPaths(): string[] {
  if (!fs.existsSync(DB_PATH)) return [];

  let db: InstanceType<typeof Database> | null = null;
  try {
    db = new Database(DB_PATH, { readonly: true });
    const rows = db.prepare(`
      SELECT domain, path, SUM(duration_sec) as total
      FROM page_visits
      GROUP BY domain, path
      ORDER BY total DESC
      LIMIT 200
    `).all() as { domain: string; path: string; total: number }[];

    // Build domain/path-prefix combos (first path segment)
    const seen = new Set<string>();
    const results: string[] = [];
    for (const r of rows) {
      // Extract first path segment: /shorts/xyz → /shorts
      const segments = r.path.split('/').filter(Boolean);
      if (segments.length > 0) {
        const prefix = `${r.domain}/${segments[0]}/*`;
        if (!seen.has(prefix)) {
          seen.add(prefix);
          results.push(prefix);
        }
      }
    }
    return results;
  } catch {
    return [];
  } finally {
    db?.close();
  }
}

function fmtMin(minutes: number): string {
  if (minutes < 1) return '0m';
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${Math.round(minutes)}m`;
}

export function generateHtmlReport(startDate: string, endDate: string, rules: { pattern: string; category: string }[]): string | null {
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
      WHERE date(recorded_at) BETWEEN ? AND ?
      GROUP BY domain
      ORDER BY totalMinutes DESC
    `).all(startDate, endDate) as DomainStats[];

    const pages = db.prepare(`
      SELECT
        domain, path, title,
        ROUND(SUM(duration_sec) / 60.0, 1) as totalMinutes
      FROM page_visits
      WHERE date(recorded_at) BETWEEN ? AND ?
      GROUP BY domain, path
      ORDER BY totalMinutes DESC
    `).all(startDate, endDate) as PathStats[];

    const hourly = db.prepare(`
      SELECT
        CAST(strftime('%H', recorded_at) AS INTEGER) as hour,
        ROUND(SUM(CASE WHEN is_active = 1 THEN duration_sec ELSE 0 END) / 60.0, 1) as activeMinutes
      FROM page_visits
      WHERE date(recorded_at) BETWEEN ? AND ?
      GROUP BY hour
      ORDER BY hour
    `).all(startDate, endDate) as { hour: number; activeMinutes: number }[];

    const totals = db.prepare(`
      SELECT
        ROUND(SUM(duration_sec) / 60.0, 1) as totalMinutes,
        ROUND(SUM(CASE WHEN is_active = 1 THEN duration_sec ELSE 0 END) / 60.0, 1) as activeMinutes,
        ROUND(SUM(CASE WHEN is_audible = 1 THEN duration_sec ELSE 0 END) / 60.0, 1) as audibleMinutes
      FROM page_visits
      WHERE date(recorded_at) BETWEEN ? AND ?
    `).get(startDate, endDate) as { totalMinutes: number; activeMinutes: number; audibleMinutes: number } | undefined;

    db.close();
    db = null;

    const maxDomain = domains.length > 0 ? domains[0]!.totalMinutes : 1;
    const maxHour = hourly.length > 0 ? Math.max(...hourly.map(h => h.activeMinutes)) : 1;

    // Build flagged map
    const flaggedMap = new Map<string, string>();
    for (const rule of rules) {
      if (rule.pattern.includes('/')) continue;
      const escaped = rule.pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
      const regex = new RegExp(`^${escaped}$`, 'i');
      for (const d of domains) {
        if (regex.test(d.domain)) flaggedMap.set(d.domain, rule.category);
      }
    }

    const catColors: Record<string, string> = {
      D: '#00bcd4', hD: '#42a5f5', E: '#4caf50', O: '#ffb300',
      S: '#1565c0', N: '#9e9e9e', W: '#e53935', SF: '#ff1744', WU: '#e040fb',
    };

    const domainBars = domains.map(d => {
      const pct = Math.max(1, (d.totalMinutes / maxDomain) * 100);
      const cat = flaggedMap.get(d.domain);
      const color = cat ? (catColors[cat] ?? '#888') : '#888';
      const badge = cat ? ` <span style="color:${color};font-weight:bold">[${cat}]</span>` : '';
      return `<div style="margin:2px 0"><span style="display:inline-block;width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(d.domain)}${badge}</span><span style="display:inline-block;width:${pct}%;max-width:400px;background:${color};height:16px;border-radius:3px;vertical-align:middle"></span> <span>${fmtMin(d.totalMinutes)}</span></div>`;
    }).join('\n');

    const pageRows = pages.slice(0, 100).map(p => {
      const title = p.title || p.path;
      return `<tr><td style="padding:2px 8px">${fmtMin(p.totalMinutes)}</td><td style="padding:2px 8px;max-width:500px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(title)}</td><td style="padding:2px 8px;color:#888">${escHtml(p.domain)}${escHtml(p.path)}</td></tr>`;
    }).join('\n');

    const hourBars = Array.from({ length: 24 }, (_, h) => {
      const entry = hourly.find(e => e.hour === h);
      const mins = entry?.activeMinutes ?? 0;
      const pct = Math.max(0, (mins / maxHour) * 100);
      return `<div style="margin:1px 0"><span style="display:inline-block;width:40px;text-align:right;color:#888">${String(h).padStart(2, '0')}:00</span> <span style="display:inline-block;width:${pct}%;max-width:400px;background:#e040fb;height:14px;border-radius:2px;vertical-align:middle"></span> <span style="color:#aaa">${mins > 0 ? fmtMin(mins) : ''}</span></div>`;
    }).join('\n');

    // Flagged domains section
    const flaggedByCategory = new Map<string, DomainStats[]>();
    for (const [domain, cat] of flaggedMap) {
      const d = domains.find(dd => dd.domain === domain);
      if (d) {
        if (!flaggedByCategory.has(cat)) flaggedByCategory.set(cat, []);
        flaggedByCategory.get(cat)!.push(d);
      }
    }
    const flaggedSection = flaggedByCategory.size > 0 ? Array.from(flaggedByCategory.entries()).map(([cat, ds]) => {
      const color = catColors[cat] ?? '#888';
      const items = ds.map(d => `<li>${escHtml(d.domain)} — ${fmtMin(d.totalMinutes)} (active: ${fmtMin(d.activeMinutes)})</li>`).join('');
      return `<h3 style="color:${color}">${escHtml(cat)}</h3><ul>${items}</ul>`;
    }).join('\n') : '<p style="color:#888">No flagged domains.</p>';

    return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Web Report ${startDate} to ${endDate}</title>
<style>
  body { background:#1a1a2e; color:#e0e0e0; font-family:monospace; padding:20px; max-width:900px; margin:0 auto }
  h1,h2,h3 { color:#e040fb } h2 { border-bottom:1px solid #333; padding-bottom:4px }
  table { border-collapse:collapse } tr:nth-child(even) { background:#222 }
</style></head><body>
<h1>Web Report</h1>
<p>${startDate} to ${endDate}</p>
<p>Active: <b>${fmtMin(totals?.activeMinutes ?? 0)}</b> | Audible: <b>${fmtMin(totals?.audibleMinutes ?? 0)}</b> | Total: <b>${fmtMin(totals?.totalMinutes ?? 0)}</b></p>

<h2>Domains (${domains.length})</h2>
${domainBars}

<h2>Pages (${pages.length})</h2>
<table>${pageRows}</table>

<h2>Hourly Activity</h2>
${hourBars}

<h2>Flagged Domains</h2>
${flaggedSection}

</body></html>`;
  } catch {
    return null;
  } finally {
    db?.close();
  }
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
