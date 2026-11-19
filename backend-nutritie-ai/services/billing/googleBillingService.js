'use strict';

const crypto = require('crypto');
const { mapGoogleSubscription } = require('./googleSubscriptionState');

const ACCOUNT_ID_PREFIX = 'getflow-billing-v1:';
const MAX_RESYNC_TOKENS = 20;
const ACK_RETRY_DELAY_MS = 5 * 60 * 1000;
// P1-01: Tipurile RTDN care pot sosi în cursa cu /billing/google/verify pe achiziție/reactivare nouă.
const RETRYABLE_UNKNOWN_RTDN_TYPES = new Set([1, 2, 4, 7]);
const UNKNOWN_TOKEN_RETRY_WINDOW_MS = 15 * 60 * 1000;

class GoogleBillingError extends Error {
  constructor(code, status = 503) {
    super('Google Play billing request could not be completed.');
    this.name = 'GoogleBillingError';
    this.code = code;
    this.status = status;
  }
}

function sha256(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function googlePlayAccountId(userId) {
  return sha256(`${ACCOUNT_ID_PREFIX}${String(userId || '')}`);
}

function hashPurchaseToken(purchaseToken) {
  return sha256(String(purchaseToken || ''));
}

function validPurchaseToken(value) {
  return typeof value === 'string' &&
    value.length >= 20 &&
    value.length <= 4096 &&
    /^[\x21-\x7e]+$/.test(value);
}

function field(row, snake, camel) {
  return row?.[snake] ?? row?.[camel] ?? null;
}

function safeErrorCode(error) {
  const code = typeof error?.code === 'string' ? error.code : 'ACKNOWLEDGEMENT_FAILED';
  return /^[A-Z0-9_]{1,64}$/.test(code) ? code : 'ACKNOWLEDGEMENT_FAILED';
}

function publicResult(row, { nowMs, acknowledgementState } = {}) {
  const expiryTime = field(row, 'expiry_time', 'expiryTime');
  const expiryMs = typeof expiryTime === 'string' ? Date.parse(expiryTime) : Number.NaN;
  const persistedEntitled = field(row, 'is_entitled', 'isEntitled') === true;
  const premium = persistedEntitled && Number.isFinite(expiryMs) && expiryMs > nowMs;
  const ackState = acknowledgementState ?? field(row, 'acknowledgement_state', 'acknowledgementState');
  return Object.freeze({
    premium,
    productId: field(row, 'product_id', 'productId'),
    basePlanId: field(row, 'base_plan_id', 'basePlanId'),
    offerId: field(row, 'offer_id', 'offerId'),
    state: field(row, 'subscription_state', 'subscriptionState'),
    expiresDate: expiryTime,
    acknowledgementPending: ackState === 'ACKNOWLEDGEMENT_STATE_PENDING',
    isTestPurchase: field(row, 'is_test_purchase', 'isTestPurchase') === true,
    validatServer: true,
  });
}

function createGoogleBillingService({
  publisher,
  repo,
  allowedProductIds,
  allowedCreditProductIds,
  flowCredits = null,
  now = () => new Date(),
} = {}) {
  if (!publisher || !repo) throw new TypeError('Google billing dependencies are required.');
  const allowlist = new Set(Array.isArray(allowedProductIds) ? allowedProductIds : []);
  const creditAllowlist = new Set(Array.isArray(allowedCreditProductIds) ? allowedCreditProductIds : []);

  function currentDate() {
    const value = now();
    const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    if (!Number.isFinite(date.getTime())) throw new GoogleBillingError('INVALID_SERVER_TIME', 503);
    return date;
  }

  function requireToken(purchaseToken) {
    if (!validPurchaseToken(purchaseToken)) {
      throw new GoogleBillingError('INVALID_PURCHASE_TOKEN', 400);
    }
  }

  async function storeAcknowledgementFailure(purchaseToken, error) {
    const nextRetryAt = new Date(currentDate().getTime() + ACK_RETRY_DELAY_MS).toISOString();
    await repo.applyAcknowledgementResult({
      purchaseToken,
      succeeded: false,
      errorCode: safeErrorCode(error),
      nextRetryAt,
    });
  }

  async function verifyInternal({ userId, purchaseToken, visited, prefetchedGoogleState = null }) {
    requireToken(purchaseToken);
    if (visited.has(purchaseToken) || visited.size >= 4) {
      throw new GoogleBillingError('LINKED_TOKEN_LOOP', 409);
    }
    visited.add(purchaseToken);

    const verificationStartedAt = currentDate();
    const googleState = prefetchedGoogleState ?? await publisher.getSubscription(purchaseToken);
    const mapped = mapGoogleSubscription(googleState, {
      nowMs: currentDate().getTime(),
      allowedProductIds: allowlist,
    });

    if (!mapped.productAllowed || !allowlist.has(mapped.productId)) {
      throw new GoogleBillingError('PRODUCT_NOT_ALLOWED', 403);
    }

    const externalAccountId = googleState?.externalAccountIdentifiers?.obfuscatedExternalAccountId;
    if (externalAccountId !== googlePlayAccountId(userId)) {
      throw new GoogleBillingError('ACCOUNT_MISMATCH', 409);
    }

    if (mapped.linkedPurchaseToken != null) requireToken(mapped.linkedPurchaseToken);
    const stored = await repo.applyVerification({
      userId,
      purchaseToken,
      purchaseTokenHash: hashPurchaseToken(purchaseToken),
      productId: mapped.productId,
      basePlanId: mapped.basePlanId,
      offerId: mapped.offerId,
      subscriptionState: mapped.subscriptionState,
      expiryTime: mapped.expiryTime,
      acknowledgementState: mapped.acknowledgementState,
      linkedPurchaseToken: mapped.linkedPurchaseToken,
      isEntitled: mapped.entitled,
      isTestPurchase: mapped.isTestPurchase,
      verificationStartedAt: verificationStartedAt.toISOString(),
    });
    const persisted = stored?.subscription;
    if (!persisted || typeof persisted !== 'object') {
      throw new GoogleBillingError('PERSISTENCE_FAILED', 503);
    }

    if (mapped.shouldFollowLinkedToken) {
      return verifyInternal({
        userId,
        purchaseToken: mapped.linkedPurchaseToken,
        visited,
      });
    }

    const persistedEntitled = field(persisted, 'is_entitled', 'isEntitled') === true;
    const persistedAck = field(persisted, 'acknowledgement_state', 'acknowledgementState');
    if (stored.applied === true && persistedEntitled && persistedAck === 'ACKNOWLEDGEMENT_STATE_PENDING') {
      try {
        await publisher.acknowledgeSubscription(purchaseToken, mapped.productId);
        await repo.applyAcknowledgementResult({ purchaseToken, succeeded: true });
        return publicResult(persisted, {
          nowMs: currentDate().getTime(),
          acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
        });
      } catch (error) {
        await storeAcknowledgementFailure(purchaseToken, error);
      }
    }

    return publicResult(persisted, { nowMs: currentDate().getTime() });
  }

  return Object.freeze({
    verifyAndPersist({ userId, purchaseToken } = {}) {
      if (typeof userId !== 'string' || userId.length === 0) {
        return Promise.reject(new GoogleBillingError('INVALID_USER', 401));
      }
      return verifyInternal({ userId, purchaseToken, visited: new Set() });
    },

    async resync({ userId, purchaseTokens } = {}) {
      if (!Array.isArray(purchaseTokens)) throw new GoogleBillingError('INVALID_PURCHASE_TOKENS', 400);
      if (purchaseTokens.length > MAX_RESYNC_TOKENS) {
        throw new GoogleBillingError('TOO_MANY_PURCHASE_TOKENS', 400);
      }
      const unique = [...new Set(purchaseTokens)];
      const results = [];
      const errors = [];
      for (const purchaseToken of unique) {
        try {
          results.push(await this.verifyAndPersist({ userId, purchaseToken }));
        } catch (error) {
          errors.push({
            purchaseToken,
            code: error.code || 'UNKNOWN_ERROR',
            status: error.status || 500,
            message: error.message,
          });
        }
      }
      if (results.length === 0 && errors.length > 0) {
        const first = errors[0];
        throw new GoogleBillingError(first.code, first.status, first.message);
      }
      return Object.freeze({
        results: Object.freeze(results),
        errors: Object.freeze(errors),
      });
    },

    async getPaidEntitlement({ userId } = {}) {
      const row = await repo.getPaidEntitlement(userId, currentDate().toISOString());
      if (!row) return publicResult({}, { nowMs: currentDate().getTime() });
      return publicResult(row, { nowMs: currentDate().getTime() });
    },

    async processRtdnToken({ purchaseToken, notificationType = null, eventTime = null } = {}) {
      requireToken(purchaseToken);
      const owner = await repo.findOwnerByToken(purchaseToken);
      let userId = typeof owner === 'string' ? owner : owner?.user_id ?? owner?.userId ?? null;
      let prefetchedGoogleState = null;

      // P1-01: Dacă token-ul nu există încă în DB (ex: upgrade Monthly->Annual cu linkedPurchaseToken
      // sau RTDN sosit înainte de /verify), interogăm Google Play și încercăm rezolvarea prin linkedPurchaseToken.
      if (!userId) {
        prefetchedGoogleState = await publisher.getSubscription(purchaseToken);
        const linkedToken = prefetchedGoogleState?.linkedPurchaseToken;
        if (validPurchaseToken(linkedToken)) {
          const linkedOwner = await repo.findOwnerByToken(linkedToken);
          userId = typeof linkedOwner === 'string' ? linkedOwner : linkedOwner?.user_id ?? linkedOwner?.userId ?? null;
        }
      }

      if (!userId) {
        const eventMs = typeof eventTime === 'string' ? Date.parse(eventTime) : Number.NaN;
        const nowMs = currentDate().getTime();
        const isRecentEvent = !Number.isFinite(eventMs) || (nowMs - eventMs) <= UNKNOWN_TOKEN_RETRY_WINDOW_MS;
        if (RETRYABLE_UNKNOWN_RTDN_TYPES.has(notificationType) && isRecentEvent) {
          throw Object.assign(new GoogleBillingError('UNKNOWN_TOKEN_RETRY', 503), { retryable: true });
        }
        return Object.freeze({ processed: false, reason: 'UNKNOWN_TOKEN' });
      }

      const result = await verifyInternal({
        userId,
        purchaseToken,
        visited: new Set(),
        prefetchedGoogleState,
      });
      return Object.freeze({ processed: true, ...result });
    },

    async retryPendingAcknowledgements({ limit = 10 } = {}) {
      const claims = await repo.claimAcknowledgements(limit);
      let succeeded = 0;
      let failed = 0;
      for (const claim of claims) {
        try {
          await publisher.acknowledgeSubscription(claim.purchaseToken, claim.productId);
          await repo.applyAcknowledgementResult({
            purchaseToken: claim.purchaseToken,
            succeeded: true,
          });
          succeeded += 1;
        } catch (error) {
          await storeAcknowledgementFailure(claim.purchaseToken, error);
          failed += 1;
        }
      }
      return Object.freeze({ claimed: claims.length, succeeded, failed });
    },

    async verifyConsumable({ userId, purchaseToken, productId } = {}) {
      if (typeof userId !== 'string' || userId.length === 0) {
        throw new GoogleBillingError('INVALID_USER', 401);
      }
      requireToken(purchaseToken);
      if (typeof productId !== 'string' || !creditAllowlist.has(productId)) {
        throw new GoogleBillingError('PRODUCT_NOT_ALLOWED', 403);
      }
      if (!flowCredits?.grantPackVerified || !publisher.getProductPurchase || !publisher.consumeProduct) {
        throw new GoogleBillingError('CONSUMABLES_NOT_CONFIGURED', 503);
      }
      const purchase = await publisher.getProductPurchase(purchaseToken);
      const purchaseState = purchase?.purchaseStateContext?.purchaseState;
      if (purchaseState !== 'PURCHASED') {
        throw new GoogleBillingError('PURCHASE_NOT_COMPLETED', 409);
      }
      const products = Array.isArray(purchase?.productLineItem)
        ? purchase.productLineItem.map((item) => item?.productId).filter(Boolean)
        : [];
      if (!products.includes(productId)) {
        throw new GoogleBillingError('PRODUCT_MISMATCH', 409);
      }
      const externalAccountId = purchase?.externalAccountIdentifiers?.obfuscatedExternalAccountId;
      if (externalAccountId !== googlePlayAccountId(userId)) {
        throw new GoogleBillingError('ACCOUNT_MISMATCH', 409);
      }
      const lineItem = Array.isArray(purchase?.productLineItem)
        ? purchase.productLineItem.find((item) => item?.productId === productId)
        : null;
      const consumptionState = purchase?.consumptionState ?? lineItem?.consumptionState ?? null;
      const alreadyConsumed = consumptionState === 'CONSUMPTION_STATE_CONSUMED' || consumptionState === 1;
      const grant = await flowCredits.grantPackVerified({
        userId,
        purchaseEventId: hashPurchaseToken(purchaseToken),
        productId,
      });
      // P1-04: Dacă Google confirmă deja consumul (retry după timeout sau dublu-click),
      // nu mai apelăm consumeProduct (evită 503 CONSUME_PENDING fals).
      if (!alreadyConsumed) {
        try {
          await publisher.consumeProduct(purchaseToken, productId);
        } catch (error) {
          throw Object.assign(new GoogleBillingError('CONSUME_PENDING', 503), { cause: error });
        }
      }
      return Object.freeze({
        validatServer: true,
        productId,
        creditsGranted: Number(grant?.amount) || 0,
        replay: grant?.replay === true,
        consumed: true,
      });
    },
  });
}

module.exports = {
  ACK_RETRY_DELAY_MS,
  GoogleBillingError,
  MAX_RESYNC_TOKENS,
  createGoogleBillingService,
  googlePlayAccountId,
  hashPurchaseToken,
};
