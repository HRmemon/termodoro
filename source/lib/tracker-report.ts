import { listWeeks, loadWeek, getCategories, computeDayStats, type WeekData } from './tracker.js';

export function generateTrackerHtmlReport(): string {
  const weekList = listWeeks(); // sorted newest to oldest
  const weeks = weekList.map(ws => loadWeek(ws)).filter((w): w is WeekData => w !== null);
  const categories = getCategories();
  
  const overallStats: Record<string, number> = {};
  for (const week of weeks) {
    for (const date of Object.keys(week.slots)) {
      const dayStats = computeDayStats(week.slots[date]);
      for (const [code, hours] of Object.entries(dayStats)) {
        overallStats[code] = (overallStats[code] ?? 0) + hours;
      }
    }
  }

  const catColors: Record<string, string> = {
    D: '#00bcd4', hD: '#42a5f5', E: '#4caf50', O: '#ffb300',
    S: '#1565c0', N: '#9e9e9e', W: '#e53935', SF: '#ff1744', WU: '#e040fb',
  };

  const fmt = (h: number) => h >= 10 ? h.toFixed(1) + 'h' : h.toFixed(2) + 'h';

  const overallRows = categories.map(cat => {
    const hours = overallStats[cat.code] ?? 0;
    if (hours === 0) return '';
    const maxVal = Math.max(...Object.values(overallStats), 1);
    const pct = Math.min(100, (hours / maxVal) * 100);
    const color = catColors[cat.code] ?? '#888';
    return `
      <div style="margin:8px 0">
        <div style="display:flex; justify-content:space-between; margin-bottom:4px">
          <span><b style="color:${color}">${cat.code}</b> ${cat.label}</span>
          <span>${fmt(hours)}</span>
        </div>
        <div style="background:#333; height:12px; border-radius:6px; overflow:hidden">
          <div style="background:${color}; width:${pct}%; height:100%"></div>
        </div>
      </div>
    `;
  }).join('');

  const weeklySections = weeks.map(week => {
    const weekTotal: Record<string, number> = {};
    for (const date of Object.keys(week.slots)) {
      const dayStats = computeDayStats(week.slots[date]);
      for (const [code, hours] of Object.entries(dayStats)) {
        weekTotal[code] = (weekTotal[code] ?? 0) + hours;
      }
    }

    const weekRows = categories.map(cat => {
      const hours = weekTotal[cat.code] ?? 0;
      if (hours === 0) return '';
      const color = catColors[cat.code] ?? '#888';
      return `<span style="display:inline-block; margin-right:15px; border-left:4px solid ${color}; padding-left:6px; margin-bottom: 5px"><b>${cat.code}</b> ${fmt(hours)}</span>`;
    }).filter(Boolean).join('');

    return `
      <div style="margin-bottom:25px; background:#222; padding:15px; border-radius:8px">
        <h3 style="margin-top:0; color:#00bcd4">${week.week} (Started ${week.start})</h3>
        <div style="display:flex; flex-wrap:wrap">${weekRows || '<i style="color:#666">No data recorded</i>'}</div>
      </div>
    `;
  }).join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Tracker Summary Report</title>
  <style>
    body { background:#1a1a2e; color:#e0e0e0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; padding:40px; max-width:800px; margin:0 auto; line-height:1.5 }
    h1, h2 { color:#00bcd4; border-bottom:1px solid #333; padding-bottom:10px }
    .card { background:#25273c; padding:25px; border-radius:12px; margin-bottom:30px; box-shadow: 0 4px 20px rgba(0,0,0,0.3) }
  </style>
</head>
<body>
  <h1>Tracker Summary</h1>
  <p style="color:#888">Generated on ${new Date().toLocaleString()}</p>

  <div class="card">
    <h2>Overall Totals</h2>
    ${overallRows}
  </div>

  <h2>Weekly Breakdown</h2>
  ${weeklySections}
</body>
</html>`;
}
