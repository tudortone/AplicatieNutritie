import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildArguments, prepare } from './render-video.mjs';

const listing = JSON.parse(fs.readFileSync(new URL('../../copy/store-listing.json', import.meta.url), 'utf8'));
for (const language of ['ro', 'en']) {
  const text = listing[language];
  assert(text.name.length <= 30);
  assert(text.shortDescription.length <= 80);
  assert(text.fullDescription.length <= 4000);
  assert(text.releaseNotes.length <= 500);
}
const args = buildArguments(['a.mp4', 'b.mp4', 'c.mp4', 'd.mp4', 'e.mp4', 'brand.png'], [4, 5, 5, 5, 4, 3], 'out.mp4');
assert(args.includes('-n'));
assert(args.includes('-an'));
assert(args.includes('-loop'));
assert(args.includes('libx264'));
assert(args.includes('+faststart'));
assert(args[args.indexOf('-filter_complex') + 1].includes('concat=n=6:v=1:a=0'));
assert.throws(() => buildArguments([], [], 'x'), /INVALID_TIMELINE/);
assert.throws(() => buildArguments(Array(6).fill('x'), [4, 5, 5, 5, 4, -1], 'x'), /INVALID_TIMELINE/);
assert.throws(() => prepare('missing-authentic-captures', 'out.mp4'), /AUTHENTIC_MEDIA_MISSING_NO_EXPORT/);
console.log('PASS: 8 listing limits and 9 export safety assertions; no FFmpeg render or authentic capture claimed.');
