const JWT_RE = /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g;
const BEARER_RE = /Bearer\s+[A-Za-z0-9._~+/=-]+/gi;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE_RE = /(\+?\d[\d\s().-]{7,}\d)/g;

const SENSITIVE_KEYS = new Set([
  'password', 'token', 'authorization', 'cookie', 'email', 'phone',
  'imagine_base64', 'user_prompt', 'user_explanation',
  'greutate', 'inaltime', 'varsta', 'sex', 'data_nasterii',
  'calorii', 'proteine', 'carbohidrati', 'grasimi', 'mese', 'alimente',
  'ingrediente', 'weight', 'height', 'age', 'birth_date', 'meals', 'foods',
]);

/** Înlocuiește identificatori și credentiale dintr-un text de telemetrie. */
export function redactTelemetryText(text: unknown): string {
  if (typeof text !== 'string') return text == null ? '' : String(text);
  return text
    .replace(JWT_RE, '[JWT]')
    .replace(BEARER_RE, '[BEARER]')
    .replace(EMAIL_RE, '[EMAIL]')
    .replace(PHONE_RE, '[PHONE]');
}

/** Scrubează recursiv obiecte înainte să fie trimise către telemetrie. */
export function scrubTelemetryObject(input: unknown): unknown {
  if (input === null || typeof input !== 'object') return input;
  if (Array.isArray(input)) return input.map(scrubTelemetryObject);
  const out: Record<string, unknown> = {};
  for (const [keyOriginal, value] of Object.entries(input as Record<string, unknown>)) {
    const key = keyOriginal.toLowerCase();
    if (SENSITIVE_KEYS.has(key)) {
      out[keyOriginal] = '[SCRUBBED_PII]';
    } else if (value !== null && typeof value === 'object') {
      out[keyOriginal] = scrubTelemetryObject(value);
    } else if (typeof value === 'string') {
      out[keyOriginal] = redactTelemetryText(value);
    } else {
      out[keyOriginal] = value;
    }
  }
  return out;
}

/** Corpurile request pot conține text de chat/masă fără chei predictibile. */
export function sanitizeSentryRequestData(input: unknown): unknown {
  if (typeof input === 'string') return '[SCRUBBED_PII]';
  return scrubTelemetryObject(input);
}

/** Păstrează tipul tehnic, nu mesajul providerului/utilizatorului. */
export function sanitizeSentryExceptionValue(type: unknown, _value: unknown): string {
  const safeType = typeof type === 'string'
    ? type.replace(/[^A-Za-z0-9_.:-]/g, '_').slice(0, 80)
    : 'Error';
  return `${safeType || 'Error'} [DETAILS_REDACTED]`;
}

/**
 * În production consola păstrează doar eticheta primului argument. Detaliile
 * dinamice (inclusiv Error/obiecte) pot conține date nutriționale sau PII.
 */
export function sanitizeProductionConsoleArguments(args: unknown[]): unknown[] {
  if (args.length === 0) return [];
  const first = typeof args[0] === 'string'
    ? redactTelemetryText(args[0]).slice(0, 240)
    : '[REDACTED_OBJECT]';
  return args.length === 1 ? [first] : [first, '[REDACTED_DETAILS]'];
}
