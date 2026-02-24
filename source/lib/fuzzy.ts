/**
 * Simple fuzzy matching: checks if all characters of `query` appear in order in `target`.
 * Returns null if no match, or a score (lower = better) if matched.
 */
export function fuzzyMatch(query: string, target: string): number | null {
  const q = query.toLowerCase();
  const t = target.toLowerCase();

  if (q.length === 0) return 0;
  if (q.length > t.length) return null;

  let qi = 0;
  let score = 0;
  let lastMatchIdx = -1;

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      // Penalize gaps between matched characters
      if (lastMatchIdx >= 0) {
        score += ti - lastMatchIdx - 1;
      }
      // Bonus for matching at word boundaries
      if (ti === 0 || t[ti - 1] === ' ' || t[ti - 1] === '/' || t[ti - 1] === '-' || t[ti - 1] === '_') {
        score -= 2;
      }
      lastMatchIdx = ti;
      qi++;
    }
  }

  // All query chars must be matched
  if (qi < q.length) return null;

  // Add penalty for target length (prefer shorter matches)
  score += Math.floor(t.length / 10);

  return score;
}

/** Fuzzy match against multiple fields, return best score or null */
export function fuzzyMatchAny(query: string, ...targets: (string | undefined)[]): number | null {
  let best: number | null = null;
  for (const t of targets) {
    if (!t) continue;
    const score = fuzzyMatch(query, t);
    if (score !== null && (best === null || score < best)) {
      best = score;
    }
  }
  return best;
}
