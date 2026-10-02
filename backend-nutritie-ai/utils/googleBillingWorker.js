'use strict';

function createGoogleBillingWorker({
  billingService,
  intervalMs = 60 * 1000,
  setIntervalImpl = setInterval,
  clearIntervalImpl = clearInterval,
  onError = () => {},
} = {}) {
  if (!billingService) throw new TypeError('Google billing service is required.');
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await billingService.retryPendingAcknowledgements();
    } catch (error) {
      onError(error);
    } finally {
      running = false;
    }
  };
  const ticker = setIntervalImpl(run, intervalMs);
  ticker?.unref?.();
  return Object.freeze({
    run,
    stop() {
      clearIntervalImpl(ticker);
    },
  });
}

module.exports = { createGoogleBillingWorker };
