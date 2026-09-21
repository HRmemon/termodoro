import assert from 'node:assert/strict';
import test from 'node:test';
import {
  adjustCount,
  aggregateMetric,
  computeDayStreak,
  defaultGoalsData,
  getLatestMetricNote,
  getMetricTarget,
  getWindowDates,
  validateGoals,
  type GoalMetric,
} from '../source/lib/goals.js';
import { renderGoalsHtml } from '../source/lib/goals-report.js';

test('counters increment, decrement, and stop at zero', () => {
  assert.equal(adjustCount(undefined, 1), 1);
  assert.equal(adjustCount(3, 1), 4);
  assert.equal(adjustCount(3, -1), 2);
  assert.equal(adjustCount(1, -1), undefined);
  assert.equal(adjustCount(undefined, -1), undefined);
});

const weeklyCount: GoalMetric = {
  id: 'attempts',
  name: 'Attempts',
  input: 'count',
  aggregate: 'sum',
  weeklyTarget: 7,
};

test('default goals match the September monthly and weekly plan', () => {
  const data = defaultGoalsData();
  const areas = Object.values(data.monthlyPlans)[0]!;
  const metric = (goalId: string, metricId: string) => areas.flatMap(area => area.goals).find(goal => goal.id === goalId)!.metrics.find(item => item.id === metricId)!;

  assert.equal(data.weekStartsOn, 1);
  assert.equal(metric('ielts-booking', 'ielts-test-booked').cumulative, true);
  assert.equal(metric('ielts-writing', 'ielts-writing-attempts').target, undefined);
  assert.equal(metric('ielts-reading', 'ielts-reading-score').target, 38);
  assert.equal(metric('ielts-listening', 'ielts-listening-score').aggregate, 'latest');
  assert.equal(metric('masters-planning', 'masters-scholarship-list').cumulative, true);
  assert.equal(metric('revenue-career-path', 'revenue-best-fit-three').target, 3);
  assert.equal(metric('exercise-monthly', 'exercise-weight-lost').target, 3);
});

test('weekly values sum and weekly targets scale to the actual month length', () => {
  const data = defaultGoalsData();
  data.entries.attempts = { '2026-08-17': 2, '2026-08-19': 1 };

  assert.equal(aggregateMetric(weeklyCount, data, getWindowDates('week', '2026-08-19')), 3);
  assert.equal(getMetricTarget(weeklyCount, 'month', 31), 31);
});

test('occasional checkboxes count completed days toward a weekly target', () => {
  const data = defaultGoalsData();
  const videoDays: GoalMetric = { id: 'videos', name: 'Videos', input: 'checkbox', aggregate: 'count', weeklyTarget: 2 };
  data.entries.videos = { '2026-08-17': true, '2026-08-19': true };

  assert.equal(aggregateMetric(videoDays, data, getWindowDates('week', '2026-08-19')), 2);
  assert.equal(getMetricTarget(videoDays, 'month', 31), 9);
});

test('score targets only aggregate entries inside the selected window', () => {
  const data = defaultGoalsData();
  const bestBand: GoalMetric = { id: 'band', name: 'Best band', input: 'rate', aggregate: 'max', target: 7.5 };
  data.entries.band = { '2026-08-16': 6.5, '2026-08-24': 6 };

  assert.equal(aggregateMetric(bestBand, data, getWindowDates('week', '2026-08-24')), 6);
});

test('explicit cumulative metrics retain values in later windows', () => {
  const data = defaultGoalsData();
  const progress: GoalMetric = { id: 'progress', name: 'Progress', input: 'rate', aggregate: 'latest', target: 100, cumulative: true };
  data.entries.progress = { '2026-07-30': 60 };

  assert.equal(aggregateMetric(progress, data, getWindowDates('month', '2026-08-19')), 60);
});

test('week start is configurable and defaults to Monday', () => {
  assert.deepEqual(getWindowDates('week', '2026-08-26'), ['2026-08-24', '2026-08-25', '2026-08-26', '2026-08-27', '2026-08-28', '2026-08-29', '2026-08-30']);
  assert.deepEqual(getWindowDates('week', '2026-08-26', 0), ['2026-08-23', '2026-08-24', '2026-08-25', '2026-08-26', '2026-08-27', '2026-08-28', '2026-08-29']);
});

