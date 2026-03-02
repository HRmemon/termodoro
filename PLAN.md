# pomodorocli — Architecture Refactor Proposal

## Context

pomodorocli is a terminal-first Pomodoro timer and productivity system built with React + Ink. It currently has 10 views (Timer, Tasks, Reminders, Clock, Sequences, Stats, Config, Web Tracking, Time Tracker, Goals), a command palette, global search, session persistence, achievement tracking, browser usage analytics, and more.

The full source is a single TypeScript codebase: `app.tsx` (main orchestrator), 27 components in `components/`, 4 custom hooks in `hooks/`, and 18 library modules in `lib/`. State management is a mix of React hooks, JSON files on disk (`~/.local/share/pomodorocli/`), and a SQLite database for browser tracking.

---

## Problem Statement

### 1. Task/Project Tracking Has Too Much Friction

The current workflow to track *what you're working on* requires:

1. Navigate to Tasks view (`2`)
2. Add a task with `a`, typing `task name #project /3`
3. Press `Enter` to activate the task
4. Navigate back to Timer view (`1`)

This is 4+ steps for something that should be near-instant. In practice, I (the developer/user) rarely use the task list at all — I just want to tag my current session with a project name. The task system is overbuilt for how I actually work: I don't need per-task pomodoro counts or completion tracking most of the time. I just need the timer to know "I'm working on #backend" so stats and goals track correctly.

**The core issue:** There's no way to tag a session with a project from the Timer view directly. The only path goes through the Tasks system, which adds overhead I don't need.

**What I actually want:**
- Press a key on the Timer view, type `#project`, and start working
- The project tag persists across sessions until I change it (sticky project)
- Stats, Goals (auto-goals), and session history all pick up the project tag
- Tasks remain available for when I want granular tracking, but they're optional — not the only way to tag work

### 2. Sequences View Is Unnecessary Navigation

Sequences (custom work/break patterns like `45w 15b 45w`) have their own dedicated view (`5`), but activating a sequence is fundamentally a timer concern. The current flow:

1. Press `5` to go to Sequences
2. Navigate to desired sequence with `j/k`
3. Press `Enter` to activate
4. Press `1` to go back to Timer

The Sequences view is only useful for *creating and editing* sequences. Activation should happen inline on the Timer. The view switcher has a dedicated slot (`5`) for something I interact with for 2 seconds before going back to the Timer.

### 3. Monolithic TUI Architecture Blocks System Integration

This is the most significant problem. The entire application lives inside a single React/Ink render loop. All state (timer, tasks, sessions, config) is managed through React hooks and direct file I/O from within the TUI process. This means:

- **No external control:** You cannot start/pause/skip the timer from outside the TUI. No CLI commands, no waybar buttons, no keyboard shortcuts from the window manager.
- **No system tray / bar integration:** On Arch with Hyprland + Waybar, I want to see `🍅 23:41 #backend` in my status bar. Currently impossible — the timer state lives exclusively inside the Ink process.
- **No event hooks:** When a session completes, I might want to: change Hyprland workspace colors, mute `mako` notifications during focus, log to `timewarrior`, trigger a custom `dunstify` notification, run `pw-play` with a specific sound file, update a `polybar` module, or post to a webhook. None of this is possible because session lifecycle events are trapped inside React callbacks.
- **No programmatic task/reminder creation:** Adding a task requires the TUI to be open and focused. I can't do `pomodoro task add "fix auth #backend /3"` from another terminal or a shell alias.
- **Timer state is fragile:** The current persistence mechanism (`timer-state.json`) only works on graceful close. If the terminal crashes or the OOM killer strikes, state is lost. A daemon would survive this.
- **Single instance limitation:** Only one TUI can run at a time because they'd conflict on the same state files. A daemon model naturally solves this — multiple clients, one source of truth.

---

## Proposed Solution

### Phase 1: Quick UX Wins (No Architecture Change)

These changes improve daily workflow immediately within the existing codebase.

#### 1A. Quick Project Tagging on Timer View

Add a `p` keybinding to the Timer view that opens an inline project picker/input:

```
Press p → type "#backend" → Enter
Timer now shows: 🍅 25:00  #backend
```

Implementation:
- Add `currentProject` state to TimerView (or read from engine)
- `p` key opens a TextInput with project autocomplete (reuse existing `getProjects()`)
- On submit, call `engineActions.setSessionInfo({ project: selectedProject })`
- Show the active project prominently on the Timer view, next to the big countdown
- Project persists across sessions until changed (engine already has `currentProject` state, but it resets on session advance — make it sticky)
- Modify `usePomodoroEngine.advanceToNext()` to preserve `currentProject` instead of clearing it

