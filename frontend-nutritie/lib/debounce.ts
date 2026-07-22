/**
 * debounce.ts — Utilitare anti-dublu-submit și debounce pentru interfața mobilă de sală.
 * Conform specificației NutriAI v7 (Secțiunea 3.D).
 */

export function once<T extends (...args: any[]) => Promise<any> | any>(fn: T): (...args: Parameters<T>) => ReturnType<T> | undefined {
  let inFlight: Promise<any> | null = null;
  let isRunning = false;

  return (...args: Parameters<T>): any => {
    if (inFlight || isRunning) {
      return inFlight || undefined;
    }

    isRunning = true;
    try {
      const result = fn(...args);
      if (result && typeof result.then === 'function') {
        inFlight = result;
        return result.finally(() => {
          inFlight = null;
          isRunning = false;
        });
      } else {
        isRunning = false;
        return result;
      }
    } catch (e) {
      isRunning = false;
      inFlight = null;
      throw e;
    }
  };
}

export const debounce = <T extends (...args: any[]) => void>(fn: T, ms = 250): ((...args: Parameters<T>) => void) => {
  let t: any = null;
  return (...args: Parameters<T>) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
};
