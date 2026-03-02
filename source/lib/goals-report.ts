import { loadGoals, getRecentWeeks, isGoalComplete, getRating, type TrackedGoal, computeStreak, type GoalsData } from './goals.js';

export function generateGoalsHtmlReport(): string {
  const data = loadGoals();
  const numWeeks = 12; // Show 12 weeks for a better dashboard feel
  const weeks = getRecentWeeks(numWeeks); // oldest first, each is 7 days (Mon-Sun)
  const allDates = weeks.flat();
  const today = new Date().toISOString().split('T')[0]!;

  // 1. Calculate Dashboard Stats
  let totalPossible = data.goals.length * allDates.length;
  let totalCompleted = 0;
  let maxCurrentStreak = 0;
  let maxLongestStreak = 0;

  const goalStats = data.goals.map(goal => {
    const streak = computeStreak(goal.id, data);
    maxCurrentStreak = Math.max(maxCurrentStreak, streak.current);
    maxLongestStreak = Math.max(maxLongestStreak, streak.best);
    
    let goalCompletions = 0;
    allDates.forEach(date => {
      if (isGoalComplete(goal, date, data)) {
        goalCompletions++;
        totalCompleted++;
      }
    });
    
    return {
      goal,
      streak,
      completionRate: allDates.length > 0 ? (goalCompletions / allDates.length) * 100 : 0
    };
  });

  const overallCompletion = totalPossible > 0 ? Math.round((totalCompleted / totalPossible) * 100) : 0;

  // Trend Calculation (This week vs Last week)
  const thisWeekDates = allDates.slice(-7);
  const lastWeekDates = allDates.slice(-14, -7);
  
  const getCompletionForDates = (dates: string[]) => {
    if (dates.length === 0) return 0;
    let completed = 0;
    dates.forEach(date => {
      data.goals.forEach(goal => {
        if (isGoalComplete(goal, date, data)) completed++;
      });
    });
    return completed / (data.goals.length * dates.length);
  };

  const thisWeekRate = getCompletionForDates(thisWeekDates);
  const lastWeekRate = getCompletionForDates(lastWeekDates);
  const trend = Math.round((thisWeekRate - lastWeekRate) * 100);
  const trendColor = trend >= 0 ? 'var(--green)' : '#ff5252';
  const trendSign = trend >= 0 ? '↑' : '↓';

  // Best Month Calculation
  const monthCompletions: Record<string, { total: number; possible: number }> = {};
  allDates.forEach(date => {
    const monthKey = date.slice(0, 7); // YYYY-MM
    if (!monthCompletions[monthKey]) monthCompletions[monthKey] = { total: 0, possible: 0 };
    monthCompletions[monthKey]!.possible += data.goals.length;
    data.goals.forEach(goal => {
      if (isGoalComplete(goal, date, data)) monthCompletions[monthKey]!.total++;
    });
  });

  let bestMonth = "N/A";
  let maxDensity = -1;
  Object.entries(monthCompletions).forEach(([month, stats]) => {
    const density = stats.total / stats.possible;
    if (density > maxDensity) {
      maxDensity = density;
      const [y, m] = month.split('-');
      const monthName = new Date(parseInt(y!), parseInt(m!) - 1).toLocaleString('default', { month: 'short' });
      bestMonth = `${monthName} '${y!.slice(2)}`;
    }
  });

  // 2. Recent Activity Timeline
  const activity: { date: string; goalName: string; color: string; type: string; note?: string }[] = [];
  const recentDays = allDates.slice(-14).reverse(); // Last 2 weeks
  recentDays.forEach(date => {
    data.goals.forEach(goal => {
      if (isGoalComplete(goal, date, data)) {
        const note = data.notes[goal.id]?.[date];
        activity.push({
          date,
          goalName: goal.name,
          color: goal.color || '#00bcd4',
          type: goal.type === 'rate' ? `Rated ${getRating(goal, date, data)}/${goal.rateMax || 5}` : 'Completed',
          note
        });
      }
    });
  });
  const recentActivityHtml = activity.slice(0, 5).map(act => `
    <div class="activity-item">
      <div class="activity-dot" style="background:${act.color}"></div>
      <div class="activity-content">
        <div class="activity-title"><b>${act.goalName}</b> ${act.type}</div>
        <div class="activity-meta">${act.date}${act.note ? ` • "${act.note}"` : ''}</div>
      </div>
    </div>
  `).join('');

  // 3. Goal Heatmaps (7 rows, weeks as columns)
  const goalSectionsHtml = goalStats.map(({ goal, streak }) => {
    // Generate the 7-row grid (Rows: Mon-Sun, Cols: Weeks)
    let gridHtml = '';
    const dayNames = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
    
    for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
      let rowCells = `<div class="day-label">${dayNames[dayIdx]}</div>`;
      for (let weekIdx = 0; weekIdx < numWeeks; weekIdx++) {
        const date = weeks[weekIdx]?.[dayIdx];
        if (!date) {
          rowCells += `<div class="cell empty"></div>`;
          continue;
        }
        
        let color = '#21262d';
        let opacity = 1;
        const complete = isGoalComplete(goal, date, data);
        
        if (complete) {
          color = goal.color || '#00bcd4';
          if (goal.type === 'rate') {
            const val = getRating(goal, date, data);
            opacity = Math.max(0.2, val / (goal.rateMax || 5));
          }
        } else if (date > today) {
          color = 'transparent';
        }

        rowCells += `<div class="cell ${complete ? 'active' : ''}" title="${date}" style="background:${color}; opacity:${opacity}"></div>`;
      }
      gridHtml += `<div class="grid-row">${rowCells}</div>`;
    }

    const color = goal.color || '#00bcd4';
    return `
      <div class="goal-card">
        <div class="goal-header">
          <div class="goal-info">
            <div class="goal-accent" style="background:${color}"></div>
            <div class="goal-name-container">
              <span class="goal-name">${goal.name}</span>
              <span class="goal-type">${goal.type === 'auto' ? `Auto: #${goal.autoProject}` : goal.type}</span>
            </div>
          </div>
          <div class="goal-streak">${streak.current} <span class="fire">🔥</span></div>
        </div>
        <div class="heatmap-container">
          <div class="heatmap-grid">
            ${gridHtml}
          </div>
        </div>
      </div>
    `;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>9 Goals Dashboard</title>
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
    
    /* Header */
    header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; }
    h1 { color: var(--cyan); margin: 0; font-size: 32px; font-weight: 600; }
    .header-meta { color: var(--text-dim); font-size: 14px; margin-top: 8px; }

    /* Dashboard Grid */
    .dashboard-grid { display: grid; grid-template-columns: 1fr 2fr; gap: 24px; margin-bottom: 40px; }
    .stat-card { background: var(--card-bg); border-radius: 12px; padding: 24px; display: flex; align-items: center; position: relative; overflow: hidden; }
    
    .completion-card { display: flex; justify-content: space-between; }
    .completion-info h3 { margin: 0; color: var(--text-dim); font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
    .completion-val { font-size: 48px; font-weight: 700; margin: 8px 0; }
    .completion-trend { color: var(--green); font-size: 13px; font-weight: 500; }
    
    .progress-ring { width: 80px; height: 80px; position: relative; }
    .progress-ring svg { transform: rotate(-90deg); width: 100%; height: 100%; }
    .progress-ring circle { fill: none; stroke-width: 8; stroke-linecap: round; }
    .progress-ring .bg { stroke: #21262d; }
    .progress-ring .bar { stroke: var(--cyan); stroke-dasharray: 226; stroke-dashoffset: ${226 - (226 * overallCompletion / 100)}; transition: stroke-dashoffset 0.5s; }
    .progress-ring .label { 
      position: absolute; top: 0; left: 0; width: 100%; height: 100%; 
      display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600;
    }

    .streaks-row { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 2px; background: #30363d; border-radius: 12px; overflow: hidden; }
    .mini-stat { background: var(--card-bg); padding: 24px; display: flex; flex-direction: column; align-items: center; text-align: center; }
    .mini-stat h3 { margin: 0; color: var(--text-dim); font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px; }
    .mini-stat .val { font-size: 28px; font-weight: 700; }
    .mini-stat .val span { font-size: 16px; color: var(--text-dim); font-weight: 500; margin-left: 4px; }
    .val-streak { color: white; }
    .val-best { color: var(--green); }
    .val-perf { color: var(--cyan); }

    /* Main Content */
    .main-layout { display: grid; grid-template-columns: 2fr 1fr; gap: 24px; }
    
    .goals-list { display: flex; flex-direction: column; gap: 16px; }
    .goal-card { background: var(--card-bg); border-radius: 12px; padding: 20px; }
    .goal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
    .goal-info { display: flex; align-items: center; gap: 12px; }
    .goal-accent { width: 4px; height: 24px; border-radius: 2px; }
    .goal-name-container { display: flex; flex-direction: column; }
    .goal-name { font-size: 18px; font-weight: 600; }
    .goal-type { font-size: 12px; color: var(--text-dim); background: #21262d; padding: 2px 8px; border-radius: 4px; margin-top: 4px; width: fit-content; }
    .goal-streak { font-size: 18px; font-weight: 700; display: flex; align-items: center; gap: 4px; }
    .fire { color: var(--orange); }

    /* Heatmap Grid */
    .heatmap-grid { display: flex; flex-direction: column; gap: 3px; }
    .grid-row { display: flex; gap: 3px; align-items: center; }
    .day-label { width: 15px; font-size: 9px; color: var(--text-dim); text-align: center; margin-right: 4px; }
    .cell { width: 13px; height: 13px; border-radius: 2px; background: #21262d; border: 1px solid rgba(255,255,255,0.03); }
    .cell.active { border: none; }
    .cell.empty { background: transparent; border: none; }

    /* Sidebar */
    .activity-card { background: var(--card-bg); border-radius: 12px; padding: 24px; height: fit-content; }
    .activity-card h2 { margin: 0 0 20px 0; font-size: 18px; display: flex; align-items: center; gap: 8px; }
    .activity-list { display: flex; flex-direction: column; gap: 24px; position: relative; }
    .activity-list::before { content: ""; position: absolute; left: 5px; top: 10px; bottom: 10px; width: 1px; background: #30363d; }
    
    .activity-item { display: flex; gap: 16px; position: relative; }
    .activity-dot { width: 11px; height: 11px; border-radius: 50%; border: 2px solid var(--card-bg); margin-top: 4px; z-index: 1; }
    .activity-content { flex: 1; }
    .activity-title { font-size: 14px; color: var(--text); }
    .activity-meta { font-size: 12px; color: var(--text-dim); margin-top: 4px; }
    
    .view-history { display: block; text-align: center; margin-top: 24px; color: var(--cyan); font-size: 14px; font-weight: 600; text-decoration: none; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div>
        <h1>9 Goals Progress</h1>
        <div class="header-meta">Generated on ${new Date().toLocaleDateString()} • Showing last ${numWeeks} weeks</div>
      </div>
    </header>

    <div class="dashboard-grid">
      <div class="stat-card completion-card">
        <div class="completion-info">
          <h3>Overall Completion</h3>
          <div class="completion-val">${overallCompletion}%</div>
          <div class="completion-trend" style="color: ${trendColor}">${trendSign} ${Math.abs(trend)}% from last week</div>
        </div>
        <div class="progress-ring">
          <svg>
            <circle class="bg" cx="40" cy="40" r="36"></circle>
            <circle class="bar" cx="40" cy="40" r="36"></circle>
          </svg>
          <div class="label">${overallCompletion}%</div>
        </div>
      </div>
      
      <div class="streaks-row">
        <div class="mini-stat">
          <h3>Current Streak</h3>
          <div class="val val-streak">${maxCurrentStreak} <span>Days</span></div>
        </div>
        <div class="mini-stat">
          <h3>Longest Streak</h3>
          <div class="val val-best">${maxLongestStreak} <span>Days</span></div>
        </div>
        <div class="mini-stat">
          <h3>Best Performance</h3>
          <div class="val val-perf">${bestMonth}</div>
        </div>
      </div>
    </div>

    <div class="main-layout">
      <div class="goals-list">
        ${goalSectionsHtml}
      </div>
      
      <div class="activity-sidebar">
        <div class="activity-card">
          <h2>🕒 Recent Activity</h2>
          <div class="activity-list">
            ${recentActivityHtml || '<div style="color:var(--text-dim)">No recent activity</div>'}
          </div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
}
