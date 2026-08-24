---
name: pomodorocli
description: Use and automate this repository's Pomodoro CLI, daemon, TUI views, Goals, reports, tracking, session import/export, and backups. Use for requests that act through `pomodorocli`; do not use for code changes or unrelated generic productivity advice.
---

# Pomodoro CLI

Use the real CLI or TUI path that already owns the requested behavior. Do not invent one-shot commands for TUI-only features.

## Good operating practices

- Use `pomodorocli` for normal installed operation.
- Prefer `pomodorocli status` or `pomodorocli daemon status` for read-only inspection.
- `toggle`, `pause`, `resume`, `skip`, `reset`, `project`, and `mode` mutate the live timer. Run them only when the user asked for that state change.
- `import`, `track`, and `daemon install` write persistent state or system configuration. Confirm scope and input before running them.
- Prefer CLI and TUI actions over editing storage files directly. Use `Ctrl+G` only for an explicitly requested bulk edit.
- Back up session data before a risky import, and inspect an import file before applying it.
- Preserve IDs in exported or bulk-edited data; they provide identity and duplicate protection.
- Read JSON status output programmatically rather than scraping the TUI.
- Never edit daemon-owned timer state files while the daemon is running.

## One-shot commands

```bash
pomodorocli status                 # Full timer state as JSON
pomodorocli status -f short        # Compact status
pomodorocli toggle                 # Start / pause / resume
pomodorocli pause
pomodorocli resume
pomodorocli skip
pomodorocli reset
pomodorocli project NAME           # Set project; empty string clears it
pomodorocli mode                   # Inspect timer/stopwatch mode
pomodorocli mode timer
pomodorocli mode stopwatch
```

The daemon auto-starts for timer commands. Manage it explicitly only when needed:

```bash
pomodorocli daemon status
pomodorocli daemon start           # Foreground debugging
pomodorocli daemon stop
pomodorocli daemon install         # Writes a systemd user service
```

Data commands:

```bash
pomodorocli backup
pomodorocli export -o sessions.csv
pomodorocli import sessions.csv    # Also accepts JSON
pomodorocli track                  # Firefox tracking setup
```

`import` validates sessions and inserts new IDs into the session database; it has no dry-run mode. Inspect the file first when the user has not already approved importing it.

## TUI

Start with `pomodorocli` or `pomodorocli start`. Only these views have direct launch commands: `stats`, `config`, `clock`, and `web`. Reach the other views with their configured numeric shortcut:

| Key | View |
|---|---|
| `0` | Planner |
| `1` | Timer |
| `2` | Tasks |
| `3` | Reminders |
| `4` | Clock |
| `5` | Stats |
| `6` | Config |
| `7` | Web Time |
| `8` | Tracker |
| `9` | Goals |

Use `?` for the current key map, `/` for global search, `:` for the command palette, and `Ctrl+G` for the current view's supported bulk editor. Text inputs must finish or cancel before global keys are used.

## Goals

Goals is TUI-only: start the app and press `9`. It stores one hierarchy—`Area -> Goal -> Metric`—with daily values aggregated into Week and Month.

- `Tab` / `Shift+Tab`: next / previous area.
- `h/l` or arrows: Today / Week / Month.
- `n/p`: next / previous day or period; `t`: today.
- `j/k`: select metric.
- `Enter`: toggle checkbox, increment count, or edit rate/note.
- `Ctrl+A` / `Ctrl+X`: increment / decrement a count.
- `0`: clear today's selected metric.
- `P/E/M`: mark the selected day Perfect / Excused / Missed. Only Perfect extends the global streak.
- `N`: add, edit, or clear the selected day's check-in note.
- `R`: open the canonical HTML dashboard.
- `Ctrl+G`: edit complete Goals JSON when a bulk/schema change is explicitly requested.
- `Tab` / `Shift+Tab`: move forward / backward through Today, Week, and Month.
- `h` / `l`: move backward / forward through goal areas.

The input type and aggregation are independent. Common pairs are count+SUM, rate+MAX, rate+LATEST, checkbox+ANY, and checkbox+COUNT for once/twice-per-week goals. Preserve existing IDs when changing definitions because entries are keyed by metric ID.

Before rewriting definitions, inspect and snapshot `goals.json`. Replace definitions without discarding `entries`, `dayQuality`, or `dayNotes`. Translate requested actions one-to-one: do not combine distinct steps such as “identify” and “practise,” turn “each stream” into one shared counter, or invent an unstated target. `target` describes a threshold; add `cumulative: true` only when its recorded value should carry into later windows. Use `weeklyTarget` for work that resets each week, and `monthlyTarget` when Month must not be derived from the weekly cadence. A recurring checkbox uses checkbox+COUNT; checkbox+ANY with `cumulative: true` is a lasting milestone. Use note+LATEST for information that must carry into future weeks. `weekStartsOn` controls the weekly boundary using JavaScript day numbers (`0` Sunday through `6` Saturday); the default is `1` for Monday.

Goals data is `~/.local/share/pomodorocli/goals.json`. The bookmarkable report is `~/.local/share/pomodorocli/goals-dashboard.html`; Goals changes regenerate that same file atomically. Day notes live separately from metric entries and appear in HTML heatmap tooltips.
