import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useInput, useApp, Box, Text } from 'ink';
import type { Config, View } from './types.js';
import { loadSessions } from './lib/store.js';
import { parseSequenceString, loadSequences } from './lib/sequences.js';
import { useDaemonConnection } from './hooks/useDaemonConnection.js';
import { useReminderChecker } from './hooks/useReminderChecker.js';
import { useCommandDispatch } from './hooks/useCommandDispatch.js';
import { Layout } from './components/Layout.js';
import { StatusLine } from './components/StatusLine.js';
import { KeysBar } from './components/KeysBar.js';
import { TimerView } from './components/TimerView.js';
import { ZenMode } from './components/ZenMode.js';
import { ReportsView } from './components/ReportsView.js';
import { ConfigView } from './components/ConfigView.js';
import { ClockView } from './components/ClockView.js';
import { ZenClock } from './components/ZenClock.js';
import { CommandPalette } from './components/CommandPalette.js';
import { SearchView } from './components/SearchView.js';
import { InsightsView } from './components/InsightsView.js';
import { RemindersView } from './components/RemindersView.js';
import { TasksView } from './components/TasksView.js';
import { GlobalSearch } from './components/GlobalSearch.js';
import { HelpView } from './components/HelpView.js';
import { ResetModal } from './components/ResetModal.js';
import { WebView } from './components/WebView.js';
import { TrackerView } from './components/TrackerView.js';
import { GraphsView } from './components/GraphsView.js';
import { CalendarView } from './components/CalendarView.js';
import { getStreaks } from './lib/stats.js';
import { openInNvim } from './lib/nvim-edit/index.js';
import { loadConfig } from './lib/config.js';
import { initTheme } from './lib/theme.js';
import { getShortcutMap } from './lib/views.js';
import { createKeymap } from './lib/keymap.js';
import type { LayoutConfig } from './types.js';

interface AppProps {
  config: Config;
  initialView?: View;
  initialProject?: string;
  initialSequence?: string;
}

function Connecting({ status }: { status: 'connecting' | 'disconnected' }) {
  return (
    <Box padding={2}>
      <Text color="yellow">{status === 'connecting' ? 'Connecting to daemon...' : 'Reconnecting to daemon...'}</Text>
    </Box>
  );
}

