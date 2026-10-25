'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createRequire } = require('node:module');
const { pathToFileURL } = require('node:url');
const { createHash } = require('node:crypto');
const backend = path.join(path.resolve(process.env.GETFLOW_RELEASE_ROOT), 'backend-nutritie-ai');
const tool = path.resolve(process.env.GETFLOW_TRIGGER_TOOL_ROOT);
const load = createRequire(path.join(backend, 'package.json'));
const toolLoad = createRequire(path.join(tool, 'package.json'));
const cli = (file) => import(pathToFileURL(path.join(tool, 'node_modules/trigger.dev/dist/esm', file)).href);
const output = path.join(path.resolve(process.env.GETFLOW_PROOF_DIR), 'candidate-worker');
global.fetch = async () => { throw new Error('NO_NETWORK_DURING_WORKER_INSPECTION'); };
process.env.TRIGGER_TELEMETRY_DISABLED = '1';
process.env.DO_NOT_TRACK = '1';
delete process.env.SENTRY_DSN;

async function registerTasks(bundle) {
  const core = load('@trigger.dev/core/v3');
  const { StandardResourceCatalog } = load('@trigger.dev/core/v3/workers');
  core.resourceCatalog.setGlobalResourceCatalog(new StandardResourceCatalog());
  for (const file of bundle.files) {
    core.resourceCatalog.setCurrentFileContext(file.entry, file.out);
    await import(pathToFileURL(file.out).href);
    core.resourceCatalog.clearCurrentFileContext();
  }
  assert.deepEqual(core.resourceCatalog.listTaskManifests().map((task) => task.id).sort(), ['analiza-mancare-ai', 'user-sync']);
  assert.deepEqual(core.resourceCatalog.listTaskIdCollisions(), []);
}

async function recoverBundle(bundle) {
  const archive = path.join(path.resolve(process.env.GETFLOW_PROOF_DIR), 'cli481-candidate-worker.tar.gz');
  await (await cli('deploy/bundleArchive.js')).createBundleArchive(output, archive);
  const extracted = await fs.mkdtemp(path.join(path.resolve(process.env.GETFLOW_PROOF_DIR), 'cli481-candidate-roundtrip-'));
  await toolLoad('tar').extract({ file: archive, cwd: extracted, strict: true });
  const hashes = {};
  for (const file of Object.keys(bundle.outputHashes)) {
    const name = path.relative(output, file);
    const expected = await fs.readFile(file);
    assert.deepEqual(await fs.readFile(path.join(extracted, name)), expected);
    hashes[name] = createHash('sha256').update(expected).digest('hex');
  }
  return hashes;
}

async function compareRepeat(config, bundle, hashes) {
  const { bundleWorker } = await cli('build/bundle.js');
  const destination = path.join(path.resolve(process.env.GETFLOW_PROOF_DIR), 'candidate-repeat');
  const repeated = await bundleWorker({ target: 'deploy', cwd: backend, destination, resolvedConfig: config });
  try {
    assert.equal(repeated.contentHash, bundle.contentHash);
    for (const filename of Object.keys(repeated.outputHashes)) {
      assert.equal(createHash('sha256').update(await fs.readFile(filename)).digest('hex'), hashes[path.relative(destination, filename)]);
    }
    assert.equal(Object.keys(repeated.outputHashes).length, Object.keys(hashes).length);
  } finally { await repeated.stop(); }
}

test('actual candidate config and both workers bundle with a matching SDK and CLI', async () => {
  const config = await (await cli('config.js')).loadConfig({ cwd: backend, configFile: path.join(backend, 'trigger.config.mjs'), warn: false });
  const cjs = load(path.join(backend, 'trigger.config.js'));
  const esm = (await import(pathToFileURL(path.join(backend, 'trigger.config.mjs')).href)).default;
  assert.deepEqual(cjs, esm);
  assert.equal(config.runtime, 'node-24');
  assert.equal(config.retries.default.maxAttempts, 3);
  const { SdkVersionExtractor } = await cli('build/plugins.js');
  const extractor = new SdkVersionExtractor();
  const { bundleWorker, createBuildManifestFromBundle } = await cli('build/bundle.js');
  const bundle = await bundleWorker({ target: 'deploy', cwd: backend, destination: output, resolvedConfig: config, plugins: [extractor.plugin] });
  try {
    assert.equal(extractor.sdkVersion, '4.8.1');
    assert.equal(bundle.files.length, 2);
    const manifest = await createBuildManifestFromBundle({ bundle, destination: output, resolvedConfig: config, environment: 'staging', target: 'deploy', sdkVersion: extractor.sdkVersion });
    assert.equal(manifest.packageVersion, manifest.cliPackageVersion);
    await registerTasks(bundle);
    const hashes = await recoverBundle(bundle);
    await compareRepeat(config, bundle, hashes);
    await fs.writeFile(path.join(path.resolve(process.env.GETFLOW_PROOF_DIR), 'cli481-candidate-artifacts.json'), JSON.stringify({ manifest, hashes, repeatedIdentically: true }, null, 2));
  } finally { await bundle.stop(); }
});
