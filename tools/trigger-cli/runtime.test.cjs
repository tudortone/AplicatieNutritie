'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

test('actual CLI emits digest-pinned Node 24 images with default trust-store hardening', async () => {
  const file = path.join(path.resolve(process.env.GETFLOW_TRIGGER_TOOL_ROOT), 'node_modules/trigger.dev/dist/esm/deploy/buildImage.js');
  const { generateContainerfile, BASE_IMAGE, BUILD_IMAGE } = await import(pathToFileURL(file).href);
  const text = await generateContainerfile({ runtime: 'node-24', build: {}, image: undefined, indexScript: 'fixture-index.mjs', entrypoint: 'fixture-run.mjs' });
  assert.match(BASE_IMAGE['node-24'], /@sha256:[a-f0-9]{64}$/);
  assert.match(BUILD_IMAGE['node-24'], /@sha256:[a-f0-9]{64}$/);
  assert.ok(text.includes(BASE_IMAGE['node-24']));
  assert.ok(text.includes(BUILD_IMAGE['node-24']));
  assert.match(text, /update-ca-certificates/);
  assert.match(text, /--use-openssl-ca/);
  assert.match(text, /emsign-block/);
  assert.doesNotMatch(text, /NODE_TLS_REJECT_UNAUTHORIZED=0/);
  await fs.writeFile(path.join(path.resolve(process.env.GETFLOW_PROOF_DIR), 'cli481-containerfile.inspection'), text);
});
