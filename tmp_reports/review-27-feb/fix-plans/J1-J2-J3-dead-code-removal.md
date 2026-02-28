# J1 / J2 / J3 — Dead Code Removal Plan

**Date:** 2026-02-28
**Scope:** Remove dead hooks, unused component variables, and logic rot across `source/`

---

## 1. Verification Results

### 1.1 `source/hooks/useTimer.ts`

**Exports:** `useTimer` (function), `TimerState`, `TimerActions`, `TimerInitialState` (interfaces)

**Search results:** Zero imports of `useTimer` anywhere in the codebase. The function name `useTimer` and the file path `useTimer` return no matches outside the file itself. This hook was the pre-daemon in-process timer tick loop. The daemon architecture replaced it with server-side interval management.

**Verdict: Dead. Safe to delete.**

---

### 1.2 `source/hooks/usePomodoroEngine.ts`

**Exports:** `usePomodoroEngine` (function), `EngineState`, `EngineActions`, `EngineInitialState` (interfaces)

**Search results:** Zero imports of `usePomodoroEngine` anywhere in the codebase. The function and its interfaces are not referenced in any component, route, or test file. This was the in-process session state machine that ran inside the React tree. The daemon (`source/daemon/server.ts`) now owns this logic entirely, and `source/hooks/useDaemonConnection.ts` is the sole live hook the UI uses to communicate with it.

**Verdict: Dead. Safe to delete.**

---

### 1.3 `source/hooks/useSequence.ts`

**Exports:** `useSequence` (function), `parseSequenceString` (function), `SequenceState`, `SequenceActions`, `SequenceInitialState` (interfaces)

**Search results — split finding:**

- `useSequence` (the hook function): **Zero imports.** The React hook itself is unused.
- `parseSequenceString` (a pure utility function in the same file): **Imported in 3 places:**
  - `source/app.tsx` line 9: `import { parseSequenceString } from './hooks/useSequence.js'`
  - `source/components/config/SequenceManager.tsx` line 5: `import { parseSequenceString } from '../../hooks/useSequence.js'`
  - `source/daemon/server.ts` line 9: `import { parseSequenceString } from '../hooks/useSequence.js'`

**Verdict: The file cannot be deleted whole. The `useSequence` hook is dead. `parseSequenceString` is live and must be preserved.**

**Required action:** Extract `parseSequenceString` (and its dependent types `SequenceBlock`, `SessionSequence` — which are already in `source/types.ts`) into a separate utility file, then delete the hook body. See Section 3.2 for the migration plan.

---

### 1.4 `source/hooks/useFullScreen.ts`

**Exports:** `useFullScreen` (function), `ScreenSize` (interface)

**Search results:** Imported in **5 active components:**
- `source/components/HelpView.tsx`
- `source/components/WebView.tsx`
- `source/components/ZenClock.tsx`
- `source/components/Layout.tsx`
- `source/components/ZenMode.tsx`
- `source/components/ResetModal.tsx`

**Verdict: Fully live. Do not touch.**

---

## 2. Other Dead Code Findings

### 2.1 `source/lib/insights.ts` lines 117–150 — First-pass burnout loop (dead logic)

**Location:** Inside `detectBurnout()`, the first `for` loop at lines 116–150.

**Problem:** The loop attempts to count consecutive days over a threshold, but its logic is broken. Line 133 declares `const curr = new Date(date).getTime()` and line 134 declares `const prev = new Date(...).getTime()`, but neither variable is ever used — they are immediately shadowed by a new `dayDiff` calculation on line 136 which itself is suppressed with `void dayDiff`. The comment on line 137 explicitly says `// suppress unused warning — we'll use a simpler approach below`. The entire first loop (lines 116–150) is therefore an abandoned first attempt. The function continues at line 152 with a correct second pass that actually works.

