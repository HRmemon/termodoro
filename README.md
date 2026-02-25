# pomodorocli

A terminal-first Pomodoro timer and productivity system. Keyboard-driven, distraction-free, with built-in task management, session sequences, activity tracking, goal monitoring, browser usage analytics, and more.

Runs as a background daemon with a TUI client. Control the timer from the TUI, CLI commands, keybindings, or waybar.

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

# Run (daemon auto-starts in the background)
npm start

# Or link globally
npm link
pomodorocli
```

## Quick Start

```bash
# Start the TUI (daemon starts automatically)
pomodorocli

# Start with a project tag and sequence
pomodorocli start --project backend --sequence deep-work

# Custom durations
pomodorocli start --work 50 --short-break 10

# Control from CLI (works from scripts, keybindings, etc.)
pomodorocli toggle
pomodorocli status --format short    # 🍅 23:41 #backend
pomodorocli project myapp
pomodorocli skip
```

---

## Architecture

pomodorocli uses a **daemon + client** architecture:

- **Daemon** — background process that owns the timer state, saves sessions, sends notifications, writes the waybar status file, and runs event hooks.
- **TUI** — the interactive terminal UI, a thin client that connects to the daemon over a Unix socket.
- **CLI** — one-shot commands (`toggle`, `status`, `project`, etc.) that talk to the daemon and exit.

The daemon **auto-starts** when you run any command. You never need to start it manually.

### Boot Startup (systemd)

```bash
pomodorocli daemon install
systemctl --user daemon-reload
systemctl --user enable pomodorocli
systemctl --user start pomodorocli
```

### Daemon Management

```bash
pomodorocli daemon status    # Check if running
pomodorocli daemon stop      # Stop the daemon
pomodorocli daemon start     # Start in foreground (for debugging)
```

---

## CLI Commands

### Timer Control

These send commands to the daemon and exit immediately. Useful for keybindings, scripts, and status bars.

```bash
pomodorocli toggle              # Start / pause / resume
pomodorocli pause               # Pause
pomodorocli resume              # Resume
pomodorocli skip                # Skip to next session
pomodorocli reset               # Reset current session
pomodorocli status              # Print full state as JSON
pomodorocli status -f short     # 🍅 23:41 #backend
pomodorocli project backend     # Set current project
pomodorocli project ""          # Clear project
```

### TUI Views

```bash
pomodorocli                     # Start TUI (timer view)
pomodorocli stats               # Stats view
pomodorocli plan                # Planner view
pomodorocli config              # Config view
pomodorocli clock               # Clock view
pomodorocli web                 # Browser tracking view
```

### Data Commands

```bash
pomodorocli backup              # Backup all data
pomodorocli export [-o file.csv]  # Export sessions to CSV
pomodorocli import <file>       # Import sessions
pomodorocli track               # Set up Firefox browser tracking
```

### CLI Flags

| Flag | Description |
|------|-------------|
| `-w, --work <min>` | Work duration in minutes |
| `--short-break <min>` | Short break duration |
| `--long-break <min>` | Long break duration |
| `--strict` | Enable strict mode (no pause/skip) |
| `-p, --project <name>` | Set initial project tag |
| `-s, --sequence <name>` | Activate a sequence (name or inline e.g. `"45w 15b 45w"`) |
| `-f, --format <fmt>` | Output format for status (`json`, `short`) |
| `-o, --output <file>` | Output file for export |

---

## Views

Navigate between views with number keys `1`-`0`. Press `?` for the help overlay.

| Key | View | Description |
|-----|------|-------------|
| `1` | Timer | Big ASCII countdown with project tag and sequence progress |
| `2` | Tasks | Task list with project tags and pomodoro tracking |
| `3` | Reminders | Scheduled notifications at specific times |
| `4` | Clock | Standalone digital clock display |
| `5` | Sequences | Activate preset or custom session sequences |
| `6` | Stats | Daily/weekly analytics, heatmaps, bar charts |
| `7` | Config | Edit all settings, manage custom sequences |
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
| `q` | Close overlay / exit zen mode |

---

## Features & Views

### [1] Timer

The main Pomodoro screen. Displays a large countdown timer, current session type, project tag, and sequence progress.

| Key | Action |
|-----|--------|
| `Space` | Start / Pause / Resume |
| `s` | Skip session (disabled in strict mode) |
| `t` | Set custom duration (minutes) |
| `p` | Set project tag (with autocomplete) |
| `P` | Clear project tag |
| `S` | Open sequence picker |
| `r` | Reset session (prompts to log as productive or unproductive) |
| `c` | Clear active sequence |
| `z` | Toggle Zen mode |

**Project tagging**: Press `p` to tag the current session with a project. Type to filter, `↑/↓` to navigate suggestions, `Tab` to fill, `Enter` to select. The tag persists across sessions and restarts. Press `P` to clear.

**Sequence picker**: Press `S` to open an inline picker with all available sequences. `j/k` to navigate, `Enter` to activate (or deactivate if already active), `Esc` to close.

**Reset behavior**: If elapsed time >= 10 seconds, you'll be asked whether to log as productive (completed) or unproductive (abandoned). If on a break with 0 elapsed, it skips to the next work session.

**Zen mode**: A distraction-free display showing only the timer. `Space` and `s` still work; press `Esc` or `z` to exit.

**Timer persistence**: The daemon persists timer state to disk. If the daemon restarts, it resumes where it left off. Expired timers are auto-completed and logged.

---

### [2] Tasks

Manage daily tasks with project tags, expected pomodoros, and completion tracking.

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

---

### [4] Clock

A simple digital clock display with the current date and time. Supports Zen mode (`z`).

---

### [5] Sequences

Browse and activate preset or custom session sequences. An active sequence overrides the default timer durations and auto-advances through blocks.

| Key | Action |
|-----|--------|
| `j/k` | Navigate |
| `Enter` | Activate sequence |
| `c` | Clear active sequence |

**Presets**: `deep-work` (45w 15b 45w 15b 45w 30b), `standard` (4x 25w 5b + 15b), `sprint` (50w 10b 50w 30b).

Custom sequences are managed in the Config view (`7`).

**Tip**: You can also activate sequences from the Timer view with `S`, or from the CLI with `--sequence`.

---

### [6] Stats

Session analytics across multiple tabs: Today, Week, Projects, Tasks, and Recent.

| Key | Action |
|-----|--------|
| `h/l` or `j/k` | Switch tab |

---

### [7] Config

Edit all application settings directly in the TUI. Includes sub-editors for tracker categories, domain rules, and custom sequences.

| Key | Action |
|-----|--------|
| `j/k` | Navigate settings |
| `Enter` | Edit / toggle value |
| `s` | Save config to disk |
| `p` | Preview sound |

**Custom Sequences sub-editor**: `a` to add, `e` to edit, `d` to delete custom sequences.

**Tracker Categories sub-editor**: `a` to add, `e` to edit, `d` to delete, `h/l` to change color.

**Domain Rules sub-editor**: `a` to add, `e` to edit, `d` to delete. Supports path-aware patterns (e.g. `youtube.com/shorts/*`).

---

### [8] Web Tracking

Browser usage statistics from the Firefox extension. Shows domain breakdowns, top pages, and time summaries.

| Key | Action |
|-----|--------|
| `h/l` | Change time range (Today / Week / Month / All) |
| `Tab` | Switch between Domains and Pages tabs |
| `j/k` | Scroll list |
| `R` | Generate full HTML report and open in browser |

**Setup**: Run `pomodorocli track` to set up the Firefox native messaging host, then load the browser extension.

**Focus Mode Warnings**: During a work session, navigating to a domain flagged as W (Wasted) in your domain rules triggers a browser notification. Clicking the notification closes matching tabs. Configure domain rules in Config view (`7`).

---

### [9] Tracker

A weekly time grid with 30-minute slots for manual activity categorization.

| Key | Action |
|-----|--------|
| `h/j/k/l` | Navigate grid |
| `Tab` | Jump to next day |
| `e` / `Enter` | Open category picker for slot |
| `.` | Clear slot |
| Category keys | Set slot immediately |
| `r` | Review pending suggestions |
| `A` | Accept all pending suggestions |
| `n` | Create new week |
| `b` | Browse past weeks |
| `d` / `w` | Toggle day / week summary |

---

### [0] Goals

Track daily habits and goals with heatmap visualization.

| Key | Action |
|-----|--------|
| `Tab` / `h` / `l` | Switch between goals |
| `←/→` | Navigate dates |
| `j/k` | Prev / next day |
| `t` | Jump to today |
| `↑/↓` | Adjust rating / scroll weeks |
| `Enter` / `x` | Toggle completion or rate picker |
| `a` | Add goal |
| `e` | Edit goal |
| `d` | Delete goal |

**Goal types**: Manual (toggle), Auto (count by `#project` pomodoros), Rate (daily rating).

---

## Command Palette

Press `:` to open the command palette. `Tab` autocompletes commands.

| Command | Description |
|---------|-------------|
| `:task TEXT [#PROJECT] [/N]` | Create a task |
| `:reminder HH:MM TITLE` | Create a timed reminder |
| `:remind AMOUNT UNIT [LABEL]` | Quick countdown (e.g. `:remind 5m Coffee`) |
| `:search QUERY` | Search sessions |
| `:session NAME_OR_INLINE` | Activate a sequence |
| `:insights` | Focus score, energy patterns, burnout detection |
| `:quit` | Quit |

---

## Waybar Integration

The daemon writes `/tmp/pomodorocli-status.json` on every tick with waybar-formatted fields.

**Waybar config** (`~/.config/waybar/config`):

```json
{
  "custom/pomodoro": {
    "exec": "cat /tmp/pomodorocli-status.json | jq -r '.waybar.text'",
    "exec-if": "test -f /tmp/pomodorocli-status.json",
    "return-type": "",
    "signal": 8,
    "interval": 30,
    "on-click": "pomodorocli toggle",
    "on-click-right": "pomodorocli skip",
    "on-click-middle": "pomodorocli reset",
    "tooltip": true
  }
}
```

**Waybar CSS** (`~/.config/waybar/style.css`):

```css
#custom-pomodoro.work-running { color: #00C853; }
#custom-pomodoro.work-paused  { color: #FFB300; }
#custom-pomodoro.break        { color: #00BCD4; }
#custom-pomodoro.idle         { color: #666666; }
```

The daemon sends `SIGRTMIN+8` to waybar on state changes for instant refresh.

---

## Event Hooks

The daemon executes shell scripts from `~/.config/pomodorocli/hooks/` on lifecycle events. Each hook receives event data as environment variables.

**Available hooks**:

| File | Fires when |
|------|------------|
| `on-session-start.sh` | Work/break session starts |
| `on-session-complete.sh` | Session completes naturally |
| `on-session-skip.sh` | Session is skipped |
| `on-session-abandon.sh` | Session is abandoned |
| `on-break-start.sh` | Break session auto-starts |
| `on-pause.sh` | Timer is paused |
| `on-resume.sh` | Timer is resumed |

**Environment variables**: `POMODORO_SESSION_TYPE`, `POMODORO_PROJECT`, `POMODORO_DURATION_PLANNED`, `POMODORO_DURATION_ACTUAL`, `POMODORO_SESSION_NUMBER`, etc.

**Example** (`~/.config/pomodorocli/hooks/on-session-complete.sh`):

```bash
#!/bin/bash
# Desktop notification
dunstify -a "pomodoro" "Focus Complete" "Session #${POMODORO_SESSION_NUMBER} done." -t 5000

# Mute notifications during break
makoctl set-mode default

# Log to timewarrior
timew stop "pomodoro:${POMODORO_PROJECT}" 2>/dev/null
```

Hooks are non-blocking (detached), killed after 5s timeout, and stdout/stderr is logged to `~/.local/share/pomodorocli/hooks.log`.

---

## Hyprland Integration

Bind timer controls to keyboard shortcuts:

```conf
# ~/.config/hypr/hyprland.conf
bind = $mainMod, F5, exec, pomodorocli toggle
bind = $mainMod, F6, exec, pomodorocli skip
bind = $mainMod SHIFT, F5, exec, pomodorocli project $(wofi --dmenu -p "Project:")
```

---

## Configuration

Settings are stored at `~/.config/pomodorocli/config.json`. Edit in the Config view (`7`) or pass CLI flags.

| Setting | Default | Description |
|---------|---------|-------------|
| `workDuration` | 25 | Work session (minutes) |
| `shortBreakDuration` | 5 | Short break (minutes) |
| `longBreakDuration` | 15 | Long break (minutes) |
| `longBreakInterval` | 4 | Work sessions before long break |
| `autoStartBreaks` | true | Auto-start breaks after work |
| `autoStartWork` | false | Auto-start work after breaks |
| `strictMode` | false | Disable pause/skip |
| `sound` | true | Sound on completion |
| `notifications` | true | OS notifications |
| `timerFormat` | mm:ss | Display format (`mm:ss`, `hh:mm:ss`, `minutes`) |
| `browserTracking` | false | Enable browser usage tracking |
| `vimKeys` | true | Vim-style navigation |

---

## Data Storage

All data lives in `~/.local/share/pomodorocli/`:

```
sessions.json       # Session history
tasks.json          # Task list
reminders.json      # Reminders
timer-state.json    # Active timer state (managed by daemon)
tracker/            # Weekly tracker data
goals/              # Goal tracking data
browser.db          # SQLite database for browser tracking
daemon.sock         # Unix socket (runtime)
daemon.pid          # Daemon PID file (runtime)
hooks.log           # Hook execution logs
```

Config lives in `~/.config/pomodorocli/`:

```
config.json         # Application settings
hooks/              # Event hook scripts
```

---

## Development

```bash
npm run dev          # Run TUI with tsx (hot reload)
npm run dev:daemon   # Run daemon with tsx
npm run build        # Compile TypeScript
npm start            # Run compiled output
```

---

## License

MIT