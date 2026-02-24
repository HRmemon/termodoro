import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useInput, useApp } from 'ink';
import { nanoid } from 'nanoid';
import type { Config, View, SessionType } from './types.js';
import { loadSessions, appendSession, loadTimerState, saveTimerState, clearTimerState } from './lib/store.js';
import type { TimerSnapshot } from './lib/store.js';
import type { TimerInitialState } from './hooks/useTimer.js';
import type { EngineInitialState } from './hooks/usePomodoroEngine.js';
import { loadTasks, addTask } from './lib/tasks.js';
import { loadReminders, updateReminder, addReminder } from './lib/reminders.js';
import { notifyReminder } from './lib/notify.js';
import { useTimer } from './hooks/useTimer.js';
import { usePomodoroEngine } from './hooks/usePomodoroEngine.js';
import { useSequence, parseSequenceString, PRESET_SEQUENCES } from './hooks/useSequence.js';
import type { SequenceInitialState } from './hooks/useSequence.js';
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
  const [showHelp, setShowHelp] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  // Focus state for global search navigation
  const [taskFocusId, setTaskFocusId] = useState<string | null>(null);
  const [reminderFocusId, setReminderFocusId] = useState<string | null>(null);

  const { exit } = useApp();

  // Restore timer state from disk on mount
  const [restoredState] = useState(() => {
    const snapshot = loadTimerState();
    if (!snapshot) return null;

    let timerInit: TimerInitialState;
    if (snapshot.isPaused) {
      timerInit = {
        secondsLeft: snapshot.pausedSecondsLeft ?? snapshot.totalSeconds,
        isRunning: true,
        isPaused: true,
      };
    } else {
      const elapsed = Math.floor((Date.now() - new Date(snapshot.startedAt).getTime()) / 1000);
      const remaining = snapshot.totalSeconds - elapsed;
      if (remaining <= 0) {
        // Timer expired while app was closed — auto-complete and advance to next session
        appendSession({
          id: nanoid(),
          type: snapshot.sessionType,
          status: 'completed',
          label: snapshot.label,
          project: snapshot.project,
          startedAt: snapshot.startedAt,
          endedAt: new Date(new Date(snapshot.startedAt).getTime() + snapshot.totalSeconds * 1000).toISOString(),
          durationPlanned: snapshot.totalSeconds,
          durationActual: snapshot.totalSeconds,
        });
        clearTimerState();

        // Compute next session type
        let nextSessionType: SessionType;
        let nextSessionNumber = snapshot.sessionNumber;
        let nextTotalWork = snapshot.totalWorkSessions;
        if (snapshot.sessionType === 'work') {
          nextTotalWork += 1;
          nextSessionType = nextTotalWork % initialConfig.longBreakInterval === 0 ? 'long-break' : 'short-break';
        } else {
          nextSessionNumber += 1;
          nextSessionType = 'work';
        }

        const engineInit: EngineInitialState = {
          sessionType: nextSessionType,
          sessionNumber: nextSessionNumber,
          totalWorkSessions: nextTotalWork,
        };
        // No timerInit — timer starts idle for the next session
        return { timerInit: undefined, engineInit, snapshot: undefined };
      }
      timerInit = {
        secondsLeft: remaining,
        isRunning: true,
        isPaused: false,
      };
    }

    const engineInit: EngineInitialState = {
      sessionType: snapshot.sessionType,
      sessionNumber: snapshot.sessionNumber,
      totalWorkSessions: snapshot.totalWorkSessions,
      label: snapshot.label,
      project: snapshot.project,
      overrideDuration: snapshot.overrideDuration,
      startedAt: snapshot.startedAt,
    };

    // Restore sequence state if present and timer not expired
    let sequenceInit: SequenceInitialState | undefined;
    if (snapshot.sequenceName && snapshot.sequenceBlocks && snapshot.sequenceBlockIndex !== undefined) {
      sequenceInit = {
        sequence: { name: snapshot.sequenceName, blocks: snapshot.sequenceBlocks },
        blockIndex: snapshot.sequenceBlockIndex,
      };
    }

    return { timerInit, engineInit, snapshot, sequenceInit };
  });

  const [engine, engineActions] = usePomodoroEngine(config, restoredState?.engineInit);
  const [seqState, seqActions] = useSequence(restoredState?.sequenceInit);

  // Wall-clock ref for timer persistence
  const timerStartedAtRef = useRef<string>(restoredState?.snapshot?.startedAt ?? '');

  // Track which reminder times have already fired (keyed by "HH:MM") each day
  const firedRemindersRef = useRef<Set<string>>(new Set());

  const onTimerComplete = useCallback(() => {
    engineActions.completeSession();
    clearTimerState();
    if (seqState.isActive) {
      const nextBlock = seqActions.advance();
      if (nextBlock) {
        engineActions.applySequenceBlock(nextBlock);
      }
    }
  }, [engineActions, seqState.isActive, seqActions]);

  const [timer, timerActions] = useTimer(engine.durationSeconds, onTimerComplete, restoredState?.timerInit);

  // Use refs so persistence always reads fresh values (avoids stale closures)
  const engineRef = useRef(engine);
  engineRef.current = engine;
  const engineActionsRef = useRef(engineActions);
  engineActionsRef.current = engineActions;
  const seqStateRef = useRef(seqState);
  seqStateRef.current = seqState;

  // Helper to persist timer state to disk — uses refs, safe to call from any closure
  const persistTimer = useCallback((opts: { isPaused: boolean; startedAt: string; pausedSecondsLeft?: number }) => {
    try {
      const eng = engineRef.current;
      const defaultDuration = engineActionsRef.current.getDuration(eng.sessionType);
      const snapshot: TimerSnapshot = {
        sessionType: eng.sessionType,
        totalSeconds: eng.durationSeconds,
        startedAt: opts.startedAt,
        isPaused: opts.isPaused,
        pausedSecondsLeft: opts.pausedSecondsLeft,
        sessionNumber: eng.sessionNumber,
        totalWorkSessions: eng.totalWorkSessions,
        label: eng.currentLabel,
        project: eng.currentProject,
        overrideDuration: eng.durationSeconds !== defaultDuration ? eng.durationSeconds : null,
        sequenceName: seqStateRef.current.sequence?.name,
        sequenceBlocks: seqStateRef.current.sequence?.blocks,
        sequenceBlockIndex: seqStateRef.current.isActive ? seqStateRef.current.currentBlockIndex : undefined,
      };
      saveTimerState(snapshot);
    } catch {
      // Don't let persistence errors break the timer
    }
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

  // CHANGE 7: Force timer reset when activating a sequence
  const handleActivateSequence = useCallback((seq: import('./types.js').SessionSequence) => {
    seqActions.setSequence(seq);
    const firstBlock = seq.blocks[0]!;
    engineActions.applySequenceBlock(firstBlock);
    timerActions.reset(firstBlock.durationMinutes * 60);
    setView('timer');
  }, [seqActions, engineActions, timerActions]);

  const handleClearSequence = useCallback(() => {
    seqActions.clear();
    engineActions.resetOverride();
  }, [seqActions, engineActions]);

  // CHANGE 6: Set custom duration
  const handleSetCustomDuration = useCallback((minutes: number) => {
    if (minutes > 0 && minutes <= 180) {
      engineActions.setDurationOverride(minutes * 60);
      timerActions.reset(minutes * 60);
    }
  }, [engineActions, timerActions]);

  // CHANGE 8: Reset modal confirm
  const handleResetConfirm = useCallback((asProductive: boolean) => {
    if (timer.elapsed >= 10) {
      if (asProductive) {
        engineActions.completeSession();
      } else {
        engineActions.abandonSession();
      }
    }
    timerActions.reset();
    clearTimerState();
    setShowResetModal(false);
  }, [timer.elapsed, engineActions, timerActions]);

  // Auto-start breaks
  const isBreak = engine.sessionType !== 'work';
  if (isBreak && config.autoStartBreaks && !timer.isRunning && !timer.isPaused && timer.secondsLeft === engine.durationSeconds) {
    setTimeout(() => {
      timerActions.start();
      engineActions.startSession();
      const now = new Date().toISOString();
      timerStartedAtRef.current = now;
      setTimeout(() => persistTimer({ isPaused: false, startedAt: now }), 0);
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
    // CHANGE 12: include showHelp and showResetModal in the guard
    if (showCommandPalette || showSearch || showInsights || showGlobalSearch || showHelp || showResetModal || isTyping) return;

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

    // CHANGE 10: help overlay
    if (input === '?' && !isZen) {
      setShowHelp(true);
      return;
    }

    if (!isZen) {
      // CHANGE 1: updated view numbers
      if (input === '1') { setView('timer'); return; }
      if (input === '2') { setView('tasks'); return; }
      if (input === '3') { setView('reminders'); return; }
      if (input === '4') { setView('clock'); return; }
      if (input === '5') { setView('plan'); return; }
      if (input === '6') { setView('stats'); return; }
      if (input === '7') { setView('config'); return; }
    }

    if (input === ':' && !isZen) {
      setShowCommandPalette(true);
      return;
    }

    if (input === '/' && !isZen) {
      // In tasks view, let TasksView handle / for in-view filtering
      if (view !== 'tasks') {
        setShowGlobalSearch(true);
      }
      return;
    }

    // CHANGE 3: clear sequence from timer screen
    if (input === 'c' && view === 'timer' && seqState.isActive) {
      handleClearSequence();
      return;
    }

    // CHANGE 8: reset modal from timer screen
    if (input === 'r' && view === 'timer') {
      // If elapsed is 0 and it's a break, skip directly to next focus session
      if (timer.elapsed === 0 && engine.sessionType !== 'work') {
        engineActions.advanceToNext();
        timerActions.reset();
        clearTimerState();
        return;
      }
      setShowResetModal(true);
      return;
    }

    if (view === 'timer' || isZen) {
      if (input === ' ') {
        if (!timer.isRunning && !timer.isPaused) {
          timerActions.start();
          engineActions.startSession();
          const now = new Date().toISOString();
          timerStartedAtRef.current = now;
          setTimeout(() => persistTimer({ isPaused: false, startedAt: now }), 0);
        } else if (timer.isPaused) {
          timerActions.resume();
          const now = new Date();
          const newStartedAt = new Date(now.getTime() - (timer.totalSeconds - timer.secondsLeft) * 1000).toISOString();
          timerStartedAtRef.current = newStartedAt;
          setTimeout(() => persistTimer({ isPaused: false, startedAt: newStartedAt }), 0);
        } else if (!config.strictMode) {
          timerActions.pause();
          setTimeout(() => persistTimer({ isPaused: true, startedAt: timerStartedAtRef.current, pausedSecondsLeft: timer.secondsLeft }), 0);
        }
        return;
      }
      if (input === 's' && !config.strictMode && timer.isRunning && !isZen) {
        timerActions.skip();
        engineActions.skipSession();
        clearTimerState();
        if (seqState.isActive) {
          const nextBlock = seqActions.advance();
          if (nextBlock) {
            engineActions.applySequenceBlock(nextBlock);
            timerActions.reset(nextBlock.durationMinutes * 60);
          }
        }
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

  // CHANGE 10: help overlay
  if (showHelp) {
    return <HelpView onClose={() => setShowHelp(false)} />;
  }

  // CHANGE 8: reset modal overlay
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
      strictMode={config.strictMode}
      isZen={false}
      hasActiveSequence={seqState.isActive}
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
          timerFormat={config.timerFormat}
          onSetCustomDuration={handleSetCustomDuration}
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
