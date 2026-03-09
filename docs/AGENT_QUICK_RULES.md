# Agent Quick Rules (PomodoroCLI)

Use this as the **minimum operational checklist** when changing code.

## Must Do
- Run `npm run build` before every commit.
- Keep `isTyping` lifecycle correct:
  - set `setIsTyping(true)` when entering text input/edit mode
  - set `setIsTyping(false)` on submit/cancel/escape
- If you add/change key behavior, update both:
  - `source/components/KeysBar.tsx`
  - `source/components/HelpView.tsx`
- For reminder logic, preserve both paths:
  - daemon checker (`source/daemon/reminder-checker.ts`) for background
  - UI fallback checker (`source/hooks/useReminderChecker.ts`) for safety
- Keep reminder time normalized as `HH:MM` (`source/lib/reminders.ts`).
- Keep config + type + UI in sync:
  - `source/types.ts`
  - `source/lib/config.ts` validation/defaults
  - `source/components/config/ConfigFieldList.tsx`

## Must Not Do
- Do not add editable config fields without rendering edit input in UI.
- Do not change keybindings without updating labels/hints/help text.
- Do not rely on only one reminder path (daemon-only or UI-only).
- Do not mix legacy calendar settings into active sections.

## Consistency Rules
- Calendar config is legacy/future-use: keep it isolated under `Calendar (Legacy)`.
- Reminder UX should stay modal/boxed and match task/day-planner interaction style.
- Sound/notification behavior must honor reminder-specific config:
  - `reminderNotificationDuration`
  - `reminderSoundDuration`
  - `reminderVolume`

## Pre-merge Smoke Checks
- Edit `notificationDuration` or any numeric config field: Enter opens input, Esc exits cleanly.
- Add reminder at next minute: fires in TUI and with TUI closed (daemon running).
- Press reminder actions (`a/e/l/r/Enter`) and verify key hints match behavior.
