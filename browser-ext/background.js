let port = null;
let reconnectTimeout = null;

function connect() {
  try {
    port = browser.runtime.connectNative("pomodorocli_host");
    port.onDisconnect.addListener(reconnect);
    reportActivity("connected");
  } catch {
    reconnect();
  }
}

function reconnect() {
  port = null;
  clearTimeout(reconnectTimeout);
  reconnectTimeout = setTimeout(connect, 5000);
}

function parseTab(tab) {
  try {
    const url = new URL(tab.url);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return { url: tab.url, domain: url.hostname, path: url.pathname, title: tab.title || "" };
  } catch {
    return null;
  }
}

async function reportActivity(trigger) {
  if (!port) return;
  try {
    const [window, audible] = await Promise.all([
      browser.windows.getLastFocused({ populate: true }),
      browser.tabs.query({ audible: true }),
    ]);
    const active = window.tabs?.find(tab => tab.active);
    port?.postMessage({
      cmd: "browser-event",
      timestamp: Date.now(),
      trigger,
      windowFocused: window.focused,
      activeTab: active ? parseTab(active) : null,
      audibleTabs: audible.map(parseTab).filter(Boolean),
    });
  } catch (error) {
    console.warn("Could not report browser activity", error);
  }
}

browser.tabs.onActivated.addListener(() => reportActivity("tab_switched"));
browser.tabs.onUpdated.addListener((_id, change) => {
  if ("url" in change || "audible" in change) reportActivity("tab_updated");
});
browser.tabs.onRemoved.addListener(() => reportActivity("tab_closed"));
browser.windows.onFocusChanged.addListener(() => reportActivity("focus_changed"));

// Checkpoint unchanged tabs; all accounting and notifications belong to Pomodoro.
browser.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === "heartbeat") reportActivity("heartbeat");
});
browser.alarms.create("heartbeat", { periodInMinutes: 1 });
connect();
