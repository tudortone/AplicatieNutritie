'use strict';

const express = require('express');
const request = require('supertest');

const {
  buildPlayIntegrityRequestHash,
  createGooglePlayIntegrityDecoder,
  createPlayIntegrityGuard,
  createPlayIntegrityVerifier,
  parseOptionalVerdicts,
  KNOWN_PLAY_PROTECT_VERDICTS,
} = require('../utils/playIntegrity');

const NOW = 1_800_000_000_000;
const HASH = 'Q35Hmy8PctX3pjA2L-1-35r3R6U5L9y1WC6LMEEcsXE';

function validPayload(overrides = {}) {
  return {
    tokenPayloadExternal: {
      requestDetails: {
        requestPackageName: 'com.totsrl.getflo',
        requestHash: HASH,
        timestampMillis: String(NOW - 1_000),
      },
      appIntegrity: {
        appRecognitionVerdict: 'PLAY_RECOGNIZED',
        packageName: 'com.totsrl.getflo',
      },
      deviceIntegrity: {
        deviceRecognitionVerdict: ['MEETS_DEVICE_INTEGRITY'],
      },
      accountDetails: { appLicensingVerdict: 'LICENSED' },
      ...overrides,
    },
  };
}

describe('Play Integrity request binding', () => {
  test('binds method, canonical path, idempotency key and canonical body', () => {
    expect(buildPlayIntegrityRequestHash({
      method: 'post',
      path: '/billing/google/verify',
      idempotencyKey: 'idem-1',
      body: { purchaseToken: 'token-123' },
    })).toBe(HASH);

    expect(buildPlayIntegrityRequestHash({
      method: 'POST',
      path: '/billing/google/verify',
      idempotencyKey: 'idem-1',
      body: { purchaseToken: 'token-123' },
    })).toBe(HASH);
  });

  test('a token bound to one action cannot be replayed for another action', () => {
    const verifyHash = buildPlayIntegrityRequestHash({
      method: 'POST', path: '/billing/google/verify', body: { purchaseToken: 'token-123' },
    });
    const photoHash = buildPlayIntegrityRequestHash({
      method: 'POST', path: '/photo-jobs', body: { purchaseToken: 'token-123' },
    });
    expect(verifyHash).not.toBe(photoHash);
  });
});

describe('Play Integrity Google decoder', () => {
  test('uses the server-side decode API without exposing the token in failures', async () => {
    const fetchImpl = jest.fn(async () => ({ ok: false, status: 503 }));
    const decode = createGooglePlayIntegrityDecoder({
      packageName: 'com.totsrl.getflo',
      auth: { getClient: async () => ({ getRequestHeaders: async () => ({ Authorization: 'Bearer adc' }) }) },
      fetchImpl,
    });
    const token = 'opaque-sensitive-token';
    await expect(decode(token)).rejects.toMatchObject({
      message: 'Play Integrity decode failed.',
      code: 'PLAY_INTEGRITY_DECODE_FAILED',
      status: 503,
    });
    try {
      await decode(token);
    } catch (error) {
      expect(JSON.stringify({ message: error.message, code: error.code })).not.toContain(token);
    }
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://playintegrity.googleapis.com/v1/com.totsrl.getflo:decodeIntegrityToken',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer adc' }),
        body: JSON.stringify({ integrity_token: token }),
      }),
    );
  });
});

