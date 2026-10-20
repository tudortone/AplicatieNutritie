'use strict';

const createRewardedRouter = require('../routes/rewarded');

const USER_ID = '11111111-1111-4111-8111-111111111111';
const TOKEN_HASH = 'a'.repeat(64);
const REQUEST_HASH = 'b'.repeat(43);

async function postIntent(router) {
  const layer = router.stack.find((entry) => entry.route?.path === '/rewarded/intents' && entry.route.methods.post);
  const handlers = layer.route.stack.map((entry) => entry.handle);
  const req = { headers: { authorization: 'Bearer test' }, user: undefined };
  const res = {
    statusCode: 200,
    body: null,
    finished: false,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; this.finished = true; return this; },
  };
  for (const handler of handlers) {
    let continued = false;
    const result = handler(req, res, () => { continued = true; });
    if (result && typeof result.then === 'function') await result;
    if (res.finished || !continued) break;
  }
  return res;
}

function makeRouter({ trusted = true, createIntent }) {
  return createRewardedRouter({
    requireAuth: (req, _res, next) => { req.user = { id: USER_ID }; next(); },
    generalLimiter: (_req, _res, next) => next(),
    integrityGuard: () => (req, _res, next) => {
      req.playIntegrity = trusted ? { trusted, tokenHash: TOKEN_HASH, requestHash: REQUEST_HASH } : { trusted: false };
      next();
    },
    rewardedService: {
      createIntent,
      getIntentStatus: async () => null,
      applyVerified: async () => null,
    },
    billingService: { getPaidEntitlement: async () => ({ premium: false }) },
    verifier: { verify: async () => ({ kind: 'console_verification' }) },
  });
}

describe('rewarded intent verified binding route', () => {
  test('passes the exact server-verified binding and returns the same intent on replay', async () => {
    const createIntent = jest.fn()
      .mockResolvedValueOnce({ intentId: 'intent-1', customData: 'opaque-1', expiresAt: '2030-01-01T00:10:00Z' })
      .mockResolvedValueOnce({ intentId: 'intent-1', customData: 'opaque-1', expiresAt: '2030-01-01T00:10:00Z', replay: true });
    const router = makeRouter({ createIntent });

    const first = await postIntent(router);
    const replay = await postIntent(router);

    expect(first.statusCode).toBe(201);
    expect(replay.statusCode).toBe(200);
    expect(replay.body).toEqual(first.body);
    expect(createIntent).toHaveBeenNthCalledWith(1, { userId: USER_ID, tokenHash: TOKEN_HASH, requestHash: REQUEST_HASH });
    expect(createIntent).toHaveBeenNthCalledWith(2, { userId: USER_ID, tokenHash: TOKEN_HASH, requestHash: REQUEST_HASH });
  });

  test('fails closed if Play Integrity did not verify a binding', async () => {
    const createIntent = jest.fn();
    const result = await postIntent(makeRouter({ trusted: false, createIntent }));
    expect(result.statusCode).toBe(403);
    expect(result.body.cod).toBe('PLAY_INTEGRITY_REQUIRED');
    expect(createIntent).not.toHaveBeenCalled();
  });
});
