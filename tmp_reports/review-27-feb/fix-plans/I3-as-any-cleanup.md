# I3: `as any` Cleanup Plan

**Tier:** 4 (low risk, purely cosmetic/type-safety)
**Files affected:** `TrackerView.tsx`, `GraphsView.tsx`, `CategoryManager.tsx`,
`DomainRuleManager.tsx`, `ConfigFieldList.tsx`, `config.ts`, `ResetModal.tsx`, `notify.ts`

---

## Full Inventory

| # | File | Line(s) | Expression |
|---|------|---------|------------|
| 1 | `TrackerView.tsx` | 51 | `cat?.color as any` |
| 2 | `TrackerView.tsx` | 412 | `cat.color as any` |
| 3 | `TrackerView.tsx` | 471 | `cat?.color as any` |
| 4 | `TrackerView.tsx` | 501 | `cat.color as any` |
| 5 | `TrackerView.tsx` | 504 | `cat.color as any` |
| 6 | `TrackerView.tsx` | 543 | `cat?.color as any` |
| 7 | `GraphsView.tsx` | 454 | `c as any` (GOAL_COLORS element) |
| 8 | `GraphsView.tsx` | 475 | `goal?.color as any` |
| 9 | `GraphsView.tsx` | 532 | `activeGoal.color as any` |
| 10 | `GraphsView.tsx` | 647 | `goal.color as any` |
| 11 | `GraphsView.tsx` | 681 | `goal.color as any` |
| 12 | `GraphsView.tsx` | 689 | `goal.color as any` |
| 13 | `CategoryManager.tsx` | 140 | `c as any` (color picker string) |
| 14 | `CategoryManager.tsx` | 150 | `catEditColor as any` |
| 15 | `CategoryManager.tsx` | 182 | `cat.color as any` |
| 16 | `CategoryManager.tsx` | 184 | `cat.color as any` |
| 17 | `DomainRuleManager.tsx` | 178 | `getCategoryByCode(...)?.color as any` |
| 18 | `ConfigFieldList.tsx` | 125, 164, 207, 208, 212, 214, 232, 295, 299, 308 | `config as any` (10 occurrences) |
| 19 | `config.ts` | 33, 36, 37, 38 | `result as any`, `override as any`, `base as any` (4 occurrences) |
| 20 | `ResetModal.tsx` | 37 | `key: any` in useInput callback |
| 21 | `notify.ts` | 24, 34 | `notifier as any` (2 occurrences) |

**Total: ~27 occurrences across 8 files**

---

## Categorization

### Category A — Ink `color` prop type mismatch (21 occurrences)
**Files:** `TrackerView.tsx` (6x), `GraphsView.tsx` (6x), `CategoryManager.tsx` (4x), `DomainRuleManager.tsx` (1x)

**Root cause:** The `color` field on `SlotCategory` and `TrackedGoal` is typed as `string`. Ink's
`<Text color={...}>` prop is typed as `LiteralUnion<ForegroundColorName, string>`. Because
`LiteralUnion` expands to `ForegroundColorName | (string & {})`, TypeScript under strict mode
sometimes fails to accept a plain `string` here directly (or it subtly works already — the
assertion may have been added defensively). Either way, the fix is to tighten the source type
rather than cast at the call site.

**Fix:**
1. Change `color: string` to `color: ForegroundColorName` (or `LiteralUnion<ForegroundColorName, string>`) in:
   - `SlotCategory` interface in `source/lib/tracker.ts`
   - `TrackedGoal` interface in `source/lib/goals.ts`
2. Change `GOAL_COLORS` in `goals.ts` from `string[]` to a `const` array with a named type:
   ```ts
   import type { ForegroundColorName } from 'chalk';
   export const GOAL_COLORS = ['cyan', 'green', 'yellow', 'magenta', 'red', 'blue', 'white'] as const satisfies readonly ForegroundColorName[];
   export type GoalColor = typeof GOAL_COLORS[number];
   ```
   Then change `color: string` in `TrackedGoal` to `color: GoalColor`.
3. Remove all `as any` casts from `<Text color={...}>` props in the affected components. No
   runtime change.

**Note on `CATEGORY_COLORS` in `CategoryManager`:** The color picker iterates over a hardcoded
array of color strings. Apply the same `as const satisfies readonly ForegroundColorName[]`
pattern to that array.

---

### Category B — `config as any` for dynamic key access (10 occurrences)
**File:** `ConfigFieldList.tsx`

**Root cause:** `getNestedValue` and `setNestedValue` are typed as
`(obj: Record<string, any>, ...) => any`. The `Config` type is a typed interface, not
`Record<string, any>`, so passing a `Config` to them requires a cast.

**Fix options (choose one):**

**Option B1 — Widen the helpers (preferred):**
Change the helper signatures to accept `Record<string, unknown>` (or even just `object`) and
return `unknown`. The call sites already do `String(...)`, `!current`, etc., so `unknown`
forces correct narrowing at each use which is actually safer.

```ts
function getNestedValue(obj: Record<string, unknown>, path: string): unknown { ... }
function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> { ... }
```

Then replace every `config as any` with `config as Record<string, unknown>`. This is a single
type lie but far less broad than `any`, and is semantically accurate: we are treating `Config`
as an opaque property bag for the purposes of dynamic key access.

**Option B2 — Keep `any` in the helpers, cast once:**
If Option B1 introduces too many downstream narrowing changes, keep `getNestedValue` / `setNestedValue`
typed as they are but change their parameter type to `Record<string, any>` and cast once at the
function boundary:

```ts
const cfg = config as Record<string, any>;
// then use cfg throughout, removing per-call `as any`
```

This reduces the count from 10 casts to 1 without touching the helpers.

