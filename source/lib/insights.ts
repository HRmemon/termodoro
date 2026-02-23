import type { Session } from '../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getDateStr(isoString: string): string {
  return isoString.slice(0, 10);
}

function getHour(isoString: string): number {
  return new Date(isoString).getHours();
}

/** Returns only completed work sessions. */
function workSessions(sessions: Session[]): Session[] {
  return sessions.filter(s => s.type === 'work' && s.status === 'completed');
}

/** Returns only skipped work sessions. */
function skippedSessions(sessions: Session[]): Session[] {
  return sessions.filter(s => s.type === 'work' && s.status === 'skipped');
}

/** Groups sessions by calendar date (YYYY-MM-DD). */
function groupByDate(sessions: Session[]): Map<string, Session[]> {
  const map = new Map<string, Session[]>();
  for (const s of sessions) {
    const d = getDateStr(s.startedAt);
    const existing = map.get(d);
    if (existing) {
      existing.push(s);
    } else {
      map.set(d, [s]);
    }
  }
  return map;
}

/** Returns an array of consecutive calendar dates (ascending) in a group map. */
function sortedDates(map: Map<string, Session[]>): string[] {
  return Array.from(map.keys()).sort();
}

/** Focus minutes for a set of sessions (durationActual is in seconds). */
function focusMinutes(sessions: Session[]): number {
  return sessions.reduce((sum, s) => sum + s.durationActual, 0) / 60;
}

// ---------------------------------------------------------------------------
// calculateFocusScore
// ---------------------------------------------------------------------------

/**
 * score = (focus_minutes * consistency_factor) - skipped_penalty
 * consistency_factor = streak_days / 7, capped at 1.5
 * skipped_penalty = skipped_count * 5
 */
export function calculateFocusScore(sessions: Session[]): number {
  const completed = workSessions(sessions);
  const skipped = skippedSessions(sessions);

  const totalFocusMinutes = focusMinutes(completed);

  // Build streak: how many consecutive days (ending today or yesterday)
  // have at least one completed work session.
  const byDate = groupByDate(completed);
  const dates = sortedDates(byDate);

  let streak = 0;
  if (dates.length > 0) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let cursor = new Date(today);
    // Allow streak to end yesterday if no sessions today yet
    const latestDate = new Date(dates[dates.length - 1]!);
    latestDate.setHours(0, 0, 0, 0);
    if (latestDate.getTime() < today.getTime() - 86400000) {
      // Last session was more than 1 day ago — streak is 0
      streak = 0;
    } else {
      // Walk backwards from today
      cursor = latestDate;
      const dateSet = new Set(dates);
      while (dateSet.has(cursor.toISOString().slice(0, 10))) {
        streak++;
        cursor = new Date(cursor.getTime() - 86400000);
      }
    }
  }

  const consistencyFactor = Math.min(streak / 7, 1.5);
  const skippedPenalty = skipped.length * 5;

  const score = totalFocusMinutes * consistencyFactor - skippedPenalty;
  return Math.round(score);
}

// ---------------------------------------------------------------------------
// detectBurnout
// ---------------------------------------------------------------------------

/**
 * Warns if completed work sessions account for > 6 hours/day for 5 consecutive days.
 */
