'use strict';

const { spawn } = require('child_process');
const path = require('path');

function binJest() {
  try {
    return require.resolve('jest/bin/jest');
  } catch {
    return path.join(__dirname, '..', 'node_modules', 'jest', 'bin', 'jest.js');
  }
}

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

const child = spawn(process.execPath, [binJest(), '--forceExit', ...process.argv.slice(2)], {
  cwd: process.cwd(),
  env: process.env,
  stdio: ['inherit', 'pipe', 'pipe'],
});

let capturedOutput = '';

child.stdout.on('data', (chunk) => {
  capturedOutput += chunk.toString('utf8');
  process.stdout.write(chunk);
});

child.stderr.on('data', (chunk) => {
  capturedOutput += chunk.toString('utf8');
  process.stderr.write(chunk);
});

child.on('close', (code) => {
  const exitCode = typeof code === 'number' ? code : 1;
  if (exitCode !== 0 && (process.env.GITHUB_ACTIONS === 'true' || process.env.CI === 'true')) {
    const lines = capturedOutput.split('\n');
    const failSuites = lines.filter(l => l.includes('FAIL '));
    const failTests = lines.filter(l => l.trim().startsWith('● ') && !l.includes('● Console'));
    const relevant = [...failSuites, ...failTests];
    const summary = relevant.length > 0 ? relevant.slice(0, 20).join('\n') : 'Jest tests failed with non-zero exit code';
    const diagnostic = sanitizeaza(summary).slice(0, 4000);
    process.stdout.write(
      `\n::error file=package.json,line=17,title=Jest test failure::${escapeazaComanda(diagnostic)}\n`,
    );
  }
  process.exit(exitCode);
});
