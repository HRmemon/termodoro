# F1: Extract Shared Filesystem Utilities

**Category:** Refactor / DRY
**Priority:** Medium
**Effort:** Low-Medium (mostly mechanical substitution)
**Risk:** Low (purely internal refactor, no behavior changes)

---

## Problem Statement

Three filesystem utility operations — `ensureDir`, `atomicWrite`, and `readJSON` — are copy-pasted across 8 library modules. The implementations are nearly identical but not perfectly consistent: some modules call `ensureDir` inside `atomicWrite`, some call it inline; `goals.ts` uses a non-atomic `writeFileSync` without a `.tmp` rename step; `sequences.ts` and `reminders.ts` do inline `mkdirSync + writeFileSync` without a `.tmp` step either; `config.ts` has its own inlined atomic write that is never extracted into a helper; `tracker.ts` uses bare `writeFileSync` for both week files and config files with no `.tmp` guard.

This creates several concrete risks:
1. Any future change to the atomic write strategy (e.g., adding `fsync`, adding error logging) must be applied in 8+ places.
2. The inconsistency between files means some paths are crash-safe (`.tmp` rename) and others are not.
3. The `readJSON` variants differ in how they handle the fallback — some use a generic `<T>` with a typed fallback, others are inlined with a bare `JSON.parse` and a specific return type.

---

## Inventory of All Duplicates

### 1. `source/lib/store.ts`

**Lines 31–51**

```typescript
// Line 31-33
function ensureDir(): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Line 35-40
function atomicWrite(filePath: string, data: unknown): void {
  ensureDir();
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  fs.renameSync(tmp, filePath);
}

// Line 42-51
function readJSON<T>(filePath: string, fallback: T): T {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
    }
  } catch {
    // corrupt file, return fallback
  }
  return fallback;
}
```

**Characteristics:**
- `ensureDir` is hardcoded to module-level `DATA_DIR` constant.
- `atomicWrite` calls `ensureDir()` (which uses the hardcoded `DATA_DIR`) before writing; this is safe only because all paths in `store.ts` live under `DATA_DIR`.
- `readJSON<T>` is fully generic with a typed fallback.
- All three are private (not exported).

**Call sites in this file:** `loadSessions`, `loadPlans`, `loadUnlockedAchievements`, `loadTimerState`, `loadStickyProject`, `saveTimerState`, `saveSessions`, `savePlans`, `saveUnlockedAchievements`, `saveStickyProject`.

---

### 2. `source/lib/events.ts`

**Lines 11–28**

```typescript
// Line 11-13
function ensureDir(): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Line 15-20
function atomicWrite(filePath: string, data: unknown): void {
  ensureDir();
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  fs.renameSync(tmp, filePath);
}

// Lines 22-28 (inlined inside loadEvents, not extracted to readJSON):
export function loadEvents(): CalendarEvent[] {
  try {
    if (fs.existsSync(EVENTS_PATH)) {
      return JSON.parse(fs.readFileSync(EVENTS_PATH, 'utf-8')) as CalendarEvent[];
    }
  } catch { /* corrupt file */ }
  return [];
}
```

**Characteristics:**
- `ensureDir` and `atomicWrite` are identical to `store.ts`.
- **No extracted `readJSON`** — the pattern is inlined directly in `loadEvents` with a hardcoded `[]` fallback.
- `saveEvents` calls `atomicWrite`.

---

### 3. `source/lib/tasks.ts`

**Lines 11–31**

```typescript
// Line 11-13
function ensureDir(): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Line 15-20
function atomicWrite(filePath: string, data: unknown): void {
  ensureDir();
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  fs.renameSync(tmp, filePath);
}

// Lines 22-31 (inlined in loadTasks, not extracted):
export function loadTasks(): Task[] {
  try {
    if (fs.existsSync(TASKS_PATH)) {
      return JSON.parse(fs.readFileSync(TASKS_PATH, 'utf-8')) as Task[];
    }
  } catch {
    // corrupt file
  }
  return [];
}

// Lines 103-112 (also inlined in loadProjects):
export function loadProjects(): string[] {
  try {
    if (fs.existsSync(PROJECTS_PATH)) {
      return JSON.parse(fs.readFileSync(PROJECTS_PATH, 'utf-8')) as string[];
    }
  } catch {
    // corrupt file
  }
  return [];
}
```

