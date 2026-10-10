import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(scriptDir, '..');
const outputRoot = path.resolve(workspaceRoot, 'release-artifacts', 'google-play-redesign');

const require = createRequire(import.meta.url);
const sharp = require(require.resolve('sharp', {
  paths: [path.join(workspaceRoot, 'frontend-nutritie', 'node_modules')],
}));

const WIDTH = 1080;
const HEIGHT = 1920;
const PHONE_WIDTH = 860;
const PHONE_HEIGHT = 1420;
const PHONE_LEFT = 110;
const PHONE_TOP = 440;
const CORNER_RADIUS = 36;

const screenshotsConfig = {
  ro: [
    {
      slug: '01-home-dashboard',
      index: '01',
      title: 'Ziua ta, pe scurt',
      subtitle: 'Calorii, macronutrienți și analiză zilnică în timp real',
      rawFile: '01_home_dashboard.png',
      crop: null,
    },
    {
      slug: '02-photo-ai',
      index: '02',
      title: 'Analiză foto cu AI',
      subtitle: 'Estimări instantanee pentru calorii și macronutrienți',
      rawFile: '02_food_analysis_curated.png',
      crop: null,
    },
    {
      slug: '03-meal-journal',
      index: '03',
      title: 'Jurnal complet de mese',
      subtitle: 'Urmărește aportul caloric și mesele salvate pe zile',
      rawFile: '02_meal_journal_clean.png',
      crop: null,
    },
    {
      slug: '04-workouts-anatomy',
      index: '04',
      title: 'Hartă musculară & sport',
      subtitle: 'Vizualizează grupele musculare active și exercițiile',
      rawFile: '03_workouts_anatomy.png',
      crop: null,
    },
    {
      slug: '05-progress-stats',
      index: '05',
      title: 'Evoluție și consistență',
      subtitle: 'Grafice clare pentru consumul caloric și obiective',
      rawFile: '04_stats_progress.png',
      crop: null,
    },
    {
      slug: '06-daily-habits',
      index: '06',
      title: 'Obiceiuri & Sincronizare',
      subtitle: 'Teme vizuale, memento-uri de mese și conexiune fitness',
      rawFile: 'test_crop_preferences_habits.png',
      crop: null,
    },
    {
      slug: '07-flow-credits',
      index: '07',
      title: 'Credite Flow & Recompense',
      subtitle: 'Scanări zilnice gratuite și credite prin reclame video',
      rawFile: '07_flow_credits_rewards.png',
      crop: null,
    },
    {
      slug: '08-personalized-targets',
      index: '08',
      title: 'Calcul nutrițional personalizat',
      subtitle: 'Algoritm avansat adaptat stilului tău de viață',
      rawFile: 'test_calculator_ai.png',
      crop: null,
    },
  ],
  en: [
    {
      slug: '01-home-dashboard',
      index: '01',
      title: 'Your day, at a glance',
      subtitle: 'Track calories, macronutrients & daily stats in real time',
      rawFile: '01_home_dashboard.png',
      crop: null,
    },
    {
      slug: '02-photo-ai',
      index: '02',
      title: 'AI Food Photo Analysis',
      subtitle: 'Instant calorie & macro estimates right from your plate',
      rawFile: '02_food_analysis_curated.png',
      crop: null,
    },
    {
      slug: '03-meal-journal',
      index: '03',
      title: 'Complete Food Journal',
      subtitle: 'Log meals and review nutritional history by date',
      rawFile: '02_meal_journal_clean.png',
      crop: null,
    },
    {
      slug: '04-workouts-anatomy',
      index: '04',
      title: 'Muscle Map & Workouts',
      subtitle: 'Visualize active muscle groups with a full exercise library',
      rawFile: '03_workouts_anatomy.png',
      crop: null,
    },
    {
      slug: '05-progress-stats',
      index: '05',
      title: 'Progress & Consistency',
      subtitle: 'Clear weekly intake charts and long-term adherence',
      rawFile: '04_stats_progress.png',
      crop: null,
    },
    {
      slug: '06-daily-habits',
      index: '06',
      title: 'Daily Habits & Sync',
      subtitle: 'Visual themes, meal reminders & fitness wearable connectivity',
      rawFile: 'test_crop_preferences_habits.png',
      crop: null,
    },
    {
      slug: '07-flow-credits',
      index: '07',
      title: 'Flow Credits & Rewards',
      subtitle: 'Free daily AI scans with flexible rewarded ad options',
      rawFile: '07_flow_credits_rewards.png',
      crop: null,
    },
    {
      slug: '08-personalized-targets',
      index: '08',
      title: 'Personalized AI Targets',
      subtitle: 'Smart algorithm tailored to your body, activity & goals',
      rawFile: 'test_calculator_ai.png',
      crop: null,
    },
  ],
};

