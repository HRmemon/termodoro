# Fix Plan: I2, I4, I5 — Type Safety & Config Fixes

---

## I2 — Inline module imports in `source/types.ts`

### Affected lines
- Line 36: `sounds: import('./lib/sounds.js').SoundConfig;`
- Line 44: `keybindings?: import('./lib/keymap.js').KeybindingConfig;`

### What is wrong
Inline `import(...)` expressions inside an interface property type are valid TypeScript
but are non-standard style for a central types file. They create implicit, hidden
dependencies inside the body of the interface instead of making them visible at the
top of the file. This makes the module's dependency surface harder to audit, prevents
IDE "go to import" navigation from working cleanly, and is inconsistent with every
other type reference in the file (all others resolve from the same module or are
self-contained).

### Current code

```typescript
// source/types.ts  (lines 35-45)
export interface Config {
  // ...
  sounds: import('./lib/sounds.js').SoundConfig;
  // ...
  keybindings?: import('./lib/keymap.js').KeybindingConfig;
  // ...
}
```

### Proposed fix

Add two `import type` statements at the top of `source/types.ts` and replace the
inline expressions with the named types.

```typescript
// Add at top of source/types.ts (after any existing imports, before first export)
import type { SoundConfig } from './lib/sounds.js';
import type { KeybindingConfig } from './lib/keymap.js';

// Then update the Config interface:
export interface Config {
  // ...
  sounds: SoundConfig;
  // ...
  keybindings?: KeybindingConfig;
  // ...
}
```

Note: `source/lib/keymap.ts` already imports `Config` from `types.ts` via
`import type { Config } from '../types.js'`. Using a plain (non-type) import of
`KeybindingConfig` back into `types.ts` would create a circular dependency at the
value level. Because both directions use `import type`, the cycle exists only at the
type level and TypeScript handles it correctly — no runtime issue arises. If the
circular reference is still considered undesirable, the alternative is to move
`KeybindingConfig` into `types.ts` directly and have `keymap.ts` import it from
there.

---

## I4 — Unchecked type assertions for daemon protocol

### Affected locations
| File | Line | Assertion |
|------|------|-----------|
| `source/daemon/server.ts` | 290 | `JSON.parse(line) as DaemonCommand` |
| `source/daemon/client.ts` | 40  | `JSON.parse(line) as DaemonResponse` |
| `source/daemon/client.ts` | 95  | `msg as DaemonResponse` |
| `source/daemon/client.ts` | 101 | `msg as DaemonEvent` |

### What is wrong
All four sites cast the result of `JSON.parse` (which is `any`) directly to a
protocol type using `as`. This is a "trust me" assertion — TypeScript will not check
it at runtime. Malformed or unexpected data from the socket will silently pass
through and either crash later with a confusing error or produce incorrect behaviour.
In particular:

- `server.ts:290` — A client sending a bad `cmd` field will bypass the discriminated
  union's safety and reach command dispatch with an invalid payload.
- `client.ts:40` — A malformed daemon response in `sendCommand` resolves the promise
  with garbage data, which callers may dereference without checking.