The `completeSession` callback in `usePomodoroEngine` already attaches `currentProject` to the saved session, so Stats and Goals will work automatically.

#### 1B. Inline Sequence Activation on Timer View

Add a `S` (shift-s) keybinding to the Timer view that shows an inline sequence picker:

```
Press S → picker appears with presets + custom sequences → j/k + Enter to activate
```

Implementation:
- Render a bordered overlay (similar to the category picker in TrackerView) listing all sequences
- On selection, call `handleActivateSequence(seq)` which already exists in `app.tsx`
- The Sequences view (`5`) remains for creation/editing, but is no longer the primary activation path

#### 1C. CLI Flags for Project and Sequence

Extend the CLI entry point so you can start with context:

```bash
pomodorocli start --project backend
pomodorocli start --project backend --sequence deep-work
pomodorocli start --project backend --work 45
```

Implementation in `cli.tsx`:
- Add `--project` flag to `meow` options
- If set, initialize the engine with `currentProject` pre-filled
- If `--sequence` is set, resolve from PRESET_SEQUENCES or custom sequences and activate on mount

---

### Phase 2: Daemon Architecture (System Integration)

This is the major structural change. Separate the **timer engine and state management** from the **TUI rendering**.

#### Architecture Overview

```
┌──────────────────────────────────────────────────────┐
│                   pomodorocli-daemon                  │
│                                                      │
│  ┌─────────────┐  ┌────────────┐  ┌──────────────┐  │
│  │ Timer Engine │  │ Session DB │  │ Task/Reminder│  │
│  │ (state       │  │ (JSON/     │  │ Manager      │  │
│  │  machine)    │  │  SQLite)   │  │              │  │
│  └──────┬───────┘  └─────┬──────┘  └──────┬───────┘  │
│         │                │                │          │
│         └────────┬───────┘────────┬───────┘          │
│                  │                │                   │
│           ┌──────┴──────┐  ┌─────┴──────┐            │
│           │ Unix Socket │  │ Event       │            │
│           │ Server      │  │ Emitter     │            │
│           │ (IPC)       │  │ (hooks)     │            │
│           └──────┬──────┘  └─────┬──────┘            │
│                  │               │                    │
└──────────────────┼───────────────┼────────────────────┘
                   │               │
      ┌────────────┼───────────────┼──────────────┐
      │            │               │              │
 ┌────┴────┐ ┌────┴────┐  ┌──────┴──────┐ ┌─────┴──────┐
 │  TUI    │ │  CLI    │  │  Waybar     │ │  Hook      │
 │ Client  │ │ Client  │  │  Module     │ │  Scripts   │
 │ (Ink)   │ │         │  │  (JSON +    │ │            │
 │         │ │         │  │   signal)   │ │            │
 └─────────┘ └─────────┘  └─────────────┘ └────────────┘
```

#### 2A. Core Daemon (`pomodorocli-daemon`)

A Node.js process that runs in the background (started by systemd user service or manually).

**Responsibilities:**
- Owns all timer state (current session type, seconds remaining, running/paused, project, sequence progress)
- Ticks the timer (1-second interval)
- Saves completed sessions to `sessions.json`
- Manages tasks, reminders, goals (CRUD operations)
- Fires event hooks on lifecycle events
- Writes a status file for external consumers (waybar, polybar)
- Listens on a Unix domain socket for commands from clients

**State machine (extracted from `usePomodoroEngine` + `useTimer`):**

The core timer logic in `hooks/useTimer.ts` and `hooks/usePomodoroEngine.ts` is already well-structured as pure state + callbacks. The refactor extracts this into a plain TypeScript class with no React dependency:

```typescript
// engine/timer-engine.ts — no React imports
class PomodoroEngine extends EventEmitter {
  private state: EngineState;
  private interval: NodeJS.Timeout | null = null;

  // State transitions
  start(): void
  pause(): void
  resume(): void
  skip(): void
  reset(): void
  setProject(project: string): void
  activateSequence(seq: SessionSequence): void

  // Events emitted:
  // 'tick'           → { secondsLeft, totalSeconds, sessionType, project }
  // 'session:start'  → { sessionType, project, startedAt }
  // 'session:complete' → { session: Session }
  // 'session:skip'   → { session: Session }
  // 'session:abandon' → { session: Session }
  // 'state:change'   → { ...fullState }
  // 'break:start'    → { sessionType, duration }
}
```

**IPC Protocol (Unix socket, newline-delimited JSON):**