**Recommendation:** Option B1 is cleaner; Option B2 is the minimal diff. Either eliminates the
10 scattered `as any` casts.

---

### Category C — `deepMerge` internals (4 occurrences)
**File:** `config.ts`

**Root cause:** `deepMerge<T extends Record<string, any>>` uses `as any` internally because
TypeScript cannot index a generic `T` with a string key at runtime. This is a legitimate
bounded-generic limitation.

**Fix:**
The function signature already uses `Record<string, any>` in the constraint, so the `any` in
the body is somewhat redundant. Replace internal `as any` casts with the `keyof T` approach or
use `Record<string, unknown>` throughout:

```ts
function deepMerge<T extends Record<string, unknown>>(base: T, override: Partial<T>): T {
  const result = { ...base } as Record<string, unknown>;
  for (const key of Object.keys(override) as Array<keyof T>) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    const val = override[key];
    if (val && typeof val === 'object' && !Array.isArray(val) && typeof base[key] === 'object') {
      (result as T)[key] = deepMerge(base[key] as Record<string, unknown>, val as Partial<Record<string, unknown>>) as T[typeof key];
    } else if (val !== undefined) {
      result[key as string] = val;
    }
  }
  return result as T;
}
```

This removes the 4 `as any` casts and replaces them with semantically correct casts. The one
remaining `as T` on the return is unavoidable with this pattern.

Alternatively, the function signature can stay as `Record<string, any>` (the constraint already
says `any`) and only the inline `as any` casts are replaced with the typed approach above.
Lower-priority — the function is correct, this is purely cosmetic.

---

### Category D — `useInput` key parameter typed as `any` (1 occurrence)
**File:** `ResetModal.tsx`, line 37

**Root cause:** The `key` parameter in the `useInput` callback was typed as `any` instead of
using Ink's exported `Key` type.

**Fix:**
```ts
import { useInput, type Key } from 'ink';
// ...
useInput(useCallback((input: string, key: Key) => {
  ...
}, [...]));
```

Trivial one-liner fix.

---

### Category E — `notifier as any` for node-notifier default import (2 occurrences)
**File:** `notify.ts`

**Root cause:** `node-notifier` is a CommonJS module exported via `module.exports = nodeNotifier`.
The `@types/node-notifier` package exists and provides `NodeNotifier` with a `.notify()` method.
The `as any` cast exists because the default import under `esModuleInterop: true` resolves to
the named export type, but the `notify` method on the default export isn't being picked up — or
the comment `// eslint-disable-next-line @typescript-eslint/no-explicit-any` suggests this was
a deliberate workaround.

**Fix:**
Change the import to use the correct namespace import style expected by the types:

```ts
import * as notifier from 'node-notifier';
```

`@types/node-notifier` exports `nodeNotifier.NodeNotifier` which has `.notify(...)`. With the
namespace import the `.notify` call should typecheck without a cast. If it does not, use a type
assertion to `NodeNotifier` rather than `any`:

```ts
import * as nodeNotifier from 'node-notifier';
const notifier = nodeNotifier as nodeNotifier.NodeNotifier;
```

This restricts the lie to the declared interface instead of silencing all type checks.

---

## Priority Order

| Priority | Category | Effort | Occurrences | Reason |
|----------|----------|--------|-------------|--------|
| 1 | D — ResetModal `key: any` | Trivial | 1 | Single import + type annotation |
| 2 | A — Ink color props | Low | 21 | Fix source types once, delete many casts |
| 3 | B — ConfigFieldList `config as any` | Low | 10 | One cast or one signature change eliminates all |
| 4 | E — notify.ts `notifier as any` | Low | 2 | Import style change, verify types compile |
| 5 | C — deepMerge internals | Medium | 4 | Tricky generics, already functionally correct |

**Start with D and A** — highest ratio of `as any` removed per change made.
**Category C** can be deferred; the `deepMerge` function is correct and well-guarded.

---

## Notes

- `LiteralUnion<ForegroundColorName, string>` is technically assignable from `string` at runtime,
  so the `as any` in category A may not even be strictly necessary today. Verify by removing one
  cast and checking `npm run build` before mass-deleting — if it compiles clean, all A casts can
  be deleted without touching the source type.
- Category B's `config as Record<string, unknown>` is the correct replacement: it is a structural
  cast (Config is a record with string keys) not a type erasure.
- Do not remove the `eslint-disable` comments in `notify.ts` until the import change is confirmed
  to typecheck cleanly.

---

## Plan Adjustments

Since the E3-E8 refactor decomposed `TrackerView.tsx` and `GraphsView.tsx` into sub-components, the
`as any` casts from those files are now spread across:
- `tracker/SlotCell.tsx`, `tracker/TrackerSummaryPanel.tsx`, `tracker/TrackerPickerOverlay.tsx`
- `graphs/GoalFormView.tsx`, `graphs/RatePicker.tsx`, `graphs/DeleteConfirmView.tsx`, `graphs/GoalSection.tsx`
- `config/CategoryManager.tsx`, `config/DomainRuleManager.tsx`, `config/ConfigFieldList.tsx`

**Implementation notes:**
- **Category A**: Confirmed that `string` is directly assignable to `LiteralUnion<ForegroundColorName, string>`.
  All color `as any` casts were simply removed without changing source types. No need for `ForegroundColorName` import.
- **Category B**: Used `config as unknown as Record<string, unknown>` (double cast needed since `Config`
  lacks an index signature). Helper functions updated to use `Record<string, unknown>` / `unknown`.
- **Category C**: Used `T extends object` constraint instead of `Record<string, unknown>` to avoid
  requiring an index signature on `Config`.
- **Category E**: Kept default import, removed `as any` casts and eslint-disable comments. Replaced
  `expire` with `timeout` (the documented property). The `notifier.notify()` call typechecks via overloads.
