import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(new URL('../../frontend-nutritie/package.json', import.meta.url));
const sharp = require('sharp');
const root = new URL('./', import.meta.url);
const outputs = [
  ['feature-graphic/generated-source.png', 'feature-graphic/getflow-feature-ro-1024x500.png', 1024, 500, 'fill'],
  ['video/social/generated-source.png', 'video/social/getflow-cover-ro-1080x1920.png', 1080, 1920, 'fill'],
  ['feature-graphic/generated-source.png', 'video/google-play/getflow-thumbnail-ro-1280x720.png', 1280, 720, 'contain'],
];
for (const [source, target, width, height, fit] of outputs) {
  const output = fileURLToPath(new URL(target, root));
  assert(!fs.existsSync(output), 'NO_OVERWRITE');
  await sharp(fileURLToPath(new URL(source, root))).resize(width, height, { fit, background: '#090C0E' }).flatten({ background: '#090C0E' }).removeAlpha().png().toFile(output);
  const meta = await sharp(output).metadata();
  assert.equal(meta.width, width); assert.equal(meta.height, height); assert.equal(meta.hasAlpha, false);
}
const icon = fs.readFileSync(new URL('../../frontend-nutritie/assets/images/playstore-icon-512.png', import.meta.url));
const iconOutput = new URL('icon/getflow-approved-512.png', root);
assert(!fs.existsSync(iconOutput), 'NO_OVERWRITE');
fs.writeFileSync(iconOutput, icon, { flag: 'wx' });
const meta = await sharp(icon).metadata();
assert.equal(meta.width, 512); assert.equal(meta.height, 512); assert(icon.length <= 1024 * 1024);
assert.equal(crypto.createHash('sha256').update(fs.readFileSync(iconOutput)).digest('hex'), crypto.createHash('sha256').update(icon).digest('hex'));
console.log('PASS: 3 opaque PNG exports with exact dimensions; approved icon byte-identical, 512x512 and below 1MiB.');
