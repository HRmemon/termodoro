import { aggregateMetric, computeDayStreak, getMetricTarget, getWindowDates, loadGoals } from './goals.js';
import { getTodayStr } from './date-utils.js';

const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

export function generateGoalsHtmlReport(): string {
  const data = loadGoals();
  const dates = getWindowDates('week');
  const streak = computeDayStreak(data);
  const areas = data.areas.map(area => `
    <section><h2>${escapeHtml(area.name)}</h2>
      ${area.goals.map(goal => `<h3>${escapeHtml(goal.name)}</h3><div class="metrics">${goal.metrics.map(metric => {
        const value = aggregateMetric(metric, data, dates);
        const target = getMetricTarget(metric, 'week', dates.length);
        const progress = target ? Math.min(100, Math.round(value / target * 100)) : 0;
        return `<div class="metric"><span>${escapeHtml(metric.name)}</span><b>${value}${target === undefined ? '' : ` / ${target}`}</b><i><em style="width:${progress}%"></em></i></div>`;
      }).join('')}</div>`).join('')}
    </section>`).join('');

  return `<!doctype html><html><head><meta charset="utf-8"><title>Goals</title><style>
    :root{color-scheme:dark}body{max-width:900px;margin:40px auto;padding:0 24px;background:#0b0e14;color:#e6edf3;font:15px system-ui}header{display:flex;justify-content:space-between;align-items:end;border-bottom:1px solid #30363d}h1{color:#22d3ee}h2{margin-top:32px;color:#22d3ee}h3{margin:20px 0 8px}.metrics{display:grid;gap:8px}.metric{display:grid;grid-template-columns:1fr 100px 160px;gap:16px;align-items:center}.metric b{text-align:right}.metric i{height:8px;background:#21262d}.metric em{display:block;height:100%;background:#22d3ee}</style></head><body>
    <header><div><h1>Goals</h1><p>Week of ${dates[0]}</p></div><p>${streak.current}d perfect streak · Best ${streak.best}d</p></header>${areas}
    <footer><p>Generated ${getTodayStr()}</p></footer></body></html>`;
}