- `client.ts:95,101` — Inside the subscription handler, a message that has neither
  `ok` nor `event` is silently dropped (the `if` branches just don't match), but a
  message that has `ok` but is actually malformed will call `resp.state` which could
  be `undefined`, crashing `callbacks.onState`.

### Proposed fix

Write a lightweight runtime validator (type guard) for each protocol shape and use
them before asserting. Full Zod/io-ts schema validation is not warranted here; simple
structural checks suffice.

#### 1. Add type guards to `source/daemon/protocol.ts`

```typescript
// source/daemon/protocol.ts — append after existing exports

/** Narrow an unknown JSON value to DaemonCommand. */
export function isDaemonCommand(v: unknown): v is DaemonCommand {
  if (typeof v !== 'object' || v === null) return false;
  const cmd = (v as Record<string, unknown>).cmd;
  return typeof cmd === 'string' && cmd.length > 0;
}

/** Narrow an unknown JSON value to DaemonResponse. */
export function isDaemonResponse(v: unknown): v is DaemonResponse {
  if (typeof v !== 'object' || v === null) return false;
  return 'ok' in (v as object);
}

/** Narrow an unknown JSON value to DaemonEvent. */
export function isDaemonEvent(v: unknown): v is DaemonEvent {
  if (typeof v !== 'object' || v === null) return false;
  return 'event' in (v as object);
}
```

These guards are intentionally minimal: they verify the structural discriminant
(`cmd`, `ok`, `event`) that downstream code branches on. They do not exhaustively
validate every field — that would duplicate the type definitions. The key benefit is
that invalid messages are rejected at the boundary rather than passed along.

#### 2. Update `source/daemon/server.ts` line 290

```typescript
// Before (line 289-290):
try {
  const cmd = JSON.parse(line) as DaemonCommand;

// After:
import { isDaemonCommand } from './protocol.js'; // add to existing import at top

try {
  const parsed: unknown = JSON.parse(line);
  if (!isDaemonCommand(parsed)) {
    send(socket, { ok: false, error: 'Invalid command format' });
    continue;
  }
  const cmd = parsed; // type is now DaemonCommand via the guard
```

#### 3. Update `source/daemon/client.ts` line 40 (`sendCommand`)

```typescript
// Add isDaemonResponse to the existing protocol import at line 3.
import type { DaemonCommand, DaemonResponse, DaemonEvent } from './protocol.js';
import { DAEMON_SOCKET_PATH, DAEMON_PID_PATH, isDaemonResponse } from './protocol.js';

// Replace lines 39-42:
// Before:
  resolve(JSON.parse(line) as DaemonResponse);

// After:
  const parsed: unknown = JSON.parse(line);
  if (!isDaemonResponse(parsed)) {
    reject(new Error('Malformed response from daemon'));
    return;
  }
  resolve(parsed);
```

#### 4. Update `source/daemon/client.ts` lines 92-105 (subscription handler)

```typescript
// Add isDaemonResponse, isDaemonEvent to the import above.

// Replace the try block (lines 91-109):
try {
  const msg: unknown = JSON.parse(line);
  if (isDaemonResponse(msg)) {
    // Initial state response from subscribe
    if (msg.ok) {
      this.callbacks.onState(msg.state);
    }
  } else if (isDaemonEvent(msg)) {
    // Event broadcast
    if (msg.event === 'tick' || msg.event === 'state:change') {
      this.callbacks.onState(msg.data as EngineFullState);
    }
    this.callbacks.onEvent(msg.event, msg.data);
  }
} catch {
  // Skip malformed messages
}
```

Note: `msg.data as EngineFullState` on tick/state:change events remains an assertion
because `DaemonEvent.data` is typed `unknown` by design (different events carry
different payloads). This is acceptable — validating the full `EngineFullState` shape
at runtime would be disproportionate. If stricter safety is wanted later, a
`isEngineFullState` guard can be added.

---

## I5 — Missing `package.json` fields

### What is wrong
The `package.json` is missing four fields that are expected for a publishable or
reliably installable Node.js package:

| Field | Why it matters |
|-------|----------------|
| `engines` | Without it, npm/yarn will happily install on Node 14/16 even though the codebase uses `node:` imports, top-level await patterns, and other Node 18+ features, leading to cryptic runtime errors. |
| `license` | npm registry and tooling (Dependabot, license-checker) treat an absent `license` field as "unlicensed". |
| `files` | Without it, `npm pack` / `npm publish` includes everything (source, tmp_reports, tsconfig, etc.). Only `dist/` and the bin entry should ship. |
| `test` script | The default `npm test` inherited from npm init emits a non-zero exit with an error message. CI pipelines that run `npm test` will fail or emit noise. |

### Current `package.json` (relevant sections)

```json
{
  "name": "pomodorocli",
  "version": "1.0.0",
  "scripts": {
    "build": "tsc",
    "dev": "tsx source/cli.tsx",
    "dev:daemon": "tsx source/cli.tsx daemon start",
    "start": "node dist/cli.js",
    "daemon": "node dist/cli.js daemon start"
  }
}
```

### Proposed fix

```json
{
  "name": "pomodorocli",
  "version": "1.0.0",
  "description": "Terminal-first Pomodoro + productivity system",
  "license": "MIT",
  "engines": {
    "node": ">=18.0.0"
  },
  "files": [
    "dist"
  ],
  "scripts": {
    "build": "tsc",
    "dev": "tsx source/cli.tsx",
    "dev:daemon": "tsx source/cli.tsx daemon start",
    "start": "node dist/cli.js",
    "daemon": "node dist/cli.js daemon start",
    "test": "echo \"No test suite yet\" && exit 0"
  }
}
```

Notes:
- `"license": "MIT"` assumes MIT intent; replace with the actual SPDX identifier if
  different. A `LICENSE` file should be added alongside this change.
- `"files": ["dist"]` is intentionally minimal. If the package is not meant for npm
  publishing (personal/local tool only), `files` can be omitted, but `engines` and
  `license` are still worthwhile.
- The `test` script uses `exit 0` so CI does not break. Once a test runner is added
  (e.g. Vitest), replace the placeholder with the real command.
- Node 18 is the minimum because: `node:` protocol imports require Node 14.18+,
  `fs.existsSync` with `AbortSignal` and other APIs used here are stable at 18, and
  Node 18 is the oldest LTS still receiving security patches as of this writing.

---

## Summary of changes

| Issue | File(s) | Change type |
|-------|---------|-------------|
| I2 | `source/types.ts` | Add 2 top-level `import type` statements; remove 2 inline imports |
| I4 | `source/daemon/protocol.ts` | Add 3 type guard functions |
| I4 | `source/daemon/server.ts` | Replace bare `as DaemonCommand` with guard + error response |
| I4 | `source/daemon/client.ts` | Replace 3 bare assertions with guard-based narrowing |
| I5 | `package.json` | Add `engines`, `license`, `files`, `test` script |

---

## Plan Adjustments

- **I4 server.ts skipped**: The plan referenced `server.ts:290` having `JSON.parse(line) as DaemonCommand`, but this was already fixed in a prior commit (B1: daemon command validation). The server now uses `validateCommand(parsed)` which performs runtime validation. No changes needed in server.ts.
- **I4 protocol.ts**: Only added `isDaemonResponse` and `isDaemonEvent` guards (not `isDaemonCommand`) since the server already validates commands via `validateCommand`.
- **I4 client.ts**: Removed unused `DaemonEvent` type import since the type guard makes the explicit `as DaemonEvent` cast unnecessary.
