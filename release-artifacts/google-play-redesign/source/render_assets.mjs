import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const outputRoot = path.resolve(scriptDir, '..');
const workspaceRoot = path.resolve(outputRoot, '..', '..');
const require = createRequire(import.meta.url);
const sharp = require(require.resolve('sharp', {
  paths: [path.join(workspaceRoot, 'frontend-nutritie', 'node_modules')],
}));

const locale = (process.argv[2] || 'en').toLowerCase();
const descriptions = {
  en: {
    label: 'GOOGLE PLAY SCREENSHOT TEMPLATE',
    placeholder: 'REAL APP SCREENSHOT',
    explanation: 'Replace this outlined area with a capture from the currently published GetFlow app.',
    status: 'NOT READY FOR PLAY CONSOLE',
    cards: [
      ['Food insights from a photo', 'AI-assisted estimates for meals. Review the result before saving.'],
      ['Your day, clearly', 'A quick view of daily calories and macronutrients.'],
      ['Meals, organized by day', 'Browse your Journal and review saved meals.'],
      ['A helpful nutrition Coach', 'Ask a question or explore a recipe in a real conversation.'],
      ['Find food your way', 'Search foods or scan a barcode before logging a meal.'],
      ['See your progress over time', 'Follow your recorded weight and nutrition history.'],
      ['Daily habits in one place', 'Review water, steps and activity from the app.'],
      ['Make workouts count', 'Show the current public workout tracking experience.'],
    ],
  },
  ro: {
    label: 'ȘABLON DE CAPTURĂ GOOGLE PLAY',
    placeholder: 'CAPTURĂ REALĂ DIN APLICAȚIE',
    explanation: 'Înlocuiește zona conturată cu o captură din versiunea GetFlow publicată acum.',
    status: 'NEPREGĂTIT PENTRU PLAY CONSOLE',
    cards: [
      ['Vezi estimări dintr-o fotografie', 'Estimări cu AI pentru mese. Verifică rezultatul înainte de salvare.'],
      ['Ziua ta, pe scurt', 'O privire rapidă asupra caloriilor și macronutrienților zilei.'],
      ['Mese organizate pe zile', 'Răsfoiește Jurnalul și verifică mesele salvate.'],
      ['Coach pentru nutriție', 'Pune o întrebare sau cere o rețetă într-o conversație reală.'],
      ['Găsește alimente cum preferi', 'Caută alimente sau scanează un cod de bare.'],
      ['Urmărește progresul în timp', 'Consultă istoricul greutății și alimentației înregistrate.'],
      ['Obiceiuri zilnice într-un loc', 'Vezi apa, pașii și activitatea din aplicație.'],
      ['Antrenamente urmărite ușor', 'Arată experiența de antrenament din versiunea publică.'],
    ],
  },
  fr: {
    label: 'MODÈLE DE CAPTURE GOOGLE PLAY',
    placeholder: 'CAPTURE RÉELLE DE L’APPLICATION',
    explanation: 'Remplacez cette zone par une capture de la version GetFlow actuellement publiée.',
    status: 'NON PRÊT POUR PLAY CONSOLE',
    cards: [
      ['Des infos repas par photo', 'Estimations avec IA. Vérifiez le résultat avant de l’enregistrer.'],
      ['Votre journée en un coup d’œil', 'Calories et macronutriments de la journée.'],
      ['Vos repas, jour après jour', 'Parcourez le Journal et consultez les repas enregistrés.'],
      ['Un Coach nutrition utile', 'Posez une question ou découvrez une recette en conversation.'],
      ['Trouvez vos aliments', 'Recherchez un aliment ou scannez son code-barres.'],
      ['Suivez votre progression', 'Consultez votre historique de poids et d’alimentation.'],
      ['Vos habitudes au même endroit', 'Retrouvez l’eau, les pas et l’activité de l’application.'],
      ['Suivez vos entraînements', 'Montrez le suivi des entraînements de la version publiée.'],
    ],
  },
  de: {
    label: 'GOOGLE-PLAY-SCREENSHOT-VORLAGE',
    placeholder: 'ECHTER APP-SCREENSHOT',
    explanation: 'Diesen Bereich mit einem Screenshot der aktuell veröffentlichten GetFlow-Version ersetzen.',
    status: 'NOCH NICHT FÜR DIE PLAY CONSOLE BEREIT',
    cards: [
      ['Essen per Foto einschätzen', 'KI-gestützte Schätzungen. Ergebnis vor dem Speichern prüfen.'],
      ['Dein Tag auf einen Blick', 'Kalorien und Makronährstoffe des Tages.'],
      ['Mahlzeiten nach Tagen', 'Journal öffnen und gespeicherte Mahlzeiten ansehen.'],
      ['Coach für Ernährungsfragen', 'Eine Frage stellen oder ein Rezept im Gespräch entdecken.'],
      ['Lebensmittel einfach finden', 'Suche verwenden oder Barcode scannen.'],
      ['Fortschritt im Blick behalten', 'Deinen erfassten Gewichts- und Ernährungsverlauf ansehen.'],
      ['Tägliche Gewohnheiten bündeln', 'Wasser, Schritte und Aktivitäten in der App ansehen.'],
      ['Workouts dokumentieren', 'Das Workout-Tracking der veröffentlichten Version zeigen.'],
    ],
  },
};