**Characteristics:**
- `ensureDir` and `atomicWrite` are identical to `store.ts`.
- `readJSON` pattern is inlined twice (once for tasks, once for projects), not extracted.
- `saveTasks` and `saveProjects` both call `atomicWrite`.

---

### 4. `source/lib/config.ts`

**Lines 59–64 (no helper functions; atomic write pattern is fully inlined)**

```typescript
export function saveConfig(config: Config): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });   // inline ensureDir
  const tmp = CONFIG_PATH + '.tmp';                 // inline atomicWrite
  fs.writeFileSync(tmp, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  fs.renameSync(tmp, CONFIG_PATH);
}
```

**Lines 46–57 (readJSON pattern inlined in loadConfig):**

```typescript
export function loadConfig(): Config {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
      const userConfig = JSON.parse(raw) as Partial<Config>;
      return deepMerge(DEFAULT_CONFIG, userConfig);
    }
  } catch {
    // Fall through to defaults
  }
  return { ...DEFAULT_CONFIG };
}
```

**Characteristics:**
- This file uses `CONFIG_DIR` (a different base path: `~/.config/pomodorocli`) instead of the shared `DATA_DIR`.
- The atomic write is fully inlined with no helper functions at all.
- `loadConfig` applies `deepMerge` after parsing rather than returning raw JSON, so it cannot be a straight `readJSON<Config>` call — but `ensureDir`/`atomicWrite` refactoring still applies.

---

### 5. `source/lib/goals.ts`

**Lines 26–46**

```typescript
// Line 26-28
function ensureDir() {
  fs.mkdirSync(path.dirname(GOALS_PATH), { recursive: true });
}

// Lines 30-41 (inlined in loadGoals):
export function loadGoals(): GoalsData {
  try {
    if (fs.existsSync(GOALS_PATH)) {
      const raw = JSON.parse(fs.readFileSync(GOALS_PATH, 'utf8'));
      // Backward compat: old files may lack ratings/notes
      if (!raw.ratings) raw.ratings = {};
      if (!raw.notes) raw.notes = {};
      return raw;
    }
  } catch { /* ignore */ }
  return { goals: [], completions: {}, overrides: {}, ratings: {}, notes: {} };
}

// Lines 43-46: NON-ATOMIC write
export function saveGoals(data: GoalsData): void {
  ensureDir();
  fs.writeFileSync(GOALS_PATH, JSON.stringify(data, null, 2));
}
```

**Characteristics:**
- `ensureDir` uses `path.dirname(GOALS_PATH)` rather than a module-level constant; functionally equivalent, but a different pattern.
- **`saveGoals` is NOT atomic** — it writes directly to the final path without a `.tmp` rename. A crash mid-write corrupts the file.
- No trailing newline in the serialized JSON (missing `+ '\n'`).
- `loadGoals` applies backward-compat fixup after parsing; cannot be a straight `readJSON` call.
- Import style uses default imports (`import fs from 'fs'`) rather than namespace imports (`import * as fs from 'node:fs'`).

---

### 6. `source/lib/tracker.ts`

**Lines 41–47 (`saveTrackerConfig` — non-atomic write)**

```typescript
export function saveTrackerConfig(config: TrackerConfig): void {
  fs.mkdirSync(path.dirname(TRACKER_CONFIG_PATH), { recursive: true });
  // ... merges with existing before writing
  fs.writeFileSync(TRACKER_CONFIG_PATH, JSON.stringify(full, null, 2));
}
```

**Lines 82–86 (`getWeeksDir` — inline mkdirSync at read time)**

```typescript
function getWeeksDir(): string {
  const dir = path.join(os.homedir(), '.local', 'share', 'pomodorocli', 'weeks');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
```

**Lines 126–134 (`loadWeek` — inlined readJSON pattern)**

```typescript
export function loadWeek(weekStr: string): WeekData | null {
  const fp = weekFilePath(weekStr);
  if (!fs.existsSync(fp)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(fp, 'utf8'));
    if (!raw.pending) raw.pending = {};
    return raw;
  } catch { return null; }
}
```

**Lines 136–138 (`saveWeek` — non-atomic write)**

```typescript
export function saveWeek(data: WeekData): void {
  fs.writeFileSync(weekFilePath(data.week), JSON.stringify(data, null, 2));
}
```

**Lines 402–405 (`saveTrackerConfigFull` — non-atomic write)**

```typescript
export function saveTrackerConfigFull(config: TrackerConfigFull): void {
  fs.mkdirSync(path.dirname(TRACKER_CONFIG_PATH), { recursive: true });
  fs.writeFileSync(TRACKER_CONFIG_PATH, JSON.stringify(config, null, 2));
}
```

