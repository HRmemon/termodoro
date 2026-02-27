# Fix Plan: C1 -- Session Loading Performance

## Problem Statement

`loadSessions()` in `source/lib/store.ts` performs a synchronous full-file read
(`fs.readFileSync`) plus full JSON parse on every call. Because sessions.json grows
unbounded over the lifetime of the application (one entry per completed/abandoned
session), this cost scales with usage and can easily reach tens of milliseconds on a
machine with a large history file.

### Complete call-site inventory

The following locations call `loadSessions()` directly, triggering an independent disk
read each time:

| File | Lines | Context |
|---|---|---|
| `source/lib/store.ts` | 65 | `appendSession()` -- called at end of every timer session |
| `source/lib/stats.ts` | 66 | `getSessionsForDateRange()` -- called by many stats functions |
| `source/lib/stats.ts` | 167 | `getDeepWorkRatio()` -- second independent load in the same function |
| `source/lib/stats.ts` | 236 | `getStreaks()` -- third independent top-level call |
| `source/lib/achievements.ts` | 180 | `checkAchievements()` -- runs after every completed session |
| `source/lib/achievements.ts` | 207 | `getAchievementProgress()` -- separate load |
| `source/components/CalendarView.tsx` | 130 | `useMemo` for heatmap -- re-runs on month/year change |
| `source/components/CalendarView.tsx` | 159 | `useMemo` for daySessions -- separate load, re-runs on date change |
| `source/components/InsightsView.tsx` | 47 | `useMemo` with empty dep array -- loads once on mount |
| `source/components/ReportsView.tsx` | 68 | `useMemo` -- loads all sessions for stats tab |
| `source/components/SearchView.tsx` | 64 | `useMemo` -- loads all sessions for full-text search |
| `source/app.tsx` | 114 | `useMemo` -- recomputes todayStats on timer events |
| `source/app.tsx` | 121 | (via `getStreaks()`) -- loads again through stats |
| `source/lib/goals.ts` | 125 | `getCachedSessions()` -- already has a 5-second TTL cache |
| `source/lib/nvim-edit.ts` | 934, 1059 | editor integration -- triggered on manual file edits |
| `source/daemon/status-writer.ts` | 18 | daemon tick -- frequency depends on daemon poll interval |

### The most acute problem: GlobalSearch on every keystroke

`source/components/GlobalSearch.tsx` computes its `results` array inside an inline IIFE
directly in the render function body (not a `useMemo`), meaning it runs on every render.
Although the current search results contain tasks, sequences, and reminders rather than
sessions, the component is architecturally identical to SearchView and could easily
acquire a session search path. More critically, SearchView (which does load sessions in a
`useMemo`) re-renders on every keystroke because its `query` state changes, and a
`useMemo` with an empty dependency array still runs on the first keystroke if the
component mounts fresh. The stated problem description flags GlobalSearch lines 58-141 as
a call site, meaning a session-search branch is either planned or already present in a
development branch.

### Compound effect in a single ReportsView render

When a user opens the stats view, `useMemo` in `ReportsView` calls:
1. `loadSessions()` directly (line 68)
2. `getSessionsForDateRange()` x 7 (inside `getWeeklyStats`, each calling `loadSessions`)
3. `getDeepWorkRatio()` which calls `loadSessions()` plus 9 more calls to `getRatioForRange`
4. `getStreaks()` which calls `loadSessions()` once directly and then `getSessionsForDateRange`

A single `ReportsView` mount triggers at minimum **11 independent disk reads** of the
same file.

---

## Current Loading Mechanism

```typescript
// source/lib/store.ts
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

export function loadSessions(): Session[] {
  const raw = readJSON<Session[]>(SESSIONS_PATH, []);
  return raw.map(s => s.intervals ? s : { ...s, intervals: [] });
}
```

Every call goes through: `existsSync` (stat syscall) + `readFileSync` (read syscall) +
`JSON.parse` (CPU). There is no caching layer at the `store.ts` level. The only existing
cache is the 5-second TTL in `goals.ts`, which is local to that module and does not
benefit any other caller.

---

## Proposed Caching Approach

