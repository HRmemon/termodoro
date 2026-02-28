import { loadSessions } from '../store.js';
import {
  getDailyStats,
  getWeeklyStats,
  getTaskBreakdown,
  getStreaks,
} from '../stats.js';
import { fmtMin, barChart } from './utils.js';

export function formatStats(): string {
  const now = new Date();
  const pad2 = (n: number) => String(n).padStart(2, '0');
  const todayStr = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  const generated = `${todayStr} ${pad2(now.getHours())}:${pad2(now.getMinutes())}`;

  // Week range (Mon-Sun)
  const dayOfWeek = now.getDay();
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - daysFromMonday);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  const weekStartStr = `${weekStart.getFullYear()}-${pad2(weekStart.getMonth() + 1)}-${pad2(weekStart.getDate())}`;
  const daily = getDailyStats(todayStr);
  const weekly = getWeeklyStats(weekStartStr);
  const allSessions = loadSessions();
  const breakdown = getTaskBreakdown(allSessions);
  const streaks = getStreaks();

  const completionPct = daily.sessionsTotal > 0
    ? Math.round((daily.sessionsCompleted / daily.sessionsTotal) * 100)
    : 0;

  const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const maxDayMin = Math.max(1, ...weekly.heatmap.map(d => d.focusMinutes));

  const maxProjectMin = Math.max(1, ...breakdown.byProject.map(p => p.minutes));
  const maxTagMin = Math.max(1, ...breakdown.byTag.map(t => t.minutes));

  const recentSessions = allSessions
    .filter(s => s.type === 'work' && s.status === 'completed')
    .slice(-10)
    .reverse();

  const lines: string[] = [];

  lines.push('# Pomodoro Stats Report');
  lines.push(`# Generated: ${generated}`);
  lines.push('# This report is read-only. Edits are not saved.');
  lines.push('');

  lines.push(`## Today (${todayStr})`);
  lines.push(`Focus:      ${fmtMin(daily.focusMinutes)}`);
  lines.push(`Break:      ${fmtMin(daily.breakMinutes)}`);
  lines.push(`Sessions:   ${daily.sessionsCompleted}/${daily.sessionsTotal} (${completionPct}% completion)`);
  lines.push('');

  const weekMonLabel = weekStart.toLocaleDateString('en-US', { weekday: 'short', month: '2-digit', day: '2-digit' }).replace(',', '');
  const weekSunLabel = weekEnd.toLocaleDateString('en-US', { weekday: 'short', month: '2-digit', day: '2-digit' }).replace(',', '');
  lines.push(`## This Week (${weekMonLabel} to ${weekSunLabel})`);
  lines.push(`Total focus: ${fmtMin(weekly.totalFocusMinutes)}`);
  lines.push(`Avg session: ${fmtMin(weekly.avgSessionLength)}`);
  lines.push(`Longest streak: ${weekly.longestStreak} days`);
  lines.push('');
  lines.push('  Day        Focus     Sessions');
  for (let i = 0; i < weekly.heatmap.length; i++) {
    const day = weekly.heatmap[i]!;
    const label = DAY_LABELS[i]!;
    const dateLabel = day.date.slice(5); // MM-DD
    const bar = barChart(day.focusMinutes, maxDayMin, 12);
    const focusCol = fmtMin(day.focusMinutes).padEnd(9);
    lines.push(`  ${label} ${dateLabel}  ${focusCol} ${day.sessions}  ${bar}`);
  }
  lines.push('');

  if (breakdown.byProject.length > 0) {
    lines.push('## Projects (all time)');
    for (const p of breakdown.byProject.slice(0, 10)) {
      const bar = barChart(p.minutes, maxProjectMin);
      const nameCol = p.label.padEnd(16);
      lines.push(`  ${nameCol} ${fmtMin(p.minutes).padEnd(8)} ${bar}`);
    }
    lines.push('');
  }

  if (breakdown.byTag.length > 0) {
    lines.push('## Tags (all time)');
    for (const t of breakdown.byTag.slice(0, 10)) {
      const bar = barChart(t.minutes, maxTagMin);
      const nameCol = t.label.padEnd(16);
      lines.push(`  ${nameCol} ${fmtMin(t.minutes).padEnd(8)} ${bar}`);
    }
    lines.push('');
  }

  lines.push('## Streaks');
  lines.push(`Current streak:    ${streaks.currentStreak} days`);
  lines.push(`Personal best:     ${streaks.personalBest} days`);
  lines.push(`Deep work (week):  ${streaks.deepWorkHoursThisWeek.toFixed(1)}h`);
  lines.push('');

  if (recentSessions.length > 0) {
    lines.push('## Recent Sessions (last 10)');
    for (const s of recentSessions) {
      const date = s.startedAt.slice(0, 10);
      const time = s.startedAt.slice(11, 16);
      const dur = fmtMin(s.durationActual / 60);
      let line = `  ${date}  ${time}  ${dur}`;
      if (s.label) line += `  ${s.label}`;
      if (s.project) line += `  #${s.project}`;
      lines.push(line);
    }
  }

  return lines.join('\n') + '\n';
}