**Characteristics:**
- Four distinct write sites in this file.
- None use the `.tmp` rename pattern; all writes are non-atomic.
- `loadWeek` applies a backward-compat patch after parsing; cannot be a straight `readJSON` call.
- `getWeeksDir` creates a subdirectory on read (not just on write), which is a different pattern from `ensureDir`.
- `loadTrackerConfig` and `loadTrackerConfigFull` (lines 32–39, 389–400) use inline `existsSync + readFileSync + JSON.parse`.
- Import style: default imports (`import fs from 'fs'`).

---

### 7. `source/lib/sequences.ts`

**Lines 45–59**

```typescript
// Lines 45-54 (inlined readJSON in loadSequences):
export function loadSequences(): SessionSequence[] {
  try {
    if (fs.existsSync(SEQUENCES_PATH)) {
      return JSON.parse(fs.readFileSync(SEQUENCES_PATH, 'utf-8')) as SessionSequence[];
    }
  } catch {
    // ignore
  }
  return [];
}

// Lines 56-59: NON-ATOMIC write with inline ensureDir
export function saveSequences(sequences: SessionSequence[]): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(SEQUENCES_PATH, JSON.stringify(sequences, null, 2) + '\n', 'utf-8');
}
```

**Characteristics:**
- No extracted helper functions at all.
- `saveSequences` inlines both `mkdirSync` and `writeFileSync`.
- **Not atomic** — no `.tmp` rename step.
- Has the trailing newline (unlike `goals.ts` and `tracker.ts`).

---

### 8. `source/lib/reminders.ts`

**Lines 9–23**

```typescript
// Lines 9-18 (inlined readJSON in loadReminders):
export function loadReminders(): ScheduledNotification[] {
  try {
    if (fs.existsSync(REMINDERS_PATH)) {
      return JSON.parse(fs.readFileSync(REMINDERS_PATH, 'utf-8')) as ScheduledNotification[];
    }
  } catch {
    // ignore
  }
  return [];
}

// Lines 20-23: NON-ATOMIC write with inline ensureDir
export function saveReminders(reminders: ScheduledNotification[]): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(REMINDERS_PATH, JSON.stringify(reminders, null, 2) + '\n', 'utf-8');
}
```

**Characteristics:**
- Identical structure to `sequences.ts`.
- Not atomic — no `.tmp` rename step.
- Has the trailing newline.

---

## Summary Table of Inconsistencies

| File | `ensureDir` helper | `atomicWrite` (tmp rename) | `readJSON<T>` helper | Non-atomic writes | Trailing newline | Import style |
|---|---|---|---|---|---|---|
| `store.ts` | Yes (private, hardcoded `DATA_DIR`) | Yes | Yes (generic) | None | Yes | `* as fs from 'node:fs'` |
| `events.ts` | Yes (private, hardcoded `DATA_DIR`) | Yes | No (inlined) | None | Yes | `* as fs from 'node:fs'` |
| `tasks.ts` | Yes (private, hardcoded `DATA_DIR`) | Yes | No (inlined x2) | None | Yes | `* as fs from 'node:fs'` |
| `config.ts` | No (inline `mkdirSync`) | Yes (inline) | No (inlined, post-process) | None | Yes | `* as fs from 'node:fs'` |
| `goals.ts` | Yes (uses `path.dirname`) | No | No (inlined, post-process) | `saveGoals` | No | `import fs from 'fs'` |
| `tracker.ts` | No (inline `mkdirSync` x3) | No | No (inlined x3, post-process) | `saveWeek`, `saveTrackerConfig`, `saveTrackerConfigFull` | No | `import fs from 'fs'` |
| `sequences.ts` | No (inline `mkdirSync`) | No | No (inlined) | `saveSequences` | Yes | `* as fs from 'node:fs'` |
| `reminders.ts` | No (inline `mkdirSync`) | No | No (inlined) | `saveReminders` | Yes | `* as fs from 'node:fs'` |

---

## Proposed `source/lib/fs-utils.ts` API

