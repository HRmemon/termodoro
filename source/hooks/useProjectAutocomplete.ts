import { useState, useMemo, useEffect, useCallback } from 'react';
import { getProjects } from '../lib/tasks.js';

export interface ProjectMenu {
  matches: string[];
  hashIdx?: number;
  partial: string;
}

interface UseProjectAutocompleteOptions {
  /** Full input string */
  input: string;
  /** Whether autocomplete is active */
  enabled: boolean;
  /** True for TasksView-style (parse after #), false for standalone field */
  hashAnchor?: boolean;
  /** Extra memo deps for refreshing the project list */
  refreshDeps?: unknown[];
}

export function useProjectAutocomplete({
  input,
  enabled,
  hashAnchor,
  refreshDeps = [],
}: UseProjectAutocompleteOptions) {
  const [suggestionIdx, setSuggestionIdx] = useState(0);

  const allProjects = useMemo(() => getProjects(), refreshDeps);

  const projectMenu = useMemo((): ProjectMenu | null => {
    if (!enabled) return null;

    if (hashAnchor) {
      const hashIdx = input.lastIndexOf('#');
      if (hashIdx < 0) return null;
      if (hashIdx > 0 && input[hashIdx - 1] !== ' ') return null;
      const afterHash = input.slice(hashIdx + 1);
      if (afterHash.includes(' ')) return null;
      const partial = afterHash.toLowerCase();
      const matches = allProjects.filter(p => p.toLowerCase().includes(partial));
      if (matches.length === 0) return null;
      if (matches.length === 1 && matches[0]!.toLowerCase() === partial) return null;
      return { hashIdx, partial: afterHash, matches };
    }

    // Standalone mode
    const partial = input.toLowerCase();
    if (!partial) return allProjects.length > 0 ? { matches: allProjects, partial: '' } : null;
    const matches = allProjects.filter(p => p.toLowerCase().includes(partial));
    if (matches.length === 0) return null;
    if (matches.length === 1 && matches[0]!.toLowerCase() === partial) return null;
    return { matches, partial: input };
  }, [enabled, input, allProjects, hashAnchor]);

  useEffect(() => {
    setSuggestionIdx(0);
  }, [projectMenu?.matches.length, projectMenu?.partial]);

  const navigateUp = useCallback(() => {
    setSuggestionIdx(i => Math.max(i - 1, 0));
  }, []);

  const navigateDown = useCallback(() => {
    if (!projectMenu) return;
    setSuggestionIdx(i => Math.min(i + 1, projectMenu.matches.length - 1));
  }, [projectMenu]);

  const selectedProject = projectMenu?.matches[suggestionIdx] ?? null;

  return {
    allProjects,
    projectMenu,
    suggestionIdx,
    setSuggestionIdx,
    navigateUp,
    navigateDown,
    selectedProject,
  };
}
