'use strict';

/**
 * Sanitizare centrală pentru telemetrie (Sentry) și loguri.
 *
 * TASK-11: un singur loc în care se decide ce nu are voie să ajungă în afara
 * procesului. Logica stă aici, nu inline în server.js, ca orice flux nou de
 * capturare (webhook-uri, GDPR worker, rate-limit) să moștenească aceleași
 * reguli fără a le reimplementa.
 *
 * Regula de aur: PII nu se trimite. Dacă e necesară corelarea, se folosește un
 * identificator pseudonimizat STABIL (pseudonimizeaza()), niciodată valoarea
 * brută (user_id, email, token, ID Clerk/ImageKit, etc).
 */

const crypto = require('crypto');

const JWT_RE = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;
const BEARER_RE = /Bearer\s+\S+/gi;
const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
// Telefoane: doar forme plauzibile — "+" international, prefix intre paranteze
// sau cifre grupate cu separatori (0722 123 456, 555-123-4567). O secventa lunga
// de cifre fara separatori (timestamp unix, dimensiune, ID numeric) nu e telefon
// si nu trebuie redactata.
const PHONE_RE = /(?:\+(?:\d[\s().-]*){7,15}|\(\d{2,4}\)[\s().-]?\d{3}[\s().-]?\d{3,4}|\d{2,4}[\s().-]\d{3}[\s().-]\d{3,4})/g;

/**
 * Chei considerate PII în obiectele structurale (payloaduri webhook, corpuri
 * de request, extra). Dacă o cheie e aici, valoarea ei nu ajunge niciodată în
 * telemetrie.
 */
const CHEI_PII = new Set([
  'token', 'tokens', 'access_token', 'refresh_token', 'id_token',
  'password', 'parola', 'authorization', 'cookie', 'cookies',
  'session', 'session_token', 'api_key', 'apikey', 'secret',
  'email', 'phone', 'telefon', 'user_id', 'userid', 'clerk_user_id',
  'imagekit_file_id', 'imagine_base64', 'user_prompt', 'user_explanation',
  'user_disclaimer', 'webhook_payload', 'body', 'data',
]);

/** Chei permise — metadata non-sensibilă de diagnostic. */
const CHEI_PERMISE_DIAGNOSTIC = new Set([
  'code', 'cod', 'status', 'status_code', 'error', 'errors', 'name',
  'message', 'component', 'webhook', 'event_type', 'pattern_index',
  'suppressed', 'retry_count', 'max_retries_exceeded', 'dead_letter',
  'stage', 'step', 'files', 'file_count', 'bytes', 'width', 'height',
  'format', 'mime', 'duration_ms', 'attempt',
]);

/** Șterge emailuri/JWT/Bearer/telefoane dintr-un text. */
function redacteazaPii(text) {
  if (typeof text !== 'string') return text;
  return text
    .replace(JWT_RE, '[REDACTED_JWT]')
    .replace(BEARER_RE, '[REDACTED_BEARER]')
    .replace(EMAIL_RE, '[REDACTED_EMAIL]')
    .replace(PHONE_RE, '[REDACTED_PHONE]');
}

function etichetaTehnica(value, fallback) {
  const text = value == null ? '' : String(value);
  const safe = text.replace(/[^A-Za-z0-9_.:-]/g, '_').slice(0, 80);
  return safe || fallback;
}

/**
 * Rezumat pentru loguri operaționale. Mesajul/cause/response/body sunt omise
 * intenționat: furnizorii pot reflecta promptul, emailul sau tokenul în ele.
 */
function rezumatEroareSigur(eroare, context = {}) {
  const rezultat = {
    operation: etichetaTehnica(context.operation, 'unknown'),
    provider: etichetaTehnica(context.provider, 'internal'),
    code: etichetaTehnica(eroare?.code ?? eroare?.name, 'UNKNOWN_ERROR'),
    name: etichetaTehnica(eroare?.name, 'Error'),
  };
  const status = Number(eroare?.status ?? eroare?.statusCode);
  if (Number.isInteger(status) && status >= 100 && status <= 599) {
    rezultat.status = status;
  }
  return rezultat;
}

/**
 * Pseudonimizator stabil (HMAC-SHA256) pentru identificatori. Folosește la
 * corelare în telemetrie fără să expună valoarea brută. Același input →
 * același output; nu e reversibil fără saltul secret.
 */
function pseudonimizeaza(input, salt) {
  const text = input == null ? '' : String(input);
  if (!text) return '[GOAL]';
  const cheie = salt || process.env.SENTRY_PII_SALT || 'nutriai-telemetry';
  const digest = crypto.createHmac('sha256', cheie).update(text, 'utf8').digest('hex');
  return `[PID:${digest.slice(0, 12)}]`;
}

