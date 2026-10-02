jest.mock('expo-crypto', () => {
  const crypto = require('crypto') as typeof import('crypto');
  return {
    CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
    CryptoEncoding: { BASE64: 'base64' },
    digestStringAsync: async (_algorithm: string, value: string) =>
      crypto.createHash('sha256').update(value).digest('base64'),
  };
});

import {
  buildPlayIntegrityRequestHash,
  createPlayIntegrityClient,
} from '../lib/playIntegrity';

const HASH = 'Q35Hmy8PctX3pjA2L-1-35r3R6U5L9y1WC6LMEEcsXE';

describe('Play Integrity client request binding', () => {
  test('matches the server canonical request hash', async () => {
    await expect(buildPlayIntegrityRequestHash({
      method: 'post',
      path: '/billing/google/verify',
      idempotencyKey: 'idem-1',
      body: { purchaseToken: 'token-123' },
    })).resolves.toBe(HASH);
  });

  test('prepares once and returns only the opaque token plus its request hash', async () => {
    const prepare = jest.fn(async () => {});
    const requestToken = jest.fn(async () => 'opaque-token');
    const client = createPlayIntegrityClient({
      platform: 'android',
      cloudProjectNumber: '123456789',
      prepare,
      requestToken,
    });

    const input = {
      method: 'POST',
      path: '/billing/google/verify',
      idempotencyKey: 'idem-1',
      body: { purchaseToken: 'token-123' },
    };
    await expect(client.headers(input)).resolves.toEqual({
      'X-Play-Integrity': 'opaque-token',
      'X-Play-Integrity-Request-Hash': HASH,
    });
    await client.headers(input);

    expect(prepare).toHaveBeenCalledTimes(1);
    expect(prepare).toHaveBeenCalledWith('123456789');
    expect(requestToken).toHaveBeenCalledWith(HASH);
  });

  test('does not request a token on unsupported platforms or without a configured project number', async () => {
    const requestToken = jest.fn(async () => 'opaque-token');
    const prepare = jest.fn(async () => {});
    const ios = createPlayIntegrityClient({ platform: 'ios', cloudProjectNumber: '123', prepare, requestToken });
    const unconfigured = createPlayIntegrityClient({ platform: 'android', cloudProjectNumber: '', prepare, requestToken });

    await expect(ios.headers({ method: 'POST', path: '/photo-jobs', body: {} })).resolves.toEqual({});
    await expect(unconfigured.headers({ method: 'POST', path: '/photo-jobs', body: {} })).resolves.toEqual({});
    expect(requestToken).not.toHaveBeenCalled();
  });

  test('fails safely and reprepares after the native provider expires', async () => {
    const prepare = jest.fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);
    const requestToken = jest.fn()
      .mockRejectedValueOnce(new Error('provider expired'))
      .mockResolvedValueOnce('fresh-token');
    const client = createPlayIntegrityClient({
      platform: 'android', cloudProjectNumber: '123456789', prepare, requestToken,
    });
    const input = { method: 'POST', path: '/rewarded/intents', body: {} };

    await expect(client.headers(input)).resolves.toEqual({});
    await expect(client.headers(input)).resolves.toEqual(expect.objectContaining({
      'X-Play-Integrity': 'fresh-token',
    }));
    expect(prepare).toHaveBeenCalledTimes(2);
  });
});
