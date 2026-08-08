'use strict';

/**
 * Detectarea tipului MIME al unei imagini din primii bytes (magic bytes).
 *
 * Sursa unica de adevar pentru `services/ai/vision.js` (exportata si ca
 * `detectImageMime`, numele folosit de routes/ai.js) si pentru
 * `src/trigger/analiza-mancare-ai.js`. Ambele implementari vechi returnau,
 * pentru ORICE input Buffer real, exact acelasi rezultat: `'image/jpeg'`,
 * `'image/png'`, `'image/webp'` sau `null`. Pe 2026-08-08 au fost unificate
 * aici, fara schimbare de comportament (Task T2, PLAN_REFACTOR.md).
 *
 * Garda `Buffer.isBuffer` este intentionala: o valoare non-Buffer (de ex. un
 * Array simplu) nu poate fi un fisier imagine descarcat de pe disk sau din HTTP,
 * deci nu trebuie acceptata ca sigur. Cele doua call-site-uri reale trec mereu
 * Buffer-uri, deci comportamentul e identic cu cel de dinainte.
 */

const MIME_PERMISE = new Set(['image/jpeg', 'image/png', 'image/webp']);

function detecteazaMime(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return null;
  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  // PNG: 89 50 4E 47
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'image/png';
  // WEBP: RIFF....WEBP (bytes 8-11)
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) return 'image/webp';
  return null;
}

// Alias pastrat pentru interfata factory-ului vision (routes/ai.js:208).
const detectImageMime = detecteazaMime;

module.exports = { detecteazaMime, detectImageMime, MIME_PERMISE };
