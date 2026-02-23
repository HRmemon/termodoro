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

export function useTimer(
  durationSeconds: number,
  onComplete: () => void,
): [TimerState, TimerActions] {
  const [secondsLeft, setSecondsLeft] = useState(durationSeconds);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const startTimeRef = useRef<number | null>(null);
  const pausedElapsedRef = useRef(0);

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
    startTimeRef.current = Date.now();
    pausedElapsedRef.current = 0;
  }, []);

  const pause = useCallback(() => {
    if (isRunning && !isPaused) {
      setIsPaused(true);
      if (startTimeRef.current) {
        pausedElapsedRef.current += Math.floor((Date.now() - startTimeRef.current) / 1000);
      }
    }
  }, [isRunning, isPaused]);

  const resume = useCallback(() => {
    if (isRunning && isPaused) {
      setIsPaused(false);
      startTimeRef.current = Date.now();
    }
  }, [isRunning, isPaused]);

  const skip = useCallback(() => {
    setSecondsLeft(0);
    setIsRunning(false);
    setIsComplete(true);
  }, []);

  const reset = useCallback((newDuration?: number) => {
    const dur = newDuration ?? durationSeconds;
    setSecondsLeft(dur);
    setIsRunning(false);
    setIsPaused(false);
    setIsComplete(false);
    startTimeRef.current = null;
    pausedElapsedRef.current = 0;
  }, [durationSeconds]);

  const elapsed = durationSeconds - secondsLeft;

  const state: TimerState = {
    secondsLeft,
    totalSeconds: durationSeconds,
    isRunning,
    isPaused,
    isComplete,
    elapsed,
  };

  return [state, { start, pause, resume, skip, reset }];
}
