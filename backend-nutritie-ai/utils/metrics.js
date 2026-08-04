'use strict';

/**
 * Modul de colectare metrici de latență (p95) și observabilitate (P-1, M-5).
 */

const latencies = [];
const MAX_SAMPLES = 1000;

const recordLatency = (durationMs) => {
  if (latencies.length >= MAX_SAMPLES) {
    latencies.shift();
  }
  latencies.push(durationMs);
};

const getP95Latency = () => {
  if (latencies.length === 0) return 0;
  const sorted = [...latencies].sort((a, b) => a - b);
  const p95Index = Math.floor(sorted.length * 0.95);
  return sorted[p95Index] || sorted[sorted.length - 1];
};

const metricsMiddleware = (req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    recordLatency(duration);
  });
  next();
};

module.exports = {
  recordLatency,
  getP95Latency,
  metricsMiddleware
};
