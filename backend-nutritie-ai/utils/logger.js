'use strict';

const crypto = require('crypto');

// Chei de metadata acceptate în loguri (lista alba, B-11). Orice altceva este
// pierdut — datele de alimentatie sunt date de sanatate si nu trebuie logate.
const CHEI_PERMISE = new Set([
  'requestId', 'status', 'metoda', 'ruta', 'statusCode', 'durataMs',
  'userId', 'furnizor', 'model', 'providerKey', 'numeRuta',
]);

// Chei/Tipuri care, daca apar in arguments/erori, sunt inlocuite inainte de log.
const CHEI_PII = new Set([
  'authorization', 'token', 'jwt', 'secret', 'password', 'parola', 'email',
  'mesaj', 'user_prompt', 'userExplanation', 'imagine_base64', 'text',
  'body', 'data', 'cookie', 'set-cookie',
]);

function curataValoare(valoare) {
  if (valoare === null || typeof valoare !== 'object') return valoare;
  if (Array.isArray(valoare)) return valoare.map(curataValoare);
  const curat = {};
  for (const [cheie, val] of Object.entries(valoare)) {
    if (CHEI_PII.has(cheie.toLowerCase())) {
      curat[cheie] = '[SCRUBBED_PII]';
    } else if (typeof val === 'object' && val !== null) {
      curat[cheie] = curataValoare(val);
    } else {
      curat[cheie] = val;
    }
  }
  return curat;
}

function sanitizeMeta(meta) {
  if (!meta || typeof meta !== 'object') return {};
  const rezultat = {};
  for (const [cheie, valoare] of Object.entries(meta)) {
    if (!CHEI_PERMISE.has(cheie)) continue;
    rezultat[cheie] = curataValoare(valoare);
  }
  return rezultat;
}

/**
 * Logger structurat cu support pentru requestId și niveluri de logare (info, warn, error).
 * Metadata este filtro prin lista alba CHEI_PERMISE; continutul de utilizator nu ajunge.
 */
class Logger {
  static formatMessage(level, message, meta = {}) {
    let textMesaj = typeof message === 'object' ? JSON.stringify(curataValoare(message)) : String(message);
    // Mesajele pot transporta date de utilizator daca sunt obiecte de eroare construit
    // cu input din cerere. Le limitam la primele 400 caractere ca sa nu scape entitati lungi.
    if (textMesaj.length > 400) textMesaj = textMesaj.slice(0, 400) + '...[truncat]';
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      level: level.toUpperCase(),
      requestId: meta.requestId || 'system',
      message: textMesaj,
      ...sanitizeMeta(meta)
    });
  }

  static info(message, meta) {
    console.log(this.formatMessage('info', message, meta));
  }

  static warn(message, meta) {
    console.warn(this.formatMessage('warn', message, meta));
  }

  static error(message, meta) {
    console.error(this.formatMessage('error', message, meta));
  }
}

/**
 * Middleware Express pentru atașare requestId unic fiecărei cereri.
 */
const requestIdMiddleware = (req, res, next) => {
  const existingId = req.headers['x-request-id'];
  req.requestId = existingId || crypto.randomUUID();
  res.setHeader('X-Request-ID', req.requestId);
  next();
};

module.exports = {
  Logger,
  requestIdMiddleware
};
