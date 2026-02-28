import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { spawn } from 'node:child_process';

const HOOKS_DIR = path.join(os.homedir(), '.config', 'pomodorocli', 'hooks');
const LOG_PATH = path.join(os.homedir(), '.local', 'share', 'pomodorocli', 'hooks.log');

function appendLog(message: string): void {
  try {
    const timestamp = new Date().toISOString();
    fs.appendFileSync(LOG_PATH, `[${timestamp}] ${message}\n`);
  } catch { /* ignore */ }
}

function flattenData(data: Record<string, unknown>, prefix = 'POMODORO'): Record<string, string> {
  const env: Record<string, string> = {};

  for (const [key, value] of Object.entries(data)) {
    if (value === null || value === undefined) continue;

    const envKey = `${prefix}_${key.replace(/([A-Z])/g, '_$1').toUpperCase()}`
      .replace(/_{2,}/g, '_');

    if (typeof value === 'object' && !Array.isArray(value)) {
      const nested = flattenData(value as Record<string, unknown>, envKey);
      Object.assign(env, nested);
    } else {
      env[envKey] = String(value);
    }
  }

  return env;
}

// Only forward env vars that hooks legitimately need (notifications, audio, display).
// Excludes credentials like SSH_AUTH_SOCK, AWS_*, GITHUB_TOKEN, npm_*, etc.
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

export function executeHook(hookName: string, data: Record<string, unknown>): void {
  // Validate hookName to prevent path traversal
  if (!/^[a-z0-9-]+$/.test(hookName)) return;

  const scriptPath = path.join(HOOKS_DIR, `${hookName}.sh`);

  try {
    if (!fs.existsSync(scriptPath)) return;
    const stat = fs.statSync(scriptPath);
    if (!stat.isFile()) return;
  } catch {
    return;
  }

  const env = buildHookEnv(data);

  appendLog(`Executing hook: ${hookName}`);

  try {
    const child = spawn('bash', [scriptPath], {
      env,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let exited = false;

    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('close', (code) => {
      exited = true;
      if (stdout.trim()) appendLog(`  [${hookName}] stdout: ${stdout.trim()}`);
      if (stderr.trim()) appendLog(`  [${hookName}] stderr: ${stderr.trim()}`);
      if (code !== 0) appendLog(`  [${hookName}] exited with code ${code}`);
    });

    child.on('error', (err) => {
      exited = true;
      appendLog(`  [${hookName}] error: ${err.message}`);
    });

    // Kill after 5 seconds — only if the child hasn't already exited
    setTimeout(() => {
      if (exited) return;
      try {
        // Send SIGTERM first, then SIGKILL after 1s grace
        if (child.pid) {
          process.kill(-child.pid, 'SIGTERM');
          setTimeout(() => {
            if (exited) return;
            try {
              process.kill(-child.pid!, 'SIGKILL');
            } catch { /* already exited */ }
          }, 1000);
          appendLog(`  [${hookName}] killed after 5s timeout`);
        }
      } catch { /* already exited */ }
    }, 5000);

    // Unref so the daemon doesn't wait for hook completion
    child.unref();
  } catch (err) {
    appendLog(`  [${hookName}] spawn error: ${err}`);
  }
}