describe('Play Integrity server verification', () => {
  test('accepts only a fresh, request-bound Play-recognized licensed app on a trusted device', async () => {
    const verifier = createPlayIntegrityVerifier({
      packageName: 'com.totsrl.getflo',
      decodeToken: async () => validPayload(),
      now: () => NOW,
    });

    await expect(verifier.verify({ token: 'opaque-token', expectedRequestHash: HASH }))
      .resolves.toMatchObject({ trusted: true, reason: 'VERIFIED' });
  });

  test.each([
    ['wrong request hash', validPayload({ requestDetails: { requestPackageName: 'com.totsrl.getflo', requestHash: 'wrong', timestampMillis: String(NOW) } }), 'REQUEST_HASH_MISMATCH'],
    ['wrong package', validPayload({ requestDetails: { requestPackageName: 'other.app', requestHash: HASH, timestampMillis: String(NOW) } }), 'PACKAGE_MISMATCH'],
    ['stale token', validPayload({ requestDetails: { requestPackageName: 'com.totsrl.getflo', requestHash: HASH, timestampMillis: String(NOW - 10 * 60_000) } }), 'TOKEN_STALE'],
    ['unrecognized app', validPayload({ appIntegrity: { appRecognitionVerdict: 'UNRECOGNIZED_VERSION' } }), 'APP_NOT_RECOGNIZED'],
    ['wrong recognized app package', validPayload({ appIntegrity: { appRecognitionVerdict: 'PLAY_RECOGNIZED', packageName: 'other.app' } }), 'PACKAGE_MISMATCH'],
    ['untrusted device', validPayload({ deviceIntegrity: { deviceRecognitionVerdict: [] } }), 'DEVICE_NOT_TRUSTED'],
    ['unlicensed account', validPayload({ accountDetails: { appLicensingVerdict: 'UNLICENSED' } }), 'ACCOUNT_NOT_LICENSED'],
  ])('rejects %s', async (_label, payload, reason) => {
    const verifier = createPlayIntegrityVerifier({
      packageName: 'com.totsrl.getflo',
      decodeToken: async () => payload,
      now: () => NOW,
    });
    await expect(verifier.verify({ token: 'opaque-token', expectedRequestHash: HASH }))
      .resolves.toMatchObject({ trusted: false, reason });
  });

  test('fails closed without trusting client booleans or malformed decoder responses', async () => {
    const verifier = createPlayIntegrityVerifier({
      packageName: 'com.totsrl.getflo',
      decodeToken: async () => ({ isDeviceValid: true }),
      now: () => NOW,
    });
    await expect(verifier.verify({ token: 'opaque-token', expectedRequestHash: HASH }))
      .resolves.toEqual({ trusted: false, reason: 'MALFORMED_VERDICT' });
  });

  test.each([
    ['', async () => validPayload(), 'TOKEN_MISSING'],
    ['opaque-token', async () => { throw new Error('provider unavailable'); }, 'DECODE_UNAVAILABLE'],
  ])('fails closed for missing/provider-failed token verification', async (token, decodeToken, reason) => {
    const verifier = createPlayIntegrityVerifier({
      packageName: 'com.totsrl.getflo', decodeToken, now: () => NOW,
    });
    await expect(verifier.verify({ token, expectedRequestHash: HASH }))
      .resolves.toEqual({ trusted: false, reason });
  });
});