```
Client → Daemon:
  {"cmd": "start"}
  {"cmd": "pause"}
  {"cmd": "resume"}
  {"cmd": "skip"}
  {"cmd": "reset"}
  {"cmd": "status"}
  {"cmd": "set-project", "project": "backend"}
  {"cmd": "activate-sequence", "name": "deep-work"}
  {"cmd": "set-duration", "minutes": 45}
  {"cmd": "task-add", "text": "fix auth", "project": "backend", "pomodoros": 3}
  {"cmd": "task-list"}
  {"cmd": "task-complete", "id": "abc123"}
  {"cmd": "reminder-add", "time": "14:30", "title": "standup"}
  {"cmd": "subscribe"}  ← stream all events

Daemon → Client:
  {"ok": true, "state": { ...currentState }}
  {"event": "tick", "data": { secondsLeft: 1423, ... }}
  {"event": "session:complete", "data": { ... }}
  {"error": "unknown command"}
```

#### 2B. CLI Client (`pomodoro`)

A thin CLI that connects to the daemon socket, sends a command, prints the response, and exits.

```bash
# Timer control
pomodoro start                          # start timer
pomodoro start --project backend        # start with project
pomodoro start --sequence deep-work     # start with sequence
pomodoro pause                          # pause
pomodoro resume                         # resume
pomodoro toggle                         # toggle start/pause
pomodoro skip                           # skip to next session
pomodoro reset                          # reset current session
pomodoro status                         # print JSON state
pomodoro status --format short          # "🍅 23:41 #backend"

# Project
pomodoro project backend                # set current project
pomodoro project                        # show current project

# Tasks
pomodoro task add "fix auth #backend /3"
pomodoro task list
pomodoro task complete <id>
pomodoro task active <id>

# Reminders
pomodoro remind 5m "coffee"
pomodoro reminder 14:30 "standup"

# Data
pomodoro stats today
pomodoro export -o sessions.csv
pomodoro backup

# Daemon management
pomodoro daemon start                   # start daemon (or systemd)
pomodoro daemon stop
pomodoro daemon status

# Event stream (for scripts)
pomodoro subscribe                      # stream events as JSON lines
```

This means you can bind `pomodoro toggle` to a Hyprland keybinding:

```conf
# ~/.config/hypr/hyprland.conf
bind = $mainMod, F5, exec, pomodoro toggle
bind = $mainMod, F6, exec, pomodoro skip
bind = $mainMod SHIFT, F5, exec, pomodoro project $(wofi --dmenu -p "Project:")
```

#### 2C. Status File + Waybar Integration

The daemon writes `/tmp/pomodorocli-status.json` on every tick and state change:

```json
{
  "sessionType": "work",
  "secondsLeft": 1423,
  "totalSeconds": 1500,
  "isRunning": true,
  "isPaused": false,
  "project": "backend",
  "sessionNumber": 3,
  "totalWorkSessions": 7,
  "sequenceName": "deep-work",
  "sequenceBlockIndex": 2,
  "todayFocusMinutes": 142,
  "todaySessions": 6,
  "streak": 12,
  "waybar": {
    "text": "🍅 23:41",
    "tooltip": "#backend • Session 3 • 2h 22m today",
    "class": "work-running",
    "percentage": 95
  }
}
```

After writing, the daemon sends `SIGRTMIN+8` (configurable) to waybar to trigger an immediate refresh.

**Waybar config:**

```json
{
  "custom/pomodoro": {
    "exec": "cat /tmp/pomodorocli-status.json | jq -r '.waybar.text'",
    "exec-if": "test -f /tmp/pomodorocli-status.json",
    "return-type": "",
    "signal": 8,
    "interval": 30,
    "on-click": "pomodoro toggle",
    "on-click-right": "pomodoro skip",
    "on-click-middle": "pomodoro reset",
    "tooltip": true,
    "exec-on-event": false
  }
}
```

**Waybar CSS classes** (emitted in `waybar.class`):

```css
#custom-pomodoro.work-running { color: #00C853; }
#custom-pomodoro.work-paused  { color: #FFB300; }
#custom-pomodoro.break        { color: #00BCD4; }
#custom-pomodoro.idle         { color: #666666; }
```

#### 2D. Event Hooks

The daemon executes shell scripts from `~/.config/pomodorocli/hooks/` on lifecycle events.

**Hook directory structure:**

```
~/.config/pomodorocli/hooks/
├── on-session-start.sh
├── on-session-complete.sh
├── on-break-start.sh
├── on-break-complete.sh
├── on-pause.sh
├── on-resume.sh
├── on-task-complete.sh
└── on-reminder.sh
```