**Impact:** Dead code that compiles but produces no effect. TypeScript does not flag the unreachable inner branches because the outer loop still runs. The only observable consequence is that the early-return on lines 144–149 can fire incorrectly due to the broken `consecutiveOver` increment logic (it increments even when dates are non-consecutive), potentially giving a false-positive burnout warning.

**Verdict: Delete lines 116–150 entirely.** The second pass at lines 152–179 is the correct implementation and is sufficient on its own.

**Risk:** Low. The removal also fixes a latent false-positive bug in burnout detection.

---

### 2.2 `source/components/Achievements.tsx` line 45 — Unused `unlocked` variable

**Location:** `Achievements.tsx`, line 45:
```typescript
const unlocked = loadUnlockedAchievements();
```

**Problem:** `unlocked` is declared but never referenced anywhere in the component body. `unlockedItems` is derived from `progress.filter(p => p.unlocked)` on line 47, not from the `unlocked` variable. The `loadUnlockedAchievements()` call is redundant because `getAchievementProgress()` (called on line 44) already encapsulates unlocked-achievement state internally via `source/lib/achievements.ts`.

**Verdict: Delete line 45.** Remove the `loadUnlockedAchievements` import from `source/lib/store.js` on line 4 if it becomes unused after this deletion.

**Risk:** None. The variable is never read.

---

### 2.3 `source/lib/stats.ts` line 272 — Unused `recordCursor` variable

**Location:** `getStreaks()` function, line 272:
```typescript
let recordCursor = new Date(today);
```

**Problem:** `recordCursor` is declared and initialized but never read or mutated after declaration. The function uses a different variable `cursor2` (line 278) for the actual iteration. This is a leftover from a refactor where the walking logic was rewritten.

**Verdict: Delete line 272.** The variable is a stale declaration with no effect.

**Risk:** None. TypeScript may already be flagging this as an unused variable depending on `tsconfig` strictness.

---

### 2.4 `source/components/TaskList.tsx` — Unused component

**Search results:** The file exports `TaskList`. The string `TaskList` appears **only inside the file itself** — there are zero imports of `TaskList` anywhere else in the codebase. `source/components/TasksView.tsx` does not import it; it renders task lists inline. `source/components/TasksPanel.tsx` also renders tasks inline. No other component references it.

**Verdict: Dead. Safe to delete the entire file.**

**Risk:** Low. Confirm no dynamic imports or barrel re-exports exist (see Section 4 — Pre-deletion checklist).

---

## 3. Migration Plans

### 3.1 Deleting `useTimer.ts` and `usePomodoroEngine.ts`

These files have no dependents. Deletion is a single operation per file.

Steps:
1. Delete `source/hooks/useTimer.ts`.
2. Delete `source/hooks/usePomodoroEngine.ts`.
3. Run `npm run build` to confirm no TypeScript errors.

---

### 3.2 Handling `useSequence.ts` — Extract `parseSequenceString`

The hook function `useSequence` is dead, but `parseSequenceString` is a live pure utility imported by three callers. The cleanest approach is to move the utility into a dedicated lib file and update the three import sites.

**Option A (recommended): Move to `source/lib/sequences.ts`**

`source/lib/sequences.ts` already exists (imported in `source/app.tsx` line 10 as `loadSequences`). This is the natural home for sequence-related logic.

Steps:
1. Open `source/lib/sequences.ts`. Append the `parseSequenceString` function body (no new imports needed — it only uses `SequenceBlock` and `SessionSequence` from `source/types.ts`, which are already available).
2. Export `parseSequenceString` from `source/lib/sequences.ts`.
3. Update the three import sites:
   - `source/app.tsx`: change `import { parseSequenceString } from './hooks/useSequence.js'` to `import { parseSequenceString } from './lib/sequences.js'`
   - `source/components/config/SequenceManager.tsx`: change `import { parseSequenceString } from '../../hooks/useSequence.js'` to `import { parseSequenceString } from '../../lib/sequences.js'`
   - `source/daemon/server.ts`: change `import { parseSequenceString } from '../hooks/useSequence.js'` to `import { parseSequenceString } from '../lib/sequences.js'`