describe('Play Integrity optional verdict parser forward-compatibility', () => {
  test('returns default structure when optional fields are completely absent', () => {
    const parsed = parseOptionalVerdicts({
      requestDetails: { requestPackageName: 'com.totsrl.getflo' },
    });
    expect(parsed).toEqual({
      playProtect: 'UNEVALUATED',
      appAccessRisk: null,
      recentDeviceActivity: 'UNEVALUATED',
      deviceAttributes: null,
    });
  });

  test('handles null, undefined or non-object payloads gracefully without throwing', () => {
    expect(parseOptionalVerdicts(null)).toEqual({
      playProtect: 'UNEVALUATED',
      appAccessRisk: null,
      recentDeviceActivity: 'UNEVALUATED',
      deviceAttributes: null,
    });
    expect(parseOptionalVerdicts(undefined)).toEqual({
      playProtect: 'UNEVALUATED',
      appAccessRisk: null,
      recentDeviceActivity: 'UNEVALUATED',
      deviceAttributes: null,
    });
    expect(parseOptionalVerdicts('not an object')).toEqual({
      playProtect: 'UNEVALUATED',
      appAccessRisk: null,
      recentDeviceActivity: 'UNEVALUATED',
      deviceAttributes: null,
    });
  });

  test('correctly parses full set of optional fields when present', () => {
    const parsed = parseOptionalVerdicts({
      environmentDetails: {
        playProtectVerdict: 'NO_ISSUES',
        appAccessRiskVerdict: {
          otherAppsVerdict: 'NO_ISSUES',
          captureDisplayVerdict: 'NO_ISSUES',
          controlDeviceVerdict: 'NO_ISSUES',
          appsDetected: ['com.google.android.inputmethod.latin'],
        },
      },
      deviceIntegrity: {
        deviceRecognitionVerdict: ['MEETS_DEVICE_INTEGRITY'],
        recentDeviceActivity: { deviceActivityLevel: 'LEVEL_1' },
        deviceAttributes: { sdkVersion: 34 },
      },
    });

    expect(parsed.playProtect).toBe('NO_ISSUES');
    expect(parsed.recentDeviceActivity).toBe('LEVEL_1');
    expect(parsed.deviceAttributes).toEqual({ sdkVersion: 34 });
    expect(parsed.appAccessRisk).toEqual({
      otherAppsVerdict: 'NO_ISSUES',
      captureDisplayVerdict: 'NO_ISSUES',
      controlDeviceVerdict: 'NO_ISSUES',
      appsDetected: ['com.google.android.inputmethod.latin'],
    });
  });

  test('normalizes unknown or malformed optional fields without failing', () => {
    const parsed = parseOptionalVerdicts({
      environmentDetails: {
        playProtectVerdict: 'FUTURE_EXPERIMENTAL_VERDICT',
        appAccessRiskVerdict: {
          otherAppsVerdict: 999,
          appsDetected: ['valid.pkg', 123, null],
        },
      },
      deviceIntegrity: {
        recentDeviceActivity: { deviceActivityLevel: null },
        deviceAttributes: { sdkVersion: 'thirty-four' },
      },
      unexpectedFutureSection: { newField: true },
    });

    expect(parsed.playProtect).toBe('UNEVALUATED');
    expect(parsed.recentDeviceActivity).toBe('UNEVALUATED');
    expect(parsed.deviceAttributes).toEqual({ sdkVersion: null });
    expect(parsed.appAccessRisk.otherAppsVerdict).toBe('UNEVALUATED');
    expect(parsed.appAccessRisk.captureDisplayVerdict).toBe('UNEVALUATED');
    expect(parsed.appAccessRisk.controlDeviceVerdict).toBe('UNEVALUATED');
    expect(parsed.appAccessRisk.appsDetected).toEqual(['valid.pkg']);
  });

  test('all known Play Protect enum values are recognized', () => {
    expect(KNOWN_PLAY_PROTECT_VERDICTS).toEqual(new Set([
      'NO_ISSUES',
      'NO_DATA',
      'POSSIBLE_RISK',
      'MEDIUM_RISK',
      'HIGH_RISK',
      'UNEVALUATED',
    ]));
  });
});

describe('Play Integrity Play Protect risk verdicts handling', () => {
  test.each([
    ['NO_ISSUES', true],
    ['NO_DATA', true],
    ['UNEVALUATED', true],
    ['POSSIBLE_RISK', true],
    ['MEDIUM_RISK', true],
    ['HIGH_RISK', true],
  ])('under default policy, playProtectVerdict %s does not block normal verification (result.trusted=%s)', async (verdict, expectedTrusted) => {
    const payload = validPayload({
      environmentDetails: { playProtectVerdict: verdict },
    });
    const verifier = createPlayIntegrityVerifier({
      packageName: 'com.totsrl.getflo',
      decodeToken: async () => payload,
      now: () => NOW,
    });
    const result = await verifier.verify({ token: 'opaque-token', expectedRequestHash: HASH });
    expect(result.trusted).toBe(expectedTrusted);
    expect(result.verdicts.playProtect).toBe(verdict);
  });

  test('rejects on HIGH_RISK only when rejectHighRiskMalware is explicitly enabled', async () => {
    const payload = validPayload({
      environmentDetails: { playProtectVerdict: 'HIGH_RISK' },
    });
    const strictVerifier = createPlayIntegrityVerifier({
      packageName: 'com.totsrl.getflo',
      decodeToken: async () => payload,
      now: () => NOW,
      rejectHighRiskMalware: true,
    });
    const result = await strictVerifier.verify({ token: 'opaque-token', expectedRequestHash: HASH });
    expect(result.trusted).toBe(false);
    expect(result.reason).toBe('DEVICE_HIGH_RISK_MALWARE');
    expect(result.verdicts.playProtect).toBe('HIGH_RISK');
  });

  test('never fails legitimate users on NO_DATA or UNEVALUATED even when rejectHighRiskMalware is enabled', async () => {
    for (const verdict of ['NO_DATA', 'UNEVALUATED', 'NO_ISSUES']) {
      const payload = validPayload({
        environmentDetails: { playProtectVerdict: verdict },
      });
      const strictVerifier = createPlayIntegrityVerifier({
        packageName: 'com.totsrl.getflo',
        decodeToken: async () => payload,
        now: () => NOW,
        rejectHighRiskMalware: true,
      });
      const result = await strictVerifier.verify({ token: 'opaque-token', expectedRequestHash: HASH });
      expect(result.trusted).toBe(true);
      expect(result.reason).toBe('VERIFIED');
      expect(result.verdicts.playProtect).toBe(verdict);
    }
  });
});

