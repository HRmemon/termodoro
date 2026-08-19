import assert from 'node:assert/strict';
import test from 'node:test';
import {
  aggregateMetric,
  computeDayStreak,
  defaultGoalsData,
  getMetricTarget,
  getWindowDates,
  type GoalMetric,
} from '../source/lib/goals.js';

const weeklyCount: GoalMetric = {
  id: 'attempts',
  name: 'Attempts',
  input: 'count',
  aggregate: 'sum',
  weeklyTarget: 7,
};

test('weekly values sum and weekly targets scale to the actual month length', () => {
  const data = defaultGoalsData();
  data.entries.attempts = { '2026-08-17': 2, '2026-08-19': 1 };

  assert.equal(aggregateMetric(weeklyCount, data, getWindowDates('week', '2026-08-19')), 3);
  assert.equal(getMetricTarget(weeklyCount, 'month', 31), 31);
});

test('overall metrics retain their best value in later windows', () => {
  const data = defaultGoalsData();
  const bestBand: GoalMetric = { id: 'band', name: 'Best band', input: 'rate', aggregate: 'max', target: 7.5 };
  data.entries.band = { '2026-07-30': 6.5, '2026-08-02': 6 };

  assert.equal(aggregateMetric(bestBand, data, getWindowDates('month', '2026-08-19')), 6.5);
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
