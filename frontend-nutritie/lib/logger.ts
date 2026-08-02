/**
 * Logger centralizat.
 *
 * MUST-FIX #5 din auditul de productie: `console.*` ramanea activ in build-ul
 * de productie (poluare loguri + risc de scurgere de date). Toate modulele
 * trebuie sa foloseasca `log` in loc de `console`.
 *
 * - In development (`__DEV__`) se logheaza totul in consola.
 * - In productie doar `log.error` este pastrat si trimis catre reporter-ul de
 *   crash-uri (Sentry/Crashlytics), daca este configurat prin `setCrashReporter`.
 */

type LogArgs = unknown[];

type CrashReporter = {
  captureException?: (error: unknown, context?: Record<string, unknown>) => void;
  captureMessage?: (message: string, context?: Record<string, unknown>) => void;
};

let crashReporter: CrashReporter | null = null;

/**
 * Se apeleaza o singura data la pornirea aplicatiei, dupa initializarea
 * serviciului de monitorizare (ex. Sentry.init).
 */
export function setCrashReporter(reporter: CrashReporter | null) {
  crashReporter = reporter;
}

function toMessage(args: LogArgs): string {
  return args
    .map((a) => {
      if (typeof a === 'string') return a;
      if (a instanceof Error) return a.message;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(' ');
}

export const log = {
  debug: (...args: LogArgs) => {
    if (__DEV__) console.log(...args);
  },

  info: (...args: LogArgs) => {
    if (__DEV__) console.info(...args);
  },

  warn: (...args: LogArgs) => {
    if (__DEV__) {
      console.warn(...args);
      return;
    }
    crashReporter?.captureMessage?.(toMessage(args), { level: 'warning' });
  },

  /**
   * Erorile sunt raportate si in productie. Nu trimite niciodata date
   * personale (email, token, continut de mesaje) in `context`.
   */
  error: (...args: LogArgs) => {
    if (__DEV__) {
      console.error(...args);
    }
    const err = args.find((a) => a instanceof Error);
    if (err) {
      crashReporter?.captureException?.(err, { message: toMessage(args) });
    } else {
      crashReporter?.captureMessage?.(toMessage(args), { level: 'error' });
    }
  },
};

export default log;