4. Delete `source/hooks/useSequence.ts`.
5. Run `npm run build`.

**Option B (minimal): Keep the file, delete only the hook**

If moving the function is considered risky, the dead hook body can be removed while leaving `parseSequenceString` in place. This retains the file at a much-reduced size but leaves a hooks file that contains no hook.

Steps:
1. Delete the `useSequence` function (lines 47–93) from `source/hooks/useSequence.ts`.
2. Delete the now-unused interfaces `SequenceState`, `SequenceActions`, `SequenceInitialState` (lines 4–22).
3. Keep `parseSequenceString` and the `SequenceBlock`/`SessionSequence` imports.
4. Run `npm run build`.

**Recommendation:** Option A. It removes the conceptual confusion of having a non-hook in the hooks directory.

---

## 4. Pre-Deletion Checklist

Before deleting any file, verify:

- [ ] No barrel/index file (`source/index.ts`, `source/hooks/index.ts`) re-exports the symbol. (No such barrel files were found in this project.)
- [ ] No `// @ts-ignore` or dynamic `require()` / `import()` that bypass static analysis.
- [ ] No test files reference the symbol. (Grep of all `*.test.ts` / `*.test.tsx` found zero matches for all four hook names.)
- [ ] No documentation or CLI help text links to the hook by name.

---

## 5. Summary Table

| Item | File | Action | Risk |
|------|------|---------|------|
| `useTimer` hook | `source/hooks/useTimer.ts` | Delete entire file | None |
| `usePomodoroEngine` hook | `source/hooks/usePomodoroEngine.ts` | Delete entire file | None |
| `useSequence` hook body | `source/hooks/useSequence.ts` | Delete hook; migrate `parseSequenceString` to `source/lib/sequences.ts`; delete file | Low (3 import sites to update) |
| `useFullScreen` hook | `source/hooks/useFullScreen.ts` | No action — live in 6 components | N/A |
| `detectBurnout` first pass | `source/lib/insights.ts` lines 116–150 | Delete dead loop; keep second pass | Low (fixes latent false-positive bug) |
| `unlocked` variable | `source/components/Achievements.tsx` line 45 | Delete declaration and `loadUnlockedAchievements` import | None |
| `recordCursor` variable | `source/lib/stats.ts` line 272 | Delete declaration | None |
| `TaskList` component | `source/components/TaskList.tsx` | Delete entire file | None |

---

## 6. Recommended Execution Order

1. Delete `useTimer.ts` (no dependencies).
2. Delete `usePomodoroEngine.ts` (no dependencies).
3. Migrate `parseSequenceString` to `source/lib/sequences.ts`, update 3 import sites, delete `useSequence.ts`.
4. Remove `detectBurnout` first pass (lines 116–150) from `source/lib/insights.ts`.
5. Remove `unlocked` variable and `loadUnlockedAchievements` import from `source/components/Achievements.tsx`.
6. Remove `recordCursor` declaration from `source/lib/stats.ts` line 272.
7. Delete `source/components/TaskList.tsx`.
8. Run `npm run build` — expect zero TypeScript errors.

Steps 1–3 are J1. Steps 4–7 are J2/J3 (inline dead code cleanup). All are safe to land in a single commit.

---

## Plan Adjustments

**Date:** 2026-02-28

Two items from the original plan were already resolved before implementation:

1. **`useTimer.ts` (Section 1.1)** — File was already deleted in a prior commit. Skipped.
2. **`recordCursor` in `stats.ts` (Section 2.3)** — Variable was already removed in a prior refactor. Skipped.

Additionally, when merging the `parseSequenceString` import into `app.tsx`, I consolidated the two separate imports from `./hooks/useSequence.js` and `./lib/sequences.js` into a single import from `./lib/sequences.js`.

All other items were implemented as planned. Build passes cleanly.
