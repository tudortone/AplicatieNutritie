import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Citește setarea „Remove animations" / „Reduce motion" a sistemului și reacționează
 * la schimbarea ei. Folosit pentru a dezactiva animațiile decorative infinite
 * (pulsuri, shimmers, loops) care altfel ar rula independent de preferința de accesibilitate.
 *
 * Notă: animațiile de intrare/ieșire reanimated (FadeIn, ZoomIn, Layout…) respectă deja
 * ReduceMotion.System la nivel de motor; această funcție acoperă restul (withRepeat,
 * Animated.loop) care nu trece prin builder-ul de layout.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (active) setReduced(enabled);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      setReduced(enabled);
    });
    return () => {
      active = false;
      sub.remove();
    };
  }, []);

  return reduced;
}
