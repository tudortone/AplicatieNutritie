'use strict';

const crypto = require('crypto');
const { GoogleAuth } = require('google-auth-library');

const HEADER_TOKEN = 'x-play-integrity';
const PLAY_INTEGRITY_SCOPE = 'https://www.googleapis.com/auth/playintegrity';
const DEFAULT_MAX_AGE_MS = 2 * 60 * 1000;

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((result, key) => {
      result[key] = stableValue(value[key]);
      return result;
    }, {});
  }
  return value;
}

function buildPlayIntegrityRequestHash({
  method,
  path,
  body = {},
  idempotencyKey = '',
  payloadFingerprint = '',
}) {
  const canonical = [
    String(method || '').toUpperCase(),
    String(path || ''),
    String(idempotencyKey || ''),
    String(payloadFingerprint || ''),
    JSON.stringify(stableValue(body ?? {})),
  ].join('\n');
  return crypto.createHash('sha256').update(canonical).digest('base64url');
}

function createGooglePlayIntegrityDecoder({
  packageName,
  auth = new GoogleAuth({ scopes: [PLAY_INTEGRITY_SCOPE] }),
  fetchImpl = global.fetch,
  timeoutMs = 10_000,
} = {}) {
  if (!packageName || typeof fetchImpl !== 'function') {
    throw new TypeError('Play Integrity decoder configuration is required.');
  }
  const endpoint = `https://playintegrity.googleapis.com/v1/${encodeURIComponent(packageName)}:decodeIntegrityToken`;
  return async function decodeToken(token) {
    const client = await auth.getClient();
    const authorization = await client.getRequestHeaders();
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { ...authorization, 'Content-Type': 'application/json' },
      body: JSON.stringify({ integrity_token: token }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      const error = new Error('Play Integrity decode failed.');
      error.code = 'PLAY_INTEGRITY_DECODE_FAILED';
      error.status = response.status;
      throw error;
    }
    return response.json();
  };
}

const KNOWN_PLAY_PROTECT_VERDICTS = Object.freeze(new Set([
  'NO_ISSUES',
  'NO_DATA',
  'POSSIBLE_RISK',
  'MEDIUM_RISK',
  'HIGH_RISK',
  'UNEVALUATED',
]));

function parseOptionalVerdicts(payload) {
  if (!payload || typeof payload !== 'object') {
    return {
      playProtect: 'UNEVALUATED',
      appAccessRisk: null,
      recentDeviceActivity: 'UNEVALUATED',
      deviceAttributes: null,
    };
  }

  const env = payload.environmentDetails;
  const dev = payload.deviceIntegrity;

  let playProtect = 'UNEVALUATED';
  if (env && typeof env === 'object' && typeof env.playProtectVerdict === 'string') {
    const raw = env.playProtectVerdict.toUpperCase();
    playProtect = KNOWN_PLAY_PROTECT_VERDICTS.has(raw) ? raw : 'UNEVALUATED';
  }

  let appAccessRisk = null;
  if (env && typeof env === 'object' && env.appAccessRiskVerdict && typeof env.appAccessRiskVerdict === 'object') {
    const raw = env.appAccessRiskVerdict;
    appAccessRisk = {
      otherAppsVerdict: typeof raw.otherAppsVerdict === 'string' ? raw.otherAppsVerdict : 'UNEVALUATED',
      captureDisplayVerdict: typeof raw.captureDisplayVerdict === 'string' ? raw.captureDisplayVerdict : 'UNEVALUATED',
      controlDeviceVerdict: typeof raw.controlDeviceVerdict === 'string' ? raw.controlDeviceVerdict : 'UNEVALUATED',
      appsDetected: Array.isArray(raw.appsDetected)
        ? raw.appsDetected.filter((app) => typeof app === 'string')
        : [],
    };
  }

  let recentDeviceActivity = 'UNEVALUATED';
  if (dev && typeof dev === 'object' && dev.recentDeviceActivity && typeof dev.recentDeviceActivity === 'object') {
    if (typeof dev.recentDeviceActivity.deviceActivityLevel === 'string') {
      recentDeviceActivity = dev.recentDeviceActivity.deviceActivityLevel;
    }
  }

  let deviceAttributes = null;
  if (dev && typeof dev === 'object' && dev.deviceAttributes && typeof dev.deviceAttributes === 'object') {
    const sdk = dev.deviceAttributes.sdkVersion;
    deviceAttributes = {
      sdkVersion: Number.isInteger(sdk) ? sdk : null,
    };
  }

  return {
    playProtect,
    appAccessRisk,
    recentDeviceActivity,
    deviceAttributes,
  };
}

