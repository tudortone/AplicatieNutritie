'use strict';

/**
 * Test de echivalenta pentru magic-bytes (Task T2, PLAN_REFACTOR.md).
 *
 * Confond in `utils/detecteazaMime.js` sursa unica de detecEE a MIME-ului unei
 * imagini, functie-functional identica cu ambele implementari vechi:
 *   - `services/ai/vision.js` -> `detectImageMime` (buffer citit de `fs.readFile`
 *     in routes/ai.js, intotdeauna Buffer);
 *   - `src/trigger/analiza-mancare-ai.js` -> `detecteazaMime` (buffer obtinut din
 *     corpul descarcarii, intotdeauna Buffer).
 * Pentru ORICE input Buffer real, cele doua functii vechi returnau identic
 * `'image/jpeg' | 'image/png' | 'image/webp' | null` — acest test pastreaza
 * contractul parapetului (parity) prin asteptari explicite pe Buffer uri reale.
 * Unica divergenta ar fi pentru input-uri non-Buffer (de ex. Array), care nu
 * exista in niciuna dintre cele doua carai reale; aici toate sunt Buffer.
 */

const {
  detecteazaMime,
  detectImageMime,
  MIME_PERMISE,
} = require('../utils/detecteazaMime');

describe('detecteazaMime (magic bytes, T2)', () => {
  const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x46]);
  const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
  const WEBP = Buffer.from('RIFF1234WEBPVP8', 'ascii');

  it('detecteaza JPEG din magic bytes (paritate cu ambele implementari vechi)', () => {
    expect(detecteazaMime(JPG)).toBe('image/jpeg');
    expect(detectImageMime(JPG)).toBe('image/jpeg');
  });

  it('detecteaza PNG din magic bytes', () => {
    expect(detecteazaMime(PNG)).toBe('image/png');
    expect(detectImageMime(PNG)).toBe('image/png');
  });

  it('detecteaza WEBP din headerul RIFF....WEBP', () => {
    expect(detecteazaMime(WEBP)).toBe('image/webp');
    expect(detectImageMime(WEBP)).toBe('image/webp');
  });

  it('intoarce null pentru un buffer prea scurt', () => {
    expect(detecteazaMime(Buffer.from([0xff, 0xd8]))).toBeNull();
    expect(detecteazaMime(Buffer.alloc(3))).toBeNull();
    expect(detectImageMime(Buffer.from([0xff, 0xd8]))).toBeNull();
  });

  it('intoarce null pentru un buffer fara semnatura cunoscuta', () => {
    expect(detecteazaMime(Buffer.from('salut', 'ascii'))).toBeNull();
    expect(detectImageMime(Buffer.from([1, 2, 3, 4, 5]))).toBeNull();
  });

  it('intoarce null pentru valori lipsa (paritate null-safe)', () => {
    expect(detecteazaMime(null)).toBeNull();
    expect(detecteazaMime(undefined)).toBeNull();
    expect(detectImageMime(null)).toBeNull();
  });

  it('aliasul detectImageMime este aceeasi functie ca detecteazaMime', () => {
    expect(detectImageMime).toBe(detecteazaMime);
  });

  it('MIME_PERMISE contine exact JPEG/PNG/WEBP', () => {
    expect(MIME_PERMISE).toEqual(new Set(['image/jpeg', 'image/png', 'image/webp']));
  });
});