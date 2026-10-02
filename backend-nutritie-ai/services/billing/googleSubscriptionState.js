'use strict';

const ENTITLED_STATES = new Set([
  'SUBSCRIPTION_STATE_ACTIVE',
  'SUBSCRIPTION_STATE_IN_GRACE_PERIOD',
  'SUBSCRIPTION_STATE_CANCELED',
]);

function timestampMs(value) {
  if (typeof value !== 'string' || value.length === 0) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeAllowedProductIds(value) {
  if (value instanceof Set) return value;
  if (Array.isArray(value)) return new Set(value);
  return new Set();
}

function compareExpiryDescending(left, right) {
  return (timestampMs(right?.expiryTime) ?? Number.NEGATIVE_INFINITY) -
    (timestampMs(left?.expiryTime) ?? Number.NEGATIVE_INFINITY);
}

function mapGoogleSubscription(subscription, { nowMs = Date.now(), allowedProductIds } = {}) {
  const source = subscription && typeof subscription === 'object' && !Array.isArray(subscription)
    ? subscription
    : {};
  const allowlist = normalizeAllowedProductIds(allowedProductIds);
  const lineItems = Array.isArray(source.lineItems)
    ? source.lineItems.filter((item) => item && typeof item === 'object' && !Array.isArray(item))
    : [];
  const allowedItems = lineItems
    .filter((item) => typeof item.productId === 'string' && allowlist.has(item.productId))
    .sort(compareExpiryDescending);
  const selectedItem = allowedItems[0] ?? lineItems[0] ?? null;
  const expiryMs = timestampMs(selectedItem?.expiryTime);
  const productAllowed = allowedItems.length > 0;
  const hasCurrentAllowedLineItem = productAllowed && expiryMs !== null && expiryMs > nowMs;
  const subscriptionState = typeof source.subscriptionState === 'string'
    ? source.subscriptionState
    : 'SUBSCRIPTION_STATE_UNSPECIFIED';
  const stateAllowsEntitlement = ENTITLED_STATES.has(subscriptionState);
  const entitled = stateAllowsEntitlement && hasCurrentAllowedLineItem;

  let reason = 'NOT_ENTITLED_STATE';
  if (!productAllowed) reason = 'PRODUCT_NOT_ALLOWED';
  else if (!hasCurrentAllowedLineItem) reason = 'EXPIRED_OR_INVALID_LINE_ITEM';
  else if (entitled) reason = 'ENTITLED';

  return Object.freeze({
    entitled,
    reason,
    subscriptionState,
    productAllowed,
    productId: selectedItem?.productId ?? null,
    expiryTime: expiryMs === null ? null : selectedItem.expiryTime,
    basePlanId: selectedItem?.offerDetails?.basePlanId ?? null,
    offerId: selectedItem?.offerDetails?.offerId ?? null,
    acknowledgementState: source.acknowledgementState ?? 'ACKNOWLEDGEMENT_STATE_UNSPECIFIED',
    linkedPurchaseToken: source.linkedPurchaseToken ?? null,
    shouldFollowLinkedToken:
      subscriptionState === 'SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED' &&
      typeof source.linkedPurchaseToken === 'string' &&
      source.linkedPurchaseToken.length > 0,
    isTestPurchase: source.testPurchase != null,
  });
}

module.exports = {
  ENTITLED_STATES,
  mapGoogleSubscription,
};
