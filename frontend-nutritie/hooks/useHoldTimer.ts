/**
 * useHoldTimer.ts — Timer background-safe pentru exerciții tip izometrie / hold (plank, wall sit).
 * Conform specificației NutriAI v7 (Secțiunea 3.B).
 * Nu folosește setInterval ca sursă de adevăr pentru cronometrare, ci timestamp absolut Date.now().
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { AppState } from 'react-native';

export function useHoldTimer(initialSeconds = 0) {
  const startRef = useRef<number | null>(null);
  const accumRef = useRef(initialSeconds);
  const [elapsed, setElapsed] = useState(initialSeconds);
  const [isRunning, setIsRunning] = useState(false);

  const compute = useCallback(() => {
    if (startRef.current == null) {
      return accumRef.current;
    }
    return accumRef.current + (Date.now() - startRef.current) / 1000;
  }, []);

  const start = useCallback(() => {
    if (startRef.current == null) {
      startRef.current = Date.now();
      setIsRunning(true);
    }
  }, []);

  const pause = useCallback(() => {
    if (startRef.current != null) {
      accumRef.current = compute();
      startRef.current = null;
      setIsRunning(false);
      setElapsed(accumRef.current);
    }
  }, [compute]);

  const reset = useCallback((newSec = 0) => {
    startRef.current = null;
    accumRef.current = newSec;
    setElapsed(newSec);
    setIsRunning(false);
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      if (startRef.current != null) {
        setElapsed(compute());
      }
    }, 250);

    const sub = AppState.addEventListener('change', () => {
      if (startRef.current != null) {
        setElapsed(compute());
      }
    });

    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [compute]);

  return {
    elapsed: Math.floor(elapsed),
    isRunning,
    start,
    pause,
    reset,
  };
}
