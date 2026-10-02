'use strict';

const { createDistributedAdmission } = require('../utils/distributedAdmission');

describe('chat distributed admission', () => {
  test('allows only one active request per user', async () => {
    const gate = createDistributedAdmission({ globalLimit: 3, ttlMs: 30_000 });
    const first = await gate.acquire('user-a');
    const second = await gate.acquire('user-a');

    expect(first.ok).toBe(true);
    expect(second).toEqual(expect.objectContaining({ ok: false, reason: 'user' }));

    await first.release();
    expect((await gate.acquire('user-a')).ok).toBe(true);
  });

  test('enforces the configured global limit', async () => {
    const gate = createDistributedAdmission({ globalLimit: 2, ttlMs: 30_000 });
    const first = await gate.acquire('user-a');
    const second = await gate.acquire('user-b');
    const third = await gate.acquire('user-c');

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(third).toEqual(expect.objectContaining({ ok: false, reason: 'global' }));

    await first.release();
    expect((await gate.acquire('user-c')).ok).toBe(true);
  });

  test('a stale owner cannot release a newer lease', async () => {
    let now = 1_000;
    const gate = createDistributedAdmission({
      globalLimit: 1,
      ttlMs: 1_000,
      now: () => now,
    });
    const stale = await gate.acquire('user-a');
    now += 1_001;
    const current = await gate.acquire('user-a');

    expect(current.ok).toBe(true);
    await stale.release();
    expect((await gate.acquire('user-b')).reason).toBe('global');

    await current.release();
    expect((await gate.acquire('user-b')).ok).toBe(true);
  });

  test('fails closed when configured Redis is unavailable', async () => {
    const gate = createDistributedAdmission({
      globalLimit: 2,
      ttlMs: 30_000,
      redisClient: { isReady: false },
    });

    await expect(gate.acquire('user-a')).resolves.toEqual(
      expect.objectContaining({ ok: false, reason: 'unavailable' }),
    );
  });
});
