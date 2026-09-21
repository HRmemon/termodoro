import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import notifier from 'node-notifier';

test('saved browser pages reach the shared Waybar summary without dropping minor domains', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pomodoro-browser-test-'));
  process.env.XDG_DATA_HOME = dir;
  process.env.XDG_CONFIG_HOME = dir;
  const stats = await import('../source/lib/browser-stats.js');
  const tracker = await import('../source/lib/tracker.js');
  t.after(() => { stats.closeBrowserDb(); fs.rmSync(dir, { recursive: true, force: true }); });
  const db = stats.getBrowserDb();
  const insert = db.prepare(`INSERT INTO page_visits
    (url, domain, path, is_active, duration_sec, recorded_at) VALUES (?, ?, ?, 1, ?, ?)`);
  const visit = (domain: string, urlPath: string, minutes: number, time: string) =>
    insert.run(`https://${domain}${urlPath}`, domain, urlPath, minutes * 60, `2026-09-06T${time}:00.000Z`);
  visit('work.example', '/', 20, '10:00');
  visit('waste.example', '/', 5, '10:00');
  visit('mixed.example', '/learn', 4, '10:00');
  visit('mixed.example', '/shorts/a', 1, '10:00');
  visit('waste.example', '/', 10, '11:00');
  tracker.saveTrackerConfigFull({ categories: tracker.CATEGORIES, domainRules: [
    { pattern: 'waste.example', category: 'W' },
    { pattern: 'mixed.example/shorts/*', category: 'W' },
  ] });
  tracker.saveWeek({ week: '2026-W36', start: '2026-08-31',
    slots: { '2026-09-06': { '11:00': 'D' } }, pending: {}, notes: {} });
  assert.equal(stats.getSlotDomainBreakdown('2026-09-06')[0]?.domain, 'work.example');
  assert.equal(stats.getSlotPageBreakdown('2026-09-06').length, 5);
  assert.deepEqual(tracker.getTrackerTimeSummary(new Date('2026-09-06T12:00:00')),
    { deepHours: 0.5, wastedHours: 6 / 60 });

  const { loadConfig, saveConfig } = await import('../source/lib/config.js');
  saveConfig({ ...loadConfig(), browserTracking: true, notifications: false });
  const { BrowserTracker } = await import('../source/daemon/browser-tracker.js');
  const collector = new BrowserTracker();
  let now = new Date('2026-09-06T14:00:00').getTime();
  t.mock.method(Date, 'now', () => now);
  const payload = { trigger: 'heartbeat', windowFocused: true,
    activeTab: { domain: 'steady.example', url: 'https://steady.example/' }, audibleTabs: [] };
  collector.handleEvent(payload);
  for (let minute = 0; minute < 7; minute++) {
    now += 60_000;
    collector.handleEvent(payload);
  }
  const seconds = () => (db.prepare("SELECT SUM(duration_sec) AS seconds FROM page_visits WHERE domain = 'steady.example'").get() as { seconds: number }).seconds;
  assert.equal(seconds(), 420, 'unchanged pages continue accumulating beyond five minutes');
  now += 10 * 60_000;
  collector.handleEvent({ ...payload, windowFocused: false });
  assert.equal(seconds(), 420, 'a missing heartbeat gap is not counted as browsing');
  now += 60_000;
  collector.handleEvent(payload);
  assert.equal(seconds(), 420, 'unfocused browsing is not active time');

  const notify = t.mock.fn(() => notifier);
  Object.defineProperty(notifier, 'notify', { value: notify, configurable: true });
  t.after(() => { Reflect.deleteProperty(notifier, 'notify'); });
  saveConfig({ ...loadConfig(), notifications: true, browserRules: JSON.parse(`[
    {"id":"same-id","condition":"domain_flagged == 'W'","message":"Flagged"},
    {"id":"same-id","condition":"domain_flagged == 'W' && is_active","message":"Active"}
  ]`) });
  const flagged = { ...payload, activeTab: {
    domain: 'mixed.example', url: 'https://mixed.example/shorts/a', path: '/shorts/a',
  } };
  collector.handleEvent(flagged);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(notify.mock.callCount(), 2, 'path rules work and duplicate IDs do not suppress different conditions');
  now += 60_000;
  collector.handleEvent(flagged);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(notify.mock.callCount(), 2, 'missing cooldown defaults to five minutes');
  now += 4 * 60_000;
  collector.handleEvent(flagged);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(notify.mock.callCount(), 4);
  saveConfig({ ...loadConfig(), browserTracking: false });
  const eventCount = () => (db.prepare('SELECT COUNT(*) AS n FROM browser_events_log').get() as { n: number }).n;
  const beforeDisable = eventCount();
  collector.handleEvent(flagged);
  assert.equal(eventCount(), beforeDisable, 'disabled tracking does not store browser events');
});