### Decision rationale

Three candidate strategies were considered:

**Option A: React Context provider** -- Share a loaded `Session[]` array from a top-level
context. Requires all consumers to be React components, breaks the lib functions
(`stats.ts`, `achievements.ts`) which are called from both React and daemon contexts.
Would need a parallel non-React path anyway. Rejected as primary solution; suitable only
as a secondary layer for components.

**Option B: Time-based TTL in-memory singleton (like goals.ts)** -- Simple, works
everywhere (React + lib + daemon), survives module lifetime. The risk is serving stale
data if sessions.json is written by another process during the TTL window. In practice,
writes only come from `appendSession()` within the same process, so staleness is
controllable if the cache is invalidated on every write.

**Option C: mtime-based cache invalidation** -- Before returning cached data, call
`fs.statSync(SESSIONS_PATH).mtimeMs` and compare to the cached mtime. This gives
perfectly fresh data at the cost of one stat syscall per `loadSessions()` call instead
of a full read+parse. Zero staleness risk even across processes (e.g. the daemon and the
UI process both running).

**Chosen approach: Option C (mtime-based) as the in-process cache, with write-path
invalidation as a belt-and-suspenders guarantee.**

The mtime check costs ~0.05ms (a single stat) versus ~5-50ms for a full read+parse of a
large sessions file. It is also inherently correct for the multi-process scenario (daemon
writes, UI reads). Write-path invalidation (`saveSessions` clears the cache) ensures the
same process never reads its own stale data even during the stat syscall window.

The `getSessionsForDateRange` function in `stats.ts` should be refactored to accept an
optional pre-loaded `sessions` array, eliminating redundant loads within a single
computation (e.g. the 7-day loop in `getWeeklyStats`).

---

## Exact Files and Changes Needed

### 1. `source/lib/store.ts` -- Add mtime-based singleton cache

Add a module-level cache block immediately after the `SESSIONS_PATH` constant. Modify
`loadSessions()` to use it. Modify `saveSessions()` and `appendSession()` to invalidate
it.

```typescript
// --- Session cache -----------------------------------------------------------
interface SessionCache {
  sessions: Session[];
  mtimeMs: number;
}
let _sessionCache: SessionCache | null = null;

export function loadSessions(): Session[] {
  try {
    const stat = fs.statSync(SESSIONS_PATH);
    if (_sessionCache && _sessionCache.mtimeMs === stat.mtimeMs) {
      return _sessionCache.sessions;
    }
    const raw = readJSON<Session[]>(SESSIONS_PATH, []);
    const sessions = raw.map(s => s.intervals ? s : { ...s, intervals: [] });
    _sessionCache = { sessions, mtimeMs: stat.mtimeMs };
    return sessions;
  } catch {
    // File does not exist yet
    return [];
  }
}

export function saveSessions(sessions: Session[]): void {
  _sessionCache = null;   // Invalidate before write so next call re-reads
  atomicWrite(SESSIONS_PATH, sessions);
}

export function appendSession(session: Session): void {
  const sessions = loadSessions();
  sessions.push(session);
  saveSessions(sessions);
}
```

Key design decisions:
- Cache is invalidated (`null`) before `atomicWrite` is called, not after. This prevents
  a brief window where the old cache would be served if another `loadSessions` call were
  to race between the `renameSync` and a hypothetical post-write cache update.
- The `statSync` call is inside a `try/catch` so a missing file is handled cleanly
  (returns `[]`) without changing the existing contract.
- The original `readJSON` helper is left intact for the other data files (`plans`,
  `achievements`, etc.) which are much smaller and not on hot paths.

### 2. `source/lib/stats.ts` -- Eliminate redundant loads by threading sessions

The root cause of the 11-reads-per-ReportsView problem is that `getSessionsForDateRange`
calls `loadSessions()` unconditionally, and callers loop over it.

Refactor `getSessionsForDateRange` to accept an optional `sessions` parameter:

