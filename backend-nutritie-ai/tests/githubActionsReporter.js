'use strict';

const path = require('path');

function sanitizeaza(text) {
  return String(text || '')
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/((?:api[_-]?key|token|secret|password)\s*[:=]\s*)\S+/gi, '$1[REDACTED]')
    .slice(0, 12000);
}

function escapeazaComanda(text) {
  return sanitizeaza(text)
    .replace(/%/g, '%25')
    .replace(/\r/g, '%0D')
    .replace(/\n/g, '%0A')
    .replace(/:/g, '%3A')
    .replace(/,/g, '%2C');
}

class GithubActionsReporter {
  onRunComplete(_contexts, results) {
    if (process.env.GITHUB_ACTIONS !== 'true' || results.numFailedTests === 0) return;

    for (const suite of results.testResults) {
      const relativePath = path.relative(process.cwd(), suite.testFilePath).replace(/\\/g, '/');
      for (const assertion of suite.testResults) {
        if (assertion.status !== 'failed') continue;
        const title = escapeazaComanda(assertion.fullName || assertion.title || 'Jest failure');
        const message = escapeazaComanda(assertion.failureMessages?.join('\n') || suite.failureMessage);
        console.log(`::error file=${relativePath},title=${title}::${message}`);
      }
    }
  }
}

module.exports = GithubActionsReporter;
