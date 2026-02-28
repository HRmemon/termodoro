import { useState, useMemo } from 'react';
import { type Keymap, kmMatches } from '../lib/keymap.js';
import { spawnSync, spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Box, Text, useInput } from 'ink';
import { getBrowserStatsForDate, getBrowserStatsForRange, getPathPatternStats, generateHtmlReport } from '../lib/browser-stats.js';
import type { BrowserStats, DomainStats } from '../lib/browser-stats.js';
import { loadTrackerConfigFull } from '../lib/tracker.js';
import { loadConfig } from '../lib/config.js';
import { useFullScreen } from '../hooks/useFullScreen.js';
import { formatMinutes } from '../lib/format.js';

function getTodayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const ACTIVE_COLOR = 'magenta';
const AUDIBLE_COLOR = 'blue';

type Tab = 'domains' | 'pages';
type Range = 'day' | 'week' | 'month' | 'all';
const RANGES: Range[] = ['day', 'week', 'month', 'all'];

function getRangeDates(range: Range): { start: string; end: string; label: string } {
  const today = new Date();
  const end = dateStr(today);
  switch (range) {
    case 'day':
      return { start: end, end, label: 'Today' };
    case 'week': {
      const d = new Date(today);
      const day = d.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      d.setDate(d.getDate() + diff);
      return { start: dateStr(d), end, label: 'This Week' };
    }
    case 'month': {
      const d = new Date(today.getFullYear(), today.getMonth(), 1);
      return { start: dateStr(d), end, label: 'This Month' };
    }
    case 'all':
      return { start: '2000-01-01', end, label: 'All Time' };
  }
}

