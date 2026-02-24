import { useState, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import { BarChart } from './BarChart.js';
import { getBrowserStatsForDate } from '../lib/browser-stats.js';
import type { BrowserStats } from '../lib/browser-stats.js';
import { useFullScreen } from '../hooks/useFullScreen.js';

function formatMinutes(minutes: number): string {
  if (minutes < 1) return '0m';
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${Math.round(minutes)}m`;
}

function getTodayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

type Tab = 'domains' | 'pages';

export function WebView() {
  const [tab, setTab] = useState<Tab>('domains');
  const [scrollOffset, setScrollOffset] = useState(0);
  const { rows } = useFullScreen();

  const stats: BrowserStats | null = useMemo(() => {
    return getBrowserStatsForDate(getTodayString());
  }, []);

  useInput((input, key) => {
    if (key.tab || input === '\t') {
      setTab(prev => prev === 'domains' ? 'pages' : 'domains');
      setScrollOffset(0);
      return;
    }
    if (input === 'j' || key.downArrow) {
      setScrollOffset(prev => prev + 1);
    }
    if (input === 'k' || key.upArrow) {
      setScrollOffset(prev => Math.max(0, prev - 1));
    }
  });

  if (!stats || stats.totalMinutes === 0) {
    return (
      <Box flexDirection="column" flexGrow={1}>
        <Box marginBottom={1}>
          <Text dimColor>No browser data for today.</Text>
        </Box>
        <Text dimColor>Make sure the Firefox extension is loaded and the native host is running.</Text>
        <Text dimColor>Run `pomodorocli track` to set up, then reload the extension.</Text>
      </Box>
    );
  }

  const maxRows = Math.max(5, rows - 10);

  return (
    <Box flexDirection="column" flexGrow={1}>
      {/* Summary bar */}
      <Box marginBottom={1}>
        <Text dimColor>Active </Text>
        <Text bold color="magenta">{formatMinutes(stats.activeMinutes)}</Text>
        <Text dimColor>  Audible </Text>
        <Text bold color="yellow">{formatMinutes(stats.audibleMinutes)}</Text>
        <Text dimColor>  Total </Text>
        <Text bold>{formatMinutes(stats.totalMinutes)}</Text>
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
        <Text dimColor>    Tab to switch</Text>
      </Box>

      {tab === 'domains' && (
        <DomainsTab stats={stats} scrollOffset={scrollOffset} maxRows={maxRows} />
      )}
      {tab === 'pages' && (
        <PagesTab stats={stats} scrollOffset={scrollOffset} maxRows={maxRows} />
      )}
    </Box>
  );
}

function DomainsTab({ stats, scrollOffset, maxRows }: { stats: BrowserStats; scrollOffset: number; maxRows: number }) {
  const domains = stats.domains;
  const visible = domains.slice(scrollOffset, scrollOffset + maxRows);
  const barItems = visible.map(d => ({
    label: d.domain.length > 24 ? d.domain.slice(0, 23) + '..' : d.domain,
    value: d.totalMinutes,
  }));

  return (
    <Box flexDirection="column">
      <BarChart items={barItems} unit="min" color="magenta" maxBarWidth={20} />
      {visible.length > 0 && (
        <Box marginTop={1} flexDirection="column">
          <Text dimColor bold>{'  Domain'.padEnd(27)}{'Active'.padEnd(10)}{'Audible'.padEnd(10)}Total</Text>
          {visible.map(d => (
            <Box key={d.domain}>
              <Text dimColor>  </Text>
              <Box width={25}>
                <Text>{d.domain.length > 24 ? d.domain.slice(0, 23) + '..' : d.domain}</Text>
              </Box>
              <Box width={10}>
                <Text color="magenta">{formatMinutes(d.activeMinutes)}</Text>
              </Box>
              <Box width={10}>
                {d.audibleMinutes > 0 ? (
                  <Text color="yellow">{formatMinutes(d.audibleMinutes)} ♪</Text>
                ) : (
                  <Text dimColor>-</Text>
                )}
              </Box>
              <Text>{formatMinutes(d.totalMinutes)}</Text>
            </Box>
          ))}
        </Box>
      )}
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