```typescript
export function getSessionsForDateRange(
  start: string,
  end: string,
  sessions?: Session[]
): Session[] {
  const all = sessions ?? loadSessions();
  const startMs = parseDate(start).getTime();
  const endDate = parseDate(end);
  endDate.setHours(23, 59, 59, 999);
  const endMs = endDate.getTime();
  return all.filter(s => {
    const t = new Date(s.startedAt).getTime();
    return t >= startMs && t <= endMs;
  });
}
```

Refactor `getWeeklyStats` to load once and thread through:

```typescript
export function getWeeklyStats(weekStartDate: string, sessions?: Session[]): WeeklyStats {
  const allSessions = sessions ?? loadSessions();
  const start = parseDate(weekStartDate);
  const heatmap: HeatmapDay[] = [];

  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const dateStr = toDateString(d);
    // Pass allSessions in to avoid 7 re-reads
    const daySessions = getSessionsForDateRange(dateStr, dateStr, allSessions);
    // ... rest of body unchanged
  }
  // ... rest of function unchanged
}
```

Refactor `getDeepWorkRatio` to remove the second `loadSessions()` call at line 167.
The function already receives a `sessions` parameter; the inner `allSessions` variable
should reuse it:

```typescript
export function getDeepWorkRatio(sessions: Session[]): DeepWorkRatio {
  // ... existing work/break session filtering ...

  // REMOVE: const allSessions = loadSessions();   // line 167 -- redundant
  // REPLACE all uses of allSessions with sessions (same data already passed in)

  function getRatioForRange(daysBack: number, span: number): number {
    // ... use sessions parameter instead of allSessions ...
  }

  // trendValues loop and final return unchanged
}
```

Refactor `getStreaks` to load once and pass into `getSessionsForDateRange`:

```typescript
export function getStreaks(): StreakInfo {
  const allSessions = loadSessions();   // single load
  // ...
  // Change: const weekSessions = getSessionsForDateRange(weekStartStr, weekEndStr);
  // To:
  const weekSessions = getSessionsForDateRange(weekStartStr, weekEndStr, allSessions);
  // ...
}
```

### 3. `source/lib/achievements.ts` -- Load once per function, not twice

`checkAchievements` (line 179-199) and `getAchievementProgress` (line 201-220) each call
`loadSessions()` independently. With the store-level cache this becomes cheap, but they
can be made more explicit:

No structural change needed -- the mtime cache in store.ts fixes this automatically
because both calls within the same tick will hit the cache after the first miss. However,
if a write occurs between the two calls (unlikely but possible during achievement
unlock), the second call would re-read. Since both functions are short and synchronous
this is a theoretical concern only. Document in a code comment that the cache makes
sequential calls within the same call frame safe.

### 4. `source/components/CalendarView.tsx` -- Deduplicate the two session loads

Lines 130 and 159 each call `loadSessions()` inside separate `useMemo` hooks with
different dependency arrays. With the mtime cache both calls are now cheap. However,
the two `useMemo` blocks serve different slices of the same underlying data, and their
dependency arrays differ (`[year, month, ...]` vs `[selectedDate, eventVersion]`), so
merging them would require a single broader `useMemo` that recomputes more than needed.

The correct fix is to leave the structure as-is and rely on the store cache. The mtime
cache makes both calls cost only a stat syscall on the second call within the same tick.
No structural change is required here beyond the store fix.

Optional enhancement: if CalendarView becomes a performance bottleneck (unlikely for a
TUI app), one could lift a single `allSessions` memo to the top of the component with
dep array `[eventVersion]` and derive both `sessionMinutesByDate` and `daySessions` from
it. This is a secondary concern.

### 5. `source/components/InsightsView.tsx` -- No change needed

Line 47 already uses `useMemo(() => loadSessions(), [])` with an empty dep array,
meaning it loads once on mount. The mtime cache makes this call fast regardless. No
structural change required.

### 6. `source/components/ReportsView.tsx` -- Thread allSessions into stats calls

The `data` useMemo at line 65-117 already loads `allSessions` at line 68. It then calls
`getWeeklyStats`, `getDeepWorkRatio`, `getDailyStats`, `getStreaks`, and
`getSessionsForDateRange` -- each of which currently re-loads sessions internally.

After the `stats.ts` refactor (step 2), update the call sites in ReportsView to pass
`allSessions` through:

```typescript
const data = useMemo(() => {
  const today = getTodayString();
  const weekStart = getWeekStartDate();
  const allSessions = loadSessions();         // single load
  // ...
  return {
    daily: getDailyStats(today, allSessions),           // if signature allows
    weekly: getWeeklyStats(weekStart, allSessions),
    breakdown: getTaskBreakdown(allSessions),
    deepWork: getDeepWorkRatio(allSessions),
    streaks: getStreaks(),                               // getStreaks loads once internally
    todaySessions: getSessionsForDateRange(today, today, allSessions),
    // ...
  };
}, [dataVersion]);
```

Note: `getDailyStats` calls `getSessionsForDateRange` which after the refactor accepts
an optional `sessions` arg. Consider adding a `sessions?` param to `getDailyStats` as
well for completeness.

### 7. `source/app.tsx` -- Two independent loads on timer events

Lines 112-119 (`todayStats`) and line 121 (`streak` via `getStreaks()`) both load
sessions. They are in separate `useMemo` calls with slightly different dep arrays
(`[timer.isComplete, engine.sessionNumber]` for both). With the mtime cache these two
calls are cheap. However, they can be merged into a single `useMemo`:

```typescript
const statusBarData = useMemo(() => {
  const today = new Date().toISOString().slice(0, 10);
  const sessions = loadSessions();
  const todaySessions = sessions.filter(
    s => s.startedAt.startsWith(today) && s.type === 'work' && s.status === 'completed'
  );
  return {
    todayCount: todaySessions.length,
    todayFocusMinutes: Math.round(todaySessions.reduce((sum, s) => sum + s.durationActual, 0) / 60),
    streak: getStreaks().currentStreak,   // getStreaks() will internally use the mtime cache
  };
}, [timer.isComplete, engine.sessionNumber]);
```

Replace `todayStats.count`, `todayStats.focusMinutes`, and `streak` references with
`statusBarData.todayCount`, `statusBarData.todayFocusMinutes`, `statusBarData.streak`.

---

## Cache Invalidation Strategy

| Event | Mechanism | Effect |
|---|---|---|
| `saveSessions()` called | Sets `_sessionCache = null` before write | Next `loadSessions()` re-reads from disk |
| `appendSession()` called | Calls `saveSessions()` which invalidates | Same as above |
| External process writes sessions.json | `statSync` detects mtime change | Cache miss, re-read |
| Daemon writes session at end of timer | `appendSession()` path -- self-invalidating | Correct |
| nvim-edit modifies sessions.json externally | mtime change detected on next read | Correct |
| Process restart | Module-level variable re-initialised to `null` | Cold start, full read |

The daemon process and UI process are separate Node.js instances with separate module
caches. Each maintains its own `_sessionCache`. Cross-process invalidation is handled
entirely by the mtime check -- there is no shared memory or IPC needed.

### Potential mtime collision on fast writes

On filesystems where mtime resolution is 1 second (some older Linux filesystems, FAT32),
two writes within the same second could produce the same mtime. The `atomicWrite`
function uses `renameSync` which on Linux is atomic and updates mtime to the current
clock. On ext4 (the common case) mtime resolution is nanoseconds. This is not a
practical concern for session files written at most once per 25 minutes.

If future work adds batch import that writes sessions.json multiple times rapidly, the
`_sessionCache = null` write-path invalidation is the primary guard -- it fires before
each write regardless of mtime.

---

## Edge Cases and Testing

### Edge case 1: Concurrent reads during write window

`atomicWrite` writes to a `.tmp` file first, then renames. During the tiny rename
window, `statSync` on the original path could return the old mtime (if the rename has
not yet completed) or fail (if the OS has already removed the old inode). The `try/catch`
in the proposed `loadSessions` handles the failure case. The old-mtime case results in
serving the pre-write cache once, which is safe because the write has not yet committed.

### Edge case 2: File deleted between stat and read

If sessions.json is deleted after `statSync` succeeds but before `readFileSync` fires,
`readJSON` returns `[]` (the fallback). This is correct behaviour. The cache entry will
not be updated (the catch branch returns without setting `_sessionCache`), so the next
call will try the stat again and find no file, returning `[]` again.

