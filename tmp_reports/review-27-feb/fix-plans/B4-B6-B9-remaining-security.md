# Security Fix Plan: B4, B6, B7, B8, B9

## B4 - No validation of nvim-edited data (`source/lib/nvim-edit.ts`)

### Current Code

All `parse*` functions (`parseTasks`, `parseReminders`, `parseTracker`, `parseGoals`, `parseCalendarEvents`, `parseSessions`, `parseSequences`, `parseKeybindings`) accept arbitrary text returned from the editor and extract values using regex without bounds checking or type enforcement. Examples:

```typescript
// parseTasks - no length cap on text or title
const id = idMatch ? idMatch[1]! : nanoid();
result.push({ id, text: rest, ... });

// parseGoals - rateMax accepted as any integer
rateMax = parseInt(typeMatch[3]!, 10);

// parseCalendarEvents - frequency cast without validation
frequency = val as CalendarEvent['frequency'];

// parseSessions - no max length on label/project/tag
label: labelMatch ? labelMatch[1]!.trim() : undefined,
```

### Risk

- **Unbounded strings**: A user (or a compromised editor) could write a multi-megabyte label/title/text field. It gets stored in JSON and then loaded on every app startup, potentially causing OOM or very slow renders.
- **Invalid enum casts**: `frequency = val as CalendarEvent['frequency']` stores arbitrary strings like `"injected"` into the data file without validation. Same for tracker codes written into week slots.
- **Integer overflow / NaN persistence**: `parseInt` on a long digit string produces a large number. `rateMax`, `expectedPomodoros`, `repeatCount`, `distractionScore` have no range checks and get persisted.
- **ID poisoning**: A hand-crafted `%id:` value that contains unusual characters (whitespace, slashes) could confuse later lookups. The current `nanoid` pattern assumes IDs are `\S+`; a fabricated ID with spaces would be truncated unpredictably.
- **Severity**: Low-to-medium. This is a local tool — the attacker must already have shell access or control the editor. The main realistic harm is data corruption or app hang.

### Proposed Fix

Add a thin `sanitize.ts` validation layer in `source/lib/` and call it from each parse function before persisting.

**1. Field length caps (add to `source/lib/sanitize.ts`):**

```typescript
export const LIMITS = {
  SHORT_TEXT: 500,    // task text, title, goal name, note label
  LONG_TEXT: 10_000,  // session label, note body
  ID: 64,
  PROJECT: 100,
  POMODOROS: 200,     // reasonable upper bound
  RATING: 10,
  DISTRACTION: 10,
};

export function clampStr(s: string | undefined, max: number): string | undefined {
  if (s === undefined) return undefined;
  return s.slice(0, max);
}

export function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n) || isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}
```

**2. Validate enums explicitly:**

```typescript
// parseCalendarEvents
const VALID_FREQUENCIES: CalendarEvent['frequency'][] = ['once', 'daily', 'weekly', 'monthly', 'yearly'];
frequency = VALID_FREQUENCIES.includes(val as CalendarEvent['frequency'])
  ? (val as CalendarEvent['frequency'])
  : 'once';
```

Do the same for `energyLevel` in `parseSessions` (already partially done — extend to parseGoals `type`).

**3. Apply caps in each parser before pushing to result arrays:**

```typescript
// parseTasks example
result.push({
  id: clampStr(id, LIMITS.ID)!,
  text: clampStr(rest, LIMITS.SHORT_TEXT)!,
  project: clampStr(project, LIMITS.PROJECT),
  expectedPomodoros: clampInt(expectedPomodoros, 1, LIMITS.POMODOROS),
  completedPomodoros: clampInt(completedPomodoros, 0, LIMITS.POMODOROS),
  ...
});
```

**4. Validate `%id` format:**

```typescript
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const id = idMatch && ID_RE.test(idMatch[1]!) ? idMatch[1]! : nanoid();
```

**5. Cap total line / file size before parsing:**

```typescript
// At the top of parseAndSave():
if (text.length > 500_000) {
  // silently abort — do not overwrite good data with a bloated file
  return;
}
```

### Edge Cases

