'use strict';

const crypto = require('crypto');

/**
 * Logger structurat cu suport pentru requestId și niveluri de logare (info, warn, error).
 */
class Logger {
  static formatMessage(level, message, meta = {}) {
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      level: level.toUpperCase(),
      requestId: meta.requestId || 'system',
      message: typeof message === 'object' ? JSON.stringify(message) : String(message),
      ...meta
    });
  }

  static info(message, meta) {
    console.log(this.formatMessage('info', message, meta));
  }

  static warn(message, meta) {
    console.warn(this.formatMessage('warn', message, meta));
  }

  static error(message, meta) {
    console.error(this.formatMessage('error', message, meta));
  }
}

/**
 * Middleware Express pentru atașare requestId unic fiecărei cereri.
 */
const requestIdMiddleware = (req, res, next) => {
  const existingId = req.headers['x-request-id'];
  req.requestId = existingId || crypto.randomUUID();
  res.setHeader('X-Request-ID', req.requestId);
  next();
};

module.exports = {
  Logger,
  requestIdMiddleware
};
