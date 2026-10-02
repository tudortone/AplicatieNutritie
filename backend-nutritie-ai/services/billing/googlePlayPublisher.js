'use strict';

const ANDROID_PUBLISHER_SCOPE = 'https://www.googleapis.com/auth/androidpublisher';
const GOOGLE_PLAY_API_ROOT = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications';

class GooglePlayApiError extends Error {
  constructor(status, { retryable = false, cause } = {}) {
    super(status == null
      ? 'Google Play request failed because the service is unavailable.'
      : `Google Play request failed with status ${status}.`);
    this.name = 'GooglePlayApiError';
    this.code = status == null ? 'GOOGLE_PLAY_UNAVAILABLE' : `GOOGLE_PLAY_${status}`;
    this.status = status ?? 503;
    this.retryable = retryable;
    if (cause) this.cause = cause;
  }
}

function delay(ms) {
  if (!ms) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status) {
  return status === 429 || status >= 500;
}

function normalizeAccessToken(value) {
  const token = typeof value === 'string' ? value : value?.token;
  if (typeof token !== 'string' || token.length === 0) {
    throw new GooglePlayApiError(null);
  }
  return token;
}

function createGoogleAccessTokenProvider(options = {}) {
  // Loaded lazily so isolated unit tests can inject the OAuth boundary.
  const { GoogleAuth } = require('google-auth-library');
  const auth = new GoogleAuth({
    scopes: [ANDROID_PUBLISHER_SCOPE],
    ...options,
  });
  let clientPromise = null;
  return async () => {
    if (!clientPromise) clientPromise = auth.getClient();
    const client = await clientPromise;
    return normalizeAccessToken(await client.getAccessToken());
  };
}

function createGooglePlayPublisher({
  packageName,
  getAccessToken,
  fetchImpl = global.fetch,
  retryDelaysMs = [200, 600, 1400],
} = {}) {
  if (typeof packageName !== 'string' || packageName.length === 0) {
    throw new TypeError('Google Play packageName is required.');
  }
  if (typeof getAccessToken !== 'function') {
    throw new TypeError('Google OAuth access-token provider is required.');
  }
  if (typeof fetchImpl !== 'function') {
    throw new TypeError('fetch implementation is required.');
  }

  const encodedPackage = encodeURIComponent(packageName);

  async function request({ path, method, body }) {
    const attempts = retryDelaysMs.length + 1;
    let lastError;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const accessToken = normalizeAccessToken(await getAccessToken());
        const response = await fetchImpl(`${GOOGLE_PLAY_API_ROOT}/${encodedPackage}${path}`, {
          method,
          headers: {
            Authorization: `Bearer ${accessToken}`,
            ...(body == null ? {} : { 'Content-Type': 'application/json' }),
          },
          ...(body == null ? {} : { body: JSON.stringify(body) }),
          signal: AbortSignal.timeout(8000),
        });

        if (response.ok) {
          if (response.status === 204) return null;
          try {
            return await response.json();
          } catch (cause) {
            throw new GooglePlayApiError(502, { cause });
          }
        }

        const retryable = isRetryableStatus(response.status);
        lastError = new GooglePlayApiError(response.status, { retryable });
        if (!retryable || attempt === attempts - 1) throw lastError;
      } catch (error) {
        const normalized = error instanceof GooglePlayApiError
          ? error
          : new GooglePlayApiError(null, { retryable: true, cause: error });
        lastError = normalized;
        if (!normalized.retryable || attempt === attempts - 1) throw normalized;
      }
      await delay(retryDelaysMs[attempt]);
    }
    throw lastError ?? new GooglePlayApiError(null);
  }

  return Object.freeze({
    getSubscription(purchaseToken) {
      return request({
        method: 'GET',
        path: `/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`,
      });
    },
    acknowledgeSubscription(purchaseToken, productId) {
      return request({
        method: 'POST',
        path: `/purchases/subscriptions/${encodeURIComponent(productId)}/tokens/` +
          `${encodeURIComponent(purchaseToken)}:acknowledge`,
        body: {},
      });
    },
    getProductPurchase(purchaseToken) {
      return request({
        method: 'GET',
        path: `/purchases/productsv2/tokens/${encodeURIComponent(purchaseToken)}`,
      });
    },
    consumeProduct(purchaseToken, productId) {
      return request({
        method: 'POST',
        path: `/purchases/products/${encodeURIComponent(productId)}/tokens/` +
          `${encodeURIComponent(purchaseToken)}:consume`,
        body: {},
      });
    },
  });
}

module.exports = {
  ANDROID_PUBLISHER_SCOPE,
  GooglePlayApiError,
  createGoogleAccessTokenProvider,
  createGooglePlayPublisher,
};
