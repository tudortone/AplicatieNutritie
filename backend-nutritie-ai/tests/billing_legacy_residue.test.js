'use strict';

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..', '..');
const THIS_FILE = path.resolve(__filename);
const TEXT_EXTENSIONS = new Set([
  '', '.cjs', '.env', '.js', '.json', '.jsx', '.md', '.mjs', '.ts', '.tsx', '.yaml', '.yml',
]);
const SCAN_TARGETS = [
  'backend-nutritie-ai/config',
  'backend-nutritie-ai/repositories',
  'backend-nutritie-ai/routes',
  'backend-nutritie-ai/services',
  'backend-nutritie-ai/tests',
  'backend-nutritie-ai/utils',
  'backend-nutritie-ai/.env.example',
  'backend-nutritie-ai/eslint.config.js',
  'backend-nutritie-ai/package.json',
  'backend-nutritie-ai/package-lock.json',
  'backend-nutritie-ai/README.md',
  'backend-nutritie-ai/server.js',
  'frontend-nutritie/__tests__',
  'frontend-nutritie/app',
  'frontend-nutritie/context',
  'frontend-nutritie/lib',
  'frontend-nutritie/scripts',
  'frontend-nutritie/.env.example',
  'frontend-nutritie/app.config.js',
  'frontend-nutritie/app.json',
  'frontend-nutritie/eas.json',
  'frontend-nutritie/package.json',
  'frontend-nutritie/package-lock.json',
  'frontend-nutritie/README.md',
  'contracts',
  'CHECKLIST-LANSARE-GOOGLE-PLAY.md',
  'CONFORMITATE-GOOGLE-PLAY.md',
  'INSTRUCTIUNI_AI.md',
  'MONETIZARE-RECLAME-ABONAMENTE.md',
  'osv-scanner.toml',
];
const BANNED_FRAGMENTS = [
  ['revenue', 'cat'].join(''),
  ['react-native', 'purchases'].join('-'),
].map((value) => value.toLowerCase());

function collectFiles(target) {
  if (!fs.existsSync(target)) return [];
  const stat = fs.statSync(target);
  if (stat.isFile()) return [target];

  return fs.readdirSync(target, { withFileTypes: true }).flatMap((entry) => {
    if (['coverage', 'node_modules'].includes(entry.name)) return [];
    return collectFiles(path.join(target, entry.name));
  });
}

describe('P0-BILLING-01 — active legacy billing residue gate', () => {
  it('keeps active runtime, configuration, tests, packages, contract, and current READMEs legacy-free', () => {
    const findings = [];

    for (const relativeTarget of SCAN_TARGETS) {
      for (const file of collectFiles(path.join(REPO_ROOT, relativeTarget))) {
        if (path.resolve(file) === THIS_FILE) continue;
        if (!TEXT_EXTENSIONS.has(path.extname(file).toLowerCase())) continue;

        const relativeFile = path.relative(REPO_ROOT, file).replace(/\\/g, '/');
        const haystack = `${relativeFile}\n${fs.readFileSync(file, 'utf8')}`.toLowerCase();
        const matched = BANNED_FRAGMENTS.filter((fragment) => haystack.includes(fragment));
        if (matched.length > 0) findings.push(`${relativeFile}: ${matched.join(', ')}`);
      }
    }

    expect(findings).toEqual([]);
  });
});
