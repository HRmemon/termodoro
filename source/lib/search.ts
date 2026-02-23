import type { Session, SessionType, SessionStatus, EnergyLevel } from '../types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SearchQuery {
  text?: string;
  project?: string;
  tag?: string;
  dateFrom?: string;
  dateTo?: string;
  type?: SessionType;
  status?: SessionStatus;
  energyLevel?: EnergyLevel;
  minDuration?: number;
  maxDuration?: number;
}

// ---------------------------------------------------------------------------
// parseSearchString
// ---------------------------------------------------------------------------

/**
 * Parses a query string with optional key:value tokens.
 *
 * Supported tokens:
 *   project:<name>   tag:<name>   type:<work|short-break|long-break>
 *   status:<completed|skipped|abandoned>   energy:<high|medium|low>
 *   after:<YYYY-MM-DD>   before:<YYYY-MM-DD>
 *   min:<minutes>   max:<minutes>
 *
 * Any remaining words become a free-text search against label/project/tag.
 *
 * Example: "project:myapp tag:bugfix after:2024-01-01 fix auth"
 */
export function parseSearchString(input: string): SearchQuery {
  const query: SearchQuery = {};
  const freeTextParts: string[] = [];

  // Tokenize on whitespace but keep quoted strings together
  const tokens = input.match(/"[^"]*"|'[^']*'|\S+/g) ?? [];

  for (const token of tokens) {
    const colonIdx = token.indexOf(':');
    if (colonIdx > 0) {
      const key = token.slice(0, colonIdx).toLowerCase();
      const value = token.slice(colonIdx + 1).replace(/^["']|["']$/g, '');

      switch (key) {
        case 'project':
          query.project = value;
          break;
        case 'tag':
          query.tag = value;
          break;
        case 'type':
          if (value === 'work' || value === 'short-break' || value === 'long-break') {
            query.type = value;
          }
          break;
        case 'status':
          if (value === 'completed' || value === 'skipped' || value === 'abandoned') {
            query.status = value;
          }
          break;
        case 'energy':
          if (value === 'high' || value === 'medium' || value === 'low') {
            query.energyLevel = value;
          }
          break;
        case 'after':
          query.dateFrom = value;
          break;
        case 'before':
          query.dateTo = value;
          break;
        case 'min':
          query.minDuration = parseInt(value, 10);
          break;
        case 'max':
          query.maxDuration = parseInt(value, 10);
          break;
        default:
          // Unknown key:value — treat as free text
          freeTextParts.push(token);
          break;
      }
    } else {
      freeTextParts.push(token);
    }
  }

  const freeText = freeTextParts.join(' ').trim();
  if (freeText.length > 0) {
    query.text = freeText;
  }

  return query;
}

// ---------------------------------------------------------------------------
// searchSessions
// ---------------------------------------------------------------------------

export function searchSessions(sessions: Session[], query: SearchQuery): Session[] {
  return sessions.filter(s => matchesQuery(s, query));
}

function matchesQuery(s: Session, q: SearchQuery): boolean {
  // Free-text: search label, project, tag (case-insensitive)
  if (q.text !== undefined && q.text.length > 0) {
    const needle = q.text.toLowerCase();
    const haystack = [s.label, s.project, s.tag].filter(Boolean).join(' ').toLowerCase();
    if (!haystack.includes(needle)) return false;
  }

  if (q.project !== undefined) {
    if (!s.project || !s.project.toLowerCase().includes(q.project.toLowerCase())) return false;
  }

  if (q.tag !== undefined) {
    if (!s.tag || !s.tag.toLowerCase().includes(q.tag.toLowerCase())) return false;
  }

  if (q.type !== undefined) {
    if (s.type !== q.type) return false;
  }

  if (q.status !== undefined) {
    if (s.status !== q.status) return false;
  }

  if (q.energyLevel !== undefined) {
    if (s.energyLevel !== q.energyLevel) return false;
  }

  // Date range (compare ISO date prefixes)
  if (q.dateFrom !== undefined) {
    if (s.startedAt.slice(0, 10) < q.dateFrom) return false;
  }

  if (q.dateTo !== undefined) {
    if (s.startedAt.slice(0, 10) > q.dateTo) return false;
  }

  // Duration in minutes (durationActual is in seconds)
  const actualMinutes = s.durationActual / 60;

  if (q.minDuration !== undefined) {
    if (actualMinutes < q.minDuration) return false;
  }

  if (q.maxDuration !== undefined) {
    if (actualMinutes > q.maxDuration) return false;
  }

  return true;
}
