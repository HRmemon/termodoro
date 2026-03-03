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

export function parseTimeInput(input: string, compact: boolean): string | null {
  const trimmed = input.trim().toLowerCase();
  
  // Try 12-hour format with AM/PM (e.g., "2:30 pm", "2:30pm", "2pm")
  const ampmMatch = trimmed.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
  if (ampmMatch) {
    let h = parseInt(ampmMatch[1]!, 10);
    const m = ampmMatch[2] ? parseInt(ampmMatch[2], 10) : 0;
    const isPm = ampmMatch[3] === 'pm';

    if (h >= 1 && h <= 12 && m >= 0 && m < 60) {
      if (isPm && h !== 12) h += 12;
      if (!isPm && h === 12) h = 0;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
    return null;
  }

  if (!compact) {
    // standard HH:MM
    if (/^\d{2}:\d{2}$/.test(trimmed)) return trimmed;
    return null;
  }
  
  // compact: digits only, 3 or 4 chars
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 3) {
    const h = '0' + digits[0];
    const m = digits[1] + digits[2];
    const candidate = `${h}:${m}`;
    if (parseInt(h) < 24 && parseInt(m) < 60) return candidate;
  }
  if (digits.length === 4) {
    const h = digits[0] + digits[1];
    const m = digits[2] + digits[3];
    const candidate = `${h}:${m}`;
    if (parseInt(h) < 24 && parseInt(m) < 60) return candidate;
  }
  
  return null;
}