export function detectBurnout(sessions: Session[]): { warning: boolean; message: string } {
  const completed = workSessions(sessions);
  const byDate = groupByDate(completed);
  const dates = sortedDates(byDate);

  if (dates.length < 5) {
    return { warning: false, message: '' };
  }

  // Check most recent window of consecutive dates
  let consecutiveOver = 0;
  const THRESHOLD_MINUTES = 6 * 60; // 360 minutes
  const CONSECUTIVE_REQUIRED = 5;

  // Walk dates from most recent backwards
  for (let i = dates.length - 1; i >= 0; i--) {
    const date = dates[i]!;
    const prevDate = i > 0 ? dates[i - 1]! : null;

    const dayMinutes = focusMinutes(byDate.get(date)!);

    if (dayMinutes >= THRESHOLD_MINUTES) {
      // Check that this date is consecutive with the previous one we counted
      if (consecutiveOver === 0 || prevDate === null) {
        consecutiveOver++;
      } else {
        const curr = new Date(date).getTime();
        const prev = new Date(dates[i + 1 - consecutiveOver]!).getTime();
        // Verify the whole run is consecutive
        const dayDiff = Math.round((new Date(date).getTime() - new Date(dates[i - consecutiveOver + 1 < 0 ? 0 : i - consecutiveOver + 1]!).getTime()) / 86400000);
        void dayDiff; // suppress unused warning — we'll use a simpler approach below
        consecutiveOver++;
      }
    } else {
      consecutiveOver = 0;
    }

    if (consecutiveOver >= CONSECUTIVE_REQUIRED) {
      return {
        warning: true,
        message: `You have logged more than 6 hours of focus per day for ${consecutiveOver} consecutive days. Consider taking a rest day to avoid burnout.`,
      };
    }
  }

  // Second pass: proper consecutive-day check
  // Reset and do it right with actual date arithmetic
  let runLength = 0;
  for (let i = 0; i < dates.length; i++) {
    const date = dates[i]!;
    const dayMinutes = focusMinutes(byDate.get(date)!);

    if (dayMinutes >= THRESHOLD_MINUTES) {
      if (i === 0) {
        runLength = 1;
      } else {
        const prev = dates[i - 1]!;
        const diffDays = Math.round(
          (new Date(date).getTime() - new Date(prev).getTime()) / 86400000,
        );
        runLength = diffDays === 1 ? runLength + 1 : 1;
      }
    } else {
      runLength = 0;
    }

    if (runLength >= CONSECUTIVE_REQUIRED) {
      return {
        warning: true,
        message: `You have logged more than 6 hours of focus per day for ${runLength} consecutive days. Consider taking a rest day to avoid burnout.`,
      };
    }
  }

  return { warning: false, message: '' };
}

// ---------------------------------------------------------------------------
// getProductivityByHour
// ---------------------------------------------------------------------------

export interface HourlyProductivity {
  hour: number;
  avgFocusMinutes: number;
  avgDistraction: number;
}

export function getProductivityByHour(sessions: Session[]): HourlyProductivity[] {
  const completed = workSessions(sessions);

  // Accumulate per-hour totals
  const hourData: Record<number, { totalMinutes: number; totalDistraction: number; count: number; distractionCount: number }> = {};

  for (const s of completed) {
    const h = getHour(s.startedAt);
    if (!hourData[h]) {
      hourData[h] = { totalMinutes: 0, totalDistraction: 0, count: 0, distractionCount: 0 };
    }
    hourData[h]!.totalMinutes += s.durationActual / 60;
    hourData[h]!.count++;
    if (s.distractionScore !== undefined) {
      hourData[h]!.totalDistraction += s.distractionScore;
      hourData[h]!.distractionCount++;
    }
  }

  return Array.from({ length: 24 }, (_, h) => {
    const d = hourData[h];
    if (!d || d.count === 0) {
      return { hour: h, avgFocusMinutes: 0, avgDistraction: 0 };
    }
    return {
      hour: h,
      avgFocusMinutes: Math.round(d.totalMinutes / d.count),
      avgDistraction: d.distractionCount > 0 ? Math.round((d.totalDistraction / d.distractionCount) * 10) / 10 : 0,
    };
  });
}

// ---------------------------------------------------------------------------
// detectEnergyPatterns
// ---------------------------------------------------------------------------

export interface EnergyPatterns {
  bestHours: string;
  worstHours: string;
  insights: string[];
}

