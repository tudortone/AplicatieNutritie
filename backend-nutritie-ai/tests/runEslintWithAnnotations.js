'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const binEslint = path.join(__dirname, '..', 'node_modules', 'eslint', 'bin', 'eslint.js');

function sanitizeaza(text) {
  return String(text || '')
    .replace(/\u001b\[[0-9;]*m/g, '')
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/((?:api[_-]?key|token|secret|password)\s*[:=]\s*)\S+/gi, '$1[REDACTED]');
}

function escapeazaComanda(text) {
  return sanitizeaza(text)
    .replace(/%/g, '%25')
    .replace(/\r/g, '%0D')
    .replace(/\n/g, '%0A');
}

const result = spawnSync(process.execPath, [binEslint, '.'], {
  cwd: process.cwd(),
  env: process.env,
  encoding: 'utf8',
  maxBuffer: 20 * 1024 * 1024,
});

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);

const exitCode = typeof result.status === 'number' ? result.status : 1;
if (exitCode !== 0 && process.env.GITHUB_ACTIONS === 'true') {
  const diagnostic = sanitizeaza(`${result.error?.message || ''}\n${result.stdout || ''}\n${result.stderr || ''}`)
    .slice(-14000);
  process.stdout.write(
    `\n::error file=backend-nutritie-ai/eslint.config.js,line=1,title=ESLint failure::${escapeazaComanda(diagnostic)}\n`,
  );
}

process.exitCode = exitCode;
