'use strict';

/**
 * TASK-11: Tests pentru sanitizerul central de telemetrie.
 *
 * Garzi verificate aici:
 *  - textul cu email / JWT / Bearer / telefon se redactează;
 *  - obiectele nested scrubează cheile PII și plafonează adâncimea/lungimea;
 *  - pseudonimizarea e stabilă (același input → același output) și nu expune
 *    valoarea brută;
 *  - contextul Sentry (breadcrumb) se curăță de PII.
 */

const {
  redacteazaPii,
  pseudonimizeaza,
  scrubObjectForTelemetry,
  scrubbedBreadcrumb,
} = require('../utils/sentrySanitize');

describe('TASK-11 — sanitizare telemetrie (utils/sentrySanitize)', () => {
  test('redacteazaPii șterge email, JWT, Bearer și telefon din text', () => {
    const text =
      'contact: ana.popescu@example.ro, token: ' +
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.abc123def456, ' +
      'auth: Bearer abc.def.ghi, tel: +40 722 123 456';
    const out = redacteazaPii(text);
    expect(out).toContain('[REDACTED_EMAIL]');
    expect(out).toContain('[REDACTED_JWT]');
    expect(out).toContain('[REDACTED_BEARER]');
    expect(out).toContain('[REDACTED_PHONE]');
    expect(out).not.toContain('ana.popescu@example.ro');
    expect(out).not.toContain('eyJhbGci');
    expect(out).not.toContain('+40 722 123 456');
  });

  test('redacteazaPii lasă textul fără PII intact', () => {
    const text = 'cod de eroare 4321, mesaj generic';
    expect(redacteazaPii(text)).toBe(text);
  });

  test('scrubObjectForTelemetry scrubează chei PII pe mai multe niveluri', () => {
    const obiect = {
      user_id: 'user-456',
      email: 'a@b.ro',
      token: 'eyJ.sig',
      nested: { password: 'titlul0123', user_prompt: 'ce mănânc' },
      safe: { code: 500, message: 'alimente', bytes: 12 },
    };
    const out = scrubObjectForTelemetry(obiect);
    expect(out.user_id).toBe('[SCRUBBED_PII]');
    expect(out.email).toBe('[SCRUBBED_PII]');
    expect(out.token).toBe('[SCRUBBED_PII]');
    expect(out.nested.password).toBe('[SCRUBBED_PII]');
    expect(out.nested.user_prompt).toBe('[SCRUBBED_PII]');
    expect(out.safe.code).toBe(500);
    expect(out.safe.message).toBe('alimente');
    expect(JSON.stringify(out)).not.toContain('user-456');
    expect(JSON.stringify(out)).not.toContain('a@b.ro');
  });

  test('scrubObjectForTelemetry plafonează lungimea stringurilor', () => {
    const out = scrubObjectForTelemetry({ nume: 'x'.repeat(500) }, 4, 50);
    expect(out.nume.length).toBe(50);
  });

  test('pseudonimizeaza e stabil dar nu expune valoarea brută', () => {
    const a = pseudonimizeaza('user-456');
    const b = pseudonimizeaza('user-456');
    const c = pseudonimizeaza('user-999');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).not.toContain('user-456');
    expect(a).toMatch(/\[PID:[0-9a-f]{12}\]/);
  });

  test('pseudonimizeaza valori goale → placeholder', () => {
    expect(pseudonimizeaza(null)).toBe('[GOAL]');
    expect(pseudonimizeaza('')).toBe('[GOAL]');
  });

  test('scrubbedBreadcrumb curată message + data', () => {
    const out = scrubbedBreadcrumb({
      message: 'utilizator a@b.ro a încercat',
      data: { user_id: 'user-x', status: 401 },
      category: 'http',
    });
    expect(out.message).toContain('[REDACTED_EMAIL]');
    expect(out.message).not.toContain('a@b.ro');
    expect(out.data.user_id).toBe('[SCRUBBED_PII]');
    expect(out.data.status).toBe(401);
  });
});