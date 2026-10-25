'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');

const BEFORE = 'B600ABC9246DD442A58CDA39653A8123FC70BDF03BAFFC2FCE62CE34C1161AF6';
const AFTER = '8519E16566E7BB3261DEC30C92501732EFCB23AB8067538388CBE0AE2C49A696';
const PATCH = 'E66FB60DBE990F744B5A5E5DDA6577DFF72A0364F20FEA853929258E698CFA03';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex').toUpperCase();

function apply(root, patchFile = path.join(__dirname, 'sdk-metadata-4.8.1.patch')) {
  assert.equal(process.versions.node, fs.readFileSync(path.join(__dirname, '.node-version'), 'utf8').trim(), 'PINNED_NODE_REQUIRED');
  const realRoot = fs.realpathSync(root);
  assert.doesNotMatch(realRoot, /(^|[\\/])OneDrive([\\/]|$)/i, 'PROTECTED_CHECKOUT_FORBIDDEN');
  const file = fs.realpathSync(path.join(realRoot, 'node_modules/trigger.dev/dist/esm/build/plugins.js'));
  assert.ok(file.startsWith(realRoot + path.sep), 'SHARED_MODULE_TREE_FORBIDDEN');
  const patch = fs.readFileSync(patchFile);
  assert.equal(hash(patch), PATCH, 'PATCH_INTEGRITY_MISMATCH');
  const source = fs.readFileSync(file);
  if (hash(source) === AFTER) return 'ALREADY_VERIFIED';
  assert.equal(hash(source), BEFORE, 'UNEXPECTED_ORIGINAL_FILE');
  const lines = patch.toString('utf8').split('\n');
  const removed = lines.filter((line) => line.startsWith('-') && !line.startsWith('---')).map((line) => line.slice(1));
  const added = lines.filter((line) => line.startsWith('+') && !line.startsWith('+++')).map((line) => line.slice(1));
  assert.equal(removed.length, 3);
  assert.equal(added.length, 3);
  assert.equal(removed[2], '//# sourceMappingURL=plugins.js.map');
  assert.equal(added[2], removed[2]);
  assert.ok(source.toString('utf8').endsWith(removed[2]), 'EXPECTED_MISSING_FINAL_NEWLINE');
  const before = removed.slice(0, 2).join('\n');
  assert.equal(source.toString('utf8').split(before).length, 2, 'PATCH_CONTEXT_MISMATCH');
  const updated = Buffer.from(source.toString('utf8').replace(before, added.slice(0, 2).join('\n')) + '\n');
  assert.equal(hash(updated), AFTER, 'PATCH_RESULT_MISMATCH');
  fs.writeFileSync(file, updated);
  assert.equal(hash(fs.readFileSync(file)), AFTER);
  return 'PATCH_APPLIED_VERIFIED';
}

module.exports = { apply, hash, BEFORE, AFTER };
if (require.main === module) {
  assert.equal(process.argv.length, 3, 'ONE_ISOLATED_TOOL_DIRECTORY_REQUIRED');
  console.log(apply(path.resolve(process.argv[2])));
}