### Edge case 3: Corrupt file

`readJSON` already catches JSON parse errors and returns the fallback. After the refactor
this still applies. The cache will not be populated with bad data because the `try/catch`
wraps both the stat and the parse.

### Edge case 4: First-time user with no sessions.json

`statSync` throws `ENOENT`. The outer `try/catch` catches it, returns `[]`. No change to
existing behaviour.

### Edge case 5: `getDeepWorkRatio` receives a sessions array but previously called `loadSessions()` again internally

After the refactor in step 2, `getDeepWorkRatio` must not call `loadSessions()` at all.
Its callers pass in the sessions they want analysed. The `getRatioForRange` inner
function must filter from the passed-in `sessions` parameter rather than from a fresh
`loadSessions()` call. This is a semantic correctness fix as well as a performance fix:
the current code could analyse a different snapshot of sessions for the trend than for
the ratio, if a session was written between the two calls.

### Tests to add / verify

1. **Unit -- cache hit**: Call `loadSessions()` twice without any write between them.
   Assert that `fs.readFileSync` is called exactly once (use a spy/mock on `readJSON` or
   on `fs`).

2. **Unit -- cache miss on write**: Call `loadSessions()`, call `saveSessions(...)`, call
   `loadSessions()` again. Assert `fs.readFileSync` is called twice.

3. **Unit -- mtime change triggers re-read**: Mock `fs.statSync` to return a different
   `mtimeMs` on the second call. Assert that the second `loadSessions()` call reads the
   file again.

4. **Unit -- no sessions.json**: Mock `fs.statSync` to throw `ENOENT`. Assert
   `loadSessions()` returns `[]` without throwing.

5. **Integration -- ReportsView call count**: Render `<ReportsView>` once and count
   `fs.readFileSync` calls. Should be 1 after the stats.ts threading refactor (down from
   11+).

6. **Regression -- `getDeepWorkRatio` uses passed-in sessions**: Write a session after
   computing the ratio baseline. Verify the trend values reflect the state at the time
   the sessions array was passed in, not the state after the write.

---

## Implementation Order

1. `source/lib/store.ts` -- mtime cache (self-contained, no downstream API changes)
2. `source/lib/stats.ts` -- add optional `sessions` parameter to `getSessionsForDateRange`,
   `getWeeklyStats`, `getDailyStats`; remove redundant internal load from `getDeepWorkRatio`
   and `getStreaks`
3. `source/components/ReportsView.tsx` -- thread `allSessions` through stat calls
4. `source/app.tsx` -- merge two session-dependent `useMemo` hooks
5. `source/components/CalendarView.tsx` -- optionally consolidate two `useMemo` session
   loads into one (low priority; mtime cache already covers the cost)

Steps 1 and 2 are the highest-leverage changes. They fix every call site simultaneously
without requiring component-level refactors. Steps 3-5 are clean-up that reduces
redundant work at the call-site level even in the presence of the cache.

---

## Plan Adjustments

**Major change: Sessions migrated from JSON to SQLite.** Commit `21af327` migrated
session storage from `sessions.json` to SQLite via `source/lib/session-db.ts`. The
`loadSessions()` function now calls `getAllSessions()` which runs a full SQL query +
row mapping. The mtime-based cache approach is no longer applicable.

### Adjusted approach for store.ts cache:

Instead of mtime-based invalidation, use a **write-version counter** cache:
- Module-level `_sessionCache` holds the last query result and a `_writeVersion` counter
- `insertSession()` and `replaceAllSessions()` increment `_writeVersion`
- `loadSessions()` returns cached data if `_writeVersion` hasn't changed since last read
- Cross-process invalidation is not needed here — SQLite WAL handles concurrent access,
  and within a single render frame (the main perf concern), the cache eliminates redundant queries

### What stays the same:
- Stats threading (step 2) — still fully applicable, eliminates redundant `loadSessions()` calls
- ReportsView threading (step 3) — still applicable
- app.tsx merge (step 4) — still applicable
- CalendarView (step 5) — low priority, skipped
