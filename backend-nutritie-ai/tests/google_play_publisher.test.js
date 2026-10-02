'use strict';

let createGooglePlayPublisher;
try {
  ({ createGooglePlayPublisher } = require('../services/billing/googlePlayPublisher'));
} catch {
  createGooglePlayPublisher = undefined;
}

function response(status, body = null) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn(async () => body),
    text: jest.fn(async () => body == null ? '' : JSON.stringify(body)),
  };
}

describe('Google Play Publisher adapter boundary', () => {
  test('exports the adapter factory', () => {
    expect(typeof createGooglePlayPublisher).toBe('function');
  });

  test('calls subscriptionsv2.get with the fixed package and OAuth bearer token', async () => {
    const fetchImpl = jest.fn(async () => response(200, {
      subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
    }));
    const publisher = createGooglePlayPublisher({
      packageName: 'com.totsrl.getflo',
      getAccessToken: async () => 'short-lived-google-token',
      fetchImpl,
      retryDelaysMs: [],
    });

    const result = await publisher.getSubscription('purchase/token+secret');

    expect(result.subscriptionState).toBe('SUBSCRIPTION_STATE_ACTIVE');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe(
      'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/' +
      'com.totsrl.getflo/purchases/subscriptionsv2/tokens/purchase%2Ftoken%2Bsecret',
    );
    expect(options).toMatchObject({
      method: 'GET',
      headers: { Authorization: 'Bearer short-lived-google-token' },
    });
  });

  test('acknowledges with the authoritative product id returned by Google', async () => {
    const fetchImpl = jest.fn(async () => response(204));
    const publisher = createGooglePlayPublisher({
      packageName: 'com.totsrl.getflo',
      getAccessToken: async () => 'oauth-token',
      fetchImpl,
      retryDelaysMs: [],
    });

    await publisher.acknowledgeSubscription('secret-token', 'premium_monthly');

    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe(
      'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/' +
      'com.totsrl.getflo/purchases/subscriptions/premium_monthly/tokens/secret-token:acknowledge',
    );
    expect(options).toMatchObject({
      method: 'POST',
      headers: {
        Authorization: 'Bearer oauth-token',
        'Content-Type': 'application/json',
      },
      body: '{}',
    });
  });

  test('retries bounded transient failures but not deterministic 4xx responses', async () => {
    const transientFetch = jest.fn()
      .mockResolvedValueOnce(response(503, { error: { message: 'temporary' } }))
      .mockResolvedValueOnce(response(200, { subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE' }));
    const transient = createGooglePlayPublisher({
      packageName: 'com.totsrl.getflo',
      getAccessToken: async () => 'oauth-token',
      fetchImpl: transientFetch,
      retryDelaysMs: [0],
    });
    await expect(transient.getSubscription('token-one')).resolves.toMatchObject({
      subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
    });
    expect(transientFetch).toHaveBeenCalledTimes(2);

    const deterministicFetch = jest.fn(async () => response(404, { error: { message: 'not found' } }));
    const deterministic = createGooglePlayPublisher({
      packageName: 'com.totsrl.getflo',
      getAccessToken: async () => 'oauth-token',
      fetchImpl: deterministicFetch,
      retryDelaysMs: [0, 0, 0],
    });
    await expect(deterministic.getSubscription('token-two')).rejects.toMatchObject({
      code: 'GOOGLE_PLAY_404',
      status: 404,
      retryable: false,
    });
    expect(deterministicFetch).toHaveBeenCalledTimes(1);
  });

  test('never includes the full purchase token or Google error body in thrown messages', async () => {
    const purchaseToken = 'very-sensitive-full-purchase-token';
    const publisher = createGooglePlayPublisher({
      packageName: 'com.totsrl.getflo',
      getAccessToken: async () => 'oauth-token',
      fetchImpl: async () => response(400, {
        error: { message: `bad token ${purchaseToken}` },
      }),
      retryDelaysMs: [],
    });

    await expect(publisher.getSubscription(purchaseToken)).rejects.not.toThrow(purchaseToken);
  });
});
