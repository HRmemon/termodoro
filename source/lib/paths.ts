import envPaths from 'env-paths';
import * as path from 'node:path';
import * as os from 'node:os';

const paths = envPaths('pomodorocli', { suffix: '' });

export const DATA_DIR = paths.data;
export const CONFIG_DIR = paths.config;
export const CACHE_DIR = paths.cache;

// Unix sockets should live in tmp or run dirs, not deep in AppData
export const DAEMON_SOCKET_PATH = path.join(os.tmpdir(), 'pomodorocli-daemon.sock');
export const DAEMON_PID_PATH = path.join(os.tmpdir(), 'pomodorocli-daemon.pid');