- Legitimate long task descriptions would be silently truncated at 500 chars. The current formatter does not enforce a cap either, so a user can already produce long lines. The cap just prevents runaway growth after manual edits.
- `clampInt` with `NaN` input should fall back to the minimum value, not 0, to avoid accidentally setting `expectedPomodoros` to 0 and making tasks unreachable.
- The stats view is read-only and has no `parse*` function — no change needed there.

---

## B6 - ReDoS in domain rule matching (`source/lib/tracker.ts:407-437`)

### Current Code

```typescript
export function matchDomain(domain: string, rules: DomainRule[]): string | null {
  for (const rule of rules) {
    if (rule.pattern.includes('/')) continue;
    const escaped = rule.pattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*');
    const regex = new RegExp(`^${escaped}$`, 'i');
    if (regex.test(domain)) return rule.category;
  }
  return null;
}
```

The glob-to-regex conversion escapes most metacharacters but then injects `.*` for `*`. A pattern such as `***a***a***a` after escaping becomes `^(.*)(.*)(.*)(a)(.*)(.*)(.*)(a)(.*)(.*)(.*)(a)$` which causes catastrophic backtracking when tested against a non-matching string.

### Risk

- Patterns are user-supplied via the tracker config file. A malicious or accidental pattern with multiple consecutive `*` characters causes the JS regex engine to backtrack exponentially.
- `matchUrl` and `matchDomain` are called once per web-activity slot during `generateWebSuggestions` (and during the live web view). On a large history import, thousands of domain strings are tested against each rule.
- **Severity**: Medium for local DoS (UI freeze / daemon hang). Not exploitable remotely.

### Proposed Fix

**Option A (preferred): Normalize consecutive wildcards before compiling.**

```typescript
function globToRegex(pattern: string): RegExp {
  // Collapse runs of * into a single * to prevent ReDoS
  const normalized = pattern.replace(/\*+/g, '*');
  const escaped = normalized
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '[^.]*');   // single-segment wildcard (no dot crossing)
  return new RegExp(`^${escaped}$`, 'i');
}
```

Using `[^.]*` instead of `.*` also makes the semantics more correct for domain matching: `*.example.com` should match `foo.example.com` but not `foo.bar.example.com`.

**Option B: Validate patterns at load time.**

When `loadTrackerConfigFull` reads `domainRules`, reject any pattern with more than one consecutive `*` or more than 4 total `*` characters. Log a warning to the console.

**Recommended**: Apply both. Normalize in `globToRegex` as the primary defence, and add a load-time warning so the user is informed their pattern is unusual.

**Updated `matchDomain` and `matchUrl`:**

```typescript
function globToRegex(pattern: string): RegExp {
  const normalized = pattern.replace(/\*+/g, '*');
  const escaped = normalized.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^.]*');
  return new RegExp(`^${escaped}$`, 'i');
}

export function matchDomain(domain: string, rules: DomainRule[]): string | null {
  for (const rule of rules) {
    if (rule.pattern.includes('/')) continue;
    if (globToRegex(rule.pattern).test(domain)) return rule.category;
  }
  return null;
}
```

**Compile once, not per-call (performance fix bundled in):**

Cache compiled regexes when rules are loaded rather than re-compiling on every call. Add a `compiledPattern?: RegExp` field to `DomainRule` or build a parallel array at load time in `generateWebSuggestions`.

### Edge Cases

- Existing patterns like `*.github.com` remain valid.
- A pattern `**` was previously equivalent to `.*` (match anything). After normalizing to `*` and converting to `[^.]` it would only match a single label. This is a behavior change — document it in the config comments.
- Path rules in `matchUrl` build two separate regexes; apply `globToRegex` to both `domainPattern` and `pathPattern` halves.

---

## B7 - Status file world-readable in /tmp (`source/daemon/status-writer.ts:8`)

### Current Code

```typescript
const STATUS_PATH = path.join(os.tmpdir(), 'pomodorocli-status.json');
// ...
const tmp = STATUS_PATH + '.tmp';
fs.writeFileSync(tmp, JSON.stringify(statusData, null, 2) + '\n');
fs.renameSync(tmp, STATUS_PATH);
```

`writeFileSync` uses the Node.js default umask, which is typically `0o666 & ~umask`. On most Linux systems with umask `0o022`, the resulting file is `0o644` — readable by all users on the machine.