```typescript
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Ensure a directory exists, creating it and all parents if needed.
 * Accepts either a file path (extracts its dirname) or a directory path.
 *
 * @param dirOrFile - A directory path or a file path whose parent should be created.
 */
export function ensureDir(dirOrFile: string): void {
  const dir = path.extname(dirOrFile) ? path.dirname(dirOrFile) : dirOrFile;
  fs.mkdirSync(dir, { recursive: true });
}

/**
 * Write JSON data to a file atomically using a .tmp rename strategy.
 * Ensures the parent directory exists before writing.
 * Serializes with 2-space indentation and a trailing newline.
 *
 * @param filePath - Absolute path to the target file.
 * @param data     - Any JSON-serializable value.
 */
export function atomicWrite(filePath: string, data: unknown): void {
  ensureDir(filePath);
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  fs.renameSync(tmp, filePath);
}

/**
 * Read and parse a JSON file, returning a fallback value on any error
 * (file not found, parse error, permission error).
 *
 * @param filePath - Absolute path to the JSON file.
 * @param fallback - Value returned when the file cannot be read or parsed.
 * @returns Parsed value cast to T, or the fallback.
 */
export function readJSON<T>(filePath: string, fallback: T): T {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
    }
  } catch {
    // file missing, corrupt, or unreadable — return fallback
  }
  return fallback;
}
```

### Design Decisions

1. **`ensureDir` accepts a file path OR a directory path.** It detects by checking `path.extname`. This handles both the `DATA_DIR` case (pass the directory directly) and the `path.dirname(GOALS_PATH)` pattern in `goals.ts`. Callers that pass a file path get the same behavior as calling `path.dirname` themselves.

2. **`atomicWrite` always appends a trailing newline.** This standardizes on the behavior in `store.ts`, `events.ts`, `tasks.ts`, `sequences.ts`, and `reminders.ts`. The two files currently omitting it (`goals.ts`, `tracker.ts`) will gain a trailing newline — this is not a breaking change for JSON parsers.

3. **`readJSON<T>` is generic.** This matches `store.ts`'s existing implementation exactly. Files that currently inline the pattern get a direct lift-and-shift. Files that apply post-processing after parsing (`goals.ts`, `tracker.ts`, `config.ts`) continue to call `readJSON` and then apply their own fixup logic.

4. **No `node:` protocol enforcement on callers.** The utility module itself uses `node:fs` and `node:path`. Callers that currently use the bare `'fs'` / `'path'` import style (`goals.ts`, `tracker.ts`) do not need to be changed — that is a separate cosmetic concern.

5. **No changes to public API of any module.** All functions being extracted are currently private (not exported). No consumers outside the lib files are affected.

---

## Migration Plan

### Step 1: Create `source/lib/fs-utils.ts`

Create the new file with the three exported functions exactly as specified in the API above. No other changes.

---

### Step 2: Migrate `source/lib/store.ts`

**Changes:**
- Add import: `import { ensureDir, atomicWrite, readJSON } from './fs-utils.js';`
- Remove lines 31–51 (the three private helper functions).
- No other changes needed — all call sites (`atomicWrite(...)`, `readJSON(...)`) remain identical.
- The `DATA_DIR` constant is retained (it is still referenced directly by `clearTimerState`, `saveStickyProject`, `getDataDir`, `getSessionsPath`).

**Before (lines 31–51 removed):**
```typescript
function ensureDir(): void { ... }
function atomicWrite(filePath: string, data: unknown): void { ... }
function readJSON<T>(filePath: string, fallback: T): T { ... }
```

**After:** These lines are simply deleted. All existing call sites continue to work because the imported functions have identical signatures.

---

### Step 3: Migrate `source/lib/events.ts`

**Changes:**
- Add import: `import { atomicWrite, readJSON } from './fs-utils.js';`
- Remove lines 11–20 (the two private helper functions: `ensureDir` and `atomicWrite`).
- Replace the inlined `loadEvents` body with a `readJSON` call:

**Before (lines 22–29):**
```typescript
export function loadEvents(): CalendarEvent[] {
  try {
    if (fs.existsSync(EVENTS_PATH)) {
      return JSON.parse(fs.readFileSync(EVENTS_PATH, 'utf-8')) as CalendarEvent[];
    }
  } catch { /* corrupt file */ }
  return [];
}
```

**After:**
```typescript
export function loadEvents(): CalendarEvent[] {
  return readJSON<CalendarEvent[]>(EVENTS_PATH, []);
}
```

- Remove `import * as fs from 'node:fs';` only if `fs` is no longer used elsewhere in the file. Check: `fs` is not used elsewhere in `events.ts` after this change. Remove the `fs` import.

---

### Step 4: Migrate `source/lib/tasks.ts`

