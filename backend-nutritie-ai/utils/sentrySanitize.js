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

module.exports = {
  redacteazaPii,
  pseudonimizeaza,
  scrubObjectForTelemetry,
  scrubbedBreadcrumb,
  CHEI_PII,
};
