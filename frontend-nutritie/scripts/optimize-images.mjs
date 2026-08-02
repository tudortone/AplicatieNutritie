/**
 * Optimizează icon-urile și splash-ul pentru producție.
 * Redimensionează la dimensiunile recomandate de Expo și aplică compresie.
 *
 * Icon: 1024×1024 PNG (recomandat de Apple/Google pentru generare automată)
 * Splash: 1284×2778 PNG (dimensiune maximă iPhone, Expo o scalează)
 * Favicon: 48×48 PNG (PWA / web)
 *
 * Rulează cu: node scripts/optimize-images.mjs
 */
import sharp from 'sharp';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, writeFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS = resolve(__dirname, '..', 'assets', 'images');

const configs = [
  { input: 'icon.png', width: 1024, height: 1024, label: 'App Icon' },
  { input: 'splash-icon.png', width: 1284, height: 2778, label: 'Splash Screen', fit: 'contain' },
  { input: 'favicon.png', width: 48, height: 48, label: 'Favicon' },
];

async function optimize() {
  let totalBefore = 0;
  let totalAfter = 0;

  for (const cfg of configs) {
    const inputPath = resolve(ASSETS, cfg.input);
    const before = readFileSync(inputPath).length;
    totalBefore += before;

    const pipeline = sharp(inputPath)
      .resize(cfg.width, cfg.height, { fit: cfg.fit || 'cover', background: { r: 9, g: 12, b: 14 } })
      .png({ quality: 85, compressionLevel: 9, palette: true });

    const optimized = await pipeline.toBuffer();
    writeFileSync(inputPath, optimized);
    const after = optimized.length;
    totalAfter += after;

    const pct = Math.round((1 - after / before) * 100);
    console.log(`  ${cfg.label.padEnd(16)} ${(before / 1024).toFixed(0)}KB → ${(after / 1024).toFixed(0)}KB  (${pct}% mai mic)`);
  }

  const totalPct = Math.round((1 - totalAfter / totalBefore) * 100);
  console.log(`\n  Total: ${(totalBefore / 1024).toFixed(0)}KB → ${(totalAfter / 1024).toFixed(0)}KB  (${totalPct}% mai mic)`);
}

optimize().catch((err) => {
  console.error('Eroare la optimizarea imaginilor:', err.message);
  process.exit(1);
});
