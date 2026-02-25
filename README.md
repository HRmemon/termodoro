# pomodorocli

A terminal-first Pomodoro timer and productivity system. Keyboard-driven, distraction-free, with built-in task management, session sequences, activity tracking, goal monitoring, browser usage analytics, and more.

Built with [React](https://reactjs.org/) + [Ink](https://github.com/vadimdemedes/ink).

![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)

## Install

```bash
# Clone and install
git clone https://github.com/YOUR_USERNAME/pomodorocli.git
cd pomodorocli
npm install
npm run build

# Run
npm start

# Or link globally
npm link
pomodorocli
```

## Quick Start

```bash
# Start with defaults (25m work / 5m break)
pomodorocli

# Custom durations
pomodorocli start --work 50 --short-break 10

# Strict mode (no pause/skip)
pomodorocli start --strict

# Jump to a specific view
pomodorocli stats
pomodorocli plan
pomodorocli config
pomodorocli web
```

---

## Views

Navigate between views with number keys `1`-`0`. Press `?` for the help overlay.

| Key | View | Description |
|-----|------|-------------|
| `1` | Timer | Big ASCII countdown with active task display |
| `2` | Tasks | Task list with project tags and pomodoro tracking |
| `3` | Reminders | Scheduled notifications at specific times |
| `4` | Clock | Standalone digital clock display |
| `5` | Sequences | Multi-block session sequences (e.g. 45w 15b 45w) |
| `6` | Stats | Daily/weekly analytics, heatmaps, bar charts |
| `7` | Config | Edit all settings without touching config files |
| `8` | Web | Browser usage tracking with domain/page breakdowns |
| `9` | Tracker | Weekly 30-minute time slot grid with categories |
| `0` | Goals | Daily habit/goal tracking with heatmap visualization |

---

## Global Keybindings

These work from any view (unless a text input is active):

| Key | Action |
|-----|--------|
| `1`-`0` | Switch view directly |
| `/` | Global fuzzy search (tasks, reminders, sequences) |
| `:` | Command palette |
| `?` | Help overlay (paginated keybinding reference) |
| `Ctrl+G` | Open current view's data in `$EDITOR` for bulk editing |
| `z` | Toggle Zen mode (Timer and Clock views) |
| `q` | Quit |

---

## Features & Views

### [1] Timer

The main Pomodoro screen. Displays a large countdown timer, the current session type (work/break), and any active tasks.

| Key | Action |
|-----|--------|
| `Space` | Start / Pause / Resume |
| `s` | Skip session (disabled in strict mode) |
| `t` | Set custom duration (minutes) |
| `r` | Reset session (prompts to log as productive or unproductive) |
| `c` | Clear active sequence |
| `z` | Toggle Zen mode (minimal fullscreen timer) |
| `j/k` | Navigate active tasks |
| `Enter` | Deactivate selected task |
| `x` | Complete selected task |

**Reset behavior**: If elapsed time >= 10 seconds, you'll be asked whether to log as productive (completed) or unproductive (abandoned). If on a break with 0 elapsed, it skips to the next work session.

**Zen mode**: A distraction-free display showing only the timer. `Space` and `s` still work; press `Esc` or `z` to exit.

**Timer persistence**: Closing the terminal mid-session saves state to disk. Relaunch and it resumes where you left off. Expired timers are auto-completed and logged.

---

### [2] Tasks

Manage daily tasks with project tags, expected pomodoros, and completion tracking. Active tasks appear on the Timer view.

| Key | Action |
|-----|--------|
| `j/k` | Navigate up/down |
| `Enter` | Toggle task active/inactive |
| `x` | Complete task (or undo if already completed) |
| `a` | Add new task |
| `e` | Edit task |
| `d` | Delete task |
| `u` | Undo last completion |
| `/` | Filter tasks (fuzzy search) |

**Task format**: `task name #project /3` — `#project` adds a project tag, `/3` sets expected pomodoros.

**Project autocomplete**: When typing `#`, matching projects are suggested. Use `↑/↓` to navigate and `Tab` to accept.

**Filter mode**: Press `/` to type a filter query. `Enter` applies, `Esc` cancels. While filtered, `Esc` clears the filter. Press `/` again to refine.

---

### [3] Reminders

Create time-based notifications, either one-shot or recurring daily.

| Key | Action |
|-----|--------|
| `j/k` | Navigate |
| `a` | Add reminder |
| `e` | Edit reminder |
| `d` | Delete reminder |
| `Enter` | Toggle on/off |
| `r` | Toggle recurring / one-shot |

**Add flow**: Enter time (HH:MM format), then title (optional), then optionally link to a task.

---

### [4] Clock

A simple digital clock display with the current date and time. Supports Zen mode (`z`).

---

### [5] Sequences

Define custom work/break session chains or use presets. An active sequence overrides the default timer durations and auto-advances through blocks.

| Key | Action |
|-----|--------|
| `j/k` | Navigate |
| `Enter` | Activate sequence |
| `a` | Add new custom sequence |
| `e` | Edit custom sequence |
| `d` | Delete custom sequence |
| `c` | Clear active sequence |

**Sequence format**: `25w 5b 25w 5b` means 25 min work, 5 min break, repeated.

**Presets**:
- `short` — 25w 5b
- `medium` — 25w 5b 25w 15b
- `long` — 45w 15b 45w 30b
- `focus-block` — 50w 10b 50w 20b
- `power-hour` — 25w 5b x4

---

### [6] Stats

Session analytics across multiple tabs: Today, Week, Projects, Tasks, and Recent.

| Key | Action |
|-----|--------|
| `h/l` or `←/→` | Switch tab |
| `j/k` or `↑/↓` | Switch tab |

**Tabs**:
- **Today** — Focus time, break time, sessions completed
- **Week** — Weekly heatmap, total focus, average session length
- **Projects** — Bar chart of time by project
- **Tasks** — Project task completion stats
- **Recent** — Last 10 completed sessions

---

### [7] Config

Edit all application settings directly in the TUI. Includes sub-editors for tracker categories and domain rules.

| Key | Action |
|-----|--------|
| `j/k` | Navigate settings |
| `Enter` | Edit / toggle value |
| `s` | Save config to disk |
| `p` | Preview sound (for sound events) |

**Tracker Categories sub-editor** (Enter on that row):
- `a` — Add category, `e` — Edit, `d` — Delete
- `h/l` — Change color in editor

**Domain Rules sub-editor** (Enter on that row):
- `a` — Add rule, `e` — Edit, `d` — Delete
- Domain and path suggestions from browser history for autocomplete
- Supports path-aware patterns (e.g. `youtube.com/shorts/*`)

---

### [8] Web Tracking

Browser usage statistics from the Firefox extension. Shows domain breakdowns, top pages, and time summaries across configurable date ranges.

| Key | Action |
|-----|--------|
| `h/l` | Change time range (Today → Week → Month → All) |
| `Tab` | Switch between Domains and Pages tabs |
| `j/k` | Scroll list |
| `R` | Generate full HTML report and open in browser |

**Time ranges**: Today, This Week (Mon-Sun), This Month, All Time.

**HTML report** (`R`): Generates a comprehensive report with full domain bar charts (colored by category), complete page list, hourly activity chart, and flagged domains section. Opens automatically in your default browser.

**Path-aware domain rules**: Rules like `youtube.com/shorts/*` split browsing time for a domain by URL path. These appear as separate entries in the domains list alongside the whole-domain total.

**Setup**: Run `pomodorocli track` to set up the Firefox native messaging host, then load the browser extension. Browser data flows in automatically.

---

### [9] Tracker

A weekly time grid with 30-minute slots for manual activity categorization. Each slot can be assigned a category (e.g. Work, Exercise, Reading). Browser data generates suggestions that can be reviewed and accepted.

| Key | Action |
|-----|--------|
| `h/j/k/l` | Navigate grid (left/down/up/right) |
| `Tab` | Jump to next day |
| `e` / `Enter` | Open category picker for slot |
| `.` | Clear slot |
| Category keys | Set slot immediately (case-sensitive shortcut) |
| `r` | Review pending suggestions |
| `A` | Accept all pending suggestions |
| `n` | Create new week |
| `b` | Browse past weeks |
| `d` | Toggle day summary panel |
| `w` | Toggle week summary panel |

**Category picker** (opened with `e`/`Enter`):
- `j/k` — Navigate categories
- `Enter` — Confirm selection
- `.` — Clear slot
- Category shortcut keys — Select and set immediately
- `Esc` — Cancel

**Review mode** (opened with `r`):
- `y/Y` — Accept suggestion
- `n/N` — Reject suggestion
- `A` — Accept all
- `Tab` — Next pending
- Category keys — Change suggestion category and accept
- `Esc` — Exit review

**Browse mode** (opened with `b`):
- `j/k` — Navigate weeks
- `Enter` — Open selected week
- `Esc` — Back to grid

---

### [0] Goals

Track daily habits and goals with heatmap visualization. Three goal types: manual toggle, auto-counted from pomodoros, and daily ratings.

| Key | Action |
|-----|--------|
| `Tab` / `h` / `l` | Switch between goals |
| `←/→` | Navigate dates (clamped to today) |
| `j` | Previous day |
| `k` | Next day |
| `t` | Jump to today |
| `↑/↓` | For rate goals: adjust rating. Otherwise: scroll weeks |
| `Enter` / `x` | Toggle completion or open rate picker |
| `a` | Add new goal |
| `e` | Edit goal |
| `d` | Delete goal (with y/n confirmation) |

**Goal types**:
- **Manual** — Toggle daily (e.g. Exercise, Reading)
- **Auto** — Auto-count by `#project` pomodoros
- **Rate** — Daily rating on a configurable scale (0-5 by default)

**Rate picker** (opened with `Enter` on a rate goal):
- `↑/k` — Increase rating
- `↓/j` — Decrease rating
- `1-9` — Set rating directly
- `0` — Clear rating
- `Enter` — Confirm
- `Esc` — Cancel

---

## Command Palette

Press `:` to open the command palette. `Tab` autocompletes commands.

| Command | Description |
|---------|-------------|
| `:stats` | Open statistics view |
| `:plan` | Open planner/sequences view |
| `:tasks` | Open tasks view |
| `:task TEXT [#PROJECT] [/N]` | Create a task (e.g. `:task Bug fix #backend /2`) |
| `:reminders` | Open reminders view |
| `:reminder HH:MM TITLE` | Create a reminder (e.g. `:reminder 14:30 Standup`) |
| `:remind AMOUNT UNIT [LABEL]` | Quick countdown timer (e.g. `:remind 5m Coffee`) |
| `:search QUERY` | Search sessions with filters |
| `:insights` | Show focus score, energy patterns, burnout detection |
| `:config` | Open config view |
| `:quit` | Quit |

**`:remind` units**: `s` (seconds), `m` (minutes), `h` (hours).

---

## Search

### Global Search (`/`)

Fuzzy-matches across tasks, reminders, and sequences. Navigate results with `j/k`, press `Enter` to jump to the item, `i` or `/` to edit query, `Esc` to close.

Filter prefixes: `task:`, `seq:`, `rem:`, `#project`.

### Session Search (`:search`)

Filter past sessions with structured queries:

```
project:myapp tag:bugfix after:2024-01-01
type:work status:completed min:25 max:60
energy:high before:2024-12-31
```

| Filter | Values |
|--------|--------|
| `project:NAME` | Filter by project |
| `tag:TAG` | Filter by tag |
| `type:` | `work`, `short-break`, `long-break` |
| `status:` | `completed`, `skipped`, `abandoned` |
| `energy:` | `low`, `medium`, `high` |
| `after:YYYY-MM-DD` | Sessions after date |
| `before:YYYY-MM-DD` | Sessions before date |
| `min:MINUTES` | Minimum duration |
| `max:MINUTES` | Maximum duration |
| Free text | Fuzzy match on label/project |

---

## Insights (`:insights`)

Shows a productivity dashboard:
- **Focus score** — composite metric based on focus minutes and consistency
- **Burnout warnings** — alerts if you're overworking
- **Energy patterns** — identifies your best and worst hours
- **Productivity by hour** — horizontal bar chart

Exit with `Esc` or `q`.

---

## How Views Connect

- **Timer** ↔ **Tasks**: Activate tasks in the Tasks view; they appear on the Timer. Complete them from either view.
- **Timer** ↔ **Sequences**: Activate a sequence in Sequences view; the Timer uses its durations and auto-advances.
- **Timer** → **Stats**: Completed sessions feed into Stats analytics.
- **Timer** → **Tracker**: Completed pomodoros create auto-fill entries in the Tracker grid.
- **Web** → **Tracker**: Browser data generates suggestions for Tracker time slots.
- **Config** → **Tracker/Web**: Domain rules and tracker categories configured in Config are used by both Tracker and Web views.
- **Goals** ← **Tasks/Timer**: Auto goals count pomodoros by project tag.
- **Reminders** ↔ **Tasks**: Reminders can optionally be linked to tasks.
- **Ctrl+G** works from any view to open the relevant data in your `$EDITOR`.

---

## Configuration

Settings are stored at `~/.config/pomodorocli/config.json`. Edit in the Config view (`7`) or pass CLI flags.

| Setting | Default | Description |
|---------|---------|-------------|
| `workDuration` | 25 | Work session (minutes) |
| `shortBreakDuration` | 5 | Short break (minutes) |
| `longBreakDuration` | 15 | Long break (minutes) |
| `longBreakInterval` | 4 | Work sessions before long break |
| `autoStartBreaks` | false | Auto-start breaks after work |
| `autoStartWork` | false | Auto-start work after breaks |
| `strictMode` | false | Disable pause/skip |
| `sound` | true | Sound on completion |
| `notifications` | true | OS notifications |
| `compactTime` | false | Compact time input for reminders |
| `vimKeys` | true | Vim-style navigation |
| `timerFormat` | mm:ss | Display format (mm:ss, hh:mm:ss, minutes) |
| `browserTracking` | false | Enable browser usage tracking |

---

## Data Storage

All data lives in `~/.local/share/pomodorocli/`:

```
sessions.json       # Session history
plans.json          # Day plans
achievements.json   # Unlocked achievements
timer-state.json    # Active timer state (auto-cleaned)
tasks.json          # Task list
reminders.json      # Reminders
config.json         # Configuration (also in ~/.config/pomodorocli/)
tracker/            # Weekly tracker data
goals/              # Goal tracking data
browser.db          # SQLite database for browser tracking
```

---

## CLI Commands

```bash
pomodorocli                          # Start timer (default)
pomodorocli start [--work N] [--strict]  # Start with options
pomodorocli stats                    # View statistics
pomodorocli plan                     # View planner/sequences
pomodorocli config                   # Open configuration
pomodorocli clock                    # Clock view
pomodorocli web                      # Browser tracking stats
pomodorocli track                    # Setup Firefox extension
pomodorocli backup                   # Backup all data
pomodorocli export [-o file.csv]     # Export sessions to CSV
pomodorocli import <file>            # Import sessions
```

**CLI flags**:
- `-w, --work <minutes>` — Work duration
- `--short-break <minutes>` — Short break duration
- `--long-break <minutes>` — Long break duration
- `--strict` — Enable strict mode
- `-o, --output <file>` — Output file for export

---

## Development

```bash
npm run dev      # Run with tsx (hot reload)
npm run build    # Compile TypeScript
npm start        # Run compiled output
```

## License

MIT