**Changes:**
- Add import: `import { atomicWrite, readJSON } from './fs-utils.js';`
- Remove lines 11–20 (the two private helpers: `ensureDir` and `atomicWrite`).
- Replace the inlined `loadTasks` body:

**Before (lines 22–31):**
```typescript
export function loadTasks(): Task[] {
  try {
    if (fs.existsSync(TASKS_PATH)) {
      return JSON.parse(fs.readFileSync(TASKS_PATH, 'utf-8')) as Task[];
    }
  } catch { /* corrupt file */ }
  return [];
}
```

**After:**
```typescript
export function loadTasks(): Task[] {
  return readJSON<Task[]>(TASKS_PATH, []);
}
```

- Replace the inlined `loadProjects` body:

**Before (lines 103–112):**
```typescript
export function loadProjects(): string[] {
  try {
    if (fs.existsSync(PROJECTS_PATH)) {
      return JSON.parse(fs.readFileSync(PROJECTS_PATH, 'utf-8')) as string[];
    }
  } catch { /* corrupt file */ }
  return [];
}
```

**After:**
```typescript
export function loadProjects(): string[] {
  return readJSON<string[]>(PROJECTS_PATH, []);
}
```

- Check if `fs` is still used after the changes. It is not. Remove `import * as fs from 'node:fs';`.

---

### Step 5: Migrate `source/lib/config.ts`

**Changes:**
- Add import: `import { ensureDir, atomicWrite } from './fs-utils.js';`
- `loadConfig` cannot use `readJSON<Config>` directly because it applies `deepMerge` after parsing. Leave `loadConfig` body unchanged.
- Replace the inlined atomic write in `saveConfig`:

**Before (lines 59–64):**
```typescript
export function saveConfig(config: Config): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  const tmp = CONFIG_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  fs.renameSync(tmp, CONFIG_PATH);
}
```

**After:**
```typescript
export function saveConfig(config: Config): void {
  atomicWrite(CONFIG_PATH, config);
}
```

- Note: `atomicWrite` calls `ensureDir(filePath)` internally, which will call `fs.mkdirSync(CONFIG_DIR, { recursive: true })` — correct.
- Check if `fs` is still used after the change. Yes — `loadConfig` still uses `fs.existsSync` and `fs.readFileSync`. Keep the `fs` import.

---

### Step 6: Migrate `source/lib/goals.ts`

**Changes:**
- Add import: `import { atomicWrite, readJSON } from './fs-utils.js';`
- Remove lines 26–28 (the `ensureDir` private function).
- `loadGoals` cannot use `readJSON<GoalsData>` directly because it applies backward-compat fixup (`raw.ratings`, `raw.notes`). Leave `loadGoals` body unchanged but replace its `fs.existsSync`/`fs.readFileSync` calls with a `readJSON` call and then apply the fixup:

**Before (lines 30–41):**
```typescript
export function loadGoals(): GoalsData {
  try {
    if (fs.existsSync(GOALS_PATH)) {
      const raw = JSON.parse(fs.readFileSync(GOALS_PATH, 'utf8'));
      if (!raw.ratings) raw.ratings = {};
      if (!raw.notes) raw.notes = {};
      return raw;
    }
  } catch { /* ignore */ }
  return { goals: [], completions: {}, overrides: {}, ratings: {}, notes: {} };
}
```

**After:**
```typescript
export function loadGoals(): GoalsData {
  const raw = readJSON<GoalsData | null>(GOALS_PATH, null);
  if (!raw) return { goals: [], completions: {}, overrides: {}, ratings: {}, notes: {} };
  if (!raw.ratings) raw.ratings = {};
  if (!raw.notes) raw.notes = {};
  return raw;
}
```

- Replace `saveGoals` to use `atomicWrite` (fixing the non-atomic write bug at the same time):

**Before (lines 43–46):**
```typescript
export function saveGoals(data: GoalsData): void {
  ensureDir();
  fs.writeFileSync(GOALS_PATH, JSON.stringify(data, null, 2));
}
```

**After:**
```typescript
export function saveGoals(data: GoalsData): void {
  atomicWrite(GOALS_PATH, data);
}
```

- Check if `fs` is still used after changes. Not directly. Remove `import fs from 'fs';`. Also remove `import path from 'path';` and `import os from 'os';` if they are not used elsewhere — `GOALS_PATH` is computed at module level using them, so they must stay. Remove only `fs`.

---

### Step 7: Migrate `source/lib/tracker.ts`

