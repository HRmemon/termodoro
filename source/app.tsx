import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useInput, useApp, Box, Text } from 'ink';
import { nanoid } from 'nanoid';
import type { Config, View } from './types.js';
import { loadSessions } from './lib/store.js';
import { loadTasks, addTask } from './lib/tasks.js';
import { loadReminders, updateReminder, addReminder } from './lib/reminders.js';
import { notifyReminder } from './lib/notify.js';
import { parseSequenceString, PRESET_SEQUENCES } from './hooks/useSequence.js';
import { loadCustomSequences } from './lib/sequences.js';
import { useDaemonConnection } from './hooks/useDaemonConnection.js';
import { Layout } from './components/Layout.js';
import { StatusLine } from './components/StatusLine.js';
import { KeysBar } from './components/KeysBar.js';
import { TimerView } from './components/TimerView.js';
import { ZenMode } from './components/ZenMode.js';
import { PlannerView } from './components/PlannerView.js';
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
import { getStreaks } from './lib/stats.js';
import { openInNvim } from './lib/nvim-edit.js';
import { loadConfig } from './lib/config.js';

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

  const { exit } = useApp();

  // Connect to daemon
  const { timer, engine, sequence, actions, connectionStatus } = useDaemonConnection();

  // Track which reminder times have already fired
  const firedRemindersRef = useRef<Set<string>>(new Set());

  // Apply CLI initial flags on mount
  const appliedInitRef = useRef(false);
  useEffect(() => {
    if (appliedInitRef.current || connectionStatus !== 'connected') return;
    appliedInitRef.current = true;

    if (initialProject) {
      actions.setProject(initialProject);
    }
    if (initialSequence) {
      // Try preset name first, then custom sequences, then inline format
      const preset = PRESET_SEQUENCES[initialSequence];
      if (preset) {
        actions.activateSequence(initialSequence);
      } else {
        const custom = loadCustomSequences().find(s => s.name === initialSequence);
        if (custom) {
          actions.activateSequence(initialSequence);
        } else {
          const parsed = parseSequenceString(initialSequence);
          if (parsed) actions.activateSequenceInline(initialSequence);
        }
      }
    }
  }, [connectionStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  const allSequences = useMemo(() => {
    return [...Object.values(PRESET_SEQUENCES), ...loadCustomSequences()];
  }, []);

  const todayStats = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const sessions = loadSessions().filter(s => s.startedAt.startsWith(today) && s.type === 'work' && s.status === 'completed');
    return {
      count: sessions.length,
      focusMinutes: Math.round(sessions.reduce((sum, s) => sum + s.durationActual, 0) / 60),
    };
  }, [timer.isComplete, engine.sessionNumber]);

  const streak = useMemo(() => getStreaks().currentStreak, [timer.isComplete, engine.sessionNumber]);

  // Reminder checker — runs every 30s
  useEffect(() => {
    const checkReminders = () => {
      if (!config.notifications) return;
      const now = new Date();
      const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const today = now.toISOString().slice(0, 10);
      const firedKey = `${today}:${currentTime}`;

      const reminders = loadReminders();
      for (const r of reminders) {
        if (!r.enabled) continue;
        if (r.time === currentTime && !firedRemindersRef.current.has(firedKey + r.id)) {
          firedRemindersRef.current.add(firedKey + r.id);
          let message = r.title;
          if (r.taskId) {
            const tasks = loadTasks();
            const task = tasks.find(t => t.id === r.taskId);
            if (task) message = `${r.title}\nTask: ${task.text}`;
          }
          notifyReminder(r.title, message, config.sound, config.notificationDuration, config.sounds);
          if (!r.recurring) {
            updateReminder(r.id, { enabled: false });
          }
        }
      }
    };

    checkReminders();
    const interval = setInterval(checkReminders, 30_000);
    return () => clearInterval(interval);
  }, [config.notifications, config.notificationDuration]);

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

  const handleCommand = useCallback((cmd: string, args: string) => {
    setShowCommandPalette(false);
    switch (cmd) {
      case 'stats':
        setView('stats');
        break;
      case 'plan':
        setView('plan');
        break;
      case 'reminders':
        setView('reminders');
        break;
      case 'tasks':
        setView('tasks');
        break;
      case 'search':
        setSearchQuery(args);
        setShowSearch(true);
        break;
      case 'insights':
        setShowInsights(true);
        break;
      case 'session': {
        const preset = PRESET_SEQUENCES[args.trim()];
        if (preset) {
          actions.activateSequence(args.trim());
        } else {
          const seq = parseSequenceString(args);
          if (seq) actions.activateSequenceInline(args);
        }
        setView('timer');
        break;
      }
      case 'task': {
        if (args.trim()) {
          let text = args.trim();
          let project: string | undefined;
          let expectedPomodoros = 1;

          const pomMatch = text.match(/^(.+?)\s*\/(\d+)\s*$/);
          if (pomMatch) {
            text = pomMatch[1]!.trim();
            expectedPomodoros = parseInt(pomMatch[2]!, 10);
          }
          const projMatch = text.match(/^(.+?)\s+#(\S+)\s*$/);
          if (projMatch) {
            text = projMatch[1]!.trim();
            project = projMatch[2]!;
          }
          addTask(text, expectedPomodoros, project);
          setView('tasks');
        }
        break;
      }
      case 'reminder': {
        const reminderMatch = args.trim().match(/^(\d{1,2}:\d{2})\s+(.+)$/);
        if (reminderMatch) {
          const time = reminderMatch[1]!;
          const title = reminderMatch[2]!;
          addReminder({
            id: nanoid(),
            time,
            title,
            enabled: true,
            recurring: false,
          });
          setView('reminders');
        }
        break;
      }
      case 'remind': {
        const remindMatch = args.trim().match(/^(\d+)\s*(s|m|h)(?:\s+(.+))?$/i);
        if (remindMatch) {
          const amount = parseInt(remindMatch[1]!, 10);
          const unit = remindMatch[2]!.toLowerCase();
          let ms = 0;
          if (unit === 's') ms = amount * 1000;
          else if (unit === 'm') ms = amount * 60 * 1000;
          else if (unit === 'h') ms = amount * 60 * 60 * 1000;

          const label = remindMatch[3]?.trim() || `${amount}${unit} timer`;
          const fireAt = new Date(Date.now() + ms);
          const fireTime = `${String(fireAt.getHours()).padStart(2, '0')}:${String(fireAt.getMinutes()).padStart(2, '0')}`;
          const reminderId = nanoid();
          addReminder({
            id: reminderId,
            time: fireTime,
            title: label,
            enabled: true,
            recurring: false,
          });

          setTimeout(() => {
            notifyReminder(label, `Timer: ${label}`, config.sound, config.notificationDuration, config.sounds);
            updateReminder(reminderId, { enabled: false });
          }, ms);

          setView('reminders');
        }
        break;
      }
      case 'quit':
        actions.abandon();
        exit();
        break;
      default:
        break;
    }
  }, [actions, exit, config]);

  const handleGlobalSearchNavigate = useCallback((targetView: View, focusId: string, type: 'task' | 'sequence' | 'reminder') => {
    setShowGlobalSearch(false);
    setView(targetView);
    if (type === 'task') {
      setTaskFocusId(focusId);
    } else if (type === 'reminder') {
      setReminderFocusId(focusId);
    }
  }, []);

  useInput((input, key) => {
    // Let q close any open overlay or exit zen mode
    if (input === 'q') {
      if (showHelp) { setShowHelp(false); return; }
      if (showInsights) { setShowInsights(false); return; }
      if (showGlobalSearch) { setShowGlobalSearch(false); return; }
      if (showCommandPalette) { setShowCommandPalette(false); return; }
      if (showSearch) { setShowSearch(false); return; }
      if (showResetModal) { setShowResetModal(false); return; }
      if (isZen) { setIsZen(false); return; }
    }

    if (showCommandPalette || showSearch || showInsights || showGlobalSearch || showHelp || showResetModal || isTyping) return;

    if (input === 'z' && (view === 'timer' || view === 'clock')) {
      setIsZen(prev => !prev);
      return;
    }
    if ((key.escape || input === 'q') && isZen) {
      setIsZen(false);
      return;
    }

    if (input === '?' && !isZen) {
      setShowHelp(true);
      return;
    }

    if (input === 'g' && key.ctrl && !isZen) {
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

    if (!isZen) {
      if (input === '1') { setView('timer'); return; }
      if (input === '2') { setView('tasks'); return; }
      if (input === '3') { setView('reminders'); return; }
      if (input === '4') { setView('clock'); return; }
      if (input === '5') { setView('plan'); return; }
      if (input === '6') { setView('stats'); return; }
      if (input === '7') { setView('config'); return; }
      if (input === '8') { setView('web'); return; }
      if (input === '9') { setView('tracker'); return; }
      if (input === '0') { setView('graphs'); return; }
    }

    if (input === ':' && !isZen) {
      setShowCommandPalette(true);
      return;
    }

    if (input === '/' && !isZen) {
      if (view !== 'tasks') {
        setShowGlobalSearch(true);
      }
      return;
    }

    if (input === 'c' && view === 'timer' && sequence.sequenceIsActive) {
      handleClearSequence();
      return;
    }

    if (input === 'r' && view === 'timer') {
      if (timer.elapsed === 0 && engine.sessionType !== 'work') {
        actions.advanceSession();
        return;
      }
      setShowResetModal(true);
      return;
    }

    if (view === 'timer' || isZen) {
      if (input === ' ') {
        actions.toggle();
        return;
      }
      if (input === 's' && !engine.isStrictMode && timer.isRunning && !isZen) {
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

  if (showHelp) {
    return <HelpView onClose={() => setShowHelp(false)} />;
  }

  if (showResetModal) {
    return (
      <ResetModal
        elapsed={timer.elapsed}
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
      />
    );
  }

  const statusLine = (
    <StatusLine
      sessionType={engine.sessionType}
      isRunning={timer.isRunning}
      isPaused={timer.isPaused}
      streak={streak}
      todaySessions={todayStats.count}
      todayFocusMinutes={todayStats.focusMinutes}
    />
  );

  const keysBar = (
    <KeysBar
      view={view}
      isRunning={timer.isRunning}
      isPaused={timer.isPaused}
      strictMode={engine.isStrictMode}
      isZen={false}
      hasActiveSequence={sequence.sequenceIsActive}
      hasActiveProject={!!engine.currentProject}
    />
  );

  return (
    <Layout activeView={view} statusLine={statusLine} keysBar={keysBar}>
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
        />
      )}
      {view === 'plan' && (
        <PlannerView
          key={editGeneration}
          activeSequence={sequence.sequenceName ? { name: sequence.sequenceName, blocks: sequence.sequenceBlocks ?? [] } : null}
          onActivateSequence={handleActivateSequence}
          onClearSequence={handleClearSequence}
          setIsTyping={setIsTyping}
        />
      )}
      {view === 'stats' && <ReportsView />}
      {view === 'config' && (
        <ConfigView
          key={editGeneration}
          config={config}
          onConfigChange={(newConfig) => {
            setConfig(newConfig);
            actions.updateConfig();
          }}
          setIsTyping={setIsTyping}
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
        />
      )}
      {view === 'tasks' && (
        <TasksView
          key={editGeneration}
          setIsTyping={setIsTyping}
          focusId={taskFocusId}
          onFocusConsumed={() => setTaskFocusId(null)}
        />
      )}
      {view === 'web' && <WebView />}
      {view === 'tracker' && <TrackerView key={editGeneration} />}
      {view === 'graphs' && <GraphsView key={editGeneration} setIsTyping={setIsTyping} />}
    </Layout>
  );
}