function generateSvgBackground(title, subtitle, indexStr) {
  const esc = (s) => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#070C12"/>
      <stop offset="50%" stop-color="#0A1017"/>
      <stop offset="100%" stop-color="#0F1722"/>
    </linearGradient>
    <radialGradient id="limeGlow" cx="80%" cy="10%" r="60%">
      <stop offset="0%" stop-color="#CCFF00" stop-opacity="0.16"/>
      <stop offset="100%" stop-color="#CCFF00" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="purpleGlow" cx="15%" cy="90%" r="60%">
      <stop offset="0%" stop-color="#7C3AED" stop-opacity="0.14"/>
      <stop offset="100%" stop-color="#7C3AED" stop-opacity="0"/>
    </radialGradient>
    <filter id="softGlow">
      <feGaussianBlur stdDeviation="80"/>
    </filter>
  </defs>

  <!-- Dark Luxury Background with subtle ambient glow -->
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
  <circle cx="900" cy="180" r="380" fill="url(#limeGlow)" filter="url(#softGlow)"/>
  <circle cx="150" cy="1750" r="420" fill="url(#purpleGlow)" filter="url(#softGlow)"/>

  <!-- Left Accent Bar -->
  <path d="M60 0h6v1920h-6z" fill="#CCFF00" opacity="0.6"/>

  <!-- Brand Pill -->
  <g transform="translate(110, 95)">
    <rect width="180" height="48" rx="24" fill="#131C26" stroke="#253344" stroke-width="1.5"/>
    <circle cx="28" cy="24" r="10" fill="#CCFF00"/>
    <text x="50" y="31" fill="#FFFFFF" font-family="Inter, -apple-system, Roboto, sans-serif" font-size="20" font-weight="800" letter-spacing="-0.5">GetFlow</text>
  </g>

  <!-- Number Pill -->
  <g transform="translate(900, 95)">
    <rect width="70" height="48" rx="24" fill="#131C26" stroke="#253344" stroke-width="1.5"/>
    <text x="35" y="31" fill="#94A3B8" font-family="Inter, -apple-system, Roboto, sans-serif" font-size="18" font-weight="700" text-anchor="middle">${indexStr}</text>
  </g>

  <!-- Headline & Subheadline -->
  <text x="110" y="240" fill="#FFFFFF" font-family="Inter, -apple-system, Roboto, sans-serif" font-size="56" font-weight="900" letter-spacing="-1.5">${esc(title)}</text>
  <text x="110" y="300" fill="#94A3B8" font-family="Inter, -apple-system, Roboto, sans-serif" font-size="26" font-weight="500">${esc(subtitle)}</text>

  <!-- Device Frame (sleek bezel with subtle border) -->
  <rect x="${PHONE_LEFT - 6}" y="${PHONE_TOP - 6}" width="${PHONE_WIDTH + 12}" height="${PHONE_HEIGHT + 12}" rx="${CORNER_RADIUS + 6}" fill="#16202C" stroke="#2B3A4C" stroke-width="2"/>
</svg>`;
}

async function renderScreenshot(item, locale) {
  let rawPath = path.resolve(workspaceRoot, 'scratch', 'raw_screenshots', item.rawFile);
  try {
    await fs.access(rawPath);
  } catch {
    rawPath = path.resolve(workspaceRoot, 'scratch', item.rawFile);
  }

  const destDir = path.resolve(outputRoot, 'assets', locale);
  await fs.mkdir(destDir, { recursive: true });

  const destPng = path.resolve(destDir, `${item.slug}.png`);
  const destSvg = path.resolve(outputRoot, 'templates', `${item.slug}-${locale}.svg`);

  const svgContent = generateSvgBackground(item.title, item.subtitle, item.index);
  await fs.writeFile(destSvg, svgContent, 'utf8');

  // Mask for rounded screen corners
  const maskSvg = `<svg width="${PHONE_WIDTH}" height="${PHONE_HEIGHT}">
    <rect x="0" y="0" width="${PHONE_WIDTH}" height="${PHONE_HEIGHT}" rx="${CORNER_RADIUS}" fill="#fff"/>
  </svg>`;

  let pipeline = sharp(rawPath);
  if (item.crop) {
    pipeline = pipeline.extract(item.crop);
  }

  // Process and fit phone screen
  const processedPhone = await pipeline
    .resize(PHONE_WIDTH, PHONE_HEIGHT, {
      fit: 'cover',
      position: 'top',
    })
    .composite([{
      input: Buffer.from(maskSvg),
      blend: 'dest-in',
    }])
    .png()
    .toBuffer();

  // Composite background + phone
  await sharp(Buffer.from(svgContent))
    .composite([{
      input: processedPhone,
      left: PHONE_LEFT,
      top: PHONE_TOP,
    }])
    .png()
    .toFile(destPng);

  console.log(`Rendered [${locale}] ${destPng}`);
  return destPng;
}

async function buildContactSheet(imagePaths, locale) {
  const columns = 4;
  const cellWidth = 270;
  const cellHeight = 480;
  const gap = 20;
  const margin = 40;
  const header = 110;
  const width = margin * 2 + columns * cellWidth + (columns - 1) * gap;
  const rows = Math.ceil(imagePaths.length / columns);
  const height = header + margin + rows * cellHeight + (rows - 1) * gap + margin;

  const baseSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs>
      <linearGradient id="g" x2="1" y2="1">
        <stop stop-color="#080D13"/>
        <stop offset="1" stop-color="#121B26"/>
      </linearGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
    <text x="${margin}" y="52" fill="#F5F7FA" font-family="Inter, -apple-system, sans-serif" font-size="32" font-weight="800">GetFlow · Official Google Play Store Screenshots (${locale.toUpperCase()})</text>
    <text x="${margin}" y="82" fill="#CCFF00" font-family="Inter, -apple-system, sans-serif" font-size="16" font-weight="700" letter-spacing="2">AUTHENTIC APP SCREENS · 1080 × 1920 PX · READY FOR PUBLISHING</text>
  </svg>`;

  const composites = [{ input: Buffer.from(baseSvg), left: 0, top: 0 }];
  for (let i = 0; i < imagePaths.length; i += 1) {
    const col = i % columns;
    const row = Math.floor(i / columns);
    const left = margin + col * (cellWidth + gap);
    const top = header + margin + row * (cellHeight + gap);
    const thumb = await sharp(imagePaths[i])
      .resize(cellWidth, cellHeight, { fit: 'cover' })
      .png()
      .toBuffer();
    composites.push({ input: thumb, left, top });
  }

  const destination = path.join(outputRoot, 'assets', `contact-sheet-${locale.toUpperCase()}-PRODUCTION.png`);
  await sharp({ create: { width, height, channels: 4, background: '#080D13' } })
    .composite(composites)
    .png()
    .toFile(destination);

  console.log(`Generated contact sheet: ${destination}`);
  return destination;
}

async function main() {
  for (const [loc, items] of Object.entries(screenshotsConfig)) {
    console.log(`Rendering ${items.length} screenshots for locale: ${loc}`);
    const paths = [];
    for (const item of items) {
      const p = await renderScreenshot(item, loc);
      paths.push(p);
    }
    await buildContactSheet(paths, loc);
  }
}

main().catch(console.error);
