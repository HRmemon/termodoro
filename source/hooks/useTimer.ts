import { useState, useEffect, useCallback, useRef } from 'react';

export interface TimerState {
  secondsLeft: number;
  totalSeconds: number;
  isRunning: boolean;
  isPaused: boolean;
  isComplete: boolean;
  elapsed: number;
}

export interface TimerActions {
  start: () => void;
  pause: () => void;
  resume: () => void;
  skip: () => void;
  reset: (newDuration?: number) => void;
}

export interface TimerInitialState {
  secondsLeft: number;
  isRunning: boolean;
  isPaused: boolean;
}

export function useTimer(
  durationSeconds: number,
  onComplete: () => void,
  initialState?: TimerInitialState,
): [TimerState, TimerActions] {
  const [secondsLeft, setSecondsLeft] = useState(initialState?.secondsLeft ?? durationSeconds);
  const [totalSeconds, setTotalSeconds] = useState(durationSeconds);
  const [isRunning, setIsRunning] = useState(initialState?.isRunning ?? false);
  const [isPaused, setIsPaused] = useState(initialState?.isPaused ?? false);
  const [isComplete, setIsComplete] = useState(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const isRunningRef = useRef(isRunning);
  isRunningRef.current = isRunning;
  const isPausedRef = useRef(isPaused);
  isPausedRef.current = isPaused;

  // Auto-reset when the engine changes duration while idle (e.g. sequence activation)
  useEffect(() => {
    if (!isRunningRef.current && !isPausedRef.current) {
      setSecondsLeft(durationSeconds);
      setTotalSeconds(durationSeconds);
      setIsComplete(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [durationSeconds]);

  useEffect(() => {
    if (!isRunning || isPaused) return;
    const interval = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          setIsRunning(false);
          setIsComplete(true);
          onCompleteRef.current();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isRunning, isPaused]);

  const start = useCallback(() => {
    setIsRunning(true);
    setIsPaused(false);
    setIsComplete(false);
  }, []);

  const pause = useCallback(() => {
    setIsPaused(true);
  }, []);

  const resume = useCallback(() => {
    setIsPaused(false);
  }, []);

  const skip = useCallback(() => {
    setSecondsLeft(0);
    setIsRunning(false);
    setIsComplete(true);
  }, []);

  const reset = useCallback((newDuration?: number) => {
    const dur = newDuration ?? durationSeconds;
    setSecondsLeft(dur);
    setTotalSeconds(dur);
    setIsRunning(false);
    setIsPaused(false);
    setIsComplete(false);
  }, [durationSeconds]);

  const elapsed = totalSeconds - secondsLeft;

  return [
    { secondsLeft, totalSeconds, isRunning, isPaused, isComplete, elapsed },
    { start, pause, resume, skip, reset },
  ];
}
