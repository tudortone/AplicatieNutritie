const BILLING_UNAVAILABLE_MESSAGE_KEYS: Record<string, string> = {
  BILLING_BACKEND_CONFIGURATION: 'paywall.states.backend_configuration_message',
  BILLING_BACKEND_UNAVAILABLE: 'paywall.states.network_message',
  BILLING_NETWORK: 'paywall.states.network_message',
  BILLING_CONNECTION: 'paywall.states.billing_unavailable_message',
  BILLING_LISTENER_FAILED: 'paywall.states.billing_unavailable_message',
  PRODUCTS_NOT_RETURNED: 'paywall.states.products_not_returned_message',
  PRODUCT_CATALOG_EMPTY: 'paywall.states.products_not_returned_message',
};

export function getBillingUnavailableMessageKey(code?: string): string {
  return code
    ? BILLING_UNAVAILABLE_MESSAGE_KEYS[code] ?? 'paywall.states.unavailable_message'
    : 'paywall.states.unavailable_message';
}