export function WebView({ keymap }: { keymap?: Keymap }) {
  const [tab, setTab] = useState<Tab>('domains');
  const [scrollOffset, setScrollOffset] = useState(0);
  const [range, setRange] = useState<Range>('day');
  const [reportError, setReportError] = useState<string | null>(null);
  const { rows } = useFullScreen();

  const appConfig = useMemo(() => loadConfig(), []);
  const domainLimit = Math.max(10, appConfig.webDomainLimit ?? 50);

  const { start, end } = useMemo(() => getRangeDates(range), [range]);

  const stats: BrowserStats | null = useMemo(() => {
    if (range === 'day') {
      return getBrowserStatsForDate(getTodayString());
    }
    return getBrowserStatsForRange(start, end);
  }, [range, start, end]);

  // Merge path-pattern entries into domains for non-day ranges
  const mergedStats: BrowserStats | null = useMemo(() => {
    if (!stats) return null;
    const config = loadTrackerConfigFull();
    const pathPatterns = config.domainRules
      .filter(r => r.pattern.includes('/'))
      .map(r => r.pattern);
    if (pathPatterns.length === 0) return stats;

    const pathStats = getPathPatternStats(start, end, pathPatterns);
    if (pathStats.length === 0) return stats;

    // Merge path stats after the whole-domain entries
    const merged: DomainStats[] = [...stats.domains];
    for (const ps of pathStats) {
      // Only add if not already represented as a domain
      if (!merged.find(d => d.domain === ps.domain)) {
        merged.push(ps);
      }
    }
    merged.sort((a, b) => b.totalMinutes - a.totalMinutes);

    return { ...stats, domains: merged };
  }, [stats, start, end]);

  // For TUI display, limit domains/pages using configurable domainLimit
  const displayStats: BrowserStats | null = useMemo(() => {
    if (!mergedStats) return null;
    return {
      ...mergedStats,
      domains: mergedStats.domains.slice(0, domainLimit),
      topPaths: mergedStats.topPaths.slice(0, 10),
    };
  }, [mergedStats, domainLimit]);

  useInput((input, key) => {
    const km = keymap;
    if (key.tab || input === '\t') {
      setTab(prev => prev === 'domains' ? 'pages' : 'domains');
      setScrollOffset(0);
      return;
    }
    if (kmMatches(km, 'nav.left', input, key)) {
      setRange(prev => {
        const idx = RANGES.indexOf(prev);
        return RANGES[Math.max(0, idx - 1)]!;
      });
      setScrollOffset(0);
      return;
    }
    if (kmMatches(km, 'nav.right', input, key)) {
      setRange(prev => {
        const idx = RANGES.indexOf(prev);
        return RANGES[Math.min(RANGES.length - 1, idx + 1)]!;
      });
      setScrollOffset(0);
      return;
    }
    if (input === 'R') {
      const config = loadTrackerConfigFull();
      const html = generateHtmlReport(start, end, config.domainRules);
      if (html) {
        const tmpPath = path.join(os.tmpdir(), `pomodorocli-web-report-${Date.now()}.html`);
        fs.writeFileSync(tmpPath, html);
        // Try multiple browser openers in order (which is sync, but open is async+detached)
        const openers = ['xdg-open', 'open', 'sensible-browser'];
        let opened = false;
        for (const opener of openers) {
          const which = spawnSync('which', [opener], { stdio: 'ignore' });
          if (which.status === 0) {
            spawn(opener, [tmpPath], { detached: true, stdio: 'ignore' }).unref();
            opened = true;
            break;
          }
        }
        if (!opened) {
          setReportError(`Report saved to: ${tmpPath} (no browser opener found)`);
          setTimeout(() => setReportError(null), 5000);
        }
      }
      return;
    }
    if ((kmMatches(km, 'nav.down', input, key)) || key.downArrow) {
      setScrollOffset(prev => prev + 1);
    }
    if ((kmMatches(km, 'nav.up', input, key)) || key.upArrow) {
      setScrollOffset(prev => Math.max(0, prev - 1));
    }
  });

  if (!displayStats || displayStats.totalMinutes === 0) {
    return (
      <Box flexDirection="column" flexGrow={1}>
        <RangeBar range={range} />
        <Box marginBottom={1}>
          <Text dimColor>No browser data for this period.</Text>
        </Box>
        <Text dimColor>Make sure the Firefox extension is loaded and the native host is running.</Text>
        <Text dimColor>Run `pomodorocli track` to set up, then reload the extension.</Text>
        {reportError && (
          <Box marginTop={1}>
            <Text color="cyan">{reportError}</Text>
          </Box>
        )}
      </Box>
    );
  }

  const maxRows = Math.max(5, rows - 12);

  return (
    <Box flexDirection="column" flexGrow={1}>
      {/* Range selector */}
      <RangeBar range={range} />

      {/* Summary bar */}
      <Box marginBottom={1}>
        <Text dimColor>Active </Text>
        <Text bold color={ACTIVE_COLOR}>{formatMinutes(displayStats.activeMinutes)}</Text>
        <Text dimColor>  Audible </Text>
        <Text bold color={AUDIBLE_COLOR}>{formatMinutes(displayStats.audibleMinutes)}</Text>
        <Text dimColor>  Total </Text>
        <Text bold>{formatMinutes(displayStats.totalMinutes)}</Text>
      </Box>

      {/* Tab selector */}
      <Box marginBottom={1}>
        <Text
          bold={tab === 'domains'}
          color={tab === 'domains' ? 'magenta' : 'gray'}
          underline={tab === 'domains'}
        >
          Domains
        </Text>
        <Text dimColor>  </Text>
        <Text
          bold={tab === 'pages'}
          color={tab === 'pages' ? 'magenta' : 'gray'}
          underline={tab === 'pages'}
        >
          Top Pages
        </Text>
        <Text dimColor>    Tab:switch  R:report</Text>
      </Box>

      {tab === 'domains' && (
        <DomainsTab stats={displayStats} scrollOffset={scrollOffset} maxRows={maxRows} />
      )}
      {tab === 'pages' && (
        <PagesTab stats={displayStats} scrollOffset={scrollOffset} maxRows={maxRows} />
      )}
      {reportError && (
        <Box marginTop={1}>
          <Text color="cyan">{reportError}</Text>
        </Box>
      )}
    </Box>
  );
}

function RangeBar({ range }: { range: Range }) {
  const labels: { key: Range; label: string }[] = [
    { key: 'day', label: 'Today' },
    { key: 'week', label: 'Week' },
    { key: 'month', label: 'Month' },
    { key: 'all', label: 'All' },
  ];
  return (
    <Box marginBottom={1}>
      {labels.map((item, i) => (
        <Text key={item.key}>
          {i > 0 ? '  ' : ''}
          <Text bold={range === item.key} color={range === item.key ? 'magenta' : 'gray'}>
            {range === item.key ? `[${item.label}]` : ` ${item.label} `}
          </Text>
        </Text>
      ))}
      <Text dimColor>    h/l:range</Text>
    </Box>
  );
}

