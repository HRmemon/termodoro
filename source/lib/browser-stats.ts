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

let sharedDb: InstanceType<typeof Database> | null = null;

export function getBrowserDb(): InstanceType<typeof Database> {
  if (!sharedDb) {
    // Ensure dir exists
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    sharedDb = new Database(DB_PATH);
    sharedDb.pragma('journal_mode = WAL');
    
    // Legacy table
    sharedDb.exec(`
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
      
      -- New tables for event-based tracking
      CREATE TABLE IF NOT EXISTS browser_daily_usage (
        date TEXT NOT NULL,
        domain TEXT NOT NULL,
        active_seconds INTEGER NOT NULL DEFAULT 0,
        audible_seconds INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (date, domain)
      );
      CREATE INDEX IF NOT EXISTS idx_browser_daily_usage_date ON browser_daily_usage(date);
      
      CREATE TABLE IF NOT EXISTS browser_events_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        event_type TEXT NOT NULL,
        payload TEXT NOT NULL
      );
    `);
  }
  return sharedDb;
}

export function closeBrowserDb() {
  if (sharedDb) {
    sharedDb.close();
    sharedDb = null;
  }
}

function getLocalDateString(date: Date = new Date()): string {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function getLocalISOString(date: Date = new Date()): string {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString();
}

export function logBrowserEvent(eventType: string, payload: any) {
  try {
    const db = getBrowserDb();
    db.prepare(`INSERT INTO browser_events_log (timestamp, event_type, payload) VALUES (?, ?, ?)`).run(
      Date.now(), eventType, JSON.stringify(payload)
    );
  } catch (err) {
    console.error("Failed to log browser event", err);
  }
}

export function upsertDomainUsage(tabInfo: { domain: string, url?: string, path?: string, title?: string }, activeDeltaSec: number, audibleDeltaSec: number) {
  try {
    if (activeDeltaSec <= 0 && audibleDeltaSec <= 0) return;
    const db = getBrowserDb();
    const date = getLocalDateString();
    const domain = tabInfo.domain;
    
    db.prepare(`
      INSERT INTO browser_daily_usage (date, domain, active_seconds, audible_seconds)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(date, domain) DO UPDATE SET
        active_seconds = active_seconds + excluded.active_seconds,
        audible_seconds = audible_seconds + excluded.audible_seconds
    `).run(date, domain, activeDeltaSec, audibleDeltaSec);

    // Also insert into legacy table for page-level stats
    const url = tabInfo.url || `https://${domain}`;
    const path = tabInfo.path || '/';
    const title = tabInfo.title || '';

    const is_active = activeDeltaSec > 0 ? 1 : 0;
    const is_audible = audibleDeltaSec > 0 ? 1 : 0;
    const duration = Math.max(activeDeltaSec, audibleDeltaSec);

    db.prepare(`
      INSERT INTO page_visits (url, domain, path, title, is_active, is_audible, duration_sec, recorded_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(url, domain, path, title, is_active, is_audible, duration, getLocalISOString());
  } catch (err) {
    console.error("Failed to upsert domain usage", err);
  }
}

export function getTodayDomainUsage(baseDomain: string): { active_seconds: number, audible_seconds: number } {
  try {
    const db = getBrowserDb();
    const date = getLocalDateString();
    const row = db.prepare(`
      SELECT 
        SUM(CASE WHEN is_active = 1 THEN duration_sec ELSE 0 END) as active_seconds,
        SUM(CASE WHEN is_audible = 1 THEN duration_sec ELSE 0 END) as audible_seconds
      FROM page_visits 
      WHERE DATE(recorded_at) = ? AND (domain = ? OR domain LIKE ?)
    `).get(date, baseDomain, '%.' + baseDomain) as any;
    
    return { 
      active_seconds: row?.active_seconds || 0, 
      audible_seconds: row?.audible_seconds || 0 
    };
  } catch (err) {
    console.error("getTodayDomainUsage error:", err);
  }
  return { active_seconds: 0, audible_seconds: 0 };
}

export function getYesterdayDomainUsage(baseDomain: string): { active_seconds: number } {
  try {
    const db = getBrowserDb();
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const date = getLocalDateString(d);
    const row = db.prepare(`
      SELECT SUM(CASE WHEN is_active = 1 THEN duration_sec ELSE 0 END) as active_seconds 
      FROM page_visits 
      WHERE DATE(recorded_at) = ? AND (domain = ? OR domain LIKE ?)
    `).get(date, baseDomain, '%.' + baseDomain) as any;
    
    return { active_seconds: row?.active_seconds || 0 };
  } catch (err) {
    console.error("getYesterdayDomainUsage error:", err);
  }
  return { active_seconds: 0 };
}

export function getThisWeekDomainUsage(baseDomain: string): { active_seconds: number } {
  try {
    const db = getBrowserDb();
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 is Sunday
    const distanceToMonday = (dayOfWeek + 6) % 7;
    const monday = new Date(now);
    monday.setDate(now.getDate() - distanceToMonday);
    const mondayStr = getLocalDateString(monday);
    
    const row = db.prepare(`
      SELECT SUM(CASE WHEN is_active = 1 THEN duration_sec ELSE 0 END) as active_seconds 
      FROM page_visits 
      WHERE DATE(recorded_at) >= ? AND (domain = ? OR domain LIKE ?)
    `).get(mondayStr, baseDomain, '%.' + baseDomain) as any;

    
    return { active_seconds: row?.active_seconds || 0 };
  } catch (err) {
    console.error("getThisWeekDomainUsage error:", err);
  }
  return { active_seconds: 0 };
}

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
      WHERE DATE(recorded_at) = ?
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
      WHERE DATE(recorded_at) = ?
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
      WHERE DATE(recorded_at) = ?
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
      WHERE DATE(recorded_at) = ?
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

    const daily = db.prepare(`
      SELECT
        date(recorded_at) as date,
        ROUND(SUM(CASE WHEN is_active = 1 THEN duration_sec ELSE 0 END) / 60.0, 1) as activeMinutes
      FROM page_visits
      WHERE date(recorded_at) BETWEEN ? AND ?
      GROUP BY date
      ORDER BY date
    `).all(startDate, endDate) as { date: string; activeMinutes: number }[];

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

    const domainBars = domains.slice(0, 20).map(d => {
      const pct = Math.max(1, (d.totalMinutes / maxDomain) * 100);
      const cat = flaggedMap.get(d.domain);
      const color = cat ? (catColors[cat] ?? '#00bcd4') : '#888';
      return `
        <div style="margin:12px 0">
          <div style="display:flex; justify-content:space-between; margin-bottom:6px; font-size:13px">
            <span><b style="color:${color}">${cat ? `[${cat}] ` : ''}</b>${escHtml(d.domain)}</span>
            <span style="color:#848d97">${fmtMin(d.totalMinutes)}</span>
          </div>
          <div style="background:#21262d; height:8px; border-radius:4px; overflow:hidden">
            <div style="background:${color}; width:${pct}%; height:100%; border-radius:4px"></div>
          </div>
        </div>
      `;
    }).join('\n');

    const recentActivityHtml = daily.slice(-10).reverse().map(d => `
      <div class="activity-item">
        <div class="activity-dot" style="background:var(--cyan)"></div>
        <div class="activity-content">
          <div class="activity-title"><b>${d.date}</b></div>
          <div class="activity-meta">Active: ${fmtMin(d.activeMinutes)}</div>
        </div>
      </div>
    `).join('');

    const hourBars = Array.from({ length: 24 }, (_, h) => {
      const entry = hourly.find(e => e.hour === h);
      const mins = entry?.activeMinutes ?? 0;
      const pct = Math.max(0, (mins / maxHour) * 100);
      return `<div style="margin:2px 0; display:flex; align-items:center; gap:8px">
        <span style="width:40px; font-size:11px; color:#848d97">${String(h).padStart(2, '0')}:00</span>
        <div style="flex:1; background:#21262d; height:12px; border-radius:2px; overflow:hidden">
          <div style="background:var(--cyan); width:${pct}%; height:100%"></div>
        </div>
        <span style="width:45px; font-size:11px; color:#e6edf3; text-align:right">${mins > 0 ? fmtMin(mins) : ''}</span>
      </div>`;
    }).join('\n');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Web Time Dashboard</title>
  <style>
    :root {
      --bg: #0b0e14;
      --card-bg: #161b22;
      --text: #e6edf3;
      --text-dim: #848d97;
      --cyan: #00bcd4;
      --green: #4caf50;
      --orange: #ff9800;
    }
    * { box-sizing: border-box; }
    body { 
      background: var(--bg); 
      color: var(--text); 
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; 
      padding: 40px; 
      margin: 0; 
      display: flex;
      justify-content: center;
      overflow-x: hidden;
    }
    .container { max-width: 1200px; width: 100%; min-width: 0; }
    
    header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; }
    h1 { color: var(--cyan); margin: 0; font-size: 32px; font-weight: 600; }
    .header-meta { color: var(--text-dim); font-size: 14px; margin-top: 8px; }

    .dashboard-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 24px; margin-bottom: 40px; }
    .stat-card { background: var(--card-bg); border-radius: 12px; padding: 24px; display: flex; flex-direction: column; justify-content: center; align-items: flex-start; min-height: 140px; border: 1px solid #30363d; }
    
    .completion-info h3 { margin: 0; color: var(--text-dim); font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
    .completion-val { font-size: 42px; font-weight: 700; margin: 8px 0; line-height: 1; }
    
    .streaks-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2px; background: #30363d; border-radius: 12px; overflow: hidden; border: 1px solid #30363d; }
    .mini-stat { background: var(--card-bg); padding: 24px; display: flex; flex-direction: column; align-items: center; text-align: center; justify-content: center; }
    .mini-stat h3 { margin: 0; color: var(--text-dim); font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px; }
    .mini-stat .val { font-size: 24px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; width: 100%; line-height: 1.2; }

    .main-layout { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); gap: 24px; }
    
    .goals-list { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
    .goal-card { background: var(--card-bg); border-radius: 12px; padding: 24px; display: flex; flex-direction: column; border: 1px solid #30363d; }
    .goal-card.scrollable { max-height: 500px; }
    .goal-content { overflow-y: auto; flex: 1; padding-right: 10px; min-height: 0; }
    /* Scrollbar styling */
    .goal-content::-webkit-scrollbar { width: 6px; }
    .goal-content::-webkit-scrollbar-track { background: transparent; }
    .goal-content::-webkit-scrollbar-thumb { background: #30363d; border-radius: 3px; }

    .goal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-shrink: 0; }
    .goal-info { display: flex; align-items: center; gap: 12px; }
    .goal-accent { width: 4px; height: 24px; border-radius: 2px; }
    .goal-name { font-size: 18px; font-weight: 600; }

    .activity-sidebar { min-width: 0; }
    .activity-card { background: var(--card-bg); border-radius: 12px; padding: 24px; height: fit-content; border: 1px solid #30363d; }
    .activity-card h2 { margin: 0 0 20px 0; font-size: 18px; }
    .activity-list { display: flex; flex-direction: column; gap: 20px; position: relative; max-height: 600px; overflow-y: auto; padding-right: 10px; min-height: 0; }
    .activity-list::-webkit-scrollbar { width: 4px; }
    .activity-list::-webkit-scrollbar-thumb { background: #30363d; border-radius: 2px; }
    .activity-list::before { content: ""; position: absolute; left: 5px; top: 10px; bottom: 10px; width: 1px; background: #30363d; }
    
    .activity-item { display: flex; gap: 16px; position: relative; }
    .activity-dot { width: 11px; height: 11px; border-radius: 50%; border: 2px solid var(--card-bg); margin-top: 4px; z-index: 1; }
    .activity-content { flex: 1; }
    .activity-title { font-size: 14px; color: var(--text); }
    .activity-meta { font-size: 12px; color: var(--text-dim); margin-top: 4px; }

    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th { text-align: left; color: var(--text-dim); font-size: 12px; text-transform: uppercase; padding: 8px; border-bottom: 1px solid #30363d; }
    td { padding: 10px 8px; font-size: 13px; border-bottom: 1px solid #21262d; }
    .dim { color: var(--text-dim); }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div>
        <h1>Web Time Dashboard</h1>
        <div class="header-meta">${startDate} to ${endDate}</div>
      </div>
    </header>

    <div class="dashboard-grid">
      <div class="stat-card">
        <div class="completion-info">
          <h3>Total Browsing</h3>
          <div class="completion-val">${fmtMin(totals?.totalMinutes ?? 0)}</div>
        </div>
      </div>
      
      <div class="streaks-row">
        <div class="mini-stat">
          <h3>Active</h3>
          <div class="val" style="color:var(--green)">${fmtMin(totals?.activeMinutes ?? 0)}</div>
        </div>
        <div class="mini-stat">
          <h3>Audible</h3>
          <div class="val" style="color:var(--cyan)">${fmtMin(totals?.audibleMinutes ?? 0)}</div>
        </div>
        <div class="mini-stat">
          <h3>Top Domain</h3>
          <div class="val">${domains[0]?.domain || 'N/A'}</div>
        </div>
      </div>
    </div>

    <div class="main-layout">
      <div class="goals-list">
        <div class="goal-card scrollable">
          <div class="goal-header">
            <div class="goal-info">
              <div class="goal-accent" style="background:var(--cyan)"></div>
              <span class="goal-name">Top Domains</span>
            </div>
          </div>
          <div class="goal-content">
            ${domainBars}
          </div>
        </div>

        <div class="goal-card">
          <div class="goal-header">
            <div class="goal-info">
              <div class="goal-accent" style="background:var(--orange)"></div>
              <span class="goal-name">Hourly Activity</span>
            </div>
          </div>
          <div style="margin-top:10px">
            ${hourBars}
          </div>
        </div>

        <div class="goal-card scrollable">
          <div class="goal-header">
            <div class="goal-info">
              <div class="goal-accent" style="background:var(--green)"></div>
              <span class="goal-name">Top Pages</span>
            </div>
          </div>
          <div class="goal-content">
            <table>
              <thead>
                <tr>
                  <th style="width:80px">Time</th>
                  <th>Page Title</th>
                  <th>Domain</th>
                </tr>
              </thead>
              <tbody>
                ${pages.slice(0, 50).map(p => `
                  <tr>
                    <td><b>${fmtMin(p.totalMinutes)}</b></td>
                    <td>${escHtml(p.title || p.path)}</td>
                    <td class="dim">${escHtml(p.domain)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      
      <div class="activity-sidebar">
        <div class="activity-card">
          <h2>🕒 Daily Trend</h2>
          <div class="activity-list">
            ${recentActivityHtml || '<div style="color:var(--text-dim)">No recent data</div>'}
          </div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
  } catch {
    return null;
  } finally {
    db?.close();
  }
}


function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
