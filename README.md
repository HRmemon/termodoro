# pomodorocli

A terminal-first Pomodoro timer and productivity system. Keyboard-driven, distraction-free, with built-in task management, session sequences, analytics, and achievements.

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
```

## Views

Navigate between views with number keys `1`-`7`.

| Key | View | Description |
|-----|------|-------------|
| `1` | Timer | Big ASCII countdown with active task display |
| `2` | Tasks | Task list with project tags and pomodoro tracking |
| `3` | Reminders | Scheduled notifications at specific times |
| `4` | Clock | Standalone clock display |
| `5` | Sequences | Multi-block session sequences (e.g. 45w 15b 45w) |
| `6` | Stats | Daily/weekly analytics, heatmaps, charts, streaks |
| `7` | Config | Edit settings without touching config files |

## Keybindings

Press `?` at any time to see the full help overlay.

### Timer

| Key | Action |
|-----|--------|
| `Space` | Start / Pause / Resume |
| `s` | Skip session |
| `t` | Set custom duration |
| `r` | Reset + log time |
| `c` | Clear active sequence |
| `z` | Zen mode (fullscreen timer) |

### Global

| Key | Action |
|-----|--------|
| `1`-`7` | Switch view |
| `:` | Command palette |
| `/` | Global search |
| `?` | Help |
| `q` | Quit |

## Features

### Session Sequences

Define custom work/break flows or use presets:

```
:session deep-work      # 45w 15b 45w 15b 45w 30b
:session standard       # 4x (25w 5b) + 15b long break
:session sprint         # 50w 10b 50w 30b
:session 45w 15b 45w    # Custom sequence
```

Sequences persist across restarts. Press `s` to skip to the next block.

### Task Management

- Create tasks with expected pomodoros: `:task Fix auth bug #backend /3`
- Activate a task to track it alongside the timer
- Mark complete with `x`, undo with `u`
- Filter by project tags

### Analytics

The Stats view (`6`) includes:

- **Daily/Weekly summaries** -- focus minutes, session counts, completion rates
- **Heatmap** -- visual calendar of your activity
- **Bar charts** -- productivity by hour and project
- **Streaks** -- current and personal best
- **Focus score** -- composite metric based on consistency
- **Burnout detection** -- warns if you're overworking
- **Energy patterns** -- identifies your peak productivity hours

### Achievements

11 unlockable achievements tracking milestones like total focus hours, streak lengths, and session counts.

### Search

Advanced filtering with the `/` key or `:search` command:

```
project:myapp tag:bugfix after:2024-01-01
type:work status:completed min:25
```

### Reminders

Schedule time-based notifications:

```
:reminder 09:30 Standup meeting
```

Toggle recurring with `r` in the Reminders view.

### Timer Persistence

Close the terminal mid-session? No problem. Pomodorocli saves timer state to disk and resumes where you left off. Expired timers are auto-completed and logged.

### Data Management

```bash
pomodorocli export              # Export sessions to CSV
pomodorocli export -o data.csv  # Export to specific file
pomodorocli backup              # Backup all data
pomodorocli import data.json    # Import sessions
```

## Configuration

Settings are stored at `~/.config/pomodorocli/config.json`. Edit them in the Config view (`7`) or pass CLI flags.

| Setting | Default | Description |
|---------|---------|-------------|
| `workDuration` | 25 | Work session (minutes) |
| `shortBreakDuration` | 5 | Short break (minutes) |
| `longBreakDuration` | 15 | Long break (minutes) |
| `longBreakInterval` | 4 | Work sessions before long break |
| `autoStartBreaks` | false | Auto-start breaks |
| `strictMode` | false | Disable pause/skip |
| `sound` | true | Terminal bell on completion |
| `notifications` | true | OS notifications |
| `timerFormat` | mm:ss | Display format (mm:ss, hh:mm:ss, minutes) |

## Data Storage

All data lives in `~/.local/share/pomodorocli/`:

```
sessions.json       # Session history
plans.json          # Day plans
achievements.json   # Unlocked achievements
timer-state.json    # Active timer state (auto-cleaned)
```

## Development

```bash
npm run dev      # Run with tsx (hot reload)
npm run build    # Compile TypeScript
npm start        # Run compiled output
```

## License

MIT
