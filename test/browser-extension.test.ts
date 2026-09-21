import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

test('extension checkpoints unchanged tabs, refreshes focus, and reconnects without rules', async () => {
  const event = () => ({ addListener(fn: (...args: any[]) => unknown) { this.fire = fn; }, fire: (..._args: any[]): unknown => undefined });
  const sent: any[] = [];
  const onDisconnect = event();
  const onAlarm = event();
  let focused = true;
  let reconnect: (() => void) | undefined;
  const active = { active: true, url: 'https://example.com/watch', title: 'Video' };
  const browser = {
    runtime: { connectNative: () => ({ onDisconnect, postMessage: (msg: unknown) => sent.push(msg) }) },
    windows: { getLastFocused: async () => ({ focused, tabs: [active] }), onFocusChanged: event() },
    tabs: {
      query: async () => [active, { url: 'about:blank' }],
      onActivated: event(), onUpdated: event(), onRemoved: event(),
    },
    alarms: { onAlarm, create: (name: string, options: any) => {
      assert.equal(name, 'heartbeat');
      assert.equal(options.periodInMinutes, 1);
    } },
  };
  vm.runInNewContext(readFileSync(new URL('../browser-ext/background.js', import.meta.url), 'utf8'), {
    browser, URL, console, clearTimeout() {}, setTimeout(fn: () => void) { reconnect = fn; },
  });
  const flush = () => new Promise(resolve => setImmediate(resolve));
  await flush();
  assert.equal(sent[0].activeTab.path, '/watch');
  assert.equal(sent[0].windowFocused, true);
  for (let minute = 0; minute < 7; minute++) {
    onAlarm.fire({ name: 'heartbeat' });
    await flush();
  }
  assert.equal(sent.filter(msg => msg.trigger === 'heartbeat').length, 7);
  focused = false;
  browser.windows.onFocusChanged.fire();
  await flush();
  assert.equal(sent.at(-1).windowFocused, false);
  assert.equal(sent.at(-1).audibleTabs.length, 1);
  onDisconnect.fire();
  assert.ok(reconnect);
  reconnect();
  await flush();
  assert.equal(sent.at(-1).trigger, 'connected');
});