test('linked weekly values contribute to monthly totals without replacing plans', () => {
  const data = defaultGoalsData();
  const monthly: GoalMetric = { id: 'monthly-attempts', name: 'Monthly attempts', input: 'count', aggregate: 'sum', target: 10 };
  const weekly: GoalMetric = { id: 'weekly-attempts', name: 'Weekly attempts', input: 'count', aggregate: 'sum', target: 3, contributesTo: monthly.id };
  data.monthlyPlans['2026-09'] = [{ id: 'ielts', name: 'IELTS', goals: [{ id: 'monthly', name: 'Monthly', metrics: [monthly] }] }];
  data.weeklyPlans['2026-09-07'] = [{ id: 'ielts', name: 'IELTS', goals: [{ id: 'weekly', name: 'Weekly', metrics: [weekly] }] }];
  data.entries['weekly-attempts'] = { '2026-09-08': 2 };
  data.entries['monthly-attempts'] = { '2026-09-09': 1 };

  validateGoals(data);
  assert.equal(aggregateMetric(monthly, data, getWindowDates('month', '2026-09-08')), 3);
  assert.equal(data.weeklyPlans['2026-09-07']![0]!.goals[0]!.name, 'Weekly');
  assert.equal(data.monthlyPlans['2026-09']![0]!.goals[0]!.name, 'Monthly');
});

test('latest note carries interview preparation forward', () => {
  const data = defaultGoalsData();
  data.entries['interview-playbook'] = {
    '2026-08-10': 'Use concise STAR answers',
    '2026-08-20': 'Lead with the outcome, then evidence',
  };

  assert.equal(getLatestMetricNote(data, 'interview-playbook', '2026-08-19'), 'Use concise STAR answers');
  assert.equal(getLatestMetricNote(data, 'interview-playbook', '2026-08-24'), 'Lead with the outcome, then evidence');
});

test('only consecutive perfect days count toward the day streak', () => {
  const data = defaultGoalsData();
  data.dayQuality = {
    '2026-08-14': 'perfect',
    '2026-08-15': 'perfect',
    '2026-08-16': 'excused',
    '2026-08-17': 'perfect',
    '2026-08-18': 'perfect',
    '2026-08-19': 'perfect',
  };

  assert.deepEqual(computeDayStreak(data, '2026-08-19'), { current: 3, best: 3 });
});

test('HTML report renders period tabs, hierarchy, and three-state day history', () => {
  const data = defaultGoalsData();
  const monthly = Object.values(data.monthlyPlans)[0]!;
  data.weeklyPlans['2026-08-17'] = structuredClone(monthly);
  data.monthlyPlans['2026-08'] = structuredClone(monthly);
  data.weeklyPlans['2026-08-17'][0]!.name = 'IELTS <current>';
  data.dayQuality['2026-08-19'] = 'perfect';
  data.dayNotes['2026-08-19'] = 'Strong focus <no distractions>';
  const html = renderGoalsHtml(data, '2026-08-19');

  assert.match(html, /Goal ledger/);
  assert.match(html, /id="tab-week"/);
  assert.match(html, /id="tab-month"/);
  assert.match(html, /IELTS &lt;current&gt;/);
  assert.match(html, /heat-cell perfect/);
  assert.match(html, /heat-cell perfect has-note/);
  assert.match(html, /Note: Strong focus &lt;no distractions&gt;/);
  assert.match(html, /class="compact-week"/);
  assert.match(html, /class="goal-icon"[^>]*>✍️</);
  assert.match(html, /class="metric-chip/);
  assert.match(html, /class="metric-grid"/);
});

test('month reports open on the requested month view', () => {
  const data = defaultGoalsData();
  data.monthlyPlans['2026-08'] = structuredClone(Object.values(data.monthlyPlans)[0]!);
  const html = renderGoalsHtml(data, '2026-08-31', 'month');

  assert.match(html, /<h2>August 2026<\/h2>/);
  assert.match(html, /id="tab-month"[^>]*aria-selected="true"/);
  assert.match(html, /id="panel-month" role="tabpanel" aria-labelledby="tab-month"><div/);
});