This file has the most changes. Address each write/read site individually.

**Changes:**
- Add import: `import { ensureDir, atomicWrite, readJSON } from './fs-utils.js';`

**`loadTrackerConfig` (lines 32–39):**

Before:
```typescript
export function loadTrackerConfig(): TrackerConfig {
  try {
    if (fs.existsSync(TRACKER_CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(TRACKER_CONFIG_PATH, 'utf8'));
    }
  } catch { /* ignore */ }
  return { categories: CATEGORIES };
}
```

After:
```typescript
export function loadTrackerConfig(): TrackerConfig {
  return readJSON<TrackerConfig>(TRACKER_CONFIG_PATH, { categories: CATEGORIES });
}
```

**`saveTrackerConfig` (lines 41–47) — fix non-atomic write:**

Before:
```typescript
export function saveTrackerConfig(config: TrackerConfig): void {
  fs.mkdirSync(path.dirname(TRACKER_CONFIG_PATH), { recursive: true });
  const existing = loadTrackerConfigFull();
  const full = { ...existing, categories: config.categories };
  fs.writeFileSync(TRACKER_CONFIG_PATH, JSON.stringify(full, null, 2));
}
```

After:
```typescript
export function saveTrackerConfig(config: TrackerConfig): void {
  const existing = loadTrackerConfigFull();
  const full = { ...existing, categories: config.categories };
  atomicWrite(TRACKER_CONFIG_PATH, full);
}
```

**`getWeeksDir` (lines 82–86) — replace inline `mkdirSync`:**

Before:
```typescript
function getWeeksDir(): string {
  const dir = path.join(os.homedir(), '.local', 'share', 'pomodorocli', 'weeks');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
```

After:
```typescript
function getWeeksDir(): string {
  const dir = path.join(os.homedir(), '.local', 'share', 'pomodorocli', 'weeks');
  ensureDir(dir);
  return dir;
}
```

**`loadWeek` (lines 126–134) — note: backward-compat fixup, use partial `readJSON`:**

Before:
```typescript
export function loadWeek(weekStr: string): WeekData | null {
  const fp = weekFilePath(weekStr);
  if (!fs.existsSync(fp)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(fp, 'utf8'));
    if (!raw.pending) raw.pending = {};
    return raw;
  } catch { return null; }
}
```

After:
```typescript
export function loadWeek(weekStr: string): WeekData | null {
  const raw = readJSON<WeekData | null>(weekFilePath(weekStr), null);
  if (!raw) return null;
  if (!raw.pending) raw.pending = {};
  return raw;
}
```

**`saveWeek` (lines 136–138) — fix non-atomic write:**

Before:
```typescript
export function saveWeek(data: WeekData): void {
  fs.writeFileSync(weekFilePath(data.week), JSON.stringify(data, null, 2));
}
```

After:
```typescript
export function saveWeek(data: WeekData): void {
  atomicWrite(weekFilePath(data.week), data);
}
```

Note: `weekFilePath` returns a path under the `weeks/` subdirectory. `atomicWrite` calls `ensureDir(filePath)` internally, so the directory will be created. The call to `getWeeksDir()` inside `weekFilePath` already creates the directory at time of path construction — this is redundant but harmless; consider removing `ensureDir` from `getWeeksDir` once `saveWeek` uses `atomicWrite`.

**`loadTrackerConfigFull` (lines 389–400):**

Before:
```typescript
export function loadTrackerConfigFull(): TrackerConfigFull {
  try {
    if (fs.existsSync(TRACKER_CONFIG_PATH)) {
      const raw = JSON.parse(fs.readFileSync(TRACKER_CONFIG_PATH, 'utf8'));
      return {
        categories: raw.categories ?? CATEGORIES,
        domainRules: raw.domainRules ?? [],
      };
    }
  } catch { /* ignore */ }
  return { categories: CATEGORIES, domainRules: [] };
}
```

After:
```typescript
export function loadTrackerConfigFull(): TrackerConfigFull {
  const raw = readJSON<Partial<TrackerConfigFull> | null>(TRACKER_CONFIG_PATH, null);
  return {
    categories: raw?.categories ?? CATEGORIES,
    domainRules: raw?.domainRules ?? [],
  };
}
```

**`saveTrackerConfigFull` (lines 402–405) — fix non-atomic write:**

