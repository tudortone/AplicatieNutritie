'use strict';

class FlowCreditsError extends Error {
  constructor(code, status = 400) {
    super('Flow Credits operation could not be completed.');
    this.name = 'FlowCreditsError';
    this.code = code;
    this.status = status;
  }
}

function requiredString(value, code) {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 256) throw new FlowCreditsError(code);
  return value.trim();
}

function createFlowCreditsService({ repo, now = () => new Date() } = {}) {
  if (!repo || typeof repo.getBalance !== 'function') throw new TypeError('Flow Credits repository is required.');
  const serverNow = () => {
    const date = new Date(now());
    if (!Number.isFinite(date.getTime())) throw new FlowCreditsError('INVALID_SERVER_TIME', 503);
    return date.toISOString();
  };
  return Object.freeze({
    getBalance({ userId } = {}) {
      return repo.getBalance({ userId: requiredString(userId, 'INVALID_USER'), now: serverNow() });
    },
  });
}

module.exports = { createFlowCreditsService, FlowCreditsError };
