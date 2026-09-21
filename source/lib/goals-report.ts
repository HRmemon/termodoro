import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  aggregateMetric,
  computeDayStreak,
  getLatestMetricNote,
  getMetricTarget,
  getPlanAreas,
  getRecentDates,
  getWindowDates,
  loadGoals,
  normalizeGoals,
  type GoalMetric,
  type GoalsData,
  type GoalWindow,
} from './goals.js';
import { MONTH_NAMES_FULL, getTodayStr } from './date-utils.js';
import { DATA_DIR } from './paths.js';
import { atomicWriteJSON, readJSON } from './fs-utils.js';

export const GOALS_REPORT_PATH = path.join(DATA_DIR, 'goals-dashboard.html');
export const GOALS_HISTORY_DIR = path.join(DATA_DIR, 'goals-history');

const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
const numberLabel = (value: number): string => Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, '');
const GOAL_PRESENTATION: Record<string, { icon: string; summary: string }> = {
  'interview-preparation': { icon: '🎯', summary: 'study + capture notes' },
  'ielts-writing': { icon: '✍️', summary: 'practice + band target' },
  'ielts-reading': { icon: '📖', summary: 'practice + score target' },
  'ielts-listening': { icon: '🎧', summary: 'practice + score target' },
  'ielts-speaking': { icon: '🗣️', summary: 'practice + band + weekly' },
  'money-wider': { icon: '🧭', summary: 'research checkpoints' },
  'money-deeper': { icon: '🔎', summary: '30m research blocks' },
  'money-decisions': { icon: '◆', summary: 'count target' },
  'masters-universities': { icon: '🏛️', summary: 'research checkpoint' },
  'masters-scholarships': { icon: '🎓', summary: 'research checkpoint' },
  'masters-ielts': { icon: '📅', summary: 'booking decisions' },
  'jit-current-book': { icon: '📚', summary: 'learn + apply + simplify' },
  'jit-learning-plan': { icon: '🧠', summary: 'AI-led learning plan' },
};

function metricValue(metric: GoalMetric, value: number, target?: number): string {
  if (metric.aggregate === 'any') return value ? 'Done' : 'Open';
  const suffix = metric.unit === '%' ? '%' : '';
  return `${numberLabel(value)}${suffix}${target === undefined ? '' : ` <span>/ ${numberLabel(target)}${suffix}</span>`}`;
}

