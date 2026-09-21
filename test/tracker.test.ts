import test from 'node:test';
import assert from 'node:assert/strict';
import { computeBrowserWastedHours } from '../source/lib/tracker.js';

const rules = [{ pattern: 'waste.example', category: 'W' }];

test('browser waste counts actual minutes only in unclassified tracker slots', () => {
  const hours = computeBrowserWastedHours(
    { '10:00': 'W', '10:30': 'D' },
    [
      { time: '10:00', domain: 'waste.example', activeMinutes: 20 },
      { time: '10:30', domain: 'waste.example', activeMinutes: 10 },
      { time: '11:00', domain: 'waste.example', activeMinutes: 18 },
      { time: '11:30', domain: 'work.example', activeMinutes: 25 },
    ],
    rules,
  );

  assert.equal(hours, 0.3);
});

test('waste includes minor domains and classifies paths separately, capped per slot', () => {
  const hours = computeBrowserWastedHours({}, [
    { time: '10:00', domain: 'work.example', activeMinutes: 20 },
    { time: '10:00', domain: 'waste.example', activeMinutes: 5 },
    { time: '10:00', domain: 'mixed.example', path: '/shorts/video', activeMinutes: 3 },
    { time: '10:00', domain: 'mixed.example', path: '/learn', activeMinutes: 2 },
    { time: '10:30', domain: 'waste.example', path: '/a', activeMinutes: 20 },
    { time: '10:30', domain: 'waste.example', path: '/b', activeMinutes: 20 },
  ], [...rules, { pattern: 'mixed.example/shorts/*', category: 'W' }]);
  assert.equal(hours, 38 / 60);
});
