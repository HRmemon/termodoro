import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useInput, useApp } from 'ink';
import type { Config, View } from './types.js';
import { loadSessions } from './lib/store.js';
import { loadTasks } from './lib/tasks.js';
import { loadReminders, updateReminder } from './lib/reminders.js';
import { sendReminderNotification } from './lib/notify.js';
import { useTimer } from './hooks/useTimer.js';
import { usePomodoroEngine } from './hooks/usePomodoroEngine.js';
import { useSequence, parseSequenceString, PRESET_SEQUENCES } from './hooks/useSequence.js';
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
import { getStreaks } from './lib/stats.js';

interface AppProps {
  config: Config;
  initialView?: View;
}

export function App({ config: initialConfig, initialView }: AppProps) {
  const [config, setConfig] = useState(initialConfig);
  const [view, setView] = useState<View>(initialView ?? 'timer');
  const [isZen, setIsZen] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showInsights, setShowInsights] = useState(false);
  const [showGlobalSearch, setShowGlobalSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  // Focus state for global search navigation
  const [taskFocusId, setTaskFocusId] = useState<string | null>(null);
  const [reminderFocusId, setReminderFocusId] = useState<string | null>(null);

  const { exit } = useApp();

  const [engine, engineActions] = usePomodoroEngine(config);
  const [seqState, seqActions] = useSequence();

  // Track which reminder times have already fired (keyed by "HH:MM") each day
  const firedRemindersRef = useRef<Set<string>>(new Set());

  const onTimerComplete = useCallback(() => {
    engineActions.completeSession();
    if (seqState.isActive) {
      const nextBlock = seqActions.advance();
      if (nextBlock) {
        engineActions.applySequenceBlock(nextBlock);
      }
    }
  }, [engineActions, seqState.isActive, seqActions]);

  const [timer, timerActions] = useTimer(engine.durationSeconds, onTimerComplete);

  const todayStats = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const sessions = loadSessions().filter(s => s.startedAt.startsWith(today) && s.type === 'work' && s.status === 'completed');
    return {
      count: sessions.length,
      focusMinutes: Math.round(sessions.reduce((sum, s) => sum + s.durationActual, 0) / 60),
    };
  }, [timer.isComplete]);

  const streak = useMemo(() => getStreaks().currentStreak, [timer.isComplete]);

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
          sendReminderNotification(r.title, message, config.notificationDuration);
          // Disable non-recurring reminders after firing
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
    seqActions.setSequence(seq);
    engineActions.applySequenceBlock(seq.blocks[0]!);
    setView('timer');
  }, [seqActions, engineActions]);

  const handleClearSequence = useCallback(() => {
    seqActions.clear();
    engineActions.resetOverride();
  }, [seqActions, engineActions]);

  // Auto-start breaks
  const isBreak = engine.sessionType !== 'work';
  if (isBreak && config.autoStartBreaks && !timer.isRunning && !timer.isPaused && timer.secondsLeft === engine.durationSeconds) {
    setTimeout(() => {
      timerActions.start();
      engineActions.startSession();
    }, 0);
  }

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
          handleActivateSequence(preset);
        } else {
          const seq = parseSequenceString(args);
          if (seq) handleActivateSequence(seq);
        }
        break;
      }
      case 'quit':
        engineActions.abandonSession();
        exit();
        break;
      default:
        break;
    }
  }, [engineActions, exit, handleActivateSequence]);

  const handleGlobalSearchNavigate = useCallback((targetView: View, focusId: string, type: 'task' | 'sequence' | 'reminder') => {
    setShowGlobalSearch(false);
    setView(targetView);
    if (type === 'task') {
      setTaskFocusId(focusId);
    } else if (type === 'reminder') {
      setReminderFocusId(focusId);
    }
    // sequences: just navigate to plan view, no focus needed
  }, []);

  useInput((input, key) => {
    if (showCommandPalette || showSearch || showInsights || showGlobalSearch || isTyping) return;

    if (input === 'q' && !isZen) {
      engineActions.abandonSession();
      exit();
      return;
    }

    if (input === 'z' && (view === 'timer' || view === 'clock')) {
      setIsZen(prev => !prev);
      return;
    }
    if (key.escape && isZen) {
      setIsZen(false);
      return;
    }

    if (!isZen) {
      if (input === '1') { setView('timer'); return; }
      if (input === '2') { setView('plan'); return; }
      if (input === '3') { setView('stats'); return; }
      if (input === '4') { setView('config'); return; }
      if (input === '5') { setView('clock'); return; }
      if (input === '6') { setView('reminders'); return; }
      if (input === '7') { setView('tasks'); return; }
    }

    if (input === ':' && !isZen) {
      setShowCommandPalette(true);
      return;
    }

    if (input === '/' && !isZen) {
      setShowGlobalSearch(true);
      return;
    }

    if (view === 'timer' || isZen) {
      if (input === ' ') {
        if (!timer.isRunning && !timer.isPaused) {
          timerActions.start();
          engineActions.startSession();
        } else if (timer.isPaused) {
          timerActions.resume();
        } else if (!config.strictMode) {
          timerActions.pause();
        }
        return;
      }
      if (input === 's' && !config.strictMode && timer.isRunning && !isZen) {
        timerActions.skip();
        engineActions.skipSession();
        return;
      }
    }
  });

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
      strictMode={config.strictMode}
      isZen={false}
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
          sequenceBlocks={seqState.sequence?.blocks}
          currentBlockIndex={seqState.currentBlockIndex}
          setIsTyping={setIsTyping}
        />
      )}
      {view === 'plan' && (
        <PlannerView
          activeSequence={seqState.sequence}
          onActivateSequence={handleActivateSequence}
          onClearSequence={handleClearSequence}
          setIsTyping={setIsTyping}
        />
      )}
      {view === 'stats' && <ReportsView />}
      {view === 'config' && (
        <ConfigView config={config} onConfigChange={setConfig} setIsTyping={setIsTyping} />
      )}
      {view === 'clock' && <ClockView />}
      {view === 'reminders' && (
        <RemindersView
          setIsTyping={setIsTyping}
          compactTime={config.compactTime}
          focusId={reminderFocusId}
          onFocusConsumed={() => setReminderFocusId(null)}
        />
      )}
      {view === 'tasks' && (
        <TasksView
          setIsTyping={setIsTyping}
          focusId={taskFocusId}
          onFocusConsumed={() => setTaskFocusId(null)}
        />
      )}
    </Layout>
  );
}
