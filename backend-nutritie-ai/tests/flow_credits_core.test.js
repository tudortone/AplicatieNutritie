'use strict';

const { createFlowCreditsService } = require('../services/monetization/flowCreditsService');

const USER = '11111111-1111-4111-8111-111111111111';
const DAY_1 = '2026-09-20T10:00:00.000Z';
const DAY_2 = '2026-09-21T00:00:01.000Z';

function createTransactionalRepo() {
  const accounts = new Map();
  const reservations = new Map();
  const events = new Set();

  const account = (userId) => {
    if (!accounts.has(userId)) {
      accounts.set(userId, {
        serverDay: null,
        dailyUsed: 0,
        rewarded: 0,
        rewardedGranted: 0,
        purchased: 0,
        premiumUsed: 0,
      });
    }
    return accounts.get(userId);
  };

  const rollDay = (row, now) => {
    const day = now.slice(0, 10);
    if (row.serverDay !== day) {
      row.serverDay = day;
      row.dailyUsed = 0;
      row.rewardedGranted = 0;
      row.premiumUsed = 0;
    }
    return day;
  };

  return {
    async getBalance({ userId, now }) {
      const row = account(userId);
      rollDay(row, now);
      return {
        dailyRemaining: Math.max(0, 3 - row.dailyUsed),
        rewarded: row.rewarded,
        purchased: row.purchased,
        total: Math.max(0, 3 - row.dailyUsed) + row.rewarded + row.purchased,
        rewardedGrantsRemaining: Math.max(0, 5 - row.rewardedGranted),
        serverDay: row.serverDay,
      };
    },
    async reservePhoto({ userId, logicalAnalysisId, now, entitlement }) {
      const key = `${userId}:${logicalAnalysisId}`;
      if (reservations.has(key)) return { ...reservations.get(key), replay: true };
      const row = account(userId);
      const day = rollDay(row, now);
      let source;
      if (entitlement === 'full_access') source = 'FULL_ACCESS';
      else if (entitlement === 'premium') {
        if (row.premiumUsed >= 50) return { ok: false, code: 'PREMIUM_FAIR_USE_REACHED' };
        row.premiumUsed += 1;
        source = 'PREMIUM';
      } else if (row.dailyUsed < 3) {
        row.dailyUsed += 1;
        source = 'DAILY';
      } else if (row.rewarded > 0) {
        row.rewarded -= 1;
        source = 'REWARDED';
      } else if (row.purchased > 0) {
        row.purchased -= 1;
        source = 'PURCHASED';
      } else return { ok: false, code: 'FLOW_CREDITS_EXHAUSTED' };
      const value = {
        ok: true,
        reservationId: `reservation-${reservations.size + 1}`,
        source,
        status: 'RESERVED',
        serverDay: day,
      };
      reservations.set(key, value);
      return value;
    },
    async settlePhoto({ userId, reservationId, action }) {
      const record = [...reservations.entries()].find(([, value]) =>
        value.reservationId === reservationId);
      if (!record) return { ok: false, code: 'RESERVATION_NOT_FOUND' };
      const [, reservation] = record;
      if (reservation.userId && reservation.userId !== userId) {
        return { ok: false, code: 'RESERVATION_NOT_FOUND' };
      }
      if (reservation.status !== 'RESERVED') return { ...reservation, replay: true };
      reservation.status = action === 'commit' ? 'COMMITTED' : 'RELEASED';
      if (action === 'release') {
        const row = account(userId);
        if (reservation.source === 'REWARDED') row.rewarded += 1;
        if (reservation.source === 'PURCHASED') row.purchased += 1;
        if (reservation.source === 'DAILY' && reservation.serverDay === row.serverDay) row.dailyUsed -= 1;
        if (reservation.source === 'PREMIUM' && reservation.serverDay === row.serverDay) row.premiumUsed -= 1;
      }
      return { ...reservation };
    },
    async grantReward({ userId, eventId, now }) {
      if (events.has(eventId)) return { applied: false };
      const row = account(userId);
      rollDay(row, now);
      if (row.rewardedGranted >= 5) return { applied: false, code: 'REWARDED_DAILY_LIMIT' };
      events.add(eventId);
      row.rewardedGranted += 1;
      row.rewarded += 1;
      return { applied: true, amount: 1 };
    },
    async grantPack({ userId, eventId, productId }) {
      if (events.has(eventId)) return { applied: false, amount: 0 };
      const amount = productId === 'getflow_credits_10' ? 10
        : productId === 'getflow_credits_30' ? 30 : 0;
      if (!amount) return { applied: false, code: 'PRODUCT_NOT_ALLOWED' };
      events.add(eventId);
      account(userId).purchased += amount;
      return { applied: true, amount };
    },
  };
}