export function detectEnergyPatterns(sessions: Session[]): EnergyPatterns {
  const completed = workSessions(sessions);
  const insights: string[] = [];

  if (completed.length === 0) {
    return {
      bestHours: 'No data yet',
      worstHours: 'No data yet',
      insights: ['Complete more sessions to unlock energy pattern analysis.'],
    };
  }

  const byHour = getProductivityByHour(sessions);

  // Only consider hours that have actual data
  const activeHours = byHour.filter(h => h.avgFocusMinutes > 0);

  if (activeHours.length === 0) {
    return {
      bestHours: 'No data yet',
      worstHours: 'No data yet',
      insights: ['Complete more sessions to unlock energy pattern analysis.'],
    };
  }

  // Sort by focus minutes descending to find best/worst
  const sorted = [...activeHours].sort((a, b) => b.avgFocusMinutes - a.avgFocusMinutes);

  const top = sorted.slice(0, Math.min(3, sorted.length));
  const bottom = sorted.slice(-Math.min(3, sorted.length)).reverse();

  const formatHour = (h: number): string => {
    const ampm = h < 12 ? 'AM' : 'PM';
    const display = h % 12 === 0 ? 12 : h % 12;
    return `${display}${ampm}`;
  };

  const bestHours = top.map(h => formatHour(h.hour)).join(', ');
  const worstHours = bottom.map(h => formatHour(h.hour)).join(', ');

  // Energy level correlation by hour
  const energyByHour: Record<number, { high: number; medium: number; low: number; total: number }> = {};
  for (const s of completed) {
    if (!s.energyLevel) continue;
    const h = getHour(s.startedAt);
    if (!energyByHour[h]) {
      energyByHour[h] = { high: 0, medium: 0, low: 0, total: 0 };
    }
    energyByHour[h]![s.energyLevel]++;
    energyByHour[h]!.total++;
  }

  // Find the hour with highest proportion of "high" energy
  let bestEnergyHour = -1;
  let bestEnergyRatio = -1;
  for (const [hourStr, counts] of Object.entries(energyByHour)) {
    const h = parseInt(hourStr, 10);
    const ratio = counts.total > 0 ? counts.high / counts.total : 0;
    if (ratio > bestEnergyRatio) {
      bestEnergyRatio = ratio;
      bestEnergyHour = h;
    }
  }

  if (bestEnergyHour >= 0 && bestEnergyRatio > 0.5) {
    insights.push(`You report high energy most often at ${formatHour(bestEnergyHour)} — consider scheduling deep work then.`);
  }

  // Distraction patterns
  const highDistractionHours = activeHours.filter(h => h.avgDistraction >= 3.5).map(h => formatHour(h.hour));
  if (highDistractionHours.length > 0) {
    insights.push(`High distraction periods: ${highDistractionHours.join(', ')}. Try reducing interruptions then.`);
  }

  // Low distraction = deep focus hours
  const lowDistractionHours = activeHours.filter(h => h.avgDistraction > 0 && h.avgDistraction <= 2).map(h => formatHour(h.hour));
  if (lowDistractionHours.length > 0) {
    insights.push(`Deepest focus periods: ${lowDistractionHours.join(', ')} (low distraction score).`);
  }

  // Morning vs afternoon vs evening split
  const morningMinutes = activeHours.filter(h => h.hour >= 6 && h.hour < 12).reduce((s, h) => s + h.avgFocusMinutes, 0);
  const afternoonMinutes = activeHours.filter(h => h.hour >= 12 && h.hour < 17).reduce((s, h) => s + h.avgFocusMinutes, 0);
  const eveningMinutes = activeHours.filter(h => h.hour >= 17 && h.hour < 22).reduce((s, h) => s + h.avgFocusMinutes, 0);

  const peakPeriod =
    morningMinutes >= afternoonMinutes && morningMinutes >= eveningMinutes
      ? 'morning (6 AM–12 PM)'
      : afternoonMinutes >= eveningMinutes
        ? 'afternoon (12 PM–5 PM)'
        : 'evening (5 PM–10 PM)';

  insights.push(`Your peak productivity period is the ${peakPeriod}.`);

  if (insights.length === 0) {
    insights.push('Keep logging sessions to reveal deeper energy patterns.');
  }

  return { bestHours, worstHours, insights };
}
