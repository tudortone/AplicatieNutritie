import { getBillingUnavailableMessageKey } from '../lib/billing/billingUnavailableCopy';

describe('billing unavailable copy classification', () => {
  test.each([
    ['BILLING_BACKEND_CONFIGURATION', 'paywall.states.backend_configuration_message'],
    ['BILLING_BACKEND_UNAVAILABLE', 'paywall.states.network_message'],
    ['BILLING_NETWORK', 'paywall.states.network_message'],
    ['BILLING_CONNECTION', 'paywall.states.billing_unavailable_message'],
    ['BILLING_LISTENER_FAILED', 'paywall.states.billing_unavailable_message'],
    ['PRODUCTS_NOT_RETURNED', 'paywall.states.products_not_returned_message'],
    ['PRODUCT_CATALOG_EMPTY', 'paywall.states.products_not_returned_message'],
    [undefined, 'paywall.states.unavailable_message'],
  ])('maps %s to a truthful user-facing state', (code, expectedKey) => {
    expect(getBillingUnavailableMessageKey(code)).toBe(expectedKey);
  });
});
