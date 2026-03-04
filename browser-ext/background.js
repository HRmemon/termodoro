let port = null;
let reconnectTimeout = null;
let windowFocused = true;
let audibleTabs = new Set();
let activeTabInfo = null;

function connect() {
  try {
    port = browser.runtime.connectNative("pomodorocli_host");
    port.onDisconnect.addListener(() => {
      port = null;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      reconnectTimeout = setTimeout(connect, 5000);
    });
  } catch {
    port = null;
    if (reconnectTimeout) clearTimeout(reconnectTimeout);
    reconnectTimeout = setTimeout(connect, 5000);
  }
}

connect();

function isTrackableUrl(url) {
  if (!url) return false;
  return !(
    url.startsWith("about:") ||
    url.startsWith("moz-extension:") ||
    url.startsWith("chrome:") ||
    url.startsWith("file:")
  );
}

function parseTab(tab) {
  if (!tab.url || !isTrackableUrl(tab.url)) return null;
  try {
    const u = new URL(tab.url);
    return { url: tab.url, domain: u.hostname, path: u.pathname, title: tab.title || "" };
  } catch {
    return null;
  }
}

async function broadcastState(trigger) {
  if (!port) return;
  
  const allAudible = [];
  try {
    const tabs = await browser.tabs.query({ audible: true });
    for (const t of tabs) {
      const info = parseTab(t);
      if (info) allAudible.push(info);
    }
  } catch {}

  const payload = {
    cmd: "browser-event",
    timestamp: Date.now(),
    trigger,
    windowFocused,
    activeTab: activeTabInfo,
    audibleTabs: allAudible
  };

  try {
    port.postMessage(payload);
  } catch {}
}

async function updateActiveTab(trigger) {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      activeTabInfo = null;
    } else {
      activeTabInfo = parseTab(tab);
    }
    broadcastState(trigger || "tab_switched");
  } catch {}
}

browser.tabs.onActivated.addListener(() => {
  updateActiveTab("tab_switched");
});

browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  let changed = false;
  let trigger = "tab_updated";
  if ("audible" in changeInfo) {
    if (changeInfo.audible) {
      audibleTabs.add(tabId);
    } else {
      audibleTabs.delete(tabId);
    }
    changed = true;
    trigger = "audible_change";
  }

  if (changeInfo.url && tab.active) {
    activeTabInfo = parseTab(tab);
    changed = true;
  }

  if (changed) {
    broadcastState(trigger);
  }
});

browser.tabs.onRemoved.addListener((tabId) => {
  if (audibleTabs.has(tabId)) {
    audibleTabs.delete(tabId);
    broadcastState("tab_closed");
  }
});

browser.windows.onFocusChanged.addListener((windowId) => {
  if (windowId === browser.windows.WINDOW_ID_NONE) {
    windowFocused = false;
  } else {
    windowFocused = true;
  }
  updateActiveTab("focus_changed");
});

setTimeout(() => updateActiveTab("startup"), 1000);
