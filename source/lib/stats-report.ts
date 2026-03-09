import { loadSessions } from './store.js';
import { loadTasks } from './tasks.js';
import { formatMinutes } from './format.js';
import {
  getDailyStats,
  getWeeklyStats,
  getTaskBreakdown,
  getDeepWorkRatio,
  getStreaks,
  getSessionsForDateRange,
} from './stats.js';

const HIDDEN_SEEDED_PROJECTS = new Set(['backend', 'frontend', 'devops']);

function dateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getToday(): string {
  return dateStr(new Date());
}

function getWeekStartDate(offsetWeeks = 0): string {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - daysFromMonday - (offsetWeeks * 7));
  return dateStr(weekStart);
}

function dayLabel(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function escHtml(raw: string): string {
  return raw
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function generateStatsHtmlReport(weekOffset = 0): string {
  const today = getToday();
  const weekStart = getWeekStartDate(Math.max(0, weekOffset));
  const allSessions = loadSessions();
  const tasks = loadTasks();

  const daily = getDailyStats(today, allSessions);
  const weekly = getWeeklyStats(weekStart, allSessions);
  const breakdown = getTaskBreakdown(allSessions);
  const deepWork = getDeepWorkRatio(allSessions);
  const streaks = getStreaks(allSessions);
  const todaySessions = getSessionsForDateRange(today, today, allSessions);

  const projectRows = breakdown.byProject
    .filter(p => p.label !== '(untagged)' && !HIDDEN_SEEDED_PROJECTS.has(p.label.toLowerCase()))
    .slice(0, 12);

  const projectTaskMap = new Map<string, { total: number; completed: number }>();
  for (const t of tasks) {
    if (!t.project || HIDDEN_SEEDED_PROJECTS.has(t.project.toLowerCase())) continue;
    const row = projectTaskMap.get(t.project) ?? { total: 0, completed: 0 };
    row.total += 1;
    if (t.completed) row.completed += 1;
    projectTaskMap.set(t.project, row);
  }
  const taskRows = [...projectTaskMap.entries()]
    .sort((a, b) => b[1].completed - a[1].completed)
    .slice(0, 12);

  const hourlyMinutes = new Array(24).fill(0);
  for (const s of todaySessions) {
    if (s.type === 'work' && s.status === 'completed') {
      const hour = new Date(s.startedAt).getHours();
      hourlyMinutes[hour] += s.durationActual / 60;
    }
  }
  const maxHour = Math.max(1, ...hourlyMinutes);

  const recentSessions = allSessions
    .filter(s => s.type === 'work' && s.status === 'completed')
    .filter(s => !s.project || !HIDDEN_SEEDED_PROJECTS.has(s.project.toLowerCase()))
    .slice(-20)
    .reverse();
  const weeklyHistory = Array.from({ length: 12 }, (_, offset) => {
    const ws = getWeekStartDate(offset);
    const w = getWeeklyStats(ws, allSessions);
    return { start: ws, minutes: w.totalFocusMinutes, sessions: w.heatmap.reduce((n, d) => n + d.sessions, 0) };
  });
  const maxHistoryMinutes = Math.max(1, ...weeklyHistory.map(w => w.minutes));

  const generatedAt = new Date().toLocaleString();
  const weekEnd = new Date(`${weekStart}T00:00:00`);
  weekEnd.setDate(weekEnd.getDate() + 6);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Pomodoro Stats Report</title>
  <style>
    :root { --bg:#0b0e14; --card:#161b22; --text:#e6edf3; --muted:#8b949e; --cyan:#00bcd4; --green:#4caf50; --line:#30363d; }
    * { box-sizing:border-box; }
    body { margin:0; padding:28px; background:var(--bg); color:var(--text); font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif; }
    h1,h2,h3 { margin:0 0 10px 0; }
    .muted { color:var(--muted); }
    .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:14px; margin-bottom:18px; }
    .card { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:14px; }
    .kpi { font-size:30px; font-weight:700; color:var(--cyan); }
    .bar { height:8px; border-radius:6px; background:#222b35; overflow:hidden; }
    .bar > span { display:block; height:100%; background:var(--cyan); }
    table { width:100%; border-collapse:collapse; }
    td,th { border-bottom:1px solid var(--line); padding:7px 6px; text-align:left; font-size:13px; }
    .mono { font-family: ui-monospace, Menlo, Consolas, monospace; }
    .good { color:var(--green); }
  </style>
</head>
<body>
  <h1>Pomodoro Stats Report</h1>
  <div class="muted">Generated ${escHtml(generatedAt)} • Week ${escHtml(weekStart)} to ${escHtml(dateStr(weekEnd))}</div>

  <div class="grid" style="margin-top:14px">
    <div class="card"><div class="muted">Today Focus</div><div class="kpi">${escHtml(formatMinutes(daily.focusMinutes))}</div></div>
    <div class="card"><div class="muted">Week Focus</div><div class="kpi">${escHtml(formatMinutes(weekly.totalFocusMinutes))}</div></div>
    <div class="card"><div class="muted">Deep Work Ratio</div><div class="kpi">${Math.round(deepWork.ratio * 100)}%</div></div>
    <div class="card"><div class="muted">Current Streak</div><div class="kpi">${streaks.currentStreak}d</div></div>
  </div>

  <div class="grid">
    <div class="card">
      <h3>Week Breakdown</h3>
      ${weekly.heatmap.map((d) => {
        const pct = weekly.totalFocusMinutes > 0 ? Math.round((d.focusMinutes / weekly.totalFocusMinutes) * 100) : 0;
        return `<div style="margin:10px 0">
          <div style="display:flex;justify-content:space-between"><span>${escHtml(dayLabel(d.date))}</span><span class="muted">${escHtml(formatMinutes(d.focusMinutes))}</span></div>
          <div class="bar"><span style="width:${Math.max(2, pct)}%"></span></div>
        </div>`;
      }).join('')}
    </div>
    <div class="card">
      <h3>Today by Hour</h3>
      ${hourlyMinutes.map((m, h) => {
        const pct = Math.round((m / maxHour) * 100);
        return `<div style="display:grid;grid-template-columns:44px 1fr 42px;gap:8px;align-items:center;margin:5px 0">
          <span class="mono muted">${String(h).padStart(2, '0')}:00</span>
          <div class="bar"><span style="width:${Math.max(m > 0 ? 4 : 0, pct)}%"></span></div>
          <span class="mono muted">${m > 0 ? Math.round(m) : 0}m</span>
        </div>`;
      }).join('')}
    </div>
  </div>

  <div class="grid">
    <div class="card">
      <h3>Project Focus</h3>
      ${projectRows.length === 0 ? '<div class="muted">No project focus data.</div>' : `
      <table>
        <thead><tr><th>Project</th><th>Focus</th></tr></thead>
        <tbody>${projectRows.map(p => `<tr><td class="mono">#${escHtml(p.label)}</td><td>${escHtml(formatMinutes(p.minutes))}</td></tr>`).join('')}</tbody>
      </table>`}
    </div>
    <div class="card">
      <h3>Project Tasks</h3>
      ${taskRows.length === 0 ? '<div class="muted">No project task data.</div>' : `
      <table>
        <thead><tr><th>Project</th><th>Done</th></tr></thead>
        <tbody>${taskRows.map(([name, row]) => `<tr><td class="mono">#${escHtml(name)}</td><td>${row.completed}/${row.total}</td></tr>`).join('')}</tbody>
      </table>`}
    </div>
  </div>

  <div class="card" style="margin-bottom:14px">
    <h3>Weekly History (Last 12 Weeks)</h3>
    ${weeklyHistory.map((w, i) => {
      const pct = Math.round((w.minutes / maxHistoryMinutes) * 100);
      const label = i === 0 ? `${w.start} (this week)` : w.start;
      return `<div style="margin:10px 0">
        <div style="display:flex;justify-content:space-between">
          <span class="mono">${escHtml(label)}</span>
          <span class="muted">${escHtml(formatMinutes(w.minutes))} • ${w.sessions} sessions</span>
        </div>
        <div class="bar"><span style="width:${Math.max(w.minutes > 0 ? 4 : 0, pct)}%"></span></div>
      </div>`;
    }).join('')}
  </div>

  <div class="card">
    <h3>Recent Sessions</h3>
    ${recentSessions.length === 0 ? '<div class="muted">No recent completed work sessions.</div>' : `
    <table>
      <thead><tr><th>Date</th><th>Time</th><th>Duration</th><th>Label</th><th>Project</th></tr></thead>
      <tbody>${recentSessions.map(s => `<tr>
        <td class="mono">${escHtml(s.startedAt.slice(0, 10))}</td>
        <td class="mono">${escHtml(s.startedAt.slice(11, 16))}</td>
        <td>${escHtml(formatMinutes(s.durationActual / 60))}</td>
        <td>${escHtml(s.label ?? '-')}</td>
        <td class="mono">${escHtml(s.project ? `#${s.project}` : '-')}</td>
      </tr>`).join('')}</tbody>
    </table>`}
  </div>
</body>
</html>`;
}
