import {
  redactTelemetryText,
  sanitizeSentryExceptionValue,
  sanitizeSentryRequestData,
  sanitizeProductionConsoleArguments,
  scrubTelemetryObject,
} from '../lib/telemetryPrivacy';

describe('confidențialitatea telemetriei frontend', () => {
  it('redactează credentiale și identificatori din text', () => {
    expect(redactTelemetryText(
      'Bearer secret-token user@nutriai.ro +40 712 345 678 eyJabcdefgh.abcdefgh.abcdefgh',
    )).toBe('[BEARER] [EMAIL] [PHONE] [JWT]');
  });

  it('elimină recursiv datele de sănătate și autentificare', () => {
    expect(scrubTelemetryObject({
      token: 'secret',
      profil: { greutate: 72, email: 'user@nutriai.ro' },
      status: 'failed',
    })).toEqual({
      token: '[SCRUBBED_PII]',
      profil: { greutate: '[SCRUBBED_PII]', email: '[SCRUBBED_PII]' },
      status: 'failed',
    });
  });

  it('nu lasă obiectul de eroare sau detaliile dinamice în consola production', () => {
    expect(sanitizeProductionConsoleArguments([
      '[Camera] Eroare analiză',
      new Error('masă: burger, 900 kcal'),
    ])).toEqual(['[Camera] Eroare analiză', '[REDACTED_DETAILS]']);
  });

  it('nu transmite corpuri request string către Sentry', () => {
    const raw = JSON.stringify({
      mesaj: 'burger 900 kcal',
      email: 'user@nutriai.ro',
      authorization: 'Bearer secret-token',
    });

    expect(sanitizeSentryRequestData(raw)).toBe('[SCRUBBED_PII]');
    expect(sanitizeSentryRequestData({ status: 503, user_prompt: 'burger 900 kcal' })).toEqual({
      status: 503,
      user_prompt: '[SCRUBBED_PII]',
    });
  });

  it('nu transmite conținutul arbitrar din mesajul excepției către Sentry', () => {
    expect(sanitizeSentryExceptionValue(
      'ProviderError',
      'provider echoed burger 900 kcal for user@nutriai.ro',
    )).toBe('ProviderError [DETAILS_REDACTED]');
  });
});
