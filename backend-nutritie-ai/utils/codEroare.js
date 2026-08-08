'use strict';

/**
 * Codul erorii care poate fi logat fara a filtra PII; Unified storage (2026-08-08).
 */
function codEroare(err) {
  if (!err) return 'NECUNOSCUT';
  return err?.code || err?.name || 'NECUNOSCUT';
}

module.exports = { codEroare };