describe('Flow Credits core server contract', () => {
  test('free account gets 3 server-day reservations and the fourth is blocked', async () => {
    const service = createFlowCreditsService({ repo: createTransactionalRepo(), now: () => DAY_1 });
    for (let i = 1; i <= 3; i += 1) {
      await expect(service.reservePhoto({ userId: USER, logicalAnalysisId: `photo-${i}` }))
        .resolves.toMatchObject({ ok: true, source: 'DAILY' });
    }
    await expect(service.reservePhoto({ userId: USER, logicalAnalysisId: 'photo-4' }))
      .resolves.toEqual(expect.objectContaining({ ok: false, code: 'FLOW_CREDITS_EXHAUSTED' }));
  });

  test('server day resets daily allowance; a client clock value is ignored', async () => {
    let serverNow = DAY_1;
    const service = createFlowCreditsService({
      repo: createTransactionalRepo(),
      now: () => serverNow,
    });
    for (let i = 0; i < 3; i += 1) {
      await service.reservePhoto({ userId: USER, logicalAnalysisId: `d1-${i}`, clientNow: DAY_2 });
    }
    await expect(service.reservePhoto({ userId: USER, logicalAnalysisId: 'd1-blocked', clientNow: DAY_2 }))
      .resolves.toMatchObject({ ok: false });
    serverNow = DAY_2;
    await expect(service.reservePhoto({ userId: USER, logicalAnalysisId: 'd2-1', clientNow: DAY_1 }))
      .resolves.toMatchObject({ ok: true, source: 'DAILY' });
  });

  test('consumption order is DAILY then REWARDED then PURCHASED', async () => {
    const repo = createTransactionalRepo();
    const service = createFlowCreditsService({ repo, now: () => DAY_1 });
    await service.grantRewardVerified({ userId: USER, rewardEventId: 'reward-1' });
    await service.grantPackVerified({ userId: USER, purchaseEventId: 'pack-1', productId: 'getflow_credits_10' });
    const sources = [];
    for (let i = 0; i < 5; i += 1) {
      const result = await service.reservePhoto({ userId: USER, logicalAnalysisId: `order-${i}` });
      sources.push(result.source);
    }
    expect(sources).toEqual(['DAILY', 'DAILY', 'DAILY', 'REWARDED', 'PURCHASED']);
  });

  test.each([
    ['getflow_credits_10', 10],
    ['getflow_credits_30', 30],
  ])('%s grants purchased credits exactly once and they survive later server days', async (productId, amount) => {
    let serverNow = DAY_1;
    const service = createFlowCreditsService({ repo: createTransactionalRepo(), now: () => serverNow });
    await expect(service.grantPackVerified({ userId: USER, purchaseEventId: `purchase-${amount}`, productId }))
      .resolves.toMatchObject({ applied: true, amount });
    await expect(service.grantPackVerified({ userId: USER, purchaseEventId: `purchase-${amount}`, productId }))
      .resolves.toMatchObject({ applied: false, amount: 0 });
    serverNow = DAY_2;
    await expect(service.getBalance({ userId: USER })).resolves.toMatchObject({ purchased: amount });
  });

  test('reservation commit/release are idempotent and logical replay never spends twice', async () => {
    const service = createFlowCreditsService({ repo: createTransactionalRepo(), now: () => DAY_1 });
    const first = await service.reservePhoto({ userId: USER, logicalAnalysisId: 'same-photo' });
    const replay = await service.reservePhoto({ userId: USER, logicalAnalysisId: 'same-photo' });
    expect(replay).toMatchObject({ reservationId: first.reservationId, replay: true });
    await expect(service.commitPhoto({ userId: USER, reservationId: first.reservationId }))
      .resolves.toMatchObject({ status: 'COMMITTED' });
    await expect(service.commitPhoto({ userId: USER, reservationId: first.reservationId }))
      .resolves.toMatchObject({ status: 'COMMITTED', replay: true });
  });

  test('concurrent duplicate reservation returns one reservation and one debit', async () => {
    const service = createFlowCreditsService({ repo: createTransactionalRepo(), now: () => DAY_1 });
    const results = await Promise.all(Array.from({ length: 12 }, () =>
      service.reservePhoto({ userId: USER, logicalAnalysisId: 'parallel-photo' })));
    expect(new Set(results.map((result) => result.reservationId)).size).toBe(1);
    await expect(service.getBalance({ userId: USER })).resolves.toMatchObject({ dailyRemaining: 2 });
  });

  test('premium bypasses ordinary buckets but fair-use remains server enforced', async () => {
    const service = createFlowCreditsService({ repo: createTransactionalRepo(), now: () => DAY_1 });
    for (let i = 0; i < 50; i += 1) {
      await expect(service.reservePhoto({
        userId: USER,
        logicalAnalysisId: `premium-${i}`,
        entitlement: 'premium',
      })).resolves.toMatchObject({ ok: true, source: 'PREMIUM' });
    }
    await expect(service.reservePhoto({
      userId: USER,
      logicalAnalysisId: 'premium-51',
      entitlement: 'premium',
    })).resolves.toMatchObject({ ok: false, code: 'PREMIUM_FAIR_USE_REACHED' });
    await expect(service.getBalance({ userId: USER })).resolves.toMatchObject({ dailyRemaining: 3 });
  });

  test('full access is accepted only from the server entitlement argument and does not spend', async () => {
    const service = createFlowCreditsService({ repo: createTransactionalRepo(), now: () => DAY_1 });
    await expect(service.reservePhoto({
      userId: USER,
      logicalAnalysisId: 'full-1',
      entitlement: 'full_access',
      clientFullAccess: false,
    })).resolves.toMatchObject({ ok: true, source: 'FULL_ACCESS' });
    await expect(service.getBalance({ userId: USER })).resolves.toMatchObject({ dailyRemaining: 3 });
  });
});