### Risk

The status file contains: session type, seconds left, project name, session count, today's focus minutes, and Waybar display strings. This is low-sensitivity metadata but reveals working patterns to other users on a shared machine.

**Severity**: Low. On a personal machine this is a non-issue. On a multi-user system (university servers, shared workstations) it leaks productivity metadata.

### Proposed Fix

Set explicit `0o600` mode on both the temp write and ensure the rename preserves it. The cleanest way is to pass the `mode` option to `writeFileSync`:

```typescript
fs.writeFileSync(tmp, JSON.stringify(statusData, null, 2) + '\n', { mode: 0o600 });
fs.renameSync(tmp, STATUS_PATH);
```

Note: `rename` on Linux atomically replaces the target and preserves the permissions of the source file, so setting mode on the `.tmp` file is sufficient. On some systems `rename` from a different filesystem falls back to copy+delete, but since both paths are in `os.tmpdir()` this is not a concern.

**Also harden the existing file if it was created before this fix** (on daemon startup):

```typescript
export function initStatusFile(): void {
  try {
    if (fs.existsSync(STATUS_PATH)) {
      fs.chmodSync(STATUS_PATH, 0o600);
    }
  } catch { /* ignore */ }
}
```

Call `initStatusFile()` once from `server.ts` at daemon startup.

### Edge Cases

- Waybar reads the status file. Waybar runs as the same user, so `0o600` does not affect it.
- If the daemon runs as root (unusual), `0o600` still allows root read, which is expected.

---

## B8 - PID file permissions not restricted (`source/daemon/server.ts:349`)

### Current Code

```typescript
// DAEMON_PID_PATH = ~/.local/share/pomodorocli/daemon.pid  (0o644 default)
fs.writeFileSync(DAEMON_PID_PATH, String(process.pid));
try { fs.chmodSync(DAEMON_SOCKET_PATH, 0o600); } catch { /* ignore */ }
```

The socket is restricted to `0o600` but the PID file is written with default permissions (`0o644`).

### Risk

Other local users can read the PID file and send arbitrary signals (including `SIGKILL`) to the daemon process via `kill(2)`. They cannot do more than that because they lack write permission and the Unix socket is `0o600`. The risk is denial-of-service — another user could terminate someone's running timer session.

**Severity**: Low-to-medium on shared machines.

### Proposed Fix

Pass `mode: 0o600` to the `writeFileSync` call:

```typescript
fs.writeFileSync(DAEMON_PID_PATH, String(process.pid), { mode: 0o600 });
```

This is a one-line change. The `DAEMON_PID_PATH` is in `~/.local/share/...` which is already user-owned and typically `0o700`, so the file permission is a second layer of defence. Still correct to set explicitly.

### Edge Cases

- Nothing reads the PID file except the daemon itself (to detect stale PIDs). Restricting to `0o600` does not affect functionality.
- If the daemon is restarted and a stale PID file exists with `0o644`, the new `writeFileSync` with `0o600` will overwrite it and set the restrictive mode on the new file. The old world-readable file is replaced atomically.

---

## B9 - Hook scripts receive full `process.env` (`source/daemon/hooks.ts:50-53`)

### Current Code

```typescript
const env = {
  ...process.env,           // full daemon environment
  ...flattenData(data),     // POMODORO_* variables
};

spawn('bash', [scriptPath], { env, detached: true, ... });
```

The daemon's complete environment — including `PATH`, `HOME`, `DBUS_SESSION_BUS_ADDRESS`, `DISPLAY`, `WAYLAND_DISPLAY`, `SSH_AUTH_SOCK`, `GPG_AGENT_INFO`, `XDG_RUNTIME_DIR`, and any secret tokens stored as env vars — is forwarded to user-authored hook scripts.

### Risk

- **Credential leakage**: If the user (or a third party who added a hook) logs `env` in the hook script, all daemon secrets are captured. Hook scripts are plain `.sh` files that could be modified by any process with write access to `~/.config/pomodorocli/hooks/`.
- **Expanded attack surface**: A compromised hook script has the same ambient authority as the daemon. For example, it inherits `SSH_AUTH_SOCK` and could authenticate SSH connections.
- **Privilege escalation via path manipulation**: Inheriting `PATH` means the hook's commands resolve against the user's full path, which could be manipulated if the hook is not careful.
- **Severity**: Medium. The hooks are user-authored and run as the same user, so there is no privilege boundary crossed. The concern is belt-and-suspenders: the hook needs only timer data, not the full daemon environment.

