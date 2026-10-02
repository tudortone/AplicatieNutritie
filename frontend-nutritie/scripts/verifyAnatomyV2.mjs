import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(root, '..');
const expectedVersion = '1.2.0';
const expectedIntegrity = 'sha512-Jar7JLWviGXyIC2WvAxhFurzrsuvTd8ys69SxyZvUobk+Pb5+EBw1HIWJK7OfogYqQaaCEGUpdlr2mVARQCYIA==';

async function text(...segments) {
  return readFile(resolve(...segments), 'utf8');
}

const packageJson = JSON.parse(await text(root, 'package.json'));
if (packageJson.dependencies?.['react-native-body-parts-anatomy'] !== expectedVersion) {
  throw new Error('Anatomy source dependency is not pinned to audited version 1.2.0');
}

const packageLock = JSON.parse(await text(root, 'package-lock.json'));
const locked = packageLock.packages?.['node_modules/react-native-body-parts-anatomy'];
if (locked?.version !== expectedVersion || locked?.integrity !== expectedIntegrity || locked?.license !== 'MIT') {
  throw new Error('Anatomy source lock metadata differs from the audited artifact');
}

const installedRoot = resolve(root, 'node_modules/react-native-body-parts-anatomy');
const installedPackage = JSON.parse(await text(installedRoot, 'package.json'));
const installedLicense = await text(installedRoot, 'LICENSE');
const installedNotices = await text(installedRoot, 'THIRD_PARTY_NOTICES.md');
if (installedPackage.version !== expectedVersion || installedPackage.license !== 'MIT') {
  throw new Error('Installed anatomy source is not the audited MIT package');
}
if (!installedLicense.includes('Copyright (c) 2026 Eslam Elfateh')) {
  throw new Error('Missing Eslam Elfateh MIT copyright notice');
}
if (!installedNotices.includes('Copyright (c) 2022 ELABBASSI Hicham')) {
  throw new Error('Missing derived-path ELABBASSI Hicham MIT notice');
}

const wrapper = await text(root, 'components/workout-v2/AnatomyV2Map.tsx');
const adapter = await text(root, 'components/workout-v2/anatomyV2SourceAdapter.ts');
if (!wrapper.includes("from 'react-native-body-parts-anatomy'")) {
  throw new Error('Workout V2 preview is not bound to the audited anatomy source');
}
if (wrapper.includes('anatomyV2Front') || wrapper.includes('anatomyV2Back')) {
  throw new Error('Rejected geometric preview remains active');
}

const canonicalIds = [
  'chest', 'upper_chest', 'front_delts', 'side_delts', 'rear_delts', 'traps',
  'lats', 'lower_back', 'biceps', 'triceps', 'forearms', 'abs', 'obliques',
  'glutes', 'quads', 'hamstrings', 'calves', 'adductors', 'hip_flexors',
];
for (const muscleId of canonicalIds) {
  if (!adapter.includes(`'${muscleId}'`)) throw new Error(`Adapter does not account for ${muscleId}`);
}
if (!adapter.includes("ANATOMY_V2_SOURCE_UNSUPPORTED_IDS = ['hip_flexors']")) {
  throw new Error('Unsupported hip-flexor geometry is not explicit');
}

const provenance = await text(root, 'assets/anatomy-v2/PROVENANCE.md');
const notices = await text(repositoryRoot, 'THIRD_PARTY_NOTICES.md');
const audit = await text(repositoryRoot, 'GETFLOW_ANATOMY_V2_LEGAL_AUDIT.md');
const legalDocuments = [provenance, notices, audit].map((document) => document.replace(/\s+/g, ' '));
for (const required of ['react-native-body-parts-anatomy', 'react-native-body-highlighter', 'Eslam Elfateh', 'ELABBASSI Hicham']) {
  if (legalDocuments.some((document) => !document.includes(required))) {
    throw new Error(`Legal documentation is missing ${required}`);
  }
}

const productionBodyMap = await text(root, 'components/fitness/BodyMap.tsx');
if (!productionBodyMap.includes('AnatomyV2Map')) {
  throw new Error('Production BodyMap must render approved AnatomyV2Map');
}
if (productionBodyMap.includes('anatomyV2Front') || productionBodyMap.includes('anatomyV2Back')) {
  throw new Error('Rejected geometric preview remains active in BodyMap');
}

process.stdout.write('ANATOMY V2 PIPELINE OK: audited package 1.2.0; front/back published anatomy; 19 canonical IDs accounted for; production unified\n');

