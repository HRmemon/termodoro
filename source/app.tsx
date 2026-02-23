import React, { useState, useCallback, useMemo } from 'react';
import { useInput, useApp } from 'ink';
import type { Config, View } from './types.js';
import { loadSessions } from './lib/store.js';
import { loadTasks } from './lib/tasks.js';
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
  const [searchQuery, setSearchQuery] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const { exit } = useApp();

  const [engine, engineActions] = usePomodoroEngine(config);
  const [seqState, seqActions] = useSequence();

  const onTimerComplete = useCallback(() => {
    engineActions.completeSession();

    // If sequence is active, advance to next block
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

  const currentTask = useMemo(() => {
    const tasks = loadTasks();
    return tasks.find(t => !t.completed)?.text;
  }, [view]);

  // Auto-start breaks
  const isBreak = engine.sessionType !== 'work';
  if (isBreak && config.autoStartBreaks && !timer.isRunning && !timer.isPaused && timer.secondsLeft === engine.durationSeconds) {
    setTimeout(() => {
      timerActions.start();
      engineActions.startSession();
    }, 0);
  }

  // Reset timer when engine session changes
  if (timer.totalSeconds !== engine.durationSeconds && !timer.isRunning) {
    timerActions.reset(engine.durationSeconds);
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
      case 'search':
        setSearchQuery(args);
        setShowSearch(true);
        break;
      case 'insights':
        setShowInsights(true);
        break;
      case 'session': {
        // Parse sequence: "45w 15b 45w" or preset name
        const preset = PRESET_SEQUENCES[args.trim()];
        if (preset) {
          seqActions.setSequence(preset);
          engineActions.applySequenceBlock(preset.blocks[0]!);
        } else {
          const seq = parseSequenceString(args);
          if (seq) {
            seqActions.setSequence(seq);
            engineActions.applySequenceBlock(seq.blocks[0]!);
          }
        }
        setView('timer');
        break;
      }
      case 'quit':
        engineActions.abandonSession();
        exit();
        break;
      default:
        break;
    }
  }, [engineActions, exit, seqActions]);

  useInput((input, key) => {
    if (showCommandPalette || showSearch || showInsights || isTyping) return;

    // Quit
    if (input === 'q' && !isZen) {
      engineActions.abandonSession();
      exit();
      return;
    }

    // Zen mode toggle
    if (input === 'z' && (view === 'timer' || view === 'clock')) {
      setIsZen(prev => !prev);
      return;
    }
    if (key.escape && isZen) {
      setIsZen(false);
      return;
    }

    // View switching (1-4) - not in zen
    if (!isZen) {
      if (input === '1') { setView('timer'); return; }
      if (input === '2') { setView('plan'); return; }
      if (input === '3') { setView('stats'); return; }
      if (input === '4') { setView('config'); return; }
      if (input === '5') { setView('clock'); return; }
    }

    // Command palette
    if (input === ':' && !isZen) {
      setShowCommandPalette(true);
      return;
    }

    // Timer controls (work in both timer view and zen mode)
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
        currentTask={currentTask}
      />
    );
  }

  // Status and keys bars
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

  // Main layout with views
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
      {view === 'plan' && <PlannerView setIsTyping={setIsTyping} />}
      {view === 'stats' && <ReportsView />}
      {view === 'config' && (
        <ConfigView config={config} onConfigChange={setConfig} setIsTyping={setIsTyping} />
      )}
      {view === 'clock' && <ClockView />}
    </Layout>
  );
}
