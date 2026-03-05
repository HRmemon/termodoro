import { listWeeks, loadWeek, getCategories, computeDayStats, type WeekData, ALL_SLOTS } from './tracker.js';
import { getTodayStr } from './date-utils.js';

export function generateTrackerHtmlReport(): string {
  const weekList = listWeeks(); // sorted newest to oldest
  const weeks = weekList.map(ws => loadWeek(ws)).filter((w): w is WeekData => w !== null);
  const categories = getCategories();
  const today = getTodayStr();
  
  // 1. Calculate Dashboard Stats
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

  // Trend (This week vs Last week)
  const getWeekHours = (w?: WeekData) => {
    if (!w) return 0;
    let sum = 0;
    for (const date of Object.keys(w.slots)) {
      const dayStats = computeDayStats(w.slots[date]);
      sum += Object.values(dayStats).reduce((a, b) => a + b, 0);
    }
    return sum;
  };

  const thisWeekHours = getWeekHours(weeks[0]);
  const lastWeekHours = getWeekHours(weeks[1]);
  const trend = lastWeekHours > 0 ? Math.round(((thisWeekHours - lastWeekHours) / lastWeekHours) * 100) : 0;
  const trendColor = trend >= 0 ? 'var(--green)' : '#ff5252';
  const trendSign = trend >= 0 ? '↑' : '↓';

  // Most active category
  const mostActive = Object.entries(overallStats).sort((a, b) => b[1] - a[1])[0];
  const mostActiveLabel = mostActive ? categories.find(c => c.code === mostActive[0])?.label ?? mostActive[0] : 'N/A';

  const catColors: Record<string, string> = {
    D: '#00bcd4', hD: '#42a5f5', E: '#4caf50', O: '#ffb300',
    S: '#1565c0', N: '#9e9e9e', W: '#e53935', SF: '#ff1744', WU: '#e040fb',
  };

  const fmt = (h: number) => h >= 10 ? h.toFixed(1) + 'h' : h.toFixed(2) + 'h';

  // 2. Recent Entries (last 5 days with data)
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

  const recentActivityHtml = recentEntries.map(entry => {
    const topCat = Object.entries(entry.stats).sort((a, b) => b[1] - a[1])[0];
    const color = topCat ? (catColors[topCat[0]] ?? '#888') : '#888';
    return `
      <div class="activity-item">
        <div class="activity-dot" style="background:${color}"></div>
        <div class="activity-content">
          <div class="activity-title"><b>${entry.date}</b></div>
          <div class="activity-meta">
            ${Object.entries(entry.stats).map(([c, h]) => `<span style="color:${catColors[c] || '#888'}">${c}:${fmt(h)}</span>`).join(' • ')}
          </div>
        </div>
      </div>
    `;
  }).join('');

  // 3. Category Distribution Bars
  const categoryBarsHtml = categories.map(cat => {
    const hours = overallStats[cat.code] ?? 0;
    if (hours === 0) return '';
    const maxVal = Math.max(...Object.values(overallStats), 1);
    const pct = Math.min(100, (hours / maxVal) * 100);
    const color = catColors[cat.code] ?? '#888';
    return `
      <div style="margin:12px 0">
        <div style="display:flex; justify-content:space-between; margin-bottom:6px; font-size:13px">
          <span><b style="color:${color}">${cat.code}</b> ${cat.label}</span>
          <span style="color:var(--text-dim)">${fmt(hours)}</span>
        </div>
        <div style="background:#21262d; height:8px; border-radius:4px; overflow:hidden">
          <div style="background:${color}; width:${pct}%; height:100%; border-radius:4px"></div>
        </div>
      </div>
    `;
  }).join('');

  // 4. Weekly Breakdown Cards
  const weeklySectionsHtml = weeks.slice(0, 8).map(week => {
    const weekTotal: Record<string, number> = {};
    let weekSum = 0;
    for (const date of Object.keys(week.slots)) {
      const dayStats = computeDayStats(week.slots[date]);
      for (const [code, hours] of Object.entries(dayStats)) {
        weekTotal[code] = (weekTotal[code] ?? 0) + hours;
        weekSum += hours;
      }
    }

    const weekRows = Object.entries(weekTotal)
      .sort((a, b) => b[1] - a[1])
      .map(([code, hours]) => {
        const color = catColors[code] ?? '#888';
        return `<div class="week-cat-tag"><span class="dot" style="background:${color}"></span><b>${code}</b> ${fmt(hours)}</div>`;
      }).join('');

    return `
      <div class="week-item" style="border-bottom: 1px solid #21262d; padding-bottom: 15px; margin-bottom: 15px;">
        <div class="goal-header">
          <div class="goal-info">
            <div class="goal-accent" style="background:var(--cyan)"></div>
            <div class="goal-name-container">
              <span class="goal-name">${week.week}</span>
              <span class="goal-type">Started ${week.start}</span>
            </div>
          </div>
          <div class="goal-streak">${fmt(weekSum)}</div>
        </div>
        <div class="week-cat-grid">
          ${weekRows || '<div style="color:var(--text-dim)">No data recorded</div>'}
        </div>
      </div>
    `;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Time Tracker Dashboard</title>
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
    body { 
      background: var(--bg); 
      color: var(--text); 
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; 
      padding: 40px; 
      margin: 0; 
      display: flex;
      justify-content: center;
    }
    .container { max-width: 1200px; width: 100%; }
    
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
    .completion-trend { font-size: 13px; font-weight: 500; }
    
    .streaks-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2px; background: #30363d; border-radius: 12px; overflow: hidden; border: 1px solid #30363d; }
    .mini-stat { background: var(--card-bg); padding: 24px; display: flex; flex-direction: column; align-items: center; text-align: center; justify-content: center; }
    .mini-stat h3 { margin: 0; color: var(--text-dim); font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px; }
    .mini-stat .val { font-size: 24px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; width: 100%; line-height: 1.2; }

    .main-layout { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); gap: 24px; }
    
    .goals-list { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
    .goal-card { background: var(--card-bg); border-radius: 12px; padding: 20px; display: flex; flex-direction: column; border: 1px solid #30363d; }
    .goal-card.scrollable { max-height: 500px; }
    .goal-content { overflow-y: auto; flex: 1; padding-right: 10px; min-height: 0; }
    .goal-content::-webkit-scrollbar { width: 6px; }
    .goal-content::-webkit-scrollbar-thumb { background: #30363d; border-radius: 3px; }

    .goal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; flex-shrink: 0; }
    .goal-info { display: flex; align-items: center; gap: 12px; }
    .goal-accent { width: 4px; height: 24px; border-radius: 2px; }
    .goal-name { font-size: 18px; font-weight: 600; }
    .goal-type { font-size: 12px; color: var(--text-dim); margin-top: 2px; }
    .goal-streak { font-size: 18px; font-weight: 700; }

    .week-cat-grid { display: flex; flex-wrap: wrap; gap: 10px; }
    .week-cat-tag { background: #21262d; padding: 4px 10px; border-radius: 6px; font-size: 13px; display: flex; align-items: center; gap: 6px; }
    .week-cat-tag .dot { width: 6px; height: 6px; border-radius: 50%; }

    .activity-sidebar { min-width: 0; }
    .activity-card { background: var(--card-bg); border-radius: 12px; padding: 24px; height: fit-content; border: 1px solid #30363d; }
    .activity-card h2 { margin: 0 0 20px 0; font-size: 18px; }
    .activity-list { display: flex; flex-direction: column; gap: 20px; position: relative; max-height: 600px; overflow-y: auto; padding-right: 10px; min-height: 0; }
    .activity-list::-webkit-scrollbar { width: 4px; }
    .activity-list::-webkit-scrollbar-thumb { background: #30363d; border-radius: 2px; }
    .activity-list::before { content: ""; position: absolute; left: 5px; top: 10px; bottom: 10px; width: 1px; background: #30363d; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div>
        <h1>Time Tracker Dashboard</h1>
        <div class="header-meta">Generated on ${new Date().toLocaleDateString()} • Tracking ${weeks.length} weeks</div>
      </div>
    </header>

    <div class="dashboard-grid">
      <div class="stat-card">
        <div class="completion-info">
          <h3>Total Tracked</h3>
          <div class="completion-val">${fmt(totalTrackedHours)}</div>
          <div class="completion-trend" style="color: ${trendColor}">${trendSign} ${Math.abs(trend)}% from last week</div>
        </div>
      </div>
      
      <div class="streaks-row">
        <div class="mini-stat">
          <h3>Most Frequent</h3>
          <div class="val">${mostActiveLabel}</div>
        </div>
        <div class="mini-stat">
          <h3>Avg Weekly</h3>
          <div class="val">${fmt(totalTrackedHours / Math.max(1, weeks.length))}</div>
        </div>
        <div class="mini-stat">
          <h3>Last Tracked</h3>
          <div class="val">${weeks[0]?.week || 'N/A'}</div>
        </div>
      </div>
    </div>

    <div class="main-layout">
      <div class="goals-list">
        <div class="goal-card scrollable">
          <div class="goal-header" style="margin-bottom: 25px">
            <div class="goal-info">
              <div class="goal-accent" style="background:var(--cyan)"></div>
              <span class="goal-name">Overall Distribution</span>
            </div>
          </div>
          <div class="goal-content">
            ${categoryBarsHtml}
          </div>
        </div>
        <div class="goal-card scrollable">
          <div class="goal-header">
            <div class="goal-info">
              <div class="goal-accent" style="background:var(--orange)"></div>
              <span class="goal-name">Weekly Breakdown</span>
            </div>
          </div>
          <div class="goal-content" style="display: flex; flex-direction: column; gap: 16px;">
            ${weeklySectionsHtml}
          </div>
        </div>
      </div>
      
      <div class="activity-sidebar">
        <div class="activity-card">
          <h2>🕒 Recent Entries</h2>
          <div class="activity-list">
            ${recentActivityHtml || '<div style="color:var(--text-dim)">No recent data</div>'}
          </div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

