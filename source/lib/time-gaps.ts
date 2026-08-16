export const TIMER_SUSPEND_GAP_MS = 10_000;
export const BROWSER_EVENT_GAP_MS = 5 * 60 * 1000;

export function gapExceeds(previousTimestamp: number, now: number, limitMs: number): boolean {
  return previousTimestamp > 0 && now - previousTimestamp > limitMs;
}
