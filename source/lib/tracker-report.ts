import { listWeeks, loadWeek, getCategories, computeDayStats, type WeekData, ALL_SLOTS } from './tracker.js';
import { getTodayStr } from './date-utils.js';

function escHtml(raw: string): string {
  return raw.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function fmtHours(h: number): string {
  if (h < 0.01) return '0m';
  if (h < 1) return `${Math.round(h * 60)}m`;
  const whole = Math.floor(h);
  const rem = Math.round((h - whole) * 60);
  return rem > 0 ? `${whole}h ${rem}m` : `${whole}h`;
}

function fmtDelta(current: number, previous: number): { text: string; color: string; glyph: string } {
  if (previous <= 0) return { text: '—', color: 'var(--muted)', glyph: '' };
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return { text: '0%', color: 'var(--muted)', glyph: '→' };
  const glyph = pct > 0 ? '▲' : '▼';
  const color = pct > 0 ? '#22c55e' : '#ef4444';
  return { text: `${Math.abs(pct)}%`, color, glyph };
}

const CAT_GROUP: Record<string, { group: string; color: string }> = {
  D: { group: 'deep', color: 'var(--deep)' },
  hD: { group: 'half', color: 'var(--half)' },
  W: { group: 'wasted', color: 'var(--wasted)' },
  SF: { group: 'wasted', color: 'var(--wasted)' },
  E: { group: 'okay', color: 'var(--okay)' },
  O: { group: 'okay', color: 'var(--okay)' },
  S: { group: 'sleep', color: 'var(--sleep)' },
  N: { group: 'muted', color: 'var(--muted)' },
  WU: { group: 'muted', color: 'var(--muted)' },
};

export function generateTrackerHtmlReport(): string {
  const weekList = listWeeks();
  const weeks = weekList.map(ws => loadWeek(ws)).filter((w): w is WeekData => w !== null);
  const categories = getCategories();
  const today = getTodayStr();

  const overallStats: Record<string, number> = {};
  let totalTrackedHours = 0;

  for (const week of weeks) {
    for (const date of Object.keys(week.slots)) {
      const dayStats = computeDayStats(week.slots[date]);
      for (const [code, hours] of Object.entries(dayStats)) {
        overallStats[code] = (overallStats[code] ?? 0) + hours;
        totalTrackedHours += hours;
      }
    }
  }

  const thisWeekHours = weeks[0] ? Object.values(computeDayStatsForWeek(weeks[0])).reduce((a, b) => a + b, 0) : 0;
  const lastWeekHours = weeks[1] ? Object.values(computeDayStatsForWeek(weeks[1])).reduce((a, b) => a + b, 0) : 0;
  const weekDelta = fmtDelta(thisWeekHours, lastWeekHours);

  const monthHours = weeks.slice(0, 4).reduce((sum, w) => {
    return sum + Object.values(computeDayStatsForWeek(w)).reduce((a, b) => a + b, 0);
  }, 0);

  // Per-category comparison
  const thisWeekCatStats = weeks[0] ? computeDayStatsForWeek(weeks[0]) : {};
  const lastWeekCatStats = weeks[1] ? computeDayStatsForWeek(weeks[1]) : {};
  const allCatCodes = [...new Set([...Object.keys(thisWeekCatStats), ...Object.keys(lastWeekCatStats)])].sort();

  const maxCatVal = Math.max(1, ...allCatCodes.map(c => Math.max(thisWeekCatStats[c] ?? 0, lastWeekCatStats[c] ?? 0)));

  const catLookup = new Map(categories.map(c => [c.code, c.label]));

  // Timeline grid: current week's 30-min slots colored by category
  const DAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const currentWeek = weeks[0];
  const weekDates = currentWeek ? Object.keys(currentWeek.slots).sort() : [];

  const SLOTS = ALL_SLOTS;

  const timelineGrid: string[][] = SLOTS.map(() => Array(7).fill(''));

  if (currentWeek) {
    for (const date of weekDates) {
      const dayOfWeek = new Date(date + 'T00:00:00').getDay();
      const col = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      if (col < 0 || col > 6) continue;
      const daySlots = currentWeek.slots[date] ?? {};
      for (let si = 0; si < SLOTS.length; si++) {
        const code = daySlots[SLOTS[si]!];
        if (code) {
          timelineGrid[si]![col] = CAT_GROUP[code]?.group ?? '';
        }
      }
    }
  }

  // Distribution donut data
  const totalThisWeek = Object.values(thisWeekCatStats).reduce((a, b) => a + b, 0);

  const groupTotals: Record<string, number> = {};
  for (const [code, hours] of Object.entries(thisWeekCatStats)) {
    const g = CAT_GROUP[code]?.group ?? 'muted';
    groupTotals[g] = (groupTotals[g] ?? 0) + hours;
  }
  const deepTotal = groupTotals.deep ?? 0;
  const halfTotal = groupTotals.half ?? 0;
  const wastedTotal = groupTotals.wasted ?? 0;
  const okayTotal = groupTotals.okay ?? 0;
  const sleepTotal = groupTotals.sleep ?? 0;
  const mutedTotal = groupTotals.muted ?? 0;

  const total = deepTotal + halfTotal + wastedTotal + okayTotal + sleepTotal + mutedTotal || 1;

  // Donut segments
  const donutColors: [string, number][] = [
    ['var(--deep)', deepTotal],
    ['var(--half)', halfTotal],
    ['var(--wasted)', wastedTotal],
    ['var(--okay)', okayTotal],
    ['var(--sleep)', sleepTotal],
    ['var(--muted)', mutedTotal],
  ];
  let angle = 0;
  const segs: string[] = [];
  for (const [color, val] of donutColors) {
    if (val > 0) {
      const end = angle + (val / total) * 360;
      segs.push(`${color} ${angle}deg ${end}deg`);
      angle = end;
    }
  }
  if (segs.length === 0) segs.push('var(--muted) 0deg 360deg');

  // Weekly trend (last 12 weeks) with per-category breakdown
  const weeklyHistory = weeks.slice(0, 12).reverse().map(w => {
    const stats = computeDayStatsForWeek(w);
    const sorted = Object.entries(stats).sort((a, b) => b[1] - a[1]);
    const hours = sorted.reduce((s, [, h]) => s + h, 0);
    return { week: w.week, start: w.start, hours, cats: sorted };
  });
  const maxHistoryHours = Math.max(1, ...weeklyHistory.map(w => w.hours));

  const sortOrder = ['D', 'hD', 'E', 'O', 'W', 'SF', 'S', 'N', 'WU'];

  // SVG bar chart
  const chartW = 600, chartH = 220, pad = 40;
  const plotW = chartW - pad * 2;
  const plotH = chartH - pad * 2;
  const barGap = 6;
  const barW = weeklyHistory.length > 0 ? Math.max(8, (plotW - (weeklyHistory.length - 1) * barGap) / weeklyHistory.length) : 0;

  const chartBars = weeklyHistory.map((w, i) => {
    const x = pad + i * (barW + barGap);
    const totalH = w.hours;
    const barH = maxHistoryHours > 0 ? (totalH / maxHistoryHours) * plotH : 0;
    // Sort categories by priority order
    const sortedCats = [...w.cats].sort((a, b) => {
      const ia = sortOrder.indexOf(a[0]);
      const ib = sortOrder.indexOf(b[0]);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
    let yOff = 0;
    const segs = sortedCats.map(([code, catHours]) => {
      const segH = totalH > 0 ? (catHours / totalH) * barH : 0;
      const color = CAT_GROUP[code]?.color ?? 'var(--muted)';
      const y = pad + plotH - yOff - segH;
      yOff += segH;
      return `<rect x="${x}" y="${y}" width="${barW}" height="${Math.max(segH, 0.5)}" fill="${color}" rx="1.5"/>
        <title>${code}: ${fmtHours(catHours)}</title>`;
    }).join('');
    return segs;
  }).join('');

  const chartLabels = weeklyHistory.map((w, i) => {
    const x = pad + i * (barW + barGap) + barW / 2;
    const wn = w.week.replace('W', '');
    return { label: `W${wn}`, x };
  });

  // Insights
  const insights: { title: string; text: string }[] = [];

  // Top category
  const topCatCode = Object.entries(overallStats).sort((a, b) => b[1] - a[1])[0];
  if (topCatCode) {
    const label = catLookup.get(topCatCode[0]) ?? topCatCode[0];
    const group = CAT_GROUP[topCatCode[0]]?.group ?? '';
    insights.push({
      title: `Top Activity: ${label}`,
      text: `Your most logged category overall with ${fmtHours(topCatCode[1])} tracked.`,
    });
  }

  // Week-over-week trend
  if (weekDelta.glyph === '▲') {
    insights.push({ title: 'Productivity ↑', text: `Tracking ${weekDelta.text} more than last week.` });
  } else if (weekDelta.glyph === '▼') {
    insights.push({ title: 'Productivity ↓', text: `Tracking ${weekDelta.text} less than last week.` });
  } else if (weekDelta.glyph) {
    insights.push({ title: 'Steady Pace', text: `Tracking about the same as last week.` });
  }

  // Day with most waste
  const wasteByDay = [0, 0, 0, 0, 0, 0, 0];
  if (currentWeek) {
    for (let di = 0; di < weekDates.length && di < 7; di++) {
      const date = weekDates[di]!;
      const daySlots = currentWeek.slots[date] ?? {};
      for (const [time, code] of Object.entries(daySlots)) {
        if (code === 'W' || code === 'SF') {
          wasteByDay[di] += 0.5; // each slot = 30 min
        }
      }
    }
  }
  const worstDayIdx = wasteByDay.indexOf(Math.max(...wasteByDay));
  if (worstDayIdx >= 0 && wasteByDay[worstDayIdx] > 0) {
    insights.push({
      title: 'Wasted Time Peak',
      text: `${DAYS_SHORT[worstDayIdx]} has the most wasted slots this week.`,
    });
  }

  // Deep work streak days
  const deepDays = currentWeek ? weekDates.filter(date => {
    const daySlots = currentWeek.slots[date] ?? {};
    return Object.values(daySlots).some(code => code === 'D' || code === 'hD');
  }).length : 0;
  if (deepDays > 0) {
    insights.push({
      title: `Deep Days: ${deepDays}/7`,
      text: deepDays >= 5
        ? 'Strong deep work presence this week.'
        : `Had deep work on ${deepDays} day${deepDays > 1 ? 's' : ''} this week.`,
    });
  }

  const mostActive = Object.entries(overallStats).sort((a, b) => b[1] - a[1])[0];
  const mostActiveLabel = mostActive ? catLookup.get(mostActive[0]) ?? mostActive[0] : 'N/A';
  const avgWeekly = totalTrackedHours / Math.max(1, weeks.length);

  // Recent entries (last 5 days)
  const recentEntries: { date: string; stats: Record<string, number> }[] = [];
  outer: for (const week of weeks) {
    const dates = Object.keys(week.slots).sort().reverse();
    for (const date of dates) {
      const stats = computeDayStats(week.slots[date]);
      if (Object.keys(stats).length > 0) {
        recentEntries.push({ date, stats });
        if (recentEntries.length >= 5) break outer;
      }
    }
  }

  const MAX_BAR_PCT = 80;

  const generatedAt = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Tracker Report</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
:root {
  --bg: #0a0f16;
  --panel: #111827;
  --panel-hover: #161f2d;
  --border: #1f2937;
  --text: #e5e7eb;
  --muted: #94a3b8;
  --deep: #06b6d4;
  --half: #60a5fa;
  --wasted: #ef4444;
  --okay: #f59e0b;
  --sleep: #2563eb;
  --success: #22c55e;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, sans-serif;
  background: var(--bg);
  color: var(--text);
  padding: 40px;
  -webkit-font-smoothing: antialiased;
}
.container { max-width: 1400px; margin: auto; }
h1 { font-size: 2rem; margin-bottom: 6px; font-weight: 700; letter-spacing: -0.02em; }
.subtitle { color: var(--muted); font-size: 0.95rem; }
.section { margin-top: 28px; }
.card { background: var(--panel); border: 1px solid var(--border); border-radius: 18px; padding: 22px; }
.card-title {
  font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.08em;
  color: var(--muted); margin-bottom: 16px; font-weight: 600;
}
/* Summary */
.summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; margin-top: 28px; }
.metric-label { color: var(--muted); font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; }
.metric-value { font-size: 3rem; font-weight: 800; margin-top: 8px; line-height: 1; letter-spacing: -0.03em; }
.metric-change { margin-top: 8px; font-size: 0.85rem; font-weight: 500; }
/* Table */
table { width: 100%; border-collapse: collapse; }
th { text-align: left; color: var(--muted); font-weight: 500; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; padding-bottom: 12px; }
td { padding: 14px 0; border-top: 1px solid rgba(255,255,255,0.04); font-size: 0.9rem; }
.comp-bar-wrap { display: flex; gap: 8px; align-items: center; }
.comp-bar { height: 6px; border-radius: 3px; flex-shrink: 0; }
/* Main grid */
.main-grid { display: grid; grid-template-columns: 2fr 1fr; gap: 20px; }
/* Timeline */
.timeline-wrapper { overflow-x: auto; }
.timeline { display: grid; grid-template-columns: 60px repeat(7, 1fr); gap: 4px; min-width: 600px; }
.day-header { text-align: center; font-weight: 600; color: var(--muted); font-size: 0.8rem; padding-bottom: 6px; }
.time { color: var(--muted); font-size: 0.7rem; text-align: right; padding-right: 6px; font-variant-numeric: tabular-nums; }
.slot { height: 20px; border-radius: 4px; background: rgba(255,255,255,0.03); min-width: 0; transition: background .15s; }
.slot.deep { background: var(--deep); }
.slot.half { background: var(--half); }
.slot.wasted { background: var(--wasted); }
.slot.okay { background: var(--okay); }
.slot.sleep { background: var(--sleep); }
.slot.muted { background: rgba(255,255,255,0.06); }
.slot:hover { opacity: 0.75; }
/* Donut */
.donut-wrapper { display: flex; flex-direction: column; align-items: center; }
.donut {
  width: 200px; height: 200px; border-radius: 50%; flex-shrink: 0;
  background: conic-gradient(${segs.join(', ')});
  position: relative;
  box-shadow: 0 0 40px rgba(6,182,212,0.06);
}
.donut::after {
  content: ""; position: absolute; inset: 40px;
  background: var(--panel); border-radius: 50%;
}
.donut-center {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  z-index: 1; flex-direction: column;
}
.donut-center .val { font-size: 2rem; font-weight: 800; line-height: 1; }
.donut-center .lbl { font-size: 0.7rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; margin-top: 4px; }
.legend { margin-top: 16px; width: 100%; }
.legend-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.04); font-size: 0.85rem; }
.legend-row:last-child { border-bottom: none; }
.legend-left { display: flex; gap: 10px; align-items: center; }
.dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
/* Chart */
.chart-container { position: relative; width: 100%; }
.chart-container svg { width: 100%; height: auto; display: block; }
.chart-labels { display: flex; justify-content: space-between; margin-top: 8px; color: var(--muted); font-size: 0.8rem; padding: 0 30px; }
/* Daily bars */
.daily-bars { display: flex; gap: 8px; margin-bottom: 20px; }
.daily-bar-item { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 6px; }
.daily-bar-fill { width: 70%; background: var(--deep); border-radius: 4px 4px 0 0; min-height: 2px; }
.daily-bar-label { font-size: 0.7rem; color: var(--muted); text-transform: uppercase; text-align: center; }
/* Insights */
.insights { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
.insight-card {
  background: rgba(15,23,42,0.6); border: 1px solid var(--border);
  border-radius: 14px; padding: 18px; transition: border-color .2s;
}
.insight-card:hover { border-color: rgba(255,255,255,0.1); }
.insight-title { font-weight: 700; font-size: 0.9rem; margin-bottom: 6px; }
.insight-text { color: var(--muted); font-size: 0.85rem; line-height: 1.5; }
/* Recent activity */
.activity-list { display: flex; flex-direction: column; gap: 14px; }
.activity-item { display: flex; gap: 12px; align-items: flex-start; }
.activity-dot { width: 10px; height: 10px; border-radius: 50%; margin-top: 4px; flex-shrink: 0; }
.activity-title { font-weight: 600; font-size: 0.9rem; }
.activity-meta { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; font-size: 0.8rem; color: var(--muted); }
/* Stats chips */
.stats-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 12px; margin-bottom: 20px; }
.stat-chip { background: rgba(255,255,255,0.03); border-radius: 10px; padding: 12px; text-align: center; }
.stat-chip .num { font-size: 1.4rem; font-weight: 700; }
.stat-chip .lbl { font-size: 0.7rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; margin-top: 2px; }
/* Empty */
.empty-state { text-align: center; padding: 60px 20px; color: var(--muted); }
.empty-state .big { font-size: 3rem; margin-bottom: 12px; }
/* Footer */
.footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid var(--border); color: var(--muted); font-size: 0.75rem; text-align: center; }
/* Responsive */
@media (max-width: 1000px) {
  .summary { grid-template-columns: 1fr; }
  .main-grid { grid-template-columns: 1fr; }
  .insights { grid-template-columns: 1fr; }
  body { padding: 20px; }
  .metric-value { font-size: 2.2rem; }
}
</style>
</head>
<body>
<div class="container">

  <!-- ==================== HEADER ==================== -->
  <header style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:12px;">
    <div>
      <h1>Tracker Report</h1>
      <div class="subtitle">
        ${currentWeek ? escHtml(currentWeek.start) + ' &ndash; ' + escHtml(weekDates[weekDates.length - 1] ?? currentWeek.start) : 'No data yet'}
        ${currentWeek ? '&middot; ' + escHtml(currentWeek.week) : ''}
      </div>
    </div>
    <div style="text-align:right;">
      <div style="color:var(--muted);font-size:0.75rem;">Generated ${escHtml(generatedAt)}</div>
      <div style="color:var(--muted);font-size:0.75rem;margin-top:2px;">${weeks.length} week${weeks.length !== 1 ? 's' : ''} tracked</div>
    </div>
  </header>

  ${weeks.length === 0 ? `
  <div class="empty-state">
    <div class="big">📊</div>
    <div style="font-size:1.1rem;font-weight:600;margin-bottom:8px;">No tracking data yet</div>
    <div>Start logging your time in the Tracker view to generate reports.</div>
  </div>
  ` : `
  <!-- ==================== SUMMARY ==================== -->
  <section class="summary">
    <div class="card">
      <div class="metric-label">This Week</div>
      <div class="metric-value">${escHtml(fmtHours(thisWeekHours))}</div>
      <div class="metric-change" style="color:${weekDelta.color}">
        ${weekDelta.glyph} ${weekDelta.text} vs last week
      </div>
    </div>
    <div class="card">
      <div class="metric-label">Last Week</div>
      <div class="metric-value">${escHtml(fmtHours(lastWeekHours))}</div>
      <div class="metric-change" style="color:var(--muted)">
        ${lastWeekHours > 0 ? escHtml(fmtHours(lastWeekHours)) + ' total' : 'No data'}
      </div>
    </div>
    <div class="card">
      <div class="metric-label">This Month</div>
      <div class="metric-value">${escHtml(fmtHours(monthHours))}</div>
      <div class="metric-change" style="color:var(--muted)">
        Last 4 weeks
      </div>
    </div>
  </section>

  <!-- ==================== COMPARISON ==================== -->
  ${allCatCodes.length > 0 ? `
  <section class="section card">
    <div class="card-title">Week-over-Week Comparison</div>
    <table>
      <thead>
        <tr>
          <th>Category</th>
          <th>This Week</th>
          <th>Last Week</th>
          <th>&Delta;</th>
          <th style="width:30%">Trend</th>
        </tr>
      </thead>
      <tbody>
        ${allCatCodes.map(code => {
          const tw = thisWeekCatStats[code] ?? 0;
          const lw = lastWeekCatStats[code] ?? 0;
          const delta = fmtDelta(tw, lw);
          const color = CAT_GROUP[code]?.color ?? 'var(--muted)';
          const label = catLookup.get(code) ?? code;
          return `<tr>
            <td>
              <span style="display:flex;align-items:center;gap:6px;">
                <span style="width:10px;height:10px;border-radius:50%;background:${color};display:inline-block;"></span>
                ${escHtml(label)}
              </span>
            </td>
            <td style="font-weight:600">${escHtml(fmtHours(tw))}</td>
            <td style="color:var(--muted)">${escHtml(fmtHours(lw))}</td>
            <td style="color:${delta.color};font-weight:500">${delta.glyph ? delta.glyph + ' ' + delta.text : delta.text}</td>
            <td>
              <div class="comp-bar-wrap">
                ${lw > 0 ? `<div class="comp-bar" style="width:${Math.round((lw / maxCatVal) * 60)}%;background:${color};opacity:0.4"></div>` : ''}
                <div class="comp-bar" style="width:${Math.round((tw / maxCatVal) * 60)}%;background:${color}"></div>
              </div>
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  </section>
  ` : ''}

  <!-- ==================== TIMELINE + DISTRIBUTION ==================== -->
  <section class="section main-grid">

    <!-- TIMELINE -->
    <div class="card">
      <div class="card-title" style="margin-bottom:12px;">${currentWeek ? escHtml(currentWeek.week) : 'Current Week'} Timeline</div>

      <div class="stats-row">
        <div class="stat-chip">
          <div class="num" style="color:var(--deep)">${escHtml(fmtHours(deepTotal))}</div>
          <div class="lbl">Deep Work</div>
        </div>
        <div class="stat-chip">
          <div class="num" style="color:var(--half)">${escHtml(fmtHours(halfTotal))}</div>
          <div class="lbl">Half Deep</div>
        </div>
        <div class="stat-chip">
          <div class="num" style="color:var(--wasted)">${escHtml(fmtHours(wastedTotal))}</div>
          <div class="lbl">Wasted</div>
        </div>
        <div class="stat-chip">
          <div class="num" style="color:var(--muted)">${escHtml(fmtHours(okayTotal + sleepTotal + mutedTotal))}</div>
          <div class="lbl">Other</div>
        </div>
      </div>

      ${currentWeek ? `
      <!-- Day summary bars -->
      <div class="daily-bars">
        ${(() => {
          const monday = new Date(currentWeek.start + 'T00:00:00');
          const dayCategories: { code: string; hours: number }[][] = [];
          let maxDayHours = 0;
          for (let i = 0; i < 7; i++) {
            const d = new Date(monday);
            d.setDate(monday.getDate() + i);
            const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            const daySlots = currentWeek.slots[dateKey] ?? {};
            const stats = computeDayStats(daySlots);
            const sorted = Object.entries(stats).sort((a, b) => b[1] - a[1]);
            const total = sorted.reduce((s, [, h]) => s + h, 0);
            if (total > maxDayHours) maxDayHours = total;
            dayCategories.push(sorted.map(([code, hours]) => ({ code, hours })));
          }
          const barMaxH = 80;
          return dayCategories.map((cats, i) => {
            const totalHours = cats.reduce((s, c) => s + c.hours, 0);
            const barH = maxDayHours > 0 ? Math.max(totalHours > 0 ? 4 : 0, (totalHours / maxDayHours) * barMaxH) : 0;
            const segments = cats.map(c => {
              const catColor = CAT_GROUP[c.code]?.color ?? 'var(--muted)';
              const segH = totalHours > 0 ? (c.hours / totalHours) * barH : 0;
              return `<div style="height:${segH}px;background:${catColor};border-radius:${segH > 3 ? '2px 2px 0 0' : '0'};min-height:${c.hours > 0 && segH < 2 ? 2 : 0}px;width:100%"></div>`;
            }).join('');
            return `<div class="daily-bar-item">
              <div class="daily-bar-label">${DAYS_SHORT[i]}</div>
              <div style="width:60%;height:${barMaxH}px;display:flex;flex-direction:column-reverse;align-items:center;border-radius:4px;overflow:hidden;background:rgba(255,255,255,0.03)">
                ${segments}
              </div>
              <div style="font-size:10px;color:var(--muted)">${totalHours > 0 ? fmtHours(totalHours) : ''}</div>
            </div>`;
          }).join('');
        })()}
      </div>

      <div class="timeline-wrapper">
        <div class="timeline">
          <div></div>
          ${DAYS_SHORT.map(d => `<div class="day-header">${d}</div>`).join('')}
          ${SLOTS.map((slot, si) => `
            <div class="time">${slot}</div>
            ${timelineGrid[si]!.map(cell => `<div class="slot${cell ? ' ' + cell : ''}"></div>`).join('')}
          `).join('')}
        </div>
      </div>
      ` : `
      <div class="empty-state" style="padding:30px;">
        <div>No tracking data for this week.</div>
      </div>
      `}

      <div style="display:flex;gap:16px;margin-top:14px;font-size:0.75rem;color:var(--muted);flex-wrap:wrap;">
        <span style="display:flex;align-items:center;gap:4px;"><span style="width:10px;height:10px;border-radius:3px;background:var(--deep);display:inline-block;"></span> Deep Work</span>
        <span style="display:flex;align-items:center;gap:4px;"><span style="width:10px;height:10px;border-radius:3px;background:var(--half);display:inline-block;"></span> Half Deep</span>
        <span style="display:flex;align-items:center;gap:4px;"><span style="width:10px;height:10px;border-radius:3px;background:var(--wasted);display:inline-block;"></span> Wasted</span>
        <span style="display:flex;align-items:center;gap:4px;"><span style="width:10px;height:10px;border-radius:3px;background:var(--okay);display:inline-block;"></span> Okayish</span>
        <span style="display:flex;align-items:center;gap:4px;"><span style="width:10px;height:10px;border-radius:3px;background:var(--sleep);display:inline-block;"></span> Sleep</span>
      </div>
    </div>

    <!-- DISTRIBUTION -->
    <div class="card">
      <div class="card-title">Distribution</div>

      ${total > 1 ? `
      <div class="donut-wrapper" style="margin-bottom:8px;">
        <div class="donut">
          <div class="donut-center">
            <div class="val" style="color:var(--deep)">${Math.round((deepTotal / total) * 100)}%</div>
            <div class="lbl">Deep Work</div>
          </div>
        </div>
      </div>
      ` : `
      <div class="empty-state" style="padding:30px 10px;">
        <div style="font-size:0.9rem;">No data this week</div>
      </div>
      `}

      <div class="legend">
        ${([
          ['Deep Work', 'var(--deep)', deepTotal],
          ['Half Deep', 'var(--half)', halfTotal],
          ['Wasted', 'var(--wasted)', wastedTotal],
          ['Okayish', 'var(--okay)', okayTotal],
          ['Sleep', 'var(--sleep)', sleepTotal],
          ['Other', 'var(--muted)', mutedTotal],
        ] as const).filter(([,, v]) => v > 0).map(([label, color, val]) => `
        <div class="legend-row">
          <div class="legend-left">
            <span class="dot" style="background:${color}"></span>
            ${label}
          </div>
          <span style="font-weight:600">${fmtHours(val)}</span>
        </div>
        `).join('')}
      </div>

      <div style="margin-top:20px;">
        <div class="card-title" style="margin-bottom:10px;">Quick Stats</div>
        <div style="display:flex;flex-direction:column;gap:10px;font-size:0.85rem;">
          <div style="display:flex;justify-content:space-between;">
            <span style="color:var(--muted)">Most frequent</span>
            <span style="font-weight:600">${escHtml(mostActiveLabel)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;">
            <span style="color:var(--muted)">Weekly average</span>
            <span style="font-weight:600">${escHtml(fmtHours(avgWeekly))}</span>
          </div>
          <div style="display:flex;justify-content:space-between;">
            <span style="color:var(--muted)">Total tracked</span>
            <span style="font-weight:600">${escHtml(fmtHours(totalTrackedHours))}</span>
          </div>
          <div style="display:flex;justify-content:space-between;">
            <span style="color:var(--muted)">Weeks</span>
            <span style="font-weight:600">${weeks.length}</span>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- ==================== WEEKLY TREND ==================== -->
  <section class="section card">
    <div class="card-title">Weekly Trend</div>
    <div class="chart-container">
      <svg viewBox="0 0 ${chartW} ${chartH}" preserveAspectRatio="xMidYMid meet">
        ${weeklyHistory.length > 0 ? `
        <!-- grid lines -->
        <line x1="${pad}" y1="${pad}" x2="${pad}" y2="${pad + plotH}" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>
        <line x1="${pad}" y1="${pad + plotH}" x2="${pad + plotW}" y2="${pad + plotH}" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>
        ${chartBars}
        ` : `
        <text x="${chartW / 2}" y="${chartH / 2}" text-anchor="middle" fill="var(--muted)" font-size="14">Not enough data</text>
        `}
      </svg>
    </div>
    <div class="chart-labels">
      ${chartLabels.map(l => `<span>${l.label}</span>`).join('')}
    </div>
    <div style="display:flex;gap:14px;margin-top:12px;flex-wrap:wrap;justify-content:center;font-size:0.75rem;color:var(--muted);">
      ${(['D','hD','W','E','O','S'] as const).filter(code => overallStats[code] > 0).map(code => {
        const label = catLookup.get(code) ?? code;
        const color = CAT_GROUP[code]?.color ?? 'var(--muted)';
        return `<span style="display:flex;align-items:center;gap:4px;">
          <span style="width:10px;height:10px;border-radius:2px;background:${color};display:inline-block;"></span>
          ${label}
        </span>`;
      }).join('')}
    </div>
  </section>

  <!-- ==================== INSIGHTS ==================== -->
  ${insights.length > 0 ? `
  <section class="section">
    <div class="insights">
      ${insights.map(ins => `
      <div class="insight-card">
        <div class="insight-title">${escHtml(ins.title)}</div>
        <div class="insight-text">${escHtml(ins.text)}</div>
      </div>
      `).join('')}
    </div>
  </section>
  ` : ''}

  <!-- ==================== RECENT ACTIVITY ==================== -->
  ${recentEntries.length > 0 ? `
  <section class="section card">
    <div class="card-title">Recent Activity</div>
    <div class="activity-list">
      ${recentEntries.map(entry => {
        const topCat = Object.entries(entry.stats).sort((a, b) => b[1] - a[1])[0];
        const color = topCat ? (CAT_GROUP[topCat[0]]?.color ?? '#888') : '#888';
        return `<div class="activity-item">
          <div class="activity-dot" style="background:${color}"></div>
          <div>
            <div class="activity-title">${escHtml(entry.date)}</div>
            <div class="activity-meta">
              ${Object.entries(entry.stats).map(([c, h]) => {
                const clr = CAT_GROUP[c]?.color ?? 'var(--muted)';
                const label = catLookup.get(c) ?? c;
                return `<span style="color:${clr}">${escHtml(label)}: ${fmtHours(h)}</span>`;
              }).join('<span style="color:var(--muted);opacity:0.4"> &middot; </span>')}
            </div>
          </div>
        </div>`;
      }).join('')}
    </div>
  </section>
  ` : ''}

  `}

  <!-- ==================== FOOTER ==================== -->
  <div class="footer">
    Pomodoro CLI Tracker &bull; ${escHtml(generatedAt)}
  </div>

</div>
</body>
</html>`;
}

function computeDayStatsForWeek(week: WeekData): Record<string, number> {
  const total: Record<string, number> = {};
  for (const date of Object.keys(week.slots)) {
    const dayStats = computeDayStats(week.slots[date]);
    for (const [code, hours] of Object.entries(dayStats)) {
      total[code] = (total[code] ?? 0) + hours;
    }
  }
  return total;
}
