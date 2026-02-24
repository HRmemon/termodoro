let port = null;
let reconnectTimeout = null;

// --- Native host connection ---

function connect() {
  try {
    port = browser.runtime.connectNative("pomodorocli_host");
    port.onDisconnect.addListener(() => {
      port = null;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      reconnectTimeout = setTimeout(connect, 30000);
    });
  } catch {
    port = null;
    if (reconnectTimeout) clearTimeout(reconnectTimeout);
    reconnectTimeout = setTimeout(connect, 30000);
  }
}

connect();

// --- State tracking ---

// Tracks currently "open" spans: key → { url, domain, path, title, is_active, is_audible, startedAt }
// Keys: "active" for the focused tab, "audible:<tabId>" for audible tabs
const openSpans = new Map();

// Buffer of completed entries waiting to be flushed
const buffer = [];

let flushDebounce = null;
let flushMaxTimer = null;
let browserFocused = true;

function localISOString(date) {
  const d = date || new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}

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

// Close a span: calculate duration, push to buffer
function closeSpan(key) {
  const span = openSpans.get(key);
  if (!span) return;
  openSpans.delete(key);

  const durationSec = Math.round((Date.now() - span.startedAt) / 1000);
  if (durationSec < 1) return; // Ignore sub-second spans

  buffer.push({
    url: span.url,
    domain: span.domain,
    path: span.path,
    title: span.title,
    is_active: span.is_active,
    is_audible: span.is_audible,
    duration_sec: durationSec,
    recorded_at: localISOString(new Date(span.startedAt)),
  });

  scheduleFlush();
}

// Open a new span
function openSpan(key, info, is_active, is_audible) {
  openSpans.set(key, {
    ...info,
    is_active: is_active ? 1 : 0,
    is_audible: is_audible ? 1 : 0,
    startedAt: Date.now(),
  });
}

// --- Flush logic ---

function scheduleFlush() {
  // Debounce: flush after 5s of quiet
  if (flushDebounce) clearTimeout(flushDebounce);
  flushDebounce = setTimeout(flush, 5000);

  // Max timer: flush at least every 30s
  if (!flushMaxTimer) {
    flushMaxTimer = setTimeout(flush, 30000);
  }
}

function flush() {
  if (flushDebounce) clearTimeout(flushDebounce);
  if (flushMaxTimer) clearTimeout(flushMaxTimer);
  flushDebounce = null;
  flushMaxTimer = null;

  if (buffer.length === 0) return;
  if (!port) {
    connect();
    return; // Data stays in buffer, will flush on next schedule
  }

  const entries = buffer.splice(0);
  try {
    port.postMessage({ type: "tick", entries });
  } catch {
    // Put entries back if send failed
    buffer.unshift(...entries);
  }
}

// --- Event handlers ---

// Track active tab changes
async function updateActiveTab() {
  // Close the current active span
  closeSpan("active");

  if (!browserFocused) return;

  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;
    const info = parseTab(tab);
    if (!info) return;
    openSpan("active", info, true, false);
  } catch {
    // Ignore
  }
}

// Tab activated (switched tabs)
browser.tabs.onActivated.addListener(() => {
  updateActiveTab();
});

// Tab updated (navigation, title change, audible change)
browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Handle audible state changes
  if ("audible" in changeInfo) {
    const audibleKey = `audible:${tabId}`;
    if (changeInfo.audible) {
      // Started playing audio
      const info = parseTab(tab);
      if (info) {
        openSpan(audibleKey, info, false, true);
      }
    } else {
      // Stopped playing audio
      closeSpan(audibleKey);
    }
  }

  // Handle navigation on the active tab (URL changed)
  if (changeInfo.url && tab.active) {
    updateActiveTab();
  }
});

// Tab closed — clean up any audible spans
browser.tabs.onRemoved.addListener((tabId) => {
  closeSpan(`audible:${tabId}`);
});

// Window focus changed — detect Firefox active/inactive
browser.windows.onFocusChanged.addListener((windowId) => {
  if (windowId === browser.windows.WINDOW_ID_NONE) {
    // Firefox lost focus — close active span, audible spans keep going
    browserFocused = false;
    closeSpan("active");
  } else {
    // Firefox regained focus
    browserFocused = true;
    updateActiveTab();
  }
});

// --- Periodic flush of long-running spans ---
// Every 60s, close and reopen all open spans to avoid unbounded durations
setInterval(() => {
  const now = Date.now();
  for (const [key, span] of openSpans.entries()) {
    const durationSec = Math.round((now - span.startedAt) / 1000);
    if (durationSec >= 60) {
      // Close and immediately reopen
      closeSpan(key);
      openSpan(key, {
        url: span.url,
        domain: span.domain,
        path: span.path,
        title: span.title,
      }, span.is_active === 1, span.is_audible === 1);
    }
  }
}, 60000);

// Initial capture on startup
setTimeout(async () => {
  await updateActiveTab();

  // Also capture any currently audible tabs
  try {
    const audibleTabs = await browser.tabs.query({ audible: true });
    for (const tab of audibleTabs) {
      const info = parseTab(tab);
      if (info) {
        openSpan(`audible:${tab.id}`, info, false, true);
      }
    }
  } catch {
    // Ignore
  }
}, 2000);
