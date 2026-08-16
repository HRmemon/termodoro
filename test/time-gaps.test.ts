import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BROWSER_EVENT_GAP_MS,
  gapExceeds,
  TIMER_SUSPEND_GAP_MS,
} from '../source/lib/time-gaps.js';

test('timer suspension gap starts only after the limit', () => {
  assert.equal(gapExceeds(1_000, 1_000 + TIMER_SUSPEND_GAP_MS, TIMER_SUSPEND_GAP_MS), false);
  assert.equal(gapExceeds(1_000, 1_001 + TIMER_SUSPEND_GAP_MS, TIMER_SUSPEND_GAP_MS), true);
});

test('browser event gaps retain the existing five-minute allowance', () => {
  assert.equal(gapExceeds(1_000, 1_000 + BROWSER_EVENT_GAP_MS, BROWSER_EVENT_GAP_MS), false);
  assert.equal(gapExceeds(1_000, 1_001 + BROWSER_EVENT_GAP_MS, BROWSER_EVENT_GAP_MS), true);
});

test('an unset previous timestamp is never treated as suspension', () => {
  assert.equal(gapExceeds(0, Number.MAX_SAFE_INTEGER, TIMER_SUSPEND_GAP_MS), false);
});