Each hook receives event data as environment variables:

```bash
#!/bin/bash
# ~/.config/pomodorocli/hooks/on-session-complete.sh

# Available environment variables:
# POMODORO_SESSION_TYPE=work
# POMODORO_PROJECT=backend
# POMODORO_DURATION_PLANNED=1500
# POMODORO_DURATION_ACTUAL=1500
# POMODORO_SESSION_NUMBER=3
# POMODORO_TODAY_FOCUS_MINUTES=142
# POMODORO_TODAY_SESSIONS=6
# POMODORO_STREAK=12

# Example: desktop notification with custom styling
dunstify -a "pomodoro" \
  -u normal \
  -i "appointment-soon" \
  "Focus Complete" \
  "Session #${POMODORO_SESSION_NUMBER} done. ${POMODORO_TODAY_FOCUS_MINUTES}m today." \
  -t 5000

# Example: play custom sound through pipewire
pw-play ~/sounds/session-complete.ogg &

# Example: log to timewarrior
timew stop "pomodoro:${POMODORO_PROJECT}" 2>/dev/null
timew start "break" 2>/dev/null

# Example: unmute Mako notifications during break
makoctl set-mode default

# Example: change hyprland border color for break
hyprctl keyword general:col.active_border "rgb(FFB300)"
```

```bash
#!/bin/bash
# ~/.config/pomodorocli/hooks/on-session-start.sh

# Mute notifications during focus
makoctl set-mode do-not-disturb

# Change hyprland border to focus color
hyprctl keyword general:col.active_border "rgb(00C853)"

# Log to timewarrior
timew stop 2>/dev/null
timew start "pomodoro:${POMODORO_PROJECT}" 2>/dev/null
```

**Hook execution:**
- Hooks are spawned as detached child processes (non-blocking)
- stdout/stderr are logged to `~/.local/share/pomodorocli/hooks.log`
- Hooks that take >5s are killed
- Missing hook files are silently skipped
- Hooks are optional — zero config needed if you don't want them

#### 2E. TUI Client Refactor

The existing TUI (`app.tsx` + all components) becomes a client that connects to the daemon socket instead of managing state directly.

**Changes:**
- `useTimer` hook is replaced by a `useDaemonConnection` hook that subscribes to events from the socket
- `usePomodoroEngine` is removed — the daemon owns this logic
- Timer actions (start/pause/skip) send commands to the socket instead of calling local functions
- Task/Reminder CRUD sends commands to the socket
- The TUI reconnects automatically if the daemon restarts
- If the daemon isn't running, the TUI shows a message: "Daemon not running. Run `pomodoro daemon start` or `systemctl --user start pomodorocli`"

**What stays the same:**
- All visual components (BigTimer, Layout, Heatmap, etc.) — they just receive data from the socket instead of local state
- Navigation, keybindings, view switching — all local to the TUI
- Views that are read-only (Stats, Insights) can still read files directly for performance

#### 2F. Systemd User Service

```ini
# ~/.config/systemd/user/pomodorocli.service
[Unit]
Description=pomodorocli Timer Daemon
After=default.target

[Service]
Type=simple
ExecStart=/usr/local/bin/pomodorocli-daemon
Restart=on-failure
RestartSec=3
Environment=NODE_ENV=production

[Install]
WantedBy=default.target
```

```bash
systemctl --user enable pomodorocli
systemctl --user start pomodorocli
```

---

### Phase 3: Optional Enhancements

These build on top of the daemon architecture but are not required.

#### 3A. D-Bus Interface

Expose timer state and controls over D-Bus for deep desktop integration:

```
org.pomodorocli.Timer
  Methods:
    Start(), Pause(), Resume(), Skip(), Reset()
    SetProject(s project)
    GetStatus() → a{sv}
  Signals:
    SessionComplete(a{sv} session)
    StateChanged(a{sv} state)
    Tick(u secondsLeft, u totalSeconds)
  Properties:
    SessionType (s) — "work", "short-break", "long-break"
    IsRunning (b)
    IsPaused (b)
    SecondsLeft (u)
    Project (s)
```

This enables integration with GNOME extensions, KDE widgets, or any D-Bus-aware tool.

#### 3B. MQTT / Webhook Events

For smart home integration (Home Assistant, etc.):

```json
{
  "mqtt": {
    "enabled": true,
    "broker": "mqtt://localhost:1883",
    "topic": "pomodoro/events"
  },
  "webhooks": {
    "on-session-complete": "https://hooks.example.com/pomodoro"
  }
}
```

#### 3C. Multi-Device Sync

