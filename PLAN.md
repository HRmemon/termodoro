# Plan: Task & Reminder Unification + Calendar Deprecation

## Goal
Simplify the core action workflow by unifying scheduling capabilities directly into Tasks, turning Reminders into pure point-in-time alarms, removing unwanted Pomodoro-tracking cruft from Tasks, and deprecating the current detached Calendar view.

## 1. Database Backup (Safety First)
- **Action:** Full backup of `~/.local/share/pomodorocli/` into `~/.local/share/pomodorocli/backups/pre_task_unification_<timestamp>`.
- **Status:** COMPLETED.

## 2. Deprecating the Calendar & Events
- **Action:** Add `// DEPRECATED` comments to Calendar UI files.
- **Routing:** Remove `calendar` from `View` type in `source/types.ts`.
- **UI:** Remove calendar from `app.tsx`, sidebar, and shortcut maps.
- **Data:** Stop parsing `events.json`.

## 3. Model Cleanup: Tasks & Reminders
- **Task Model (`types.ts`):** 
    - Remove `expectedPomodoros`, `completedPomodoros`.
    - Add `date` (YYYY-MM-DD), `time` (HH:MM), `endTime` (HH:MM).
- **Reminder Model (`types.ts`):**
    - Ensure it remains a pure alarm (title/time/enabled/recurring).

## 4. Logic & Engine Updates
- **`lib/tasks.ts`:** Remove pomodoro params from `addTask`/`updateTask`.
- **Neovim Parser (`source/lib/nvim-edit/tasks.ts`):** 
    - Remove `/N` syntax.
    - Add parsing for `date:YYYY-MM-DD`, `time:HH:MM`, `end:HH:MM`.
- **`useReminderChecker.ts`:** Poll both reminders and tasks for minute-accurate notifications.

## 5. TUI Overhaul: The New Tasks View
- **Visuals:** Remove `[0/1]` counters. Display `Scheduled: YYYY-MM-DD HH:MM - HH:MM` in cyan under task text.
- **Hotkey `s`:** Implement scheduling flow (Date > Start > End).
- **Visual Mockup:**
    ```text
    > [ ] Write API endpoints #coding
          Scheduled: 2026-03-03 14:00 - 16:00
    ```

## 6. Verification
- Run `npm run build` and `npx tsc --noEmit`.
- Verify desktop notifications for both tasks and reminders.
- Verify Neovim bidirectional sync with new tags.