if (!descriptions[locale]) {
  throw new Error(`Unsupported locale: ${locale}. Use en, ro, fr, or de.`);
}

const copy = descriptions[locale];
const slug = ['photo-ai', 'home-dashboard', 'meal-journal', 'coach', 'food-search', 'progress', 'daily-habits', 'workouts'];
const esc = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
const wrap = (value, max = 31) => {
  const words = value.split(/\s+/);
  const lines = [];
  let current = '';
  for (const word of words) {
    if (current && `${current} ${word}`.length > max) {
      lines.push(current);
      current = word;
    } else current = current ? `${current} ${word}` : word;
  }
  if (current) lines.push(current);
  return lines.slice(0, 3);
};

function screenshotSvg(index, headline, subhead) {
  const titleLines = wrap(headline, 28);
  const titleMarkup = titleLines.map((line, lineIndex) => `<text x="92" y="${302 + lineIndex * 64}" class="headline">${esc(line)}</text>`).join('');
  const subLines = wrap(subhead, 49);
  const subY = 323 + titleLines.length * 64;
  const subMarkup = subLines.map((line, lineIndex) => `<text x="96" y="${subY + lineIndex * 38}" class="subhead">${esc(line)}</text>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920" role="img" aria-label="${esc(copy.label)} ${index + 1} — NOT READY">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#071018"/><stop offset="0.58" stop-color="#0A111C"/><stop offset="1" stop-color="#101426"/></linearGradient>
    <radialGradient id="limeGlow"><stop stop-color="#B8FF21" stop-opacity=".18"/><stop offset="1" stop-color="#B8FF21" stop-opacity="0"/></radialGradient>
    <radialGradient id="purpleGlow"><stop stop-color="#8F58E8" stop-opacity=".16"/><stop offset="1" stop-color="#8F58E8" stop-opacity="0"/></radialGradient>
    <linearGradient id="slot" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#151E2A"/><stop offset="1" stop-color="#0D1420"/></linearGradient>
    <filter id="soft"><feGaussianBlur stdDeviation="60"/></filter>
    <style>
      .brand{font:700 38px Inter,Arial,sans-serif;letter-spacing:-1px;fill:#F5F7FA}
      .label{font:700 18px Inter,Arial,sans-serif;letter-spacing:3px;fill:#B8FF21}
      .headline{font:700 56px Inter,Arial,sans-serif;letter-spacing:-1.6px;fill:#F5F7FA}
      .subhead{font:400 27px Inter,Arial,sans-serif;fill:#A5AFBD}
      .slot-title{font:700 30px Inter,Arial,sans-serif;letter-spacing:1px;fill:#D5DCE6}
      .slot-copy{font:400 23px Inter,Arial,sans-serif;fill:#8693A4}
      .notready{font:700 20px Inter,Arial,sans-serif;letter-spacing:1.5px;fill:#10151A}
      .index{font:700 18px Inter,Arial,sans-serif;letter-spacing:2px;fill:#8C97A6}
    </style>
  </defs>
  <rect width="1080" height="1920" fill="url(#bg)"/>
  <circle cx="965" cy="95" r="330" fill="url(#limeGlow)" filter="url(#soft)"/>
  <circle cx="54" cy="1700" r="370" fill="url(#purpleGlow)" filter="url(#soft)"/>
  <path d="M64 0h8v1920h-8z" fill="#B8FF21" opacity=".85"/>
  <g transform="translate(96 85)">
    <circle cx="31" cy="31" r="31" fill="#B8FF21" opacity=".12"/>
    <path d="M20 39c1-13 11-22 25-25-1 14-9 25-25 25Zm3 2c9 1 17 7 19 18-10-1-18-7-19-18Z" fill="none" stroke="#B8FF21" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    <text x="79" y="43" class="brand">GetFlow</text>
  </g>
  <text x="96" y="219" class="label">${esc(copy.label)}</text>
  ${titleMarkup}
  ${subMarkup}
  <text x="96" y="${subY + subLines.length * 38 + 58}" class="index">${String(index + 1).padStart(2, '0')} / 08</text>
  <rect x="78" y="${subY + subLines.length * 38 + 105}" width="924" height="1180" rx="62" fill="#111A27" stroke="#526070" stroke-opacity=".65" stroke-width="3"/>
  <rect x="99" y="${subY + subLines.length * 38 + 126}" width="882" height="1138" rx="46" fill="url(#slot)"/>
  <rect x="134" y="${subY + subLines.length * 38 + 163}" width="812" height="1064" rx="34" fill="none" stroke="#B8FF21" stroke-opacity=".66" stroke-width="3" stroke-dasharray="14 13"/>
  <g transform="translate(492 ${subY + subLines.length * 38 + 510})" fill="none" stroke="#B8FF21" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" opacity=".9">
    <rect x="-54" y="-54" width="108" height="108" rx="26"/>
    <path d="M-23 3h46M0-20v46"/>
  </g>
  <text x="540" y="${subY + subLines.length * 38 + 635}" class="slot-title" text-anchor="middle">${esc(copy.placeholder)}</text>
  <text x="540" y="${subY + subLines.length * 38 + 687}" class="slot-copy" text-anchor="middle">${esc(slug[index])}</text>
  ${wrap(copy.explanation, 53).map((line, lineIndex) => `<text x="540" y="${subY + subLines.length * 38 + 749 + lineIndex * 36}" class="slot-copy" text-anchor="middle">${esc(line)}</text>`).join('')}
  <rect x="96" y="1774" width="888" height="78" rx="39" fill="#B8FF21"/>
  <text x="540" y="1825" class="notready" text-anchor="middle">${esc(copy.status)}</text>
  <text x="96" y="1890" class="index">GETFLOW · STORE ARTWORK TEMPLATE</text>
</svg>`;
}

async function makeFeatureGraphic() {
  const backgroundPath = path.join(outputRoot, 'assets', 'feature-background-generated.png');
  const iconPath = path.join(workspaceRoot, 'frontend-nutritie', 'assets', 'images', 'playstore-icon-512.png');
  const roundedMask = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="78" height="78"><rect x="0" y="0" width="78" height="78" rx="18" fill="#fff"/></svg>');
  const icon = await sharp(iconPath)
    .resize(78, 78, { fit: 'cover' })
    .composite([{ input: roundedMask, blend: 'dest-in' }])
    .png()
    .toBuffer();
  const overlay = `<?xml version="1.0" encoding="UTF-8"?>
  <svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500" viewBox="0 0 1024 500">
    <defs><linearGradient id="veil" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#05090D" stop-opacity=".9"/><stop offset=".48" stop-color="#05090D" stop-opacity=".56"/><stop offset=".72" stop-color="#05090D" stop-opacity="0"/></linearGradient></defs>
    <rect width="1024" height="500" fill="url(#veil)"/>
    <rect x="76" y="74" width="98" height="98" rx="27" fill="#101820" stroke="#B8FF21" stroke-opacity=".4" stroke-width="2"/>
    <text x="198" y="133" fill="#F5F7FA" font-family="Inter,Arial,sans-serif" font-size="60" font-weight="750" letter-spacing="-2">GetFlow</text>
    <rect x="199" y="151" width="112" height="5" rx="2.5" fill="#B8FF21"/>
    <text x="198" y="194" fill="#D5DCE6" font-family="Inter,Arial,sans-serif" font-size="24" font-weight="500">Smarter nutrition. Better choices.</text>
    <text x="80" y="425" fill="#A5AFBD" font-family="Inter,Arial,sans-serif" font-size="15" font-weight="700" letter-spacing="3">NUTRITION · MEALS · PROGRESS</text>
  </svg>`;
  const output = path.join(outputRoot, 'assets', 'feature-graphic-1024x500.png');
  await sharp(backgroundPath)
    .resize(1024, 500, { fit: 'cover', position: 'centre' })
    .composite([
      { input: Buffer.from(overlay), left: 0, top: 0 },
      { input: icon, left: 86, top: 84 },
    ])
    .png()
    .toFile(output);
  await fs.writeFile(path.join(outputRoot, 'assets', 'feature-graphic-overlay.svg'), overlay, 'utf8');
  return output;
}

async function makeContactSheet(images) {
  const columns = 4;
  const cellWidth = 270;
  const cellHeight = 480;
  const gap = 22;
  const margin = 40;
  const header = 105;
  const width = margin * 2 + columns * cellWidth + (columns - 1) * gap;
  const rows = Math.ceil(images.length / columns);
  const height = header + margin + rows * cellHeight + (rows - 1) * gap + margin;
  const baseSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#080D13"/><stop offset="1" stop-color="#121B26"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><text x="${margin}" y="56" fill="#F5F7FA" font-family="Arial,sans-serif" font-size="34" font-weight="700">GetFlow · Screenshot templates</text><text x="${margin}" y="85" fill="#B8FF21" font-family="Arial,sans-serif" font-size="16" font-weight="700" letter-spacing="2">PLACEHOLDERS — NOT READY FOR PLAY CONSOLE</text></svg>`;
  const composites = [{ input: Buffer.from(baseSvg), left: 0, top: 0 }];
  for (let i = 0; i < images.length; i += 1) {
    const col = i % columns;
    const row = Math.floor(i / columns);
    const left = margin + col * (cellWidth + gap);
    const top = header + margin + row * (cellHeight + gap);
    const thumb = await sharp(images[i]).resize(cellWidth, cellHeight, { fit: 'cover' }).png().toBuffer();
    composites.push({ input: thumb, left, top });
  }
  const destination = path.join(outputRoot, 'assets', 'contact-sheet-NOT-READY.png');
  await sharp({ create: { width, height, channels: 4, background: '#080D13' } }).composite(composites).png().toFile(destination);
  return destination;
}

await fs.mkdir(path.join(outputRoot, 'templates'), { recursive: true });
const destinationDir = path.join(outputRoot, 'assets', locale);
await fs.mkdir(destinationDir, { recursive: true });
const rendered = [];
for (let i = 0; i < copy.cards.length; i += 1) {
  const [headline, subhead] = copy.cards[i];
  const svg = screenshotSvg(i, headline, subhead);
  const source = path.join(outputRoot, 'templates', `${String(i + 1).padStart(2, '0')}-${slug[i]}-${locale}.svg`);
  const png = path.join(destinationDir, `${String(i + 1).padStart(2, '0')}-${slug[i]}-template-NOT-READY.png`);
  await fs.writeFile(source, svg, 'utf8');
  await sharp(Buffer.from(svg)).png().toFile(png);
  rendered.push(png);
}

const feature = await makeFeatureGraphic();
const contact = await makeContactSheet(rendered);
console.log(JSON.stringify({ locale, templates: copy.cards.length, pngs: rendered, feature, contact }, null, 2));
