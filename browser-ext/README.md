# Pomodorocli Browser Tracker

The Firefox extension is an activity sensor. Pomodoro owns storage, classification,
notifications, and the Web Time and Waybar displays.

## Data flow

Firefox → native messaging bridge → Pomodoro daemon → browser.db → Web Time / Waybar

- The extension reports the active tab, window focus, audible tabs, and a timestamp.
- It sends snapshots on tab/navigation/audio/focus changes and a one-minute alarm.
  The alarm keeps long visits measurable even when the page never changes.
- The bridge only forwards JSON to the daemon's Unix socket. If the daemon stops,
  the bridge exits; the extension reconnects every five seconds and sends fresh state.
- The daemon attributes elapsed time to the previous snapshot. Gaps longer than five
  minutes are discarded to avoid counting suspension or a disconnected browser.
- Background audio is stored separately. Only foreground active time contributes
  to automatic wasted time.
- Domain/path rules live in Pomodoro's Config → Domain Rules
  (`tracker-config.json`). Notifications use the same matcher as wasted time.
  Notification conditions and cooldowns live in `config.json` under `browserRules`;
  omitted cooldowns default to five minutes.
- Waybar counts every matching page in each half-hour, capped at 30 minutes.
  A manual tracker classification takes priority over automatic browser waste.
- Web Time and the Waybar status file refresh every 30 seconds. With the heartbeat,
  unchanged-page time can take about 90 seconds to appear.

The extension contains no domain rules, timers for accounting, database access,
or notification logic. Changing Pomodoro rules does not require an extension update.

## Setup and updates

1. Run `pomodorocli track` to register the native messaging bridge.
2. Install the signed XPI in Firefox: `about:addons` → gear →
   **Install Add-on From File**. Updating source files alone does not update an
   installed signed extension.
3. Enable **Browser Tracking** in Pomodoro Config (key `6`).
4. Open Web Time (key `7`) to check recorded activity.

For temporary development, use `about:debugging` → This Firefox →
Load Temporary Add-on → select `browser-ext/manifest.json`.

The bridge uses only Node's standard library. It needs no separate npm install.
Run `pomodorocli track` again if the repository is moved.

## Troubleshooting

- Check the extension is enabled, Browser Tracking is on, and the daemon is running.
- Verify recent `browser_events_log` rows in
  `~/.local/share/pomodorocli/browser.db`. An unchanged page should send
  `heartbeat` every minute.
- Check `/tmp/pomodorocli-status.json` for the actual Waybar payload.
- A browser extension update is required for heartbeat changes; restarting only
  the daemon cannot update Firefox's installed code.
- Time discarded before the heartbeat fix cannot be reconstructed reliably.
