/**
 * verifyAnatomy.mjs — Script de verificare a modulului generat
 * Rulează cu: node scripts/verifyAnatomy.mjs
 *
 * Verifică DOAR fișierul generat (anatomyPaths.generated.ts), nu SVG-urile.
 * Rulează-l după `node scripts/buildAnatomy.mjs`.
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

console.log('🔍 verifyAnatomy.mjs — verificare integritate hartă musculară\n');

const ALL_MUSCLE_IDS = [
  'pectorali', 'deltoid_anterior', 'deltoid_lateral', 'deltoid_posterior',
  'biceps', 'triceps', 'antebrate', 'abdomen', 'oblici',
  'trapez', 'dorsali', 'lombari', 'romboizi',
  'fesieri', 'cvadriceps', 'ischiogambieri', 'gambe', 'adductori', 'abductori',
];

const genPath = resolve(ROOT, 'components/fitness/anatomyPaths.generated.ts');
const genContent = readFileSync(genPath, 'utf-8');

/** Extrage obiectele complete dintr-un array exportat din fișierul generat. */
function extractPathData(arrayName) {
  const regex = new RegExp(`export const ${arrayName}: AnatomyPath\\[\\] = \\[([\\s\\S]*?)\\n\\];`, 'm');
  const match = genContent.match(regex);
  if (!match) return [];
  const body = match[1];
  const items = [];
  const itemRegex = /\{ d:'((?:[^'\\]|\\.)*)', muscleId:(?:null|'([^']*)'), baseColor:'([^']*)', role:'([^']*)' \}/g;
  let m;
  while ((m = itemRegex.exec(body)) !== null) {
    items.push({
      d: m[1],
      muscleId: m[2] === undefined ? null : m[2],
      baseColor: m[3],
      role: m[4],
    });
  }
  return items;
}

const frontPaths = extractPathData('FRONT_PATHS');
const backPaths = extractPathData('BACK_PATHS');

if (frontPaths.length === 0 || backPaths.length === 0) {
  console.error('❌ Nu s-au putut citi path-urile din fișierul generat. Rulează întâi: node scripts/buildAnatomy.mjs');
  process.exit(1);
}

console.log(`  📐 Path-uri față: ${frontPaths.length}`);
console.log(`  📐 Path-uri spate: ${backPaths.length}`);

let allGood = true;

// ─── 1. Acoperire per mușchi (doar role=fill — doar acestea se colorează) ───

function countFills(paths) {
  const counts = {};
  for (const p of paths) {
    if (p.role !== 'fill') continue;
    const key = p.muscleId || '__neutru__';
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

const frontCounts = countFills(frontPaths);
const backCounts = countFills(backPaths);

console.log('\n📋 1. Mușchi cu path-uri colorabile (role=fill):\n');
const zero = [];
for (const mid of ALL_MUSCLE_IDS) {
  const f = frontCounts[mid] || 0;
  const b = backCounts[mid] || 0;
  const total = f + b;
  if (total < 1) {
    allGood = false;
    zero.push(mid);
  }
  console.log(`   ${total >= 1 ? '✅' : '❌'} ${mid.padEnd(20)} Față=${String(f).padStart(3)}  Spate=${String(b).padStart(3)}  Total=${String(total).padStart(3)}`);
}

const neutruFront = frontCounts.__neutru__ || 0;
const neutruBack = backCounts.__neutru__ || 0;
console.log(`\n   🧪 Path-uri fill fără mușchi (neutru): Față=${neutruFront}, Spate=${neutruBack}`);

// Prea multe fill-uri neutre înseamnă că harta arată "stinsă" chiar dacă
// intensitățile sunt corecte — majoritatea corpului nu poate fi colorată.
const fillFront = frontPaths.filter((p) => p.role === 'fill').length;
const fillBack = backPaths.filter((p) => p.role === 'fill').length;
const neutruRatio = (neutruFront + neutruBack) / Math.max(1, fillFront + fillBack);
if (neutruRatio > 0.5) {
  console.log(`   ⚠️  ${(neutruRatio * 100).toFixed(0)}% dintre suprafețele colorabile nu au mușchi asociat — harta va părea stinsă.`);
  allGood = false;
}

// ─── 2. Duplicate: același d cu mușchi diferit ───

console.log('\n📋 2. Verificare duplicate:\n');

function countConflicts(paths) {
  const seen = new Map();
  let dupes = 0;
  for (const item of paths) {
    const prev = seen.get(item.d);
    if (prev) {
      if (prev.muscleId !== item.muscleId) dupes++;
    } else {
      seen.set(item.d, item);
    }
  }
  return dupes;
}

const frontDupes = countConflicts(frontPaths);
const backDupes = countConflicts(backPaths);

if (frontDupes === 0 && backDupes === 0) {
  console.log('   ✅ Niciun path duplicat cu muscleId diferit');
} else {
  console.log(`   ⚠️  Față: ${frontDupes} conflicte, Spate: ${backDupes} conflicte`);
  allGood = false;
}

// ─── 3. Paleta: 0 / lipsă intensitate → gri inactiv, nu albastru ───

console.log('\n📋 3. Verificare paleta heatColor:\n');

const heatSrc = readFileSync(resolve(ROOT, 'components/fitness/heatColor.ts'), 'utf-8');
const inactiveMatch = heatSrc.match(/COLOR_INACTIVE\s*=\s*'([^']+)'/);
if (!inactiveMatch) {
  console.log('   ❌ heatColor.ts nu definește COLOR_INACTIVE');
  allGood = false;
} else {
  console.log(`   ✅ COLOR_INACTIVE = ${inactiveMatch[1]}`);
  const returnsInactive = /return\s+COLOR_INACTIVE/.test(heatSrc);
  console.log(`   ${returnsInactive ? '✅' : '❌'} heatColor() returnează COLOR_INACTIVE pentru intensitate 0 / lipsă`);
  if (!returnsInactive) allGood = false;
}

// ─── 4. VIEWBOX ───

console.log('\n📋 4. Verificare VIEWBOX:\n');

const viewboxMatch = genContent.match(/export const VIEWBOX = \{ width: (\d+), height: (\d+) \};/);
if (viewboxMatch) {
  console.log(`   ✅ VIEWBOX = { width: ${viewboxMatch[1]}, height: ${viewboxMatch[2]} }`);
} else {
  console.log('   ❌ Nu s-a găsit VIEWBOX în fișierul generat!');
  allGood = false;
}

// ─── REZULTAT ───

console.log('\n═════════════════════════════════════');
if (allGood) {
  console.log('✅ TOATE VERIFICĂRILE AU TRECUT!');
} else {
  console.log('❌ UNELE VERIFICĂRI AU EȘUAT!');
  if (zero.length > 0) {
    console.log(`   Mușchi fără suprafață colorabilă: ${zero.join(', ')}`);
  }
  process.exit(1);
}