Before:
```typescript
export function saveTrackerConfigFull(config: TrackerConfigFull): void {
  fs.mkdirSync(path.dirname(TRACKER_CONFIG_PATH), { recursive: true });
  fs.writeFileSync(TRACKER_CONFIG_PATH, JSON.stringify(config, null, 2));
}
```

After:
```typescript
export function saveTrackerConfigFull(config: TrackerConfigFull): void {
  atomicWrite(TRACKER_CONFIG_PATH, config);
}
```

- After all changes: check if `fs` is still directly referenced anywhere in `tracker.ts`. It is used in `listWeeks` (lines 141–147: `fs.existsSync`, `fs.readdirSync`). Keep the `fs` import.

---

### Step 8: Migrate `source/lib/sequences.ts`

**Changes:**
- Add import: `import { atomicWrite, readJSON } from './fs-utils.js';`
- Replace `loadSequences` body:

**Before (lines 45–54):**
```typescript
export function loadSequences(): SessionSequence[] {
  try {
    if (fs.existsSync(SEQUENCES_PATH)) {
      return JSON.parse(fs.readFileSync(SEQUENCES_PATH, 'utf-8')) as SessionSequence[];
    }
  } catch { /* ignore */ }
  return [];
}
```

**After:**
```typescript
export function loadSequences(): SessionSequence[] {
  return readJSON<SessionSequence[]>(SEQUENCES_PATH, []);
}
```

- Replace `saveSequences` to use `atomicWrite` (fixing the non-atomic write):

**Before (lines 56–59):**
```typescript
export function saveSequences(sequences: SessionSequence[]): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(SEQUENCES_PATH, JSON.stringify(sequences, null, 2) + '\n', 'utf-8');
}
```

**After:**
```typescript
export function saveSequences(sequences: SessionSequence[]): void {
  atomicWrite(SEQUENCES_PATH, sequences);
}
```

- Check if `fs` is used elsewhere. It is not. Remove `import * as fs from 'node:fs';`. Also check `os` — `DATA_DIR` uses `os.homedir()`. Keep `os` and `path` imports.

---

### Step 9: Migrate `source/lib/reminders.ts`

**Changes:**
- Add import: `import { atomicWrite, readJSON } from './fs-utils.js';`
- Replace `loadReminders` body:

**Before (lines 9–18):**
```typescript
export function loadReminders(): ScheduledNotification[] {
  try {
    if (fs.existsSync(REMINDERS_PATH)) {
      return JSON.parse(fs.readFileSync(REMINDERS_PATH, 'utf-8')) as ScheduledNotification[];
    }
  } catch { /* ignore */ }
  return [];
}
```

**After:**
```typescript
export function loadReminders(): ScheduledNotification[] {
  return readJSON<ScheduledNotification[]>(REMINDERS_PATH, []);
}
```

- Replace `saveReminders` to use `atomicWrite`:

**Before (lines 20–23):**
```typescript
export function saveReminders(reminders: ScheduledNotification[]): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(REMINDERS_PATH, JSON.stringify(reminders, null, 2) + '\n', 'utf-8');
}
```

**After:**
```typescript
export function saveReminders(reminders: ScheduledNotification[]): void {
  atomicWrite(REMINDERS_PATH, reminders);
}
```

- Check if `fs` is used elsewhere. It is not. Remove `import * as fs from 'node:fs';`. Also check `os` and `path` — they are used by `DATA_DIR` and `REMINDERS_PATH`. Keep `os` and `path`.

---

## Side-Effect Fixes Bundled with This Refactor

The migration upgrades non-atomic writes to atomic writes in 4 files. These are bugs-by-omission that existed independently:

| File | Function | Bug Fixed |
|---|---|---|
| `goals.ts` | `saveGoals` | Non-atomic write — process crash mid-write corrupts `goals.json` |
| `tracker.ts` | `saveWeek` | Non-atomic write — process crash mid-write corrupts week file |
| `tracker.ts` | `saveTrackerConfig` | Non-atomic write — process crash mid-write corrupts `tracker-config.json` |
| `tracker.ts` | `saveTrackerConfigFull` | Non-atomic write — process crash mid-write corrupts `tracker-config.json` |
| `sequences.ts` | `saveSequences` | Non-atomic write — process crash mid-write corrupts `sequences.json` |
| `reminders.ts` | `saveReminders` | Non-atomic write — process crash mid-write corrupts `reminders.json` |

Additionally, `goals.ts` and `tracker.ts` gain a trailing newline in their JSON output, making the output consistent with the other files.

---

## Testing Approach