With the daemon owning state, syncing between machines becomes feasible via:
- Syncthing on the `~/.local/share/pomodorocli/` directory
- A simple REST API the daemon exposes for remote status checking

---

## Implementation Roadmap

### Step 1: Extract Engine (No User-Facing Changes)

- Create `engine/timer-engine.ts` — a plain TypeScript class with the same logic as `usePomodoroEngine` + `useTimer` but no React dependency
- Create `engine/task-manager.ts` — wraps `lib/tasks.ts` CRUD with event emission
- Create `engine/session-store.ts` — wraps `lib/store.ts` with event emission
- Write tests for the engine class (pure state machine, easy to test)
- The TUI continues to work exactly as before — this is a refactor, not a feature change

### Step 2: Phase 1 UX Improvements

- Implement quick project tagging (`p` key on Timer)
- Implement inline sequence picker (`S` key on Timer)
- Add `--project` and `--sequence` CLI flags
- These work within the existing monolithic architecture

### Step 3: Daemon + Socket Server

- Create `daemon/server.ts` — instantiates PomodoroEngine, listens on Unix socket
- Implement the IPC protocol (newline-delimited JSON)
- Add status file writing + SIGRTMIN signal for waybar
- Add hook script execution
- Create systemd service file

### Step 4: CLI Client

- Create `cli/client.ts` — connects to socket, sends command, prints response
- Build the `pomodoro` binary with all subcommands
- Test waybar integration end-to-end

### Step 5: TUI Client Refactor

- Replace `useTimer` / `usePomodoroEngine` with `useDaemonConnection`
- All timer actions → socket commands
- All state → socket event stream
- Verify all 10 views work correctly with the new data flow
- Handle daemon disconnection gracefully

### Step 6: Polish

- Waybar example configs and documentation
- Hook script examples for common setups (Hyprland, mako, timewarrior, dunst)
- Migration guide from monolithic to daemon mode
- Optional: keep a `--standalone` flag that runs the old monolithic mode for portability

---

## Files That Need Changes

### Phase 1 (UX)
- `components/TimerView.tsx` — add project input (`p`) and sequence picker (`S`)
- `hooks/usePomodoroEngine.ts` — make `currentProject` sticky across `advanceToNext()`
- `app.tsx` — wire new keybindings, pass sequence data to TimerView
- `cli.tsx` — add `--project` and `--sequence` flags
- `components/KeysBar.tsx` — add hints for new keybindings

### Phase 2 (Daemon)
- **New:** `engine/timer-engine.ts` — extracted engine class
- **New:** `engine/task-manager.ts` — task CRUD with events
- **New:** `daemon/server.ts` — Unix socket server + hook runner + status writer
- **New:** `daemon/hooks.ts` — hook script discovery and execution
- **New:** `daemon/status-writer.ts` — JSON status file + waybar format + SIGRTMIN
- **New:** `cli/client.ts` — socket client for CLI commands
- **Modified:** `app.tsx` — replace direct engine usage with socket connection
- **Modified:** `hooks/useTimer.ts` → `hooks/useDaemonConnection.ts`
- **Removed (from TUI):** Direct use of `usePomodoroEngine`

### Existing Files Unaffected
- All visual components (`BigTimer`, `Heatmap`, `BarChart`, etc.)
- `lib/stats.ts`, `lib/insights.ts` — read-only, can still read files directly
- `lib/bigDigits.ts`, `lib/theme.ts`, `lib/fuzzy.ts` — pure utilities
- `lib/browser-stats.ts` — SQLite reads, independent of timer
- `components/Layout.tsx`, `components/Sidebar.tsx` — pure presentation

---

## Technical Notes

### Socket Path
`~/.local/share/pomodorocli/daemon.sock` — created by daemon, cleaned up on exit. The CLI client and TUI both connect here.

### Backward Compatibility
The status file format (`timer-state.json`) changes from a crash-recovery snapshot to a continuously-updated state file. Old snapshots are auto-migrated on first daemon start.

### Concurrency
The daemon is single-threaded (Node.js event loop). Multiple clients can connect simultaneously — they all see the same state. Timer ticks are broadcast to all subscribed clients.

### Existing Data
All existing data files (`sessions.json`, `tasks.json`, `goals.json`, `config.json`, `tracker/`, `browser.db`) remain exactly where they are with the same format. The daemon reads/writes them in the same way the TUI does today. Zero data migration needed.

### Platform
This proposal assumes Arch Linux with Hyprland + Waybar, but the daemon architecture works on any Linux with Unix sockets. The waybar integration is optional. Hook scripts are optional. The TUI works everywhere Node.js runs, same as today.