function DomainsTab({ stats, scrollOffset, maxRows }: { stats: BrowserStats; scrollOffset: number; maxRows: number }) {
  const domains = stats.domains;
  const visible = domains.slice(scrollOffset, scrollOffset + maxRows);

  const domW = 20;
  const barW = 28;
  const actW = 8;
  const audW = 8;
  const globalMax = Math.max(...visible.map(d => d.totalMinutes), 1);

  return (
    <Box flexDirection="column">
      {/* Header */}
      <Box>
        <Box width={domW}><Text dimColor bold>Domain</Text></Box>
        <Box width={barW + 1}><Text dimColor> █ active ░ audible</Text></Box>
        <Box width={actW}><Text dimColor bold>{'Active'.padStart(actW)}</Text></Box>
        <Box width={audW}><Text dimColor bold>{'Audible'.padStart(audW)}</Text></Box>
        <Text dimColor bold>  Total</Text>
      </Box>
      {visible.map(d => {
        const label = d.domain.length > domW ? d.domain.slice(0, domW - 2) + '..' : d.domain;
        const aFill = Math.round((d.activeMinutes / globalMax) * barW);
        const bFill = Math.min(Math.round((d.audibleMinutes / globalMax) * barW), barW - aFill);
        const empty = barW - aFill - bFill;

        return (
          <Box key={d.domain}>
            <Box width={domW}><Text>{label}</Text></Box>
            <Box width={barW + 1}>
              <Text>
                <Text color={ACTIVE_COLOR}>{'█'.repeat(aFill)}</Text>
                <Text color={AUDIBLE_COLOR}>{'░'.repeat(bFill)}</Text>
                <Text dimColor>{'·'.repeat(empty)}</Text>
              </Text>
            </Box>
            <Box width={actW}><Text color={ACTIVE_COLOR}>{formatMinutes(d.activeMinutes).padStart(actW)}</Text></Box>
            <Box width={audW}>
              {d.audibleMinutes > 0
                ? <Text color={AUDIBLE_COLOR}>{formatMinutes(d.audibleMinutes).padStart(audW)}</Text>
                : <Text color="gray">{'-'.padStart(audW)}</Text>
              }
            </Box>
            <Text color="white" bold>{'  '}{formatMinutes(d.totalMinutes)}</Text>
          </Box>
        );
      })}
      {domains.length > maxRows && (
        <Box marginTop={1}>
          <Text dimColor>Showing {scrollOffset + 1}-{Math.min(scrollOffset + maxRows, domains.length)} of {domains.length}  j/k to scroll</Text>
        </Box>
      )}
    </Box>
  );
}

function PagesTab({ stats, scrollOffset, maxRows }: { stats: BrowserStats; scrollOffset: number; maxRows: number }) {
  const pages = stats.topPaths;
  const visible = pages.slice(scrollOffset, scrollOffset + maxRows);

  return (
    <Box flexDirection="column">
      {visible.length === 0 ? (
        <Text dimColor>No page data.</Text>
      ) : (
        visible.map((p, i) => (
          <Box key={`${p.domain}${p.path}-${i}`} marginBottom={0}>
            <Box width={6}>
              <Text bold color="magenta">{formatMinutes(p.totalMinutes)}</Text>
            </Box>
            <Box flexDirection="column">
              <Text>
                {p.title.length > 50 ? p.title.slice(0, 49) + '..' : p.title || p.path}
              </Text>
              <Text dimColor>
                {p.domain}{p.path.length > 40 ? p.path.slice(0, 39) + '..' : p.path}
              </Text>
            </Box>
          </Box>
        ))
      )}
      {pages.length > maxRows && (
        <Box marginTop={1}>
          <Text dimColor>Showing {scrollOffset + 1}-{Math.min(scrollOffset + maxRows, pages.length)} of {pages.length}  j/k to scroll</Text>
        </Box>
      )}
    </Box>
  );
}