function renderCompactWeek(data: GoalsData, anchor: string): string {
  const dates = getWindowDates('week', anchor, data.weekStartsOn);
  return `<div class="compact-week">${getPlanAreas(data, 'week', anchor).filter(area => !area.archivedAt).map((area, areaIndex) => {
    const goals = area.goals.filter(goal => !goal.archivedAt);
    const metricCount = goals.reduce((count, goal) => count + goal.metrics.length, 0);
    const targetedMetrics = goals.flatMap(goal => goal.metrics).filter(metric => getMetricTarget(metric, 'week', dates.length) !== undefined);
    const met = targetedMetrics.filter(metric => {
      const target = getMetricTarget(metric, 'week', dates.length);
      return target !== undefined && aggregateMetric(metric, data, dates) >= target;
    }).length;
    return `<section class="compact-area">
      <header class="compact-area-head">
        <span class="num">${String(areaIndex + 1).padStart(2, '0')}</span>
        <div class="label"><h3>${escapeHtml(area.name)}</h3><small>${goals.length} goals · ${metricCount} metrics</small></div>
        <span class="summary">${met}/${targetedMetrics.length} targets met</span>
      </header>
      <div class="compact-goals">${goals.map(goal => {
        const presentation = GOAL_PRESENTATION[goal.id] ?? { icon: '◇', summary: `${goal.metrics.length} metrics` };
        return `<div class="compact-goal">
          <div class="compact-goal-name"><span class="goal-icon" aria-hidden="true">${presentation.icon}</span><div><strong>${escapeHtml(goal.name)}</strong><span>${escapeHtml(presentation.summary)}</span></div></div>
          <div class="compact-metrics">${goal.metrics.map(metric => {
            if (metric.input === 'note') {
              const note = getLatestMetricNote(data, metric.id, dates.at(-1)!);
              return `<div class="metric-chip note wide ${note ? 'good' : 'idle'}"${note ? ` title="${escapeHtml(note)}"` : ''}><span class="m-name">${escapeHtml(metric.name)}</span><span class="state">${note ? '📝' : '○'}</span></div>`;
            }
            const value = aggregateMetric(metric, data, dates);
            const target = getMetricTarget(metric, 'week', dates.length);
            const progress = target ? Math.min(100, Math.round(value / target * 100)) : 0;
            const wide = metric.name.length > 16 ? ' wide' : '';
            if (metric.input === 'checkbox' && target === 1) {
              const done = value >= target;
              return `<div class="metric-chip check ${done ? 'done good' : 'open idle'}${wide}"><span class="m-name">${escapeHtml(metric.name)}</span><span class="state" aria-label="${done ? 'Done' : 'Open'}">${done ? '✓' : '○'}</span></div>`;
            }
            const state = value === 0 ? 'idle' : progress >= 75 ? 'good' : 'warn';
            return `<div class="metric-chip ${state}${wide}"><span class="m-name">${escapeHtml(metric.name)}</span><span class="m-value">${metricValue(metric, value, target)}</span>${target === undefined ? '' : `<span class="tiny-track"><i style="width:${progress}%"></i></span>`}</div>`;
          }).join('')}</div>
        </div>`;
      }).join('')}</div>
    </section>`;
  }).join('')}</div><div class="compact-legend"><span><b>Bars</b> = count, score, or latest value</span><span><b>✓ / ○</b> = complete / open checkpoint</span><span>Progress stays in its native unit.</span></div>`;
}

function renderPeriod(data: GoalsData, window: Exclude<GoalWindow, 'today'>, anchor: string): string {
  const dates = getWindowDates(window, anchor, data.weekStartsOn);
  return getPlanAreas(data, window, anchor).filter(area => !area.archivedAt).map((area, areaIndex) => `
    <section class="area-card">
      <header class="area-heading">
        <span>${String(areaIndex + 1).padStart(2, '0')}</span>
        <div><p>Area · ${window}</p><h2>${escapeHtml(area.name)}</h2></div>
        <small>${area.goals.filter(goal => !goal.archivedAt).length} goals</small>
      </header>
      <div class="goal-list">
        ${area.goals.filter(goal => !goal.archivedAt).map(goal => `
          <section class="goal-block">
            <div class="goal-title"><h3><i aria-hidden="true">${GOAL_PRESENTATION[goal.id]?.icon ?? '◇'}</i>${escapeHtml(goal.name)}</h3><span>${goal.metrics.length} metrics</span></div>
            <div class="metric-grid">
              ${goal.metrics.map(metric => {
                if (metric.input === 'note') {
                  const note = getLatestMetricNote(data, metric.id, dates.at(-1)!);
                  return `<article class="metric${note ? ' complete' : ''}">
                    <div class="metric-heading"><h4>${escapeHtml(metric.name)}</h4><strong>${note ? 'Saved' : 'Open'}</strong></div>
                    <div class="note-preview"${note ? ` title="${escapeHtml(note)}"` : ''}>${note ? escapeHtml(note) : 'No note yet'}</div>
                    <p>note · carried forward</p>
                  </article>`;
                }
                const value = aggregateMetric(metric, data, dates);
                const target = getMetricTarget(metric, window, dates.length);
                const progress = target ? Math.min(100, Math.round(value / target * 100)) : 0;
                const complete = target !== undefined && value >= target;
                return `<article class="metric${complete ? ' complete' : ''}">
                  <div class="metric-heading"><h4>${escapeHtml(metric.name)}</h4><strong>${metricValue(metric, value, target)}</strong></div>
                  ${target === undefined ? '' : `<div class="progress-track" role="progressbar" aria-label="${escapeHtml(metric.name)}" aria-valuemin="0" aria-valuemax="${target}" aria-valuenow="${value}"><span style="width:${progress}%"></span></div>`}
                  <p>${metric.input} · ${metric.aggregate}</p>
                </article>`;
              }).join('')}
            </div>
          </section>`).join('')}
      </div>
    </section>`).join('');
}

