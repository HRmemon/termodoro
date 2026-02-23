# AGENTS.md — Pomodoro CLI

Guidelines for AI agents working on this codebase.

## Project Overview

Terminal-first Pomodoro + productivity system built with **Ink** (React for terminal UIs).
Entry point: `source/cli.tsx` → `source/app.tsx`.

## Commands

```bash
npm run dev      # Run directly via tsx (no build step, fast iteration)
npm run build    # Compile TypeScript → dist/
npm start        # Run compiled dist/cli.js
```

Always run `npm run build` after changes before committing — `npm start` uses the compiled output.
Use `npx tsc --noEmit` to type-check without emitting.

## Architecture

### Layout
Full-screen terminal layout: sidebar (left) + main area (right) + status bar + keys bar at bottom.
Zen mode bypasses the layout entirely and renders a full-screen centered component.

### Views
| Key | View | Component |
|-----|------|-----------|
| 1 | Timer & Tasks | `TimerView.tsx` |
| 2 | Sequences | `PlannerView.tsx` |
| 3 | Stats | `ReportsView.tsx` |
| 4 | Config | `ConfigView.tsx` |
| 5 | Clock | `ClockView.tsx` |
| 6 | Reminders | `RemindersView.tsx` |

Zen mode (`z` key, timer and clock views only): `ZenMode.tsx` / `ZenClock.tsx`.

### State in app.tsx
All global state lives in `app.tsx`:
- `view` — active view
- `isZen` — zen mode toggle
- `config` — loaded from disk, mutated by ConfigView
- `timer` / `timerActions` — countdown from `useTimer`
- `engine` / `engineActions` — session state machine from `usePomodoroEngine`
- `seqState` / `seqActions` — sequence progress from `useSequence`
- `isTyping` — set to `true` by any child with an active text input; gates global `useInput` handler

### isTyping pattern
Child components that use `TextInput` must call `setIsTyping(true)` on input focus and `setIsTyping(false)` on submit/escape. This prevents global hotkeys (`:`, `q`, `z`, etc.) from firing while typing.

## Key Files

### Source
| File | Purpose |
|------|---------|
| `source/types.ts` | All shared types: `Session`, `Config`, `Task`, `SequenceBlock`, `SessionSequence`, `ScheduledNotification`, `View` |
| `source/app.tsx` | Root component: state, routing, global key handling |
| `source/cli.tsx` | Entry point via `meow` |

### Hooks
| File | Purpose |
|------|---------|
| `hooks/useTimer.ts` | Countdown timer with start/pause/resume/skip/reset |
| `hooks/usePomodoroEngine.ts` | Session type state machine (work → break cycle) |
| `hooks/useSequence.ts` | Sequence block state machine; `PRESET_SEQUENCES`; `parseSequenceString` |
| `hooks/useFullScreen.ts` | Terminal dimensions via `useStdout`, updates on resize |

### Lib
| File | Purpose |
|------|---------|
| `lib/config.ts` | Load/save `~/.config/pomodorocli/config.json` |
| `lib/store.ts` | Session and plan persistence to `~/.local/share/pomodorocli/` |
| `lib/tasks.ts` | Task CRUD + `setActiveTask` |
| `lib/sequences.ts` | Custom sequence persistence to `sequences.json` |
| `lib/reminders.ts` | Scheduled notification CRUD to `reminders.json` |
| `lib/notify.ts` | node-notifier wrapper; `notifySessionEnd`, `sendReminderNotification` |
| `lib/bigDigits.ts` | ASCII art renderer: `renderBigTime(seconds)`, `renderBigString(str)` |
| `lib/stats.ts` | Streak, heatmap, and summary stats computation |

## Data Storage

All data lives under `~/.local/share/pomodorocli/`:
- `sessions.json` — completed/skipped/abandoned sessions
- `tasks.json` — todo list with active flag
- `sequences.json` — user-created custom sequences
- `reminders.json` — scheduled notifications
- `plans.json` — day plans (legacy, still used by planner lib)

Config: `~/.config/pomodorocli/config.json`

## Adding a New View

1. Add the view name to `View` type in `types.ts`
2. Create `source/components/YourView.tsx`
3. Add entry to `VIEW_TITLES` and `VIEW_NUMS` in `Layout.tsx`
4. Add entry to `VIEWS` array in `Sidebar.tsx`
5. Add number key handler in `app.tsx` `useInput`
6. Add conditional render in `app.tsx` JSX
7. Add hint block in `KeysBar.tsx`

## TypeScript Notes

- `tsconfig.json` uses `"jsx": "react-jsx"` — no need to import React in component files
- `"module": "NodeNext"` — all local imports must use `.js` extension even for `.tsx` source files
- `"strict": true` — no implicit any, strict null checks enforced
- `skipLibCheck: true` — node-notifier type issues are bypassed this way

## Conventions

- No backward compatibility shims — delete dead code outright
- `useInput` in child components fires in addition to `app.tsx`'s `useInput`; guard with `isTyping` or component-local state flags
- Sequence activation always calls both `seqActions.setSequence(seq)` and `engineActions.applySequenceBlock(seq.blocks[0])` — see `handleActivateSequence` in `app.tsx`
- Notifications use `config.notificationDuration` (seconds) as expire time
- `nanoid` for generating IDs throughout