export function App({ config: initialConfig, initialView, initialProject, initialSequence }: AppProps) {
  const [config, setConfig] = useState(initialConfig);
  const [view, setView] = useState<View>(initialView ?? 'timer');

  // Initialize theme from config
  useEffect(() => {
    initTheme(config);
  }, [config]);

  // Runtime sidebar toggle state — starts from config layout setting
  const [sidebarOverride, setSidebarOverride] = useState<'visible' | 'hidden' | null>(null);
  const [isZen, setIsZen] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showInsights, setShowInsights] = useState(false);
  const [showGlobalSearch, setShowGlobalSearch] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [editGeneration, setEditGeneration] = useState(0);
  const [taskFocusId, setTaskFocusId] = useState<string | null>(null);
  const [reminderFocusId, setReminderFocusId] = useState<string | null>(null);
  const [configSeqMode, setConfigSeqMode] = useState(false);

  const { exit } = useApp();

  // Connect to daemon
  const { timer, engine, sequence, actions, connectionStatus } = useDaemonConnection();

  // Reminder checker — runs every 30s
  useReminderChecker(config);

  // Apply CLI initial flags on mount
  const appliedInitRef = useRef(false);
  useEffect(() => {
    if (appliedInitRef.current || connectionStatus !== 'connected') return;
    appliedInitRef.current = true;

    if (initialProject) {
      actions.setProject(initialProject);
    }
    if (initialSequence) {
      // Try named sequence first, then inline format
      const named = loadSequences().find(s => s.name === initialSequence);
      if (named) {
        actions.activateSequence(initialSequence);
      } else {
        const parsed = parseSequenceString(initialSequence);
        if (parsed) actions.activateSequenceInline(initialSequence);
      }
    }
  }, [connectionStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  const allSequences = useMemo(() => {
    return loadSequences();
  }, [view]);

  const statusBarData = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const allSessions = loadSessions();
    const todaySessions = allSessions.filter(
      s => s.startedAt.startsWith(today) && s.type === 'work' && s.status === 'completed'
    );
    return {
      todayCount: todaySessions.length,
      todayFocusMinutes: Math.round(todaySessions.reduce((sum, s) => sum + s.durationActual, 0) / 60),
      streak: getStreaks(allSessions).currentStreak,
    };
  }, [timer.isComplete, engine.sessionNumber]);

  const handleActivateSequence = useCallback((seq: import('./types.js').SessionSequence) => {
    actions.activateSequence(seq.name);
    setView('timer');
  }, [actions]);

  const handleClearSequence = useCallback(() => {
    actions.clearSequence();
  }, [actions]);

  const handleSetCustomDuration = useCallback((minutes: number) => {
    if (minutes > 0 && minutes <= 180) {
      actions.setDuration(minutes);
    }
  }, [actions]);

  const handleResetConfirm = useCallback((asProductive: boolean) => {
    actions.resetAndLog(asProductive);
    setShowResetModal(false);
  }, [actions]);

  const commandCallbacks = useMemo(() => ({
    setShowCommandPalette,
    setSearchQuery,
    setShowSearch,
    setShowInsights,
    setView,
  }), []);

  const handleCommand = useCommandDispatch(
    actions,
    commandCallbacks,
    config,
    exit,
  );

  const handleGlobalSearchNavigate = useCallback((targetView: View, focusId: string, type: 'task' | 'sequence' | 'reminder') => {
    setShowGlobalSearch(false);
    setView(targetView);
    if (type === 'task') {
      setTaskFocusId(focusId);
    } else if (type === 'reminder') {
      setReminderFocusId(focusId);
    }
  }, []);

  const keymap = useMemo(() => createKeymap(config), [config]);
  const shortcutMap = useMemo(() => getShortcutMap(config), [config]);

  useInput((input, key) => {
    // Let q close any open overlay or exit zen mode
    if (keymap.matches('global.quit', input, key)) {
      if (showHelp) { setShowHelp(false); return; }
      if (showInsights) { setShowInsights(false); return; }
      if (showGlobalSearch) { setShowGlobalSearch(false); return; }
      if (showCommandPalette) { setShowCommandPalette(false); return; }
      if (showSearch) { setShowSearch(false); return; }
      if (showResetModal) { setShowResetModal(false); return; }
      if (isZen) { setIsZen(false); return; }
    }

    // ? toggles help, Esc closes help (close if open)
    if (showHelp && !isTyping && (key.escape || keymap.matches('global.help', input, key))) {
      setShowHelp(false);
      return;
    }

    if (showCommandPalette || showSearch || showInsights || showGlobalSearch || showHelp || showResetModal || isTyping) return;

    if (keymap.matches('global.zen', input, key) && (view === 'timer' || view === 'clock')) {
      setIsZen(prev => !prev);
      return;
    }
    if ((key.escape || keymap.matches('global.quit', input, key)) && isZen) {
      setIsZen(false);
      return;
    }

    if (keymap.matches('global.help', input, key) && !isZen) {
      setShowHelp(true);
      return;
    }

    if (keymap.matches('global.editor', input, key) && !isZen) {
      const changed = openInNvim(view);
      if (changed) {
        setEditGeneration(g => g + 1);
        if (view === 'config') {
          setConfig(loadConfig());
          actions.updateConfig();
        }
      }
      return;
    }

    if (keymap.matches('global.toggle_sidebar', input, key) && !isZen) {
      setSidebarOverride(prev => {
        // Resolve effective current state: override takes precedence, then config
        const current = prev ?? config.layout?.sidebar ?? 'visible';
        return current === 'hidden' ? 'visible' : 'hidden';
      });
      return;
    }

    if (!isZen) {
      const shortcutView = shortcutMap.get(input);
      if (shortcutView) { setView(shortcutView); return; }
    }

    if (keymap.matches('global.command_palette', input, key) && !isZen) {
      setShowCommandPalette(true);
      return;
    }

    if (keymap.matches('global.search', input, key) && !isZen) {
      if (view !== 'tasks') {
        setShowGlobalSearch(true);
      }
      return;
    }

    if (keymap.matches('timer.clear_sequence', input, key) && view === 'timer' && sequence.sequenceIsActive) {
      handleClearSequence();
      return;
    }

    if (keymap.matches('timer.reset', input, key) && view === 'timer') {
      const effectiveElapsed = timer.timerMode === 'stopwatch' ? timer.stopwatchElapsed : timer.elapsed;
      if (effectiveElapsed === 0 && engine.sessionType !== 'work') {
        actions.advanceSession();
        return;
      }
      setShowResetModal(true);
      return;
    }

    if (view === 'timer' || isZen) {
      if (keymap.matches('timer.toggle', input, key)) {
        actions.toggle();
        return;
      }
      if (keymap.matches('timer.skip', input, key) && !engine.isStrictMode && timer.isRunning && !isZen && timer.timerMode !== 'stopwatch') {
        actions.skip();
        return;
      }
    }
  });

  // Show connection status screens
  if (connectionStatus !== 'connected') {
    return <Connecting status={connectionStatus} />;
  }

  // Full-screen overlays
  if (showCommandPalette) {
    return (
      <CommandPalette
        onCommand={handleCommand}
        onDismiss={() => setShowCommandPalette(false)}
      />
    );
  }

  if (showSearch) {
    return (
      <SearchView
        onBack={() => setShowSearch(false)}
        initialQuery={searchQuery}
      />
    );
  }

  if (showInsights) {
    return (
      <InsightsView
        onBack={() => setShowInsights(false)}
      />
    );
  }

  if (showGlobalSearch) {
    return (
      <GlobalSearch
        onNavigate={handleGlobalSearchNavigate}
        onDismiss={() => setShowGlobalSearch(false)}
      />
    );
  }

  if (showResetModal) {
    return (
      <ResetModal
        elapsed={timer.timerMode === 'stopwatch' ? timer.stopwatchElapsed : timer.elapsed}
        sessionType={engine.sessionType}
        onConfirm={handleResetConfirm}
        onCancel={() => setShowResetModal(false)}
      />
    );
  }

  // Zen mode
  if (isZen) {
    if (view === 'clock') {
      return <ZenClock />;
    }
    return (
      <ZenMode
        secondsLeft={timer.secondsLeft}
        totalSeconds={timer.totalSeconds}
        sessionType={engine.sessionType}
        isPaused={timer.isPaused}
        isRunning={timer.isRunning}
        timerFormat={config.timerFormat}
        timerMode={timer.timerMode}
        stopwatchElapsed={timer.stopwatchElapsed}
      />
    );
  }

  const statusLine = (
    <StatusLine
      sessionType={engine.sessionType}
      isRunning={timer.isRunning}
      isPaused={timer.isPaused}
      timerMode={timer.timerMode}
      streak={statusBarData.streak}
      todaySessions={statusBarData.todayCount}
      todayFocusMinutes={statusBarData.todayFocusMinutes}
    />
  );

  // Resolve effective layout — runtime sidebar override takes precedence
  const baseLayout = config.layout ?? { sidebar: 'visible', showKeysBar: true, compact: false };
  const effectiveLayout: LayoutConfig = sidebarOverride !== null
    ? { ...baseLayout, sidebar: sidebarOverride }
    : baseLayout;

  const keysBar = effectiveLayout.showKeysBar ? (
    <KeysBar
      view={view}
      isRunning={timer.isRunning}
      isPaused={timer.isPaused}
      strictMode={engine.isStrictMode}
      isZen={false}
      hasActiveSequence={sequence.sequenceIsActive}
      hasActiveProject={!!engine.currentProject}
      timerMode={timer.timerMode}
      config={config}
      keymap={keymap}
    />
  ) : null;

  return (
    <Layout activeView={view} statusLine={statusLine} keysBar={keysBar} sidebarWidth={config.sidebarWidth} layout={effectiveLayout} config={config} hideViewHeader={showHelp}>
      {showHelp ? (
        <HelpView onClose={() => setShowHelp(false)} keymap={keymap} setIsTyping={setIsTyping} sidebarWidth={config.sidebarWidth} />
      ) : (
        <>
          {view === 'timer' && (
            <TimerView
              secondsLeft={timer.secondsLeft}
              totalSeconds={timer.totalSeconds}
              sessionType={engine.sessionType}
              isPaused={timer.isPaused}
              isRunning={timer.isRunning}
              sessionNumber={engine.sessionNumber}
              totalWorkSessions={engine.totalWorkSessions}
              sequenceBlocks={sequence.sequenceBlocks}
              currentBlockIndex={sequence.sequenceBlockIndex}
              setIsTyping={setIsTyping}
              timerFormat={config.timerFormat}
              onSetCustomDuration={handleSetCustomDuration}
              currentProject={engine.currentProject}
              onSetProject={(p) => actions.setProject(p)}
              sequences={allSequences}
              activeSequence={sequence.sequenceName ? { name: sequence.sequenceName, blocks: sequence.sequenceBlocks ?? [] } : null}
              onActivateSequence={handleActivateSequence}
              onClearSequence={handleClearSequence}
              onEditSequences={() => { setConfigSeqMode(true); setView('config'); }}
              timerMode={timer.timerMode}
              stopwatchElapsed={timer.stopwatchElapsed}
              onSwitchToStopwatch={() => actions.switchToStopwatch()}
              onStopStopwatch={() => actions.stopStopwatch()}
              keymap={keymap}
            />
          )}
          {view === 'stats' && <ReportsView keymap={keymap} />}
          {view === 'config' && (
            <ConfigView
              key={editGeneration}
              config={config}
              onConfigChange={(newConfig) => {
                setConfig(newConfig);
                actions.updateConfig();
              }}
              setIsTyping={setIsTyping}
              initialSeqMode={configSeqMode}
              onSeqModeConsumed={() => setConfigSeqMode(false)}
              keymap={keymap}
            />
          )}
          {view === 'clock' && <ClockView />}
          {view === 'reminders' && (
            <RemindersView
              key={editGeneration}
              setIsTyping={setIsTyping}
              compactTime={config.compactTime}
              focusId={reminderFocusId}
              onFocusConsumed={() => setReminderFocusId(null)}
              keymap={keymap}
            />
          )}
          {view === 'tasks' && (
            <TasksView
              key={editGeneration}
              setIsTyping={setIsTyping}
              focusId={taskFocusId}
              onFocusConsumed={() => setTaskFocusId(null)}
              keymap={keymap}
            />
          )}
          {view === 'web' && <WebView keymap={keymap} />}
          {view === 'tracker' && <TrackerView key={editGeneration} keymap={keymap} />}
          {view === 'graphs' && <GraphsView key={editGeneration} setIsTyping={setIsTyping} keymap={keymap} />}
          {view === 'calendar' && <CalendarView setIsTyping={setIsTyping} config={config} keymap={keymap} />}
        </>
      )}
    </Layout>
  );
}