function renderWeeklyOnly(data: GoalsData, anchor: string): string {
  const month = anchor.slice(0, 7);
  const items = Object.entries(data.weeklyPlans).filter(([start]) => getWindowDates('week', start, data.weekStartsOn).some(date => date.startsWith(month))).flatMap(([start, areas]) =>
    areas.flatMap(area => area.goals.flatMap(goal => goal.metrics.filter(metric => !metric.contributesTo).map(metric => `${escapeHtml(area.name || 'Untitled Category')} · ${escapeHtml(goal.name)} · ${escapeHtml(metric.name)} <small>${start}</small>`))));
  return `<details class="weekly-only"><summary>Weekly-only additions (${items.length})</summary>${items.map(item => `<div>${item}</div>`).join('')}</details>`;
}

export function renderGoalsHtml(data: GoalsData, anchor = getTodayStr(), initialWindow: 'week' | 'month' = 'week'): string {
  const streak = computeDayStreak(data, anchor);
  const history = getRecentDates(365, anchor);
  const firstDay = new Date(`${history[0]}T00:00:00`).getDay();
  const blanks = firstDay === 0 ? 6 : firstDay - 1;
  const heatmap = `${'<span class="heat-blank"></span>'.repeat(blanks)}${history.map(date => {
    const quality = data.dayQuality[date];
    const label = quality === 'perfect' ? 'Perfect' : quality === 'excused' ? 'Missed with reason' : quality === 'missed' ? 'Missed without reason' : 'Unchecked';
    const note = data.dayNotes[date];
    const tooltip = `${date} · ${label}${note ? ` · Note: ${note}` : ''}`;
    return `<span class="heat-cell ${quality ?? ''}${note ? ' has-note' : ''}" title="${escapeHtml(tooltip)}" aria-label="${escapeHtml(tooltip)}" role="img"></span>`;
  }).join('')}`;
  const qualityCounts = history.reduce((counts, date) => {
    const quality = data.dayQuality[date];
    if (quality) counts[quality]++;
    return counts;
  }, { perfect: 0, excused: 0, missed: 0 });
  const [year, month] = anchor.split('-').map(Number);
  const weekDates = getWindowDates('week', anchor, data.weekStartsOn);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Goal ledger</title>
  <style>
    :root { --paper:#f1ede3; --card:#fbf8f0; --ink:#20231f; --muted:#77786f; --line:#d8d2c3; --moss:#426b50; --moss-soft:#c9d8c4; --ember:#e75b2c; --amber:#c69235; --red:#a64b3c; --shadow:0 18px 55px rgba(42,39,31,.09); }
    * { box-sizing:border-box; }
    body { margin:0; min-height:100vh; color:var(--ink); background:var(--paper); font-family:Georgia, 'Times New Roman', serif; }
    body::before { content:""; position:fixed; inset:0; pointer-events:none; opacity:.28; background-image:radial-gradient(rgba(32,35,31,.18) .55px, transparent .55px); background-size:5px 5px; mix-blend-mode:multiply; }
    button { font:inherit; }
    .shell { width:min(1180px, calc(100% - 32px)); margin:0 auto; padding:36px 0 56px; position:relative; }
    .masthead { display:flex; align-items:flex-end; justify-content:space-between; gap:24px; margin-bottom:18px; }
    .eyebrow, .area-heading p, .metric p { margin:0 0 7px; color:var(--moss); font:700 10px/1.2 ui-monospace, SFMono-Regular, Consolas, monospace; letter-spacing:.15em; text-transform:uppercase; }
    h1 { margin:0; font-size:clamp(38px, 6vw, 60px); line-height:.9; font-weight:500; letter-spacing:-.055em; }
    .stamp { text-align:right; color:var(--muted); font:12px/1.6 ui-monospace, SFMono-Regular, Consolas, monospace; }
    .streak-card { display:grid; grid-template-columns:190px 1fr; gap:24px; padding:20px 24px; overflow:hidden; color:var(--card); background:var(--ink); border-radius:3px 24px 3px 3px; box-shadow:var(--shadow); }
    .streak-number { display:grid; grid-template-columns:46px 1fr; align-items:center; gap:12px; border-right:1px solid #4a4d47; }
    .flame { width:46px; height:46px; display:grid; place-items:center; border-radius:50%; background:${streak.current ? '#613524' : '#343730'}; filter:${streak.current ? 'none' : 'grayscale(1)'}; font-size:25px; }
    .streak-number strong { display:block; font:500 32px/.85 ui-monospace, SFMono-Regular, Consolas, monospace; }
    .streak-number span, .streak-number small { display:block; margin-top:7px; color:#aeb0a9; font:11px/1.3 ui-monospace, SFMono-Regular, Consolas, monospace; text-transform:uppercase; letter-spacing:.1em; }
    .streak-number small { grid-column:1/-1; text-transform:none; letter-spacing:0; }
    .heat-scroll { overflow-x:auto; padding:2px 0 7px; }
    .heatmap { display:grid; grid-template-rows:repeat(7, 10px); grid-auto-flow:column; grid-auto-columns:10px; gap:4px; width:max-content; min-width:100%; }
    .heat-cell { width:10px; height:10px; border-radius:2px; background:#3c4039; }
    .heat-cell.perfect { background:#71a36f; } .heat-cell.excused { background:var(--amber); } .heat-cell.missed { background:var(--red); }
    .heat-cell.has-note { box-shadow:inset 0 0 0 1px #eef0e7, 0 0 0 1px #7e8278; }
    .heat-blank { visibility:hidden; }
    .heat-legend { display:flex; justify-content:space-between; gap:18px; margin-top:7px; color:#aeb0a9; font:10px/1.2 ui-monospace, SFMono-Regular, Consolas, monospace; text-transform:uppercase; letter-spacing:.07em; }
    .legend-items { display:flex; gap:14px; } .legend-items i { display:inline-block; width:8px; height:8px; margin-right:5px; border-radius:2px; }
    .tabs { display:flex; gap:5px; margin:16px 0; border-bottom:1px solid var(--line); }
    .tabs button { border:0; background:none; color:var(--muted); padding:11px 20px; cursor:pointer; position:relative; font-size:14px; }
    .tabs button::after { content:""; position:absolute; left:22px; right:22px; bottom:-1px; height:2px; background:var(--ink); transform:scaleX(0); transition:transform .18s ease; }
    .tabs button[aria-selected="true"] { color:var(--ink); } .tabs button[aria-selected="true"]::after { transform:scaleX(1); }
    [role="tabpanel"][hidden] { display:none; } [role="tabpanel"] { animation:arrive .3s ease both; }
    @keyframes arrive { from { opacity:0; transform:translateY(7px); } }
    .period-heading { display:flex; justify-content:space-between; align-items:end; margin:24px 0 13px; }
    .period-heading h2 { margin:0; font-size:26px; font-weight:500; letter-spacing:-.025em; } .period-heading span { color:var(--muted); font:11px/1.2 ui-monospace, SFMono-Regular, Consolas, monospace; }
    .area-card { margin-bottom:18px; background:var(--card); border:1px solid var(--line); box-shadow:var(--shadow); }
    .area-heading { display:grid; grid-template-columns:48px 1fr auto; align-items:center; min-height:72px; padding:0 20px; border-bottom:1px solid var(--line); }
    .area-heading>span { color:var(--line); font:22px/1 ui-monospace, SFMono-Regular, Consolas, monospace; }
    .area-heading h2 { margin:0; font-size:22px; font-weight:500; } .area-heading small, .goal-title span { color:var(--muted); font:9px/1 ui-monospace, SFMono-Regular, Consolas, monospace; text-transform:uppercase; letter-spacing:.08em; }
    .goal-block { padding:16px 20px 18px; border-bottom:1px solid var(--line); } .goal-block:last-child { border-bottom:0; }
    .goal-title { display:flex; justify-content:space-between; align-items:baseline; margin-bottom:10px; } .goal-title h3 { display:flex; align-items:center; gap:8px; margin:0; font-size:17px; font-weight:500; } .goal-title h3 i { width:22px; font-style:normal; font-size:16px; filter:saturate(.72); }
    .metric-grid { display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); border-top:1px solid var(--line); border-left:1px solid var(--line); }
    .metric { min-height:98px; padding:14px 16px; border-right:1px solid var(--line); border-bottom:1px solid var(--line); background:rgba(241,237,227,.28); }
    .metric-heading { display:flex; justify-content:space-between; gap:18px; align-items:baseline; } .metric h4 { margin:0; font-size:15px; font-weight:500; }
    .metric strong { white-space:nowrap; font:16px/1 ui-monospace, SFMono-Regular, Consolas, monospace; } .metric strong span { color:var(--muted); font-size:10px; }
    .metric p { margin:9px 0 0; color:var(--muted); font-size:8px; }
    .note-preview { margin-top:15px; overflow:hidden; color:var(--muted); font:11px/1.35 ui-monospace,SFMono-Regular,Consolas,monospace; white-space:nowrap; text-overflow:ellipsis; }
    .weekly-only { margin:18px 0; padding:14px 18px; border:1px solid var(--line); background:var(--card); } .weekly-only summary { cursor:pointer; } .weekly-only div { margin-top:8px; color:var(--muted); font:12px/1.4 ui-monospace,monospace; }
    .progress-track { height:7px; margin-top:18px; overflow:hidden; background:#ded8c9; border-radius:99px; } .progress-track span { display:block; height:100%; background:var(--moss); border-radius:inherit; }
    .metric.complete { background:rgba(201,216,196,.28); } .metric.complete .progress-track span { background:#527b5c; }
    footer { display:flex; justify-content:space-between; margin-top:34px; padding-top:14px; border-top:1px solid var(--line); color:var(--muted); font:10px/1.5 ui-monospace, SFMono-Regular, Consolas, monospace; text-transform:uppercase; letter-spacing:.08em; }
    @media (max-width:900px) { .metric-grid { grid-template-columns:repeat(2, minmax(0, 1fr)); } }
    @media (max-width:620px) { .shell { width:min(100% - 20px, 620px); padding-top:24px; } .stamp { display:none; } .streak-card { grid-template-columns:1fr; padding:18px; } .streak-number { border-right:0; border-bottom:1px solid #4a4d47; padding-bottom:14px; } .metric-grid { grid-template-columns:1fr; } .area-heading { grid-template-columns:38px 1fr; padding:0 14px; } .area-heading small { display:none; } }
    @media (prefers-reduced-motion:reduce) { *, *::before, *::after { animation:none !important; transition:none !important; } }
    #panel-week .compact-week { display:grid; gap:12px; }
    #panel-week .compact-area { background:var(--card); border:1px solid var(--line); box-shadow:0 10px 30px rgba(42,39,31,.055); }
    #panel-week .compact-area-head { display:grid; grid-template-columns:40px 1fr auto; align-items:center; min-height:50px; padding:0 14px; border-bottom:1px solid var(--line); }
    #panel-week .compact-area-head .num { color:var(--line); font:18px/1 ui-monospace,SFMono-Regular,Consolas,monospace; }
    #panel-week .compact-area-head .label { display:flex; align-items:baseline; gap:9px; min-width:0; }
    #panel-week .compact-area-head h3 { margin:0; font-size:18px; font-weight:500; }
    #panel-week .compact-area-head small, #panel-week .compact-area-head .summary { color:var(--muted); font:9px/1 ui-monospace,SFMono-Regular,Consolas,monospace; text-transform:uppercase; letter-spacing:.08em; }
    #panel-week .compact-goal { display:grid; grid-template-columns:minmax(175px,.85fr) minmax(0,2.6fr); gap:14px; align-items:center; min-height:46px; padding:7px 14px; border-bottom:1px solid rgba(216,210,195,.72); }
    #panel-week .compact-goal:last-child { border-bottom:0; }
    #panel-week .compact-goal-name { display:grid; grid-template-columns:24px 1fr; align-items:center; gap:8px; min-width:0; }
    #panel-week .goal-icon { font-size:17px; filter:saturate(.72); }
    #panel-week .compact-goal-name strong { display:block; font-size:14px; font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    #panel-week .compact-goal-name span:not(.goal-icon) { display:block; margin-top:3px; color:var(--muted); font:8px/1.2 ui-monospace,SFMono-Regular,Consolas,monospace; text-transform:uppercase; letter-spacing:.07em; }
    #panel-week .compact-metrics { display:flex; gap:7px; align-items:stretch; min-width:0; flex-wrap:wrap; }
    #panel-week .metric-chip { display:grid; grid-template-columns:auto auto; gap:4px 10px; align-items:center; min-width:112px; padding:6px 8px; border:1px solid #ddd7ca; background:rgba(241,237,227,.30); border-radius:2px; }
    #panel-week .metric-chip.wide { min-width:145px; }
    #panel-week .metric-chip .m-name { color:var(--muted); font:9px/1 ui-monospace,SFMono-Regular,Consolas,monospace; white-space:nowrap; }
    #panel-week .metric-chip .m-value { justify-self:end; color:var(--ink); font:700 11px/1 ui-monospace,SFMono-Regular,Consolas,monospace; white-space:nowrap; }
    #panel-week .metric-chip .m-value span { color:var(--muted); font-size:9px; }
    #panel-week .metric-chip .tiny-track { grid-column:1/-1; height:3px; background:#dfd9cb; overflow:hidden; border-radius:9px; }
    #panel-week .metric-chip .tiny-track i { display:block; height:100%; background:var(--moss); }
    #panel-week .metric-chip.good { background:rgba(201,216,196,.30); border-color:#c5d2c0; }
    #panel-week .metric-chip.warn .m-value { color:#946c22; }
    #panel-week .metric-chip.idle { opacity:.72; }
    #panel-week .metric-chip.check { grid-template-columns:1fr auto; min-width:122px; }
    #panel-week .metric-chip.check .state { font:700 12px/1 ui-monospace,SFMono-Regular,Consolas,monospace; }
    #panel-week .metric-chip.check.done .state { color:var(--moss); }
    #panel-week .metric-chip.check.open .state { color:var(--muted); }
    #panel-week .compact-legend { display:flex; flex-wrap:wrap; gap:14px; margin:8px 2px 0; color:var(--muted); font:9px/1.3 ui-monospace,SFMono-Regular,Consolas,monospace; }
    #panel-week .compact-legend b { color:var(--ink); font-weight:600; }
    @media (max-width:760px) { #panel-week .compact-area-head { grid-template-columns:32px 1fr; } #panel-week .compact-area-head .summary { display:none; } #panel-week .compact-goal { grid-template-columns:1fr; gap:6px; padding:9px 12px; } #panel-week .compact-metrics { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); } #panel-week .metric-chip, #panel-week .metric-chip.wide, #panel-week .metric-chip.check { min-width:0; } }
  </style>
</head>
<body>
  <main class="shell">
    <header class="masthead"><div><p class="eyebrow">Pomodoro CLI · Personal field notes</p><h1>Goal ledger</h1></div><div class="stamp">Asia / Karachi<br>${anchor}</div></header>
    <section class="streak-card" aria-label="Day quality summary">
      <div class="streak-number"><div class="flame" aria-hidden="true">🔥</div><div><strong>${streak.current}</strong><span>perfect-day streak</span></div><small>Personal best · ${streak.best} days</small></div>
      <div><div class="heat-scroll"><div class="heatmap" aria-label="365 day quality history">${heatmap}</div></div>
        <div class="heat-legend"><span>Past year · day quality</span><div class="legend-items"><span><i style="background:#71a36f"></i>${qualityCounts.perfect} perfect</span><span><i style="background:var(--amber)"></i>${qualityCounts.excused} reason</span><span><i style="background:var(--red)"></i>${qualityCounts.missed} missed</span></div></div>
      </div>
    </section>
    <nav class="tabs" role="tablist" aria-label="Goal period"><button id="tab-week" role="tab" aria-controls="panel-week" aria-selected="${initialWindow === 'week'}"${initialWindow === 'month' ? ' tabindex="-1"' : ''}>Week</button><button id="tab-month" role="tab" aria-controls="panel-month" aria-selected="${initialWindow === 'month'}"${initialWindow === 'week' ? ' tabindex="-1"' : ''}>Month</button></nav>
    <section id="panel-week" role="tabpanel" aria-labelledby="tab-week"${initialWindow === 'month' ? ' hidden' : ''}><div class="period-heading"><h2>This week</h2><span>${weekDates[0]} → ${weekDates.at(-1)}</span></div>${renderCompactWeek(data, anchor)}</section>
    <section id="panel-month" role="tabpanel" aria-labelledby="tab-month"${initialWindow === 'week' ? ' hidden' : ''}><div class="period-heading"><h2>${MONTH_NAMES_FULL[month! - 1]} ${year}</h2><span>${getWindowDates('month', anchor).length} days</span></div>${renderPeriod(data, 'month', anchor)}${renderWeeklyOnly(data, anchor)}</section>
    <footer><span>Auto-updated from goals.json</span><span>Dashboard · ${anchor}</span></footer>
  </main>
  <script>
    const tabs = [...document.querySelectorAll('[role="tab"]')];
    const selectTab = tab => tabs.forEach(item => { const active = item === tab; item.setAttribute('aria-selected', String(active)); item.tabIndex = active ? 0 : -1; document.getElementById(item.getAttribute('aria-controls')).hidden = !active; });
    tabs.forEach((tab, index) => { tab.addEventListener('click', () => selectTab(tab)); tab.addEventListener('keydown', event => { if (!['ArrowLeft','ArrowRight'].includes(event.key)) return; event.preventDefault(); const offset = event.key === 'ArrowRight' ? 1 : -1; const next = tabs[(index + offset + tabs.length) % tabs.length]; selectTab(next); next.focus(); }); });
  </script>
</body>
</html>`;
}

export function writeGoalsHtmlReport(data: GoalsData = loadGoals()): string {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmpPath = `${GOALS_REPORT_PATH}.tmp`;
  fs.writeFileSync(tmpPath, renderGoalsHtml(data), 'utf8');
  fs.renameSync(tmpPath, GOALS_REPORT_PATH);
  return GOALS_REPORT_PATH;
}

function assertMonth(month: string): void {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error(`Invalid month: ${month}. Use YYYY-MM.`);
}

export function archiveGoalsMonth(month: string, data: GoalsData = loadGoals()): string {
  assertMonth(month);
  const snapshotPath = path.join(GOALS_HISTORY_DIR, `${month}.json`);
  atomicWriteJSON(snapshotPath, data);
  return snapshotPath;
}

export function writeArchivedGoalsReport(month: string): string {
  assertMonth(month);
  const snapshotPath = path.join(GOALS_HISTORY_DIR, `${month}.json`);
  const raw = readJSON<unknown | null>(snapshotPath, null);
  if (!raw) throw new Error(`No Goals snapshot for ${month}. Archive it first.`);
  const data = normalizeGoals(raw as Parameters<typeof normalizeGoals>[0]);
  const [year, monthNumber] = month.split('-').map(Number);
  const lastDay = new Date(year!, monthNumber!, 0).getDate();
  const reportPath = path.join(GOALS_HISTORY_DIR, `${month}.html`);
  fs.mkdirSync(GOALS_HISTORY_DIR, { recursive: true });
  const tmpPath = `${reportPath}.tmp`;
  fs.writeFileSync(tmpPath, renderGoalsHtml(data, `${month}-${lastDay}`, 'month'), 'utf8');
  fs.renameSync(tmpPath, reportPath);
  return reportPath;
}
