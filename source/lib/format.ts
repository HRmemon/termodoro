/**
 * Format a duration given in minutes into a human-readable string.
 *
 * - Input <= 0  -> "0m"
 * - Input < 60  -> "Xm"      e.g. "45m"
 * - Input >= 60 -> "Xh Ym"   e.g. "2h 30m"
 *                  or "Xh"   if remainder is 0  e.g. "3h"
 *
 * Fractional minutes are rounded to the nearest whole minute.
 */
export function formatMinutes(minutes: number): string {
	if (minutes < 1) return '0m';
	if (minutes >= 60) {
		const h = Math.floor(minutes / 60);
		const m = Math.round(minutes % 60);
		return m > 0 ? `${h}h ${m}m` : `${h}h`;
	}
	return `${Math.round(minutes)}m`;
}

/**
 * Format a duration given in seconds into a human-readable string.
 * Converts to minutes (floor) then delegates to formatMinutes.
 *
 * e.g. 3661 seconds -> "1h 1m"
 */
export function formatSeconds(seconds: number): string {
	return formatMinutes(Math.floor(seconds / 60));
}

/**
 * Format fractional hours into a compact string.
 * Uses no space between hours and minutes components ("2h30m").
 * Kept separate because TrackerView intentionally uses this compact style.
 *
 * - h === 0         -> "0h"
 * - h < 1           -> "Xm"    e.g. "45m"
 * - h >= 1, rem > 0 -> "XhYm"  e.g. "2h30m"  (no space)
 * - h >= 1, rem = 0 -> "Xh"    e.g. "3h"
 */
export function formatHours(h: number): string {
	if (h === 0) return '0h';
	if (h < 1) return `${Math.floor(h * 60)}m`;
	const whole = Math.floor(h);
	const mins = Math.round((h - whole) * 60);
	return mins > 0 ? `${whole}h${mins}m` : `${whole}h`;
}