### Proposed Fix

Build a minimal, explicit environment instead of spreading `process.env`:

```typescript
const SAFE_ENV_KEYS: ReadonlyArray<string> = [
  'PATH',
  'HOME',
  'USER',
  'LOGNAME',
  'LANG',
  'LC_ALL',
  'TERM',
  'DISPLAY',
  'WAYLAND_DISPLAY',
  'XDG_RUNTIME_DIR',
  'DBUS_SESSION_BUS_ADDRESS',
  // Notification tools need these:
  'XDG_DATA_DIRS',
  'XDG_CONFIG_HOME',
];

function buildHookEnv(data: Record<string, unknown>): Record<string, string> {
  const safe: Record<string, string> = {};
  for (const key of SAFE_ENV_KEYS) {
    const val = process.env[key];
    if (val !== undefined) safe[key] = val;
  }
  return { ...safe, ...flattenData(data) };
}
```

Replace the env construction in `executeHook`:

```typescript
const env = buildHookEnv(data);
spawn('bash', [scriptPath], { env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
```

**Why `DISPLAY` and `DBUS_*` are kept**: Common hook use-cases include sending desktop notifications (`notify-send`) and playing sounds, which require these variables. Excluding them would break the most popular hooks.

**What is excluded**: `SSH_AUTH_SOCK`, `GPG_AGENT_INFO`, `AWS_*`, `GITHUB_TOKEN`, `npm_*`, `CARGO_*`, and any other credential or build-tool env vars that the daemon may have inherited from the user's shell session.

### Edge Cases

- A hook that genuinely needs a custom env var (e.g., `MY_NOTIFY_URL`) can no longer rely on it being inherited. The user would need to hard-code it in the `.sh` script or source their profile. This is a minor usability trade-off worth documenting in the hooks README.
- `PATH` must remain in the allowlist or basic commands (`notify-send`, `paplay`, `curl`) will not be found.
- The `flattenData` output keys all begin with `POMODORO_` so there is no collision risk with the safe keys.
- On headless systems (servers), `DISPLAY` and `WAYLAND_DISPLAY` will be absent from `process.env` and will simply not appear in the hook env — no error.

---

## Summary Table

| ID | File | Change Complexity | Risk Level |
|----|------|-------------------|------------|
| B4 | `source/lib/nvim-edit.ts` + new `source/lib/sanitize.ts` | Medium — touch every parse function | Low-Medium |
| B6 | `source/lib/tracker.ts` | Small — replace glob conversion helper | Medium |
| B7 | `source/daemon/status-writer.ts` | Trivial — add `{ mode: 0o600 }` | Low |
| B8 | `source/daemon/server.ts` | Trivial — add `{ mode: 0o600 }` | Low-Medium |
| B9 | `source/daemon/hooks.ts` | Small — replace env spread with allowlist | Medium |

Recommended implementation order: B7 and B8 first (trivial, zero risk of regression), then B9, then B6, then B4 (most invasive).

---

## Plan Adjustments

1. **B8 already implemented**: `server.ts` already had `{ mode: 0o600 }` on both PID file writes (lines 405, 420). No changes needed.
2. **nvim-edit decomposed**: The plan referenced `source/lib/nvim-edit.ts` as a single file, but it was decomposed into `source/lib/nvim-edit/` directory (tasks.ts, reminders.ts, goals.ts, calendar.ts, sessions.ts, sequences.ts, tracker.ts, keybindings.ts, index.ts). Sanitization was applied to each individual parser file.
3. **B4 sanitize.ts**: Created at `source/lib/sanitize.ts` as planned. Applied to all parse functions across the decomposed nvim-edit modules.
4. **B6 path matching**: Added `pathGlobToRegex` using `[^/]*` instead of `[^.]*` for URL path segments, which is more semantically correct for path matching.
5. **File size guard**: Added to `parseAndSave()` in index.ts plus standalone nvim flows in `sessions.ts` and `sequences.ts`.
