import type {DaemonCommand} from './protocol.js';

const SIMPLE_COMMANDS = new Set([
	'start', 'pause', 'resume', 'toggle', 'skip', 'reset', 'abandon',
	'status', 'clear-sequence', 'advance-session', 'switch-to-stopwatch',
	'stop-stopwatch', 'update-config', 'subscribe', 'ping', 'shutdown',
]);

export function validateCommand(obj: unknown): DaemonCommand | string {
	if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
		return 'Command must be a JSON object';
	}

	const raw = obj as Record<string, unknown>;

	if (typeof raw.cmd !== 'string') {
		return 'Missing or invalid "cmd" field';
	}

	const cmd = raw.cmd;

	if (SIMPLE_COMMANDS.has(cmd)) {
		return {cmd} as DaemonCommand;
	}

	switch (cmd) {
		case 'reset-log': {
			if (typeof raw.productive !== 'boolean')
				return '"reset-log" requires "productive" (boolean)';
			return {cmd: 'reset-log', productive: raw.productive};
		}

		case 'set-project': {
			if (typeof raw.project !== 'string')
				return '"set-project" requires "project" (string)';
			return {cmd: 'set-project', project: raw.project};
		}

		case 'set-label': {
			if (typeof raw.label !== 'string')
				return '"set-label" requires "label" (string)';
			return {cmd: 'set-label', label: raw.label};
		}

		case 'set-duration': {
			if (typeof raw.minutes !== 'number' || !Number.isFinite(raw.minutes))
				return '"set-duration" requires "minutes" (finite number)';
			if (raw.minutes <= 0 || raw.minutes > 180)
				return '"set-duration" requires "minutes" between 0 (exclusive) and 180 (inclusive)';
			return {cmd: 'set-duration', minutes: raw.minutes};
		}

		case 'activate-sequence': {
			if (typeof raw.name !== 'string' || raw.name.length === 0)
				return '"activate-sequence" requires "name" (non-empty string)';
			return {cmd: 'activate-sequence', name: raw.name};
		}

		case 'activate-sequence-inline': {
			if (typeof raw.definition !== 'string' || raw.definition.length === 0)
				return '"activate-sequence-inline" requires "definition" (non-empty string)';
			return {cmd: 'activate-sequence-inline', definition: raw.definition};
		}

		default:
			return `Unknown command: "${cmd}"`;
	}
}