/**
 * Curăță recursiv un obiect pentru telemetrie. Păstrează cheile non-PII,
 * scrubează valorile string pe care le întâlnește și plafonează adâncimea și
 * lungimea stringurilor.
 */
function scrubObjectForTelemetry(obj, maxDepth = 6, maxStr = 200) {
  if (maxDepth <= 0) return Array.isArray(obj) ? [] : {};
  if (Array.isArray(obj)) {
    return obj.slice(0, 50).map((v) => scrubObjectForTelemetry(v, maxDepth - 1, maxStr));
  }
  if (obj !== null && typeof obj === 'object') {
    const rezultat = {};
    for (const cheie of Object.keys(obj)) {
      const cheieLc = String(cheie).toLowerCase();
      if (CHEI_PII.has(cheieLc)) {
        rezultat[cheie] = '[SCRUBBED_PII]';
        continue;
      }
      const valoare = obj[cheie];
      if (typeof valoare === 'string') {
        rezultat[cheie] = redacteazaPii(valoare).slice(0, maxStr);
      } else if (valoare !== null && typeof valoare === 'object') {
        rezultat[cheie] = scrubObjectForTelemetry(valoare, maxDepth - 1, maxStr);
      } else if (typeof valoare === 'number' || typeof valoare === 'boolean') {
        if (CHEI_PERMISE_DIAGNOSTIC.has(cheieLc) || typeof valoare === 'boolean') {
          rezultat[cheie] = valoare;
        } else {
          // M-20: numerele non-permise nu se sterg silențios — se marcheaza,
          // la fel ca stringurile, ca sa nu dispara campuri de diagnostic.
          rezultat[cheie] = '[REDACTED_NUMBER]';
        }
      }
    }
    return rezultat;
  }
  return obj;
}

/** Griffă pentru un breadcrumb: message și data la limită PII. */
function scrubbedBreadcrumb(crumb) {
  if (!crumb || typeof crumb !== 'object') return crumb;
  const decupat = { ...crumb };
  if (typeof crumb.message === 'string') {
    decupat.message = redacteazaPii(crumb.message).slice(0, 200);
  }
  if (crumb.data && typeof crumb.data === 'object') {
    decupat.data = scrubObjectForTelemetry(crumb.data);
  }
  return decupat;
}

/** Curăță defensiv forma completă transmisă de SDK către Sentry. */
function scrubSentryEvent(event) {
  if (!event || typeof event !== 'object') return event;
  const curatat = { ...event };
  if (typeof curatat.message === 'string') {
    curatat.message = redacteazaPii(curatat.message).slice(0, 200);
  }
  if (curatat.exception && Array.isArray(curatat.exception.values)) {
    curatat.exception = {
      ...curatat.exception,
      values: curatat.exception.values.map((exceptie) => {
        if (!exceptie || typeof exceptie !== 'object') return exceptie;
        const urmatoare = { ...exceptie };
        const tip = etichetaTehnica(exceptie.type, 'Error');
        urmatoare.value = `${tip} [DETAILS_REDACTED]`;
        if (exceptie.stacktrace && Array.isArray(exceptie.stacktrace.frames)) {
          urmatoare.stacktrace = {
            ...exceptie.stacktrace,
            frames: exceptie.stacktrace.frames.map((cadru) => {
              if (!cadru || typeof cadru !== 'object') return cadru;
              const copie = { ...cadru };
              for (const camp of ['filename', 'context_line', 'pre_context', 'post_context']) {
                const valoare = copie[camp];
                if (typeof valoare === 'string') copie[camp] = redacteazaPii(valoare);
                else if (Array.isArray(valoare)) {
                  copie[camp] = valoare.map((linie) =>
                    typeof linie === 'string' ? redacteazaPii(linie) : linie);
                }
              }
              return copie;
            }),
          };
        }
        return urmatoare;
      }),
    };
  }
  if (curatat.request && typeof curatat.request === 'object') {
    curatat.request = { ...curatat.request };
    curatat.request.data = '[SCRUBBED_PII]';
    curatat.request.headers = {};
    if (curatat.request.url) {
      curatat.request.url = String(curatat.request.url).split(/[?#]/, 1)[0];
    }
  }
  curatat.user = undefined;
  if (curatat.extra) curatat.extra = { redacted: true };
  if (curatat.contexts) curatat.contexts = {};
  if (Array.isArray(curatat.breadcrumbs)) {
    curatat.breadcrumbs = curatat.breadcrumbs
      .filter((crumb) => crumb?.category !== 'console')
      .slice(-50)
      .map(scrubbedBreadcrumb);
  }
  return curatat;
}

module.exports = {
  redacteazaPii,
  pseudonimizeaza,
  scrubObjectForTelemetry,
  scrubbedBreadcrumb,
  scrubSentryEvent,
  rezumatEroareSigur,
  CHEI_PII,
};
