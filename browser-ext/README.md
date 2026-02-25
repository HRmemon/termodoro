# Pomodorocli Browser Tracker

Firefox extension that tracks active tabs and background audio, feeding time data into pomodorocli's **Web Time** view (key `8`).

## How it works

```
Firefox Extension
  │  tab events (activate, navigate, audible)
  │  window focus/blur
  ▼
Native Messaging Host (Node.js)
  │  4-byte length-prefixed JSON over stdin/stdout
  ▼
~/.local/share/pomodorocli/browser.db  (SQLite)
  ▲
pomodorocli TUI — Web Time view
```

The extension tracks time **event-driven**, not on a fixed tick:

- Every tab switch, navigation, or audio state change closes the previous span and opens a new one with an accurate `duration_sec`
- A 5s debounce + 30s max timer flushes buffered entries to the native host
- Every 60s, long-running spans are checkpointed so durations stay bounded
- When Firefox loses window focus, active tab tracking pauses; audible tabs (background audio) keep accumulating

## Files

| File | Purpose |
|------|---------|
| `manifest.json` | Firefox Manifest V3 — permissions: `tabs`, `nativeMessaging`, `alarms` |
| `background.js` | Service worker — event listeners, span tracking, flush logic |

### `../native-host/`

| File | Purpose |
|------|---------|
| `pomodorocli-host.mjs` | Node.js stdio host — reads native messaging protocol, writes to SQLite |
| `package.json` | Separate `node_modules` compiled against system Node (`/usr/bin/node`) |

> **Why separate `node_modules`?** The host must run under the system Node (`/usr/bin/node v25`) which Firefox resolves via `PATH`. The main project uses nvm's Node v24. `better-sqlite3` is a native addon — it must be compiled for the Node version that actually runs it.

## Setup (one-time)

```bash
# 1. Install native messaging manifest
pomodorocli track

# 2. Install the extension in Firefox
#    Option A — permanent (requires web-ext + AMO API key):
cd browser-ext
web-ext sign --api-key=user:XXX --api-secret=XXX --channel=unlisted
# Then: about:addons → gear → Install Add-on From File → select .xpi

#    Option B — temporary (lost on Firefox restart):
# about:debugging → This Firefox → Load Temporary Add-on → select manifest.json

# 3. Enable in pomodorocli
# Config view (key 7) → Browser Tracking → ON
```

`pomodorocli track` only needs to run **once**. It writes a persistent file at `~/.mozilla/native-messaging-hosts/pomodorocli_host.json` and survives reboots. Re-run only if you move the project directory.

## SQLite schema

Database at `~/.local/share/pomodorocli/browser.db`:

```sql
CREATE TABLE page_visits (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  url          TEXT    NOT NULL,
  domain       TEXT    NOT NULL,
  path         TEXT    NOT NULL DEFAULT '/',
  title        TEXT    NOT NULL DEFAULT '',
  is_active    INTEGER NOT NULL DEFAULT 0,  -- 1 = foreground tab in focused window
  is_audible   INTEGER NOT NULL DEFAULT 0,  -- 1 = tab playing audio
  duration_sec INTEGER NOT NULL DEFAULT 60,
  recorded_at  TEXT    NOT NULL             -- local ISO datetime, e.g. 2026-02-25T14:30:00
);
```

`is_active` and `is_audible` are not mutually exclusive — a tab can be both foregrounded and playing audio.

## Permissions used

| Permission | Why |
|-----------|-----|
| `tabs` | Read tab URLs, titles, active/audible state |
| `nativeMessaging` | Communicate with the Node.js host process |
| `alarms` | (Reserved) Periodic checkpoint — currently handled by `setInterval` |

## Troubleshooting

**Extension connects but immediately disconnects**
The native host is crashing. Check the log:
```bash
cat ~/.local/share/pomodorocli/host-debug.log
```
Most common cause: `better-sqlite3` compiled for wrong Node version. Fix:
```bash
cd native-host && /usr/bin/npm install better-sqlite3
```

**No data in Web Time view**
- Confirm extension is loaded and not in error state (`about:debugging`)
- Confirm `Browser Tracking` is ON in Config view
- Check DB exists: `ls ~/.local/share/pomodorocli/browser.db`
- Data only appears for the current local date

**Moved the project directory**
Re-run `pomodorocli track` to update the absolute path in the native messaging manifest.
