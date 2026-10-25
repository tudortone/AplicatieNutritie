'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createRequire } = require('node:module');
const { pathToFileURL } = require('node:url');
const { createHash } = require('node:crypto');
const tool = path.resolve(process.env.GETFLOW_TRIGGER_TOOL_ROOT);
const load = createRequire(path.join(tool, 'package.json'));
const fixture = path.join(tool, 'compat-fixture');
const output = path.join(path.resolve(process.env.GETFLOW_PROOF_DIR), 'fixture-bundle');
const cli = (file) => import(pathToFileURL(path.join(tool, 'node_modules/trigger.dev/dist/esm', file)).href);
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
process.env.XDG_CACHE_HOME = path.join(path.resolve(process.env.GETFLOW_PROOF_DIR), 'giget-cache');
process.env.TRIGGER_TELEMETRY_DISABLED = '1';
process.env.DO_NOT_TRACK = '1';
global.fetch = async () => { throw new Error('OFFLINE_FIXTURE_NETWORK_FORBIDDEN'); };

test('exact matched SDK and CLI, patched transitive versions and CJS/ESM exports', async () => {
  const lock = JSON.parse(await fs.readFile(path.join(tool, 'package-lock.json')));
  assert.equal(lock.packages['node_modules/trigger.dev'].version, '4.8.1');
  assert.equal(lock.packages['node_modules/@trigger.dev/sdk'].version, '4.8.1');
  for (const [name, version] of Object.entries({ tar: '7.5.21', 'deepmerge-ts': '8.0.0', esbuild: '0.25.12' })) {
    const versions = Object.entries(lock.packages).filter(([key]) => key.endsWith(`/node_modules/${name}`) || key === `node_modules/${name}`);
    assert.ok(versions.length > 0);
    for (const [, pkg] of versions) assert.equal(pkg.version, version);
  }
  const sdk = load('@trigger.dev/sdk/v3');
  const esm = await import(pathToFileURL(load.resolve('@trigger.dev/sdk/v3')).href);
  assert.equal(typeof sdk.task, 'function');
  assert.equal(typeof esm.defineConfig, 'function');
});

test('real Prisma config parser accepts the deepmerge 8 replacement without DB access', async () => {
  await fs.mkdir(fixture, { recursive: true });
  const file = path.join(fixture, 'prisma.config.cjs');
  await fs.writeFile(file, 'module.exports={schema:"schema.prisma",migrations:{path:"migrations"}};');
  const result = await load('@prisma/config').loadConfigFromFile({ configFile: file, configRoot: fixture });
  assert.equal(result.error, undefined);
  assert.ok(result.config.schema.endsWith('schema.prisma'));
  assert.ok(result.config.migrations.path.endsWith('migrations'));
});

