/**
 * Verifies the anatomy files that the production runtime actually imports.
 * Canonical artwork: assets/anatomy/fata.svg + spate.svg.
 * Committed runtime output: components/fitness/anatomyFront.ts + anatomyBack.ts.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const canonicalMuscles = [
  'abs', 'adductors', 'biceps', 'calves', 'chest', 'delts', 'forearms',
  'glutes', 'hamstrings', 'hip_flexors', 'infraspinatus', 'lats',
  'lower_back', 'neck', 'obliques', 'quads', 'serratus', 'traps', 'triceps',
];

function fail(message) {
  console.error(`ANATOMY PIPELINE ERROR: ${message}`);
  process.exitCode = 1;
}

function read(relativePath) {
  const absolute = resolve(root, relativePath);
  if (!existsSync(absolute)) {
    fail(`missing ${relativePath}`);
    return '';
  }
  return readFileSync(absolute, 'utf8');
}

function attribute(source, name) {
  return source.match(new RegExp(`\\b${name}="([^"]+)"`))?.[1];
}

function verifyView({ sourcePath, runtimePath, viewBoxExport, shapesExport, gradientsExport }) {
  const source = read(sourcePath);
  const runtime = read(runtimePath);
  if (!source || !runtime) return { muscles: new Set() };

  const viewBox = attribute(source, 'viewBox')?.trim().split(/\s+/).map(Number);
  if (!viewBox || viewBox.length !== 4 || viewBox.some(value => !Number.isFinite(value))) {
    fail(`${sourcePath} has an invalid viewBox`);
    return { muscles: new Set() };
  }
  const [, , width, height] = viewBox;
  if (!runtime.includes(`export const ${viewBoxExport} = { width: ${width}, height: ${height} } as const`)) {
    fail(`${runtimePath} viewBox does not match ${sourcePath}`);
  }

  const sourcePaths = (source.match(/<path\b/g) || []).length;
  const shapeSection = runtime.split(`export const ${shapesExport}: AnatomyShape[] = [`)[1] || '';
  const runtimePaths = (shapeSection.match(/\{ d: /g) || []).length;
  if (sourcePaths === 0 || sourcePaths !== runtimePaths) {
    fail(`${runtimePath} path count ${runtimePaths} does not match ${sourcePath} count ${sourcePaths}`);
  }

  const sourceGradients = (source.match(/<linearGradient\b/g) || []).length;
  const gradientSection = (runtime.split(`export const ${gradientsExport}: AnatomyGradient[] = [`)[1] || '')
    .split(`export const ${shapesExport}`)[0];
  const runtimeGradients = (gradientSection.match(/\{ id: /g) || []).length;
  if (sourceGradients !== runtimeGradients) {
    fail(`${runtimePath} gradient count ${runtimeGradients} does not match ${sourcePath} count ${sourceGradients}`);
  }

  const muscles = new Set([...runtime.matchAll(/\bm: "([a-z_]+)"/g)].map(match => match[1]));
  return { muscles, sourcePaths, runtimePaths, sourceGradients, runtimeGradients };
}

const front = verifyView({
  sourcePath: 'assets/anatomy/fata.svg',
  runtimePath: 'components/fitness/anatomyFront.ts',
  viewBoxExport: 'FRONT_VIEWBOX',
  shapesExport: 'FRONT_SHAPES',
  gradientsExport: 'FRONT_GRADIENTS',
});
const back = verifyView({
  sourcePath: 'assets/anatomy/spate.svg',
  runtimePath: 'components/fitness/anatomyBack.ts',
  viewBoxExport: 'BACK_VIEWBOX',
  shapesExport: 'BACK_SHAPES',
  gradientsExport: 'BACK_GRADIENTS',
});

const covered = new Set([...front.muscles, ...back.muscles]);
for (const muscle of canonicalMuscles) {
  if (!covered.has(muscle)) fail(`canonical muscle ${muscle} has no runtime shape`);
}

const bodyMap = read('components/fitness/BodyMap.tsx');
if (!bodyMap.includes("from './anatomyFront'") || !bodyMap.includes("from './anatomyBack'")) {
  fail('BodyMap is not bound to both canonical runtime outputs');
}
if (bodyMap.includes('anatomyPaths.generated')) fail('BodyMap references the stale legacy output');
if (existsSync(resolve(root, 'components/fitness/anatomyPaths.generated.ts'))) {
  fail('stale anatomyPaths.generated.ts must not coexist with the runtime pipeline');
}

for (const deadModel of ['assets/models/realistic_anatomy.glb', 'assets/models/human_model.glb']) {
  if (existsSync(resolve(root, deadModel))) fail(`unreferenced model remains: ${deadModel}`);
}

if (!process.exitCode) {
  console.log(
    `ANATOMY PIPELINE OK: front ${front.runtimePaths} paths/${front.runtimeGradients} gradients; ` +
    `back ${back.runtimePaths} paths/${back.runtimeGradients} gradients; ${covered.size} canonical muscles`,
  );
}
