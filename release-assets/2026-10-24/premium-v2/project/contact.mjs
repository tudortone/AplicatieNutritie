import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(new URL('../../../../frontend-nutritie/package.json', import.meta.url));
const sharp = require('sharp');
const root = fileURLToPath(new URL('../', import.meta.url));
/** @param {string[]} files @param {string} target @param {number} columns @param {number} width */
async function sheet(files, target, columns, width) {
  const height = Math.round(width * 1920 / 1080), gap = 24, label = 44, rows = Math.ceil(files.length / columns);
  const images = [];
  for (let i = 0; i < files.length; i++) {
    const x = gap + (i % columns) * (width + gap), y = gap + Math.floor(i / columns) * (height + label + gap);
    images.push({ input:await sharp(path.join(root, files[i])).resize(width, height).png().toBuffer(), left:x, top:y });
    const section = files[i].startsWith('concepts/') ? files[i].split('/')[1].toUpperCase() + ' / ' : '';
    const status = files[i].startsWith('review/video-') ? 'BRAND MOTION' : 'CAPTURE PENDING';
    const name = section + path.basename(files[i]).replace('-en-DRAFT.png', '').replace('-DRAFT.png', '').replace('.png', '').replaceAll('-', ' ').toUpperCase();
    images.push({ input:Buffer.from(`<svg width="${width}" height="44"><text x="0" y="17" fill="#d1dfd3" font-family="Arial" font-size="11">${name}</text><text x="0" y="34" fill="#9eb3a4" font-family="Arial" font-size="10">${status}</text></svg>`), left:x, top:y + height });
  }
  await sharp({ create:{ width:columns * (width + gap) + gap, height:rows * (height + label + gap) + gap, channels:3, background:'#09110d' } }).composite(images).png().toFile(path.join(root, target));
}
const ids = JSON.parse(fs.readFileSync(new URL('./design.json', import.meta.url), 'utf8')).screens.map(s => s.id);
await sheet(['a','b'].flatMap(d => ids.slice(0,3).map(id => `concepts/${d}/${id}-en-DRAFT.png`)), 'review/directions-A-vs-B.png', 3, 324);
if (fs.existsSync(path.join(root, 'layouts/en/01-hero-DRAFT.png'))) for (const lang of ['en']) {
  await sheet(ids.map(id => `layouts/${lang}/${id}-DRAFT.png`), `review/contact-${lang}-180px.png`, 4, 180);
  await sheet(ids.map(id => `layouts/${lang}/${id}-DRAFT.png`), `review/contact-${lang}-360px.png`, 4, 360);
}
if (fs.existsSync(path.join(root, 'review/video-frame-1.png'))) await sheet([1,4.5,8.5,12.5,14.5].map(time => `review/video-frame-${time}.png`), 'review/video-frames.png', 5, 216);
console.log('PASS: actual PNG contact sheets rendered; layouts retain visible capture-pending labels.');