### 1. TypeScript Compilation (Must Pass First)

```bash
npm run build
```

All changed files must compile without errors. Pay special attention to:
- `tracker.ts` `loadTrackerConfigFull` — the `Partial<TrackerConfigFull> | null` intermediate type must satisfy the return type.
- `goals.ts` `loadGoals` — the `GoalsData | null` intermediate must not cause type errors downstream.

### 2. Manual Smoke Tests

For each migrated module, run the application and verify:

- **`store.ts`:** Start a timer session, stop it, restart the app — session should persist.
- **`events.ts`:** Add a calendar event, restart the app — event should persist.
- **`tasks.ts`:** Add a task, add a project, restart the app — both should persist.
- **`config.ts`:** Change a setting, restart — setting should persist.
- **`goals.ts`:** Add a goal, mark it complete, restart — completion should persist.
- **`tracker.ts`:** Fill in week slots, restart — slots should persist. Add a domain rule, restart — rule should persist.
- **`sequences.ts`:** Add a custom sequence, restart — sequence should persist.
- **`reminders.ts`:** Add a reminder, restart — reminder should persist.

### 3. Corruption Recovery Smoke Test

Verify `readJSON` fallback still works after migration:

```bash
# Corrupt a data file
echo "not json{{{" > ~/.local/share/pomodorocli/tasks.json
# Start the app — should not crash, tasks list should be empty
```

Repeat for a representative sample of files (`goals.json`, `reminders.json`, `sequences.json`).

### 4. Atomic Write Verification

Verify that `.tmp` files do not persist after a successful write:

```bash
ls ~/.local/share/pomodorocli/*.tmp 2>/dev/null || echo "No .tmp files — correct"
```

### 5. Regression: Existing Data Files

Before running migrations in a dev environment that has real data, verify that files with missing fields (`ratings`, `notes` in `goals.json`; `pending` in week files) are still handled correctly by the updated `loadGoals` and `loadWeek` functions.

---

## Files to Create

- `source/lib/fs-utils.ts` — new shared module

## Files to Modify

| File | Changes |
|---|---|
| `source/lib/store.ts` | Remove 3 private helpers, add import |
| `source/lib/events.ts` | Remove 2 private helpers, simplify `loadEvents`, add import, possibly remove `fs` import |
| `source/lib/tasks.ts` | Remove 2 private helpers, simplify `loadTasks`/`loadProjects`, add import, remove `fs` import |
| `source/lib/config.ts` | Simplify `saveConfig`, add import, keep `fs` import |
| `source/lib/goals.ts` | Remove `ensureDir`, refactor `loadGoals`/`saveGoals`, add import, remove `fs` import |
| `source/lib/tracker.ts` | Refactor 6 functions, add import, keep `fs` import |
| `source/lib/sequences.ts` | Simplify `loadSequences`/`saveSequences`, add import, remove `fs` import |
| `source/lib/reminders.ts` | Simplify `loadReminders`/`saveReminders`, add import, remove `fs` import |

## Files NOT Modified

All files outside `source/lib/` are untouched. No public API surfaces change. No component, hook, command, or daemon file needs modification.

---

## Plan Adjustments

The plan was written before a partial migration had already occurred. When implementation began, the codebase had already been partially refactored:

1. **`fs-utils.ts` already existed** with `atomicWriteJSON` (combining the plan's `ensureDir` + `atomicWrite` into one function).
2. **All `save*` functions** across all 8 files had already been migrated to use `atomicWriteJSON` — the non-atomic write bugs in goals.ts, tracker.ts, sequences.ts, and reminders.ts were already fixed.
3. **Private `ensureDir` and `atomicWrite` helpers** had already been removed from store.ts, events.ts, tasks.ts, and goals.ts.

**What remained and was implemented:**
- Added `readJSON<T>` and `ensureDir` to `fs-utils.ts`
- Replaced all inline readJSON patterns (fs.existsSync + fs.readFileSync + JSON.parse) with `readJSON()` calls in: store.ts, events.ts, tasks.ts, goals.ts, tracker.ts, sequences.ts, reminders.ts
- Replaced inline `fs.mkdirSync` in tracker.ts `getWeeksDir()` with `ensureDir()`
- Removed unused `fs` imports from: events.ts, tasks.ts, goals.ts, sequences.ts, reminders.ts
- Kept `fs` imports in store.ts (used by `clearTimerState`, `saveStickyProject`) and tracker.ts (used by `listWeeks`)
