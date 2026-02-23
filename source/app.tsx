import React, { useState, useCallback, useMemo } from 'react';
import { Box, useInput, useApp } from 'ink';
import type { Config, View, TagInfo, PostSessionInfo } from './types.js';
import { loadSessions } from './lib/store.js';
import { PlanView } from './components/PlanView.js';
import { useTimer } from './hooks/useTimer.js';
import { usePomodoroEngine } from './hooks/usePomodoroEngine.js';
import { Timer } from './components/Timer.js';
import { Controls } from './components/Controls.js';
import { Header } from './components/Header.js';
import { StatusBar } from './components/StatusBar.js';
import { SessionTagger } from './components/SessionTagger.js';
import { StatsView } from './components/StatsView.js';
import { CommandPalette } from './components/CommandPalette.js';
import { SearchView } from './components/SearchView.js';
import { InsightsView } from './components/InsightsView.js';

interface AppProps {
  config: Config;
  initialView?: View;
}

export function App({ config, initialView }: AppProps) {
  const [view, setView] = useState<View>(initialView ?? 'timer');
  const [searchQuery, setSearchQuery] = useState('');
  const [engine, engineActions] = usePomodoroEngine(config);
  const { exit } = useApp();

  const onTimerComplete = useCallback(() => {
    engineActions.completeSession();
  }, [engineActions]);

  const [timer, timerActions] = useTimer(engine.durationSeconds, onTimerComplete);

  const todayStats = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const sessions = loadSessions().filter(s => s.startedAt.startsWith(today) && s.type === 'work' && s.status === 'completed');
    return {
      count: sessions.length,
      focusMinutes: Math.round(sessions.reduce((sum, s) => sum + s.durationActual, 0) / 60),
    };
  }, [timer.isComplete]);

  const handleTagSubmit = useCallback((info: TagInfo) => {
    engineActions.setTagInfo(info);
    timerActions.reset(engine.durationSeconds);
    timerActions.start();
    engineActions.startSession();
    setView('timer');
  }, [engineActions, timerActions, engine.durationSeconds]);

  const handleTagSkip = useCallback(() => {
    engineActions.setTagInfo({});
    timerActions.reset(engine.durationSeconds);
    timerActions.start();
    engineActions.startSession();
    setView('timer');
  }, [engineActions, timerActions, engine.durationSeconds]);

  const handlePostSubmit = useCallback((info: PostSessionInfo) => {
    engineActions.setPostSessionInfo(info);
    // Engine will advance; reset timer for next session
    setView('timer');
  }, [engineActions]);

  const handlePostSkip = useCallback(() => {
    engineActions.setPostSessionInfo({});
    setView('timer');
  }, [engineActions]);

  const handleCommand = useCallback((cmd: string, args: string) => {
    switch (cmd) {
      case 'stats':
        setView('stats');
        break;
      case 'plan':
        setView('plan');
        break;
      case 'search':
        setSearchQuery(args);
        setView('search');
        break;
      case 'insights':
        setView('insights');
        break;
      case 'export':
        setView('timer');
        break;
      case 'backup':
        setView('timer');
        break;
      case 'config':
        setView('timer');
        break;
      case 'quit':
        engineActions.abandonSession();
        exit();
        break;
      default:
        setView('timer');
        break;
    }
  }, [engineActions, exit]);

  // Auto-start breaks if configured
  const needsAutoStart = !engine.isWaitingForTag && !engine.isWaitingForPostSession &&
    !timer.isRunning && !timer.isComplete && engine.sessionType !== 'work';

  if (needsAutoStart && config.autoStartBreaks && !timer.isRunning && timer.secondsLeft === engine.durationSeconds) {
    // Will be picked up on next render
    setTimeout(() => {
      timerActions.start();
      engineActions.startSession();
    }, 0);
  }

  useInput((input, key) => {
    // Subviews that manage their own useInput handle their own keys
    if (view === 'command-palette' || view === 'search' || view === 'insights') return;

    // Global keybinds
    if (input === 'q') {
      engineActions.abandonSession();
      exit();
      return;
    }

    if (view === 'timer' && !engine.isWaitingForTag && !engine.isWaitingForPostSession) {
      if (input === ' ') {
        if (!timer.isRunning && !timer.isPaused) {
          // Not started yet — start
          if (engine.sessionType === 'work' && engine.isWaitingForTag) return;
          timerActions.start();
          engineActions.startSession();
        } else if (timer.isPaused) {
          timerActions.resume();
        } else if (!config.strictMode) {
          timerActions.pause();
        }
      }

      if (input === 's' && !config.strictMode && timer.isRunning) {
        timerActions.skip();
        engineActions.skipSession();
      }
    }

    // View switching
    if (input === 't' && !engine.isWaitingForTag && !engine.isWaitingForPostSession) {
      setView(view === 'stats' ? 'timer' : 'stats');
    }
    if (input === 'p' && !engine.isWaitingForTag && !engine.isWaitingForPostSession) {
      setView(view === 'plan' ? 'timer' : 'plan');
    }
    if (input === ':' && !engine.isWaitingForTag && !engine.isWaitingForPostSession) {
      setView('command-palette');
    }
    if (key.escape) {
      setView('timer');
    }
  });

  // Tagger views
  if (engine.isWaitingForTag && engine.sessionType === 'work') {
    return <SessionTagger mode="pre" onSubmit={handleTagSubmit} onSkip={handleTagSkip} />;
  }
  if (engine.isWaitingForPostSession) {
    return <SessionTagger mode="post" onSubmit={handlePostSubmit} onSkip={handlePostSkip} />;
  }

  // Reset timer if engine changed the session type and timer is stale
  if (timer.totalSeconds !== engine.durationSeconds && !timer.isRunning) {
    timerActions.reset(engine.durationSeconds);
  }

  // Full-screen views rendered without the main chrome
  if (view === 'command-palette') {
    return (
      <CommandPalette
        onCommand={handleCommand}
        onDismiss={() => setView('timer')}
      />
    );
  }

  if (view === 'search') {
    return (
      <SearchView
        onBack={() => setView('timer')}
        initialQuery={searchQuery}
      />
    );
  }

  if (view === 'insights') {
    return (
      <InsightsView
        onBack={() => setView('timer')}
      />
    );
  }

  return (
    <Box flexDirection="column">
      <Header
        sessionType={engine.sessionType}
        sessionNumber={engine.sessionNumber}
        totalWorkSessions={engine.totalWorkSessions}
        longBreakInterval={config.longBreakInterval}
        label={engine.currentLabel}
        project={engine.currentProject}
      />
      {view === 'timer' && (
        <>
          <Timer
            secondsLeft={timer.secondsLeft}
            totalSeconds={timer.totalSeconds}
            sessionType={engine.sessionType}
            isPaused={timer.isPaused}
          />
          <Controls
            isRunning={timer.isRunning}
            isPaused={timer.isPaused}
            strictMode={config.strictMode}
            vimKeys={config.vimKeys}
          />
        </>
      )}
      {view === 'stats' && (
        <StatsView />
      )}
      {view === 'plan' && (
        <PlanView
          date={new Date().toISOString().slice(0, 10)}
          sessions={loadSessions()}
          onBack={() => setView('timer')}
        />
      )}
      <StatusBar
        sessionType={engine.sessionType}
        secondsLeft={timer.secondsLeft}
        todaySessionCount={todayStats.count}
        todayFocusMinutes={todayStats.focusMinutes}
      />
    </Box>
  );
}