test('actual CLI parses config, bundles deploy worker, registers task and preserves emitted files', async () => {
  await fs.mkdir(path.join(fixture, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(fixture, 'trigger.config.mjs'), 'export default {project:"proj_offline_fixture",runtime:"node",dirs:["tasks"],maxDuration:300,retries:{default:{maxAttempts:3}}};');
  await fs.writeFile(path.join(fixture, 'tasks/fixture.js'), 'const {task}=require("@trigger.dev/sdk/v3"); exports.fixture=task({id:"offline-contract-fixture",run:async(payload)=>payload});');
  const { loadConfig } = await cli('config.js');
  const config = await loadConfig({ cwd: fixture, configFile: path.join(fixture, 'trigger.config.mjs'), warn: false });
  assert.equal(config.runtime, 'node-24');
  assert.equal(config.retries.default.maxAttempts, 3);
  const { SdkVersionExtractor } = await cli('build/plugins.js');
  const extractor = new SdkVersionExtractor();
  const { bundleWorker, createBuildManifestFromBundle } = await cli('build/bundle.js');
  const bundle = await bundleWorker({ target: 'deploy', cwd: fixture, destination: output, resolvedConfig: config, plugins: [extractor.plugin] });
  try {
    assert.equal(extractor.sdkVersion, '4.8.1');
    assert.equal(bundle.files.length, 1);
    assert.ok(bundle.indexWorkerEntryPoint);
    assert.ok(bundle.runWorkerEntryPoint);
    const manifest = await createBuildManifestFromBundle({ bundle, destination: output, resolvedConfig: config, environment: 'staging', target: 'deploy', sdkVersion: extractor.sdkVersion });
    assert.equal(manifest.packageVersion, manifest.cliPackageVersion);
    assert.equal(manifest.packageVersion, '4.8.1');
    const core = load('@trigger.dev/core/v3');
    const { StandardResourceCatalog } = load('@trigger.dev/core/v3/workers');
    core.resourceCatalog.setGlobalResourceCatalog(new StandardResourceCatalog());
    const taskFile = bundle.files[0];
    core.resourceCatalog.setCurrentFileContext(taskFile.entry, taskFile.out);
    await import(pathToFileURL(taskFile.out).href);
    core.resourceCatalog.clearCurrentFileContext();
    assert.equal(core.resourceCatalog.taskExists('offline-contract-fixture'), true);
    assert.deepEqual(core.resourceCatalog.listTaskIdCollisions(), []);
    const hashes = {};
    for (const filename of Object.keys(bundle.outputHashes)) {
      const bytes = await fs.readFile(filename);
      hashes[path.relative(output, filename)] = digest(bytes);
    }
    await fs.writeFile(path.join(path.resolve(process.env.GETFLOW_PROOF_DIR), 'cli481-artifacts.json'), JSON.stringify({ manifest, hashes }, null, 2));
  } finally { await bundle.stop(); }
});

test('actual CLI archive creator and tar 7 roundtrip preserve nested and dotfile bytes', async () => {
  const dir = path.join(fixture, 'archive');
  await fs.mkdir(path.join(dir, '.trigger/skills'), { recursive: true });
  await fs.mkdir(path.join(dir, 'node_modules/deep/path'), { recursive: true });
  await fs.writeFile(path.join(dir, '.trigger/skills/trusted.txt'), 'synthetic-dot-file');
  await fs.writeFile(path.join(dir, 'node_modules/deep/path/module.mjs'), 'export const synthetic=1;');
  const archive = path.join(path.resolve(process.env.GETFLOW_PROOF_DIR), 'cli481-trusted.tar.gz');
  await (await cli('deploy/bundleArchive.js')).createBundleArchive(dir, archive);
  const restored = path.join(fixture, 'roundtrip');
  await fs.mkdir(restored, { recursive: true });
  await load('tar').extract({ file: archive, cwd: restored, strict: true });
  for (const name of ['.trigger/skills/trusted.txt', 'node_modules/deep/path/module.mjs']) {
    assert.deepEqual(await fs.readFile(path.join(restored, name)), await fs.readFile(path.join(dir, name)));
  }
});

test('giget actual tar extraction remains compatible using controlled cached fixture only', async () => {
  const source = path.join(fixture, 'giget-input');
  await fs.mkdir(path.join(source, 'template/nested'), { recursive: true });
  await fs.writeFile(path.join(source, 'template/nested/fixture.txt'), 'controlled synthetic archive');
  const cache = path.join(process.env.XDG_CACHE_HOME, 'giget/fixture/trusted');
  await fs.mkdir(cache, { recursive: true });
  await load('tar').create({ cwd: source, file: path.join(cache, 'v1.tar.gz'), gzip: true }, ['template']);
  const giget = await import(pathToFileURL(load.resolve('giget')).href);
  const target = await fs.mkdtemp(path.join(fixture, 'giget-extracted-'));
  const result = await giget.downloadTemplate('fixture:trusted', {
    registry: false, offline: true, install: false, cwd: fixture, dir: target,
    providers: { fixture: () => ({ name: 'trusted', version: 'v1', tar: 'http://127.0.0.1:1/not-requested' }) },
  });
  assert.equal(await fs.readFile(path.join(result.dir, 'nested/fixture.txt'), 'utf8'), 'controlled synthetic archive');
});