describe('Play Integrity enforcement policy', () => {
  function appFor({ mode, preserveEntitlement = false, requireCleanAccessRisk = false, verification }) {
    const app = express();
    app.use(express.json());
    const guard = createPlayIntegrityGuard({
      mode,
      verifier: { verify: async () => verification },
    });
    app.post('/sensitive', guard({
      action: 'photo.submit',
      canonicalPath: '/sensitive',
      preserveEntitlement,
      requireCleanAccessRisk,
    }), (req, res) => res.json({ ok: true, integrity: req.playIntegrity }));
    return app;
  }

  test('enforce blocks an untrusted high-cost action', async () => {
    const response = await request(appFor({
      mode: 'enforce',
      verification: { trusted: false, reason: 'TOKEN_MISSING' },
    })).post('/sensitive').send({ value: 1 });
    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      eroare: 'Verificarea integrității aplicației nu a reușit.',
      cod: 'PLAY_INTEGRITY_REQUIRED',
    });
  });

  test('observe records the verdict but does not block the request', async () => {
    const response = await request(appFor({
      mode: 'observe',
      verification: { trusted: false, reason: 'TOKEN_MISSING' },
    })).post('/sensitive').send({ value: 1 });
    expect(response.status).toBe(200);
    expect(response.body.integrity).toEqual({ trusted: false, reason: 'TOKEN_MISSING', action: 'photo.submit' });
  });

  test('never destroys access to an already-valid purchase when integrity is unavailable', async () => {
    const response = await request(appFor({
      mode: 'enforce',
      preserveEntitlement: true,
      verification: { trusted: false, reason: 'DECODE_UNAVAILABLE' },
    })).post('/sensitive').send({ value: 1 });
    expect(response.status).toBe(200);
  });

  test('standard sensitive actions are NOT blocked when App Access Risk is detected (no global blocking)', async () => {
    const response = await request(appFor({
      mode: 'enforce',
      requireCleanAccessRisk: false,
      verification: {
        trusted: true,
        reason: 'VERIFIED',
        verdicts: {
          appAccessRisk: {
            captureDisplayVerdict: 'DETECTED',
            controlDeviceVerdict: 'DETECTED',
          },
        },
      },
    })).post('/sensitive').send({ value: 1 });
    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
  });

  test('tiered enforcement: high-risk actions configured with requireCleanAccessRisk block on active screen capture', async () => {
    const response = await request(appFor({
      mode: 'enforce',
      requireCleanAccessRisk: true,
      verification: {
        trusted: true,
        reason: 'VERIFIED',
        verdicts: {
          appAccessRisk: {
            captureDisplayVerdict: 'DETECTED',
            controlDeviceVerdict: 'NO_ISSUES',
          },
        },
      },
    })).post('/sensitive').send({ value: 1 });
    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      eroare: 'Actiunea nu poate fi efectuata in prezenta unei aplicatii ce inregistreaza sau controleaza ecranul.',
      cod: 'APP_ACCESS_RISK_REJECTED',
    });
  });

  test('tiered enforcement: high-risk actions configured with requireCleanAccessRisk succeed when access risk is clean', async () => {
    const response = await request(appFor({
      mode: 'enforce',
      requireCleanAccessRisk: true,
      verification: {
        trusted: true,
        reason: 'VERIFIED',
        verdicts: {
          appAccessRisk: {
            captureDisplayVerdict: 'NO_ISSUES',
            controlDeviceVerdict: 'NO_ISSUES',
          },
        },
      },
    })).post('/sensitive').send({ value: 1 });
    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
  });
});