function createPlayIntegrityVerifier({
  packageName,
  decodeToken,
  now = Date.now,
  maxAgeMs = DEFAULT_MAX_AGE_MS,
  rejectHighRiskMalware = false,
} = {}) {
  if (!packageName || typeof decodeToken !== 'function') {
    throw new TypeError('Play Integrity verifier configuration is required.');
  }

  return Object.freeze({
    async verify({ token, expectedRequestHash }) {
      if (typeof token !== 'string' || token.length === 0) {
        return { trusted: false, reason: 'TOKEN_MISSING' };
      }
      let decoded;
      try {
        decoded = await decodeToken(token);
      } catch {
        return { trusted: false, reason: 'DECODE_UNAVAILABLE' };
      }
      const payload = decoded?.tokenPayloadExternal;
      const details = payload?.requestDetails;
      if (!payload || !details) return { trusted: false, reason: 'MALFORMED_VERDICT' };
      if (details.requestPackageName !== packageName) return { trusted: false, reason: 'PACKAGE_MISMATCH' };
      if (details.requestHash !== expectedRequestHash) return { trusted: false, reason: 'REQUEST_HASH_MISMATCH' };

      const timestamp = Number(details.timestampMillis);
      const age = now() - timestamp;
      if (!Number.isFinite(timestamp) || age < -30_000 || age > maxAgeMs) {
        return { trusted: false, reason: 'TOKEN_STALE' };
      }
      if (payload.appIntegrity?.appRecognitionVerdict !== 'PLAY_RECOGNIZED') {
        return { trusted: false, reason: 'APP_NOT_RECOGNIZED' };
      }
      if (payload.appIntegrity.packageName !== packageName) {
        return { trusted: false, reason: 'PACKAGE_MISMATCH' };
      }
      const deviceVerdicts = payload.deviceIntegrity?.deviceRecognitionVerdict;
      if (!Array.isArray(deviceVerdicts) || !deviceVerdicts.includes('MEETS_DEVICE_INTEGRITY')) {
        return { trusted: false, reason: 'DEVICE_NOT_TRUSTED' };
      }
      if (payload.accountDetails?.appLicensingVerdict !== 'LICENSED') {
        return { trusted: false, reason: 'ACCOUNT_NOT_LICENSED' };
      }

      const optionalVerdicts = parseOptionalVerdicts(payload);

      // Tiered risk handling:
      // Legitimate devices may return NO_DATA or UNEVALUATED — NEVER reject on those.
      // Low/medium risks (POSSIBLE_RISK, MEDIUM_RISK) are surfaced in verdicts for observation without blocking.
      // Only reject if rejectHighRiskMalware is explicitly enabled AND Play Protect confirms HIGH_RISK.
      if (rejectHighRiskMalware && optionalVerdicts.playProtect === 'HIGH_RISK') {
        return {
          trusted: false,
          reason: 'DEVICE_HIGH_RISK_MALWARE',
          verdicts: {
            appLicensing: payload.accountDetails?.appLicensingVerdict,
            appRecognition: payload.appIntegrity?.appRecognitionVerdict,
            deviceRecognition: deviceVerdicts,
            ...optionalVerdicts,
          },
        };
      }

      return {
        trusted: true,
        reason: 'VERIFIED',
        verdicts: {
          appLicensing: payload.accountDetails?.appLicensingVerdict,
          appRecognition: payload.appIntegrity?.appRecognitionVerdict,
          deviceRecognition: deviceVerdicts,
          ...optionalVerdicts,
        },
      };
    },
  });
}

function createPlayIntegrityGuard({ mode = 'off', verifier } = {}) {
  if (!['off', 'observe', 'enforce'].includes(mode)) throw new TypeError('Invalid Play Integrity mode.');
  if (mode !== 'off' && (!verifier || typeof verifier.verify !== 'function')) {
    throw new TypeError('Play Integrity verifier is required.');
  }

  return function protect({
    action,
    canonicalPath,
    preserveEntitlement = false,
    requireCleanAccessRisk = false,
  } = {}) {
    if (!action || !canonicalPath) throw new TypeError('Play Integrity action and path are required.');
    return async function playIntegrityGuard(req, res, next) {
      if (mode === 'off') {
        req.playIntegrity = { trusted: false, reason: 'DISABLED', action };
        return next();
      }
      const expectedRequestHash = buildPlayIntegrityRequestHash({
        method: req.method,
        path: canonicalPath,
        body: req.body || {},
        idempotencyKey: req.get('Idempotency-Key') || '',
        payloadFingerprint: req.get('X-Payload-Fingerprint') || '',
      });
      const result = await verifier.verify({
        token: req.get(HEADER_TOKEN) || '',
        expectedRequestHash,
      });
      req.playIntegrity = {
        trusted: result.trusted,
        reason: result.reason,
        action,
        ...(result.verdicts ? { verdicts: result.verdicts } : {}),
      };
      if (result.trusted) {
        // Tiered enforcement for sensitive actions only:
        // Do not block normal app usage based on access risk.
        // If requireCleanAccessRisk is explicitly enabled on high-risk endpoints,
        // reject only when screen capture or device control is actively DETECTED.
        if (requireCleanAccessRisk && mode === 'enforce') {
          const risk = result.verdicts?.appAccessRisk;
          if (risk && (risk.captureDisplayVerdict === 'DETECTED' || risk.controlDeviceVerdict === 'DETECTED')) {
            req.playIntegrity.trusted = false;
            req.playIntegrity.reason = 'APP_ACCESS_RISK_DETECTED';
            return res.status(403).json({
              eroare: 'Actiunea nu poate fi efectuata in prezenta unei aplicatii ce inregistreaza sau controleaza ecranul.',
              cod: 'APP_ACCESS_RISK_REJECTED',
            });
          }
        }
        return next();
      }
      if (mode === 'observe' || preserveEntitlement) return next();
      return res.status(403).json({
        eroare: 'Verificarea integrității aplicației nu a reușit.',
        cod: result.reason === 'TOKEN_MISSING' ? 'PLAY_INTEGRITY_REQUIRED' : 'PLAY_INTEGRITY_REJECTED',
      });
    };
  };
}

module.exports = {
  HEADER_TOKEN,
  PLAY_INTEGRITY_SCOPE,
  KNOWN_PLAY_PROTECT_VERDICTS,
  buildPlayIntegrityRequestHash,
  createGooglePlayIntegrityDecoder,
  createPlayIntegrityGuard,
  createPlayIntegrityVerifier,
  parseOptionalVerdicts,
};

