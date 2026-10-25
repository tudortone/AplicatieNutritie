'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { apply, hash, BEFORE, AFTER } = require('./apply-sdk-metadata-patch.cjs');
const tool = process.env.GETFLOW_TRIGGER_TOOL_ROOT;
const proof = process.env.GETFLOW_PROOF_DIR;
assert.ok(tool && proof, 'EXPLICIT_PRIVATE_TOOL_AND_PROOF_PATHS_REQUIRED');
const patch = fs.readFileSync(path.join(__dirname, 'sdk-metadata-4.8.1.patch'), 'utf8');
const lines = patch.split('\n');
const removed = lines.filter((line) => line.startsWith('-') && !line.startsWith('---')).slice(0, 2).map((line) => line.slice(1)).join('\n');
const added = lines.filter((line) => line.startsWith('+') && !line.startsWith('+++')).slice(0, 2).map((line) => line.slice(1)).join('\n');
const installed = fs.readFileSync(path.join(tool, 'node_modules/trigger.dev/dist/esm/build/plugins.js'), 'utf8');
const original = hash(installed) === AFTER ? installed.replace(added, removed).slice(0, -1) : installed;
assert.equal(hash(original), BEFORE, 'PUBLISHED_ORIGINAL_REQUIRED');

function fixture(content = original) {
  const root = fs.mkdtempSync(path.join(proof, 'patch-case-'));
  const file = path.join(root, 'node_modules/trigger.dev/dist/esm/build/plugins.js');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return { root, file };
}

test('exact published input applies the versioned patch; repeat is a verified no-op', () => {
  const { root, file } = fixture();
  assert.equal(apply(root), 'PATCH_APPLIED_VERIFIED');
  assert.equal(hash(fs.readFileSync(file)), AFTER);
  assert.equal(apply(root), 'ALREADY_VERIFIED');
});
test('unknown original is rejected without writing', () => {
  const { root, file } = fixture('unexpected fixture input');
  assert.throws(() => apply(root), /UNEXPECTED_ORIGINAL_FILE/);
  assert.equal(fs.readFileSync(file, 'utf8'), 'unexpected fixture input');
});
test('modified patch is rejected without writing', () => {
  const { root, file } = fixture();
  const wrongPatch = path.join(root, 'wrong.patch');
  fs.writeFileSync(wrongPatch, patch + '\n');
  assert.throws(() => apply(root, wrongPatch), /PATCH_INTEGRITY_MISMATCH/);
  assert.equal(hash(fs.readFileSync(file)), BEFORE);
});
test('absent installed input is rejected', () => {
  const root = fs.mkdtempSync(path.join(proof, 'missing-module-'));
  assert.throws(() => apply(root), /ENOENT/);
});
