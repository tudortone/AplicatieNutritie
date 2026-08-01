/**
 * buildAnatomy.mjs — Node ESM script
 * Citește SVG-urile anatomice și generează anatomyPaths.generated.ts
 * Rulează cu: node scripts/buildAnatomy.mjs
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ─── HELPERS ─────────────────────────────────────────────────────

/** 
 * Decode HTML entities where UTF-8 bytes are individually encoded as &#NNN;.
 * Example: &#200;&#152; → UTF-8 0xC8 0x98 → Ș (U+0218)
 * Standard entities like &#536; decode directly.
 */
function decodeEntities(str) {
  // First, collect consecutive &#NNN; sequences that may form UTF-8 sequences
  const bytes = [];
  let result = '';
  const re = /&#(\d+);/g;
  let m;
  let lastIdx = 0;
  
  while ((m = re.exec(str)) !== null) {
    // Add text before this entity
    result += str.substring(lastIdx, m.index);
    const byte = parseInt(m[1], 10);
    
    if (byte <= 0xFF) {
      bytes.push(byte);
    }
    
    // Check if next chars are also entities (whitespace between?)
    const nextIdx = m.index + m[0].length;
    const nextMatch = str.substring(nextIdx).match(/^\s*&#(\d+);/);
    
    if (!nextMatch || parseInt(nextMatch[1], 10) > 0xFF) {
      // Flush accumulated bytes
      if (bytes.length > 0) {
        const buf = Buffer.from(bytes);
        result += buf.toString('utf-8');
        bytes.length = 0;
      } else if (byte > 0xFF) {
        result += String.fromCharCode(byte);
      }
    }
    
    lastIdx = nextIdx;
  }
  
  result += str.substring(lastIdx);
  return result;
}

/** Slugify: lowercase, no diacritics, spaces → _, trim */
function slugify(str) {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .trim();
}

/** Calculate relative luminance from hex color (sRGB formula) */
function relativeLuminance(hex) {
  if (!hex || hex === 'none') return 1; // no fill = transparent = high luminance
  const h = hex.replace('#', '');
  if (h.length < 6) return 0.5;
  const r = parseInt(h.substring(0, 2), 16) / 255;
  const g = parseInt(h.substring(2, 4), 16) / 255;
  const b = parseInt(h.substring(4, 6), 16) / 255;
  const toLin = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b);
}

// ─── MUSCLE MAPS ───────────────────────────────────────────────

// IDs we skip when walking up the parent tree (placeholder / organizational groups)
const SKIP_GROUP_IDS = new Set([
  '1', '2', '4', 'a', '1_2', '1_3', '1_4',
  'group_1', 'group_2', 'group_3', 'group_4', 'group_5',
]);

// NEUTRU (null) — IDs that should NOT be colored
const NEUTRU_IDS = new Set([
  // FAȚĂ
  'head_front', 'neck_front_left', 'neck_front_right', 'neck_tendons_left',
  'neck_tendons_right', 'clavicula_fata_satnga_dreapta',
  'muschii_generali_corp_front', 'muschii_generali_strat_spate',
  'm_uschi_generali_fata', 'parte_abdomen_trb_rsmsd_spate',
  'corp_fata',
  // SPATE
  'head_back', 'muschi_spate_generali', 'corp_spate',
]);

// FAȚĂ mappings: slugified SVG id → MuscleId
const FRONT_MAP = {
  // Pectorali
  chest_upper_left: 'pectorali', chest_upper_right: 'pectorali',
  chest_middle_left: 'pectorali', chest_middle_right: 'pectorali',
  chest_lower_left: 'pectorali', chest_lower_right: 'pectorali',
  chest_right: 'pectorali',
  // Deltoid anterior
  delts_front_left: 'deltoid_anterior', delts_front_right: 'deltoid_anterior',
  // Deltoid lateral
  delts_side_left: 'deltoid_lateral', delts_side_right: 'deltoid_lateral',
  // Deltoid posterior
  delts_rear_left: 'deltoid_posterior', delts_rear_right: 'deltoid_posterior',
  // Biceps
  biceps_left: 'biceps', biceps_right: 'biceps',
  // Triceps
  triceps_brachii_left: 'triceps', triceps_brachii_right: 'triceps',
  // Antebrațe
  forearms_brachio_left: 'antebrate', forearms_brachio_right: 'antebrate',
  // Abdomen
  abs_upper: 'abdomen', abs_middle: 'abdomen',
  abs_lower_left: 'abdomen', abs_lower_right: 'abdomen',
  // Oblici
  obliques_left: 'oblici', obliques_right: 'oblici',
  obliques_left_2: 'oblici', obliques_right_2: 'oblici',
  serratus_left: 'oblici', serratus_right: 'oblici',
  // Cvadriceps
  quads_vastus_lateralis_left: 'cvadriceps', quads_vastus_lateralis_right: 'cvadriceps',
  quads_vastus_medialis_left: 'cvadriceps', quads_vastus_medialis_right: 'cvadriceps',
  // Adductori
  adductors_left: 'adductori', adductors_right: 'adductori',
  // Gambe
  calves_gastrocnemius_left: 'gambe', calves_gastrocnemius_right: 'gambe',
  tibialis_anterior_left: 'gambe', tibialis_anterior_right: 'gambe',
  tibialis_anterior_left_2: 'gambe', tibialis_anterior_right_2: 'gambe',
  // Abductori
  hip_flexors_left: 'abductori', hip_flexors_right: 'abductori',
};

// SPATE mappings
const BACK_MAP = {
  // Trapez
  traps_upper_left: 'trapez', traps_upper_right: 'trapez',
  traps_middle_left: 'trapez', traps_middle_right: 'trapez',
  // Dorsali
  lats_left: 'dorsali', lats_right: 'dorsali',
  // Romboizi
  infraspinatus_left: 'romboizi', infraspinatus_right: 'romboizi',
  // Lombari
  lower_back_left: 'lombari', lower_back_right: 'lombari',
  // Deltoid posterior
  delts_rear_left: 'deltoid_posterior', delts_rear_right: 'deltoid_posterior',
  // Deltoid lateral
  delts_lateral_left: 'deltoid_lateral', delts_lateral_right: 'deltoid_lateral',
  // Triceps (multiple Romanian variants)
  triceps_long_left: 'triceps', triceps_long_right: 'triceps',
  // Biceps
  muschiul_brahial_left: 'biceps', muschiul_brahial_right: 'biceps',
  // Fesieri
  glutes_maximus_left: 'fesieri', glutes_maximus_right: 'fesieri',
  // Abductori
  glutes_medius_left: 'abductori', glutes_medius_right: 'abductori',
  // Ischiogambieri
  biceps_femoris_left: 'ischiogambieri', biceps_femoris_right: 'ischiogambieri',
  semitendinosus_left: 'ischiogambieri', semitendinosus_right: 'ischiogambieri',
  semimembranosus_left: 'ischiogambieri', semimembranosus_right: 'ischiogambieri',
  // Adductori
  adductors_left: 'adductori', adductors_right: 'adductori',
  // Cvadriceps
  quads_vastus_lateralis_left: 'cvadriceps', quads_vastus_lateralis_right: 'cvadriceps',
  // Oblici
  obliques_left: 'oblici', obliques_right: 'oblici',
};

/**
 * FIX CRITIC: reguli pe tipare, aplicate pe AMBELE vederi.
 *
 * Inainte existau doar `BACK_REGEX_MAP` si, din cauza unui bug (`muscleId` era
 * initializat cu `null`, iar verificarile de dupa testau `=== undefined`), acele
 * reguli nu se aplicau NICIODATA. Toti muschii cu denumiri romanesti in SVG
 * ("MUSCHIUL TRICEPS BRAHIAL", "MUSCHII EXTENSORI AI ANTEBRATULUI",
 * "Muschiul Soleus"...) ieseau cu muscleId = null, deci nu puteau fi colorati
 * niciodata. De aici "nu se vad toti muschii".
 *
 * ORDINEA CONTEAZA: regulile mai specifice trebuie sa fie primele
 * (antebrate inainte de brate, biceps_femoris inainte de biceps,
 * glutes_medius inainte de glutes).
 */
const PATTERN_MAP = [
  // Antebrate (inainte de orice regula de brat)
  [/antebrat|forearm|extensor|brachiorad|brahioradial|muschi_mana/i, 'antebrate'],
  // Ischiogambieri (inainte de biceps, altfel "biceps femoris" devine biceps)
  [/biceps_femoris|semitendinos|semimembranos|hamstring|ischiogambier/i, 'ischiogambieri'],
  // Triceps
  [/triceps|capatul_medial|lateral_head|long_head/i, 'triceps'],
  // Biceps
  [/biceps|brahial|brachii/i, 'biceps'],
  // Gambe
  [/soleus|gastrocnem|tibialis|calf|calves|gamba|gambe/i, 'gambe'],
  // Abductori (inainte de fesieri)
  [/glutes_medius|gluteus_medius|abductor/i, 'abductori'],
  [/glute|fesier/i, 'fesieri'],
  [/adductor/i, 'adductori'],
  [/quad|vastus|rectus_femoris|sartorius|cvadriceps/i, 'cvadriceps'],
  // Trunchi
  [/lats|latissimus|dorsal/i, 'dorsali'],
  [/rhomboid|romboiz|infraspinatus|teres/i, 'romboizi'],
  [/lower_back|erector|lombar/i, 'lombari'],
  [/trapez|traps/i, 'trapez'],
  [/oblique|oblic|serratus/i, 'oblici'],
  [/abs_|abdomen|rectus_abdominis/i, 'abdomen'],
  // Umeri (inainte de piept, ca "delts" sa nu fie prins de altceva)
  [/delts?_front|front_delt|deltoid_anterior/i, 'deltoid_anterior'],
  [/delts?_side|delts?_lateral|deltoid_lateral/i, 'deltoid_lateral'],
  [/delts?_rear|rear_delt|deltoid_posterior/i, 'deltoid_posterior'],
  [/chest|pector/i, 'pectorali'],
];

// ─── PARSE SVG ─────────────────────────────────────────────────

function parseSVG(filePath, map, isFront) {
  let raw = readFileSync(filePath, 'utf-8');
  raw = decodeEntities(raw);

  // Remove background rect
  raw = raw.replace(/<rect[^>]*fill="#1E1E1E"[^>]*\/>/gi, '');
  // Remove defs and linearGradient elements
  raw = raw.replace(/<defs>[\s\S]*?<\/defs>/gi, '');
  raw = raw.replace(/<linearGradient[\s\S]*?<\/linearGradient>/gi, '');

  // Parse group stack and paths
  const paths = [];
  const unmapped = new Set();
  const groupStack = []; // [{id, level}]
  
  // Regex to match any tag: <g id="...">, </g>, <path ... />
  const tagRegex = /<(\/?)(g|path)\b([^>]*?)(\/?)>/gi;
  let match;

  while ((match = tagRegex.exec(raw)) !== null) {
    const isClosing = match[1] === '/';
    const tagName = match[2].toLowerCase();
    const attrs = match[3] || '';
    const selfClosing = match[4] === '/';

    if (tagName === 'g') {
      if (isClosing) {
        if (groupStack.length > 0) groupStack.pop();
      } else if (!selfClosing) {
        const idMatch = attrs.match(/\sid\s*=\s*"([^"]*)"/i);
        const gid = idMatch ? idMatch[1] : null;
        groupStack.push({ id: gid, level: groupStack.length });
      }
    } else if (tagName === 'path') {
      // ⚠️ CRITICAL: \s înaintea atributului previne confuzia cu id="Vector_2" etc.
      const dMatch = attrs.match(/\sd\s*=\s*"([^"]*)"/i);
      if (!dMatch) continue;

      const fillMatch = attrs.match(/\sfill\s*=\s*"([^"]*)"/i);
      const rawFill = fillMatch ? fillMatch[1] : 'none';
      
      let fill = rawFill;
      if (fill.startsWith('url(#')) {
        fill = '#555555'; // fallback for gradients - dark outline
      }

      const d = dMatch[1];

      // Check if path itself has a meaningful (non-Vector) id
      const pathIdMatch = attrs.match(/\sid\s*=\s*"([^"]*)"/i);
      const pathRawId = pathIdMatch ? pathIdMatch[1] : null;
      const pathSlug = pathRawId ? slugify(pathRawId) : null;
      const isVectorLike = pathSlug && /^vector(_\d+)?$/i.test(pathSlug);

      // Determine parent group id:
      // 1. If path has a non-Vector id → use it directly
      // 2. Otherwise walk up group stack, skip placeholder IDs
      let groupId = null;
      const ancestors = [];
      if (pathSlug && !isVectorLike && !SKIP_GROUP_IDS.has(pathSlug)) {
        groupId = pathSlug;
      }
      for (let i = groupStack.length - 1; i >= 0; i--) {
        const gid = groupStack[i].id;
        if (!gid) continue;
        const slug = slugify(gid);
        if (SKIP_GROUP_IDS.has(slug)) continue;
        ancestors.push(slug);
        if (!groupId) groupId = slug;
      }

      if (!groupId) continue; // no meaningful parent

      // ─── Map to muscleId ───
      // `undefined` = inca nedecis, `null` = neutru intentionat.
      // Bug reparat: variabila era initializata cu `null`, deci toate testele
      // `=== undefined` de mai jos erau moarte si regulile nu rulau niciodata.
      let muscleId;

      // 1. Mapare directa pe id-ul cel mai apropiat
      if (Object.prototype.hasOwnProperty.call(map, groupId)) {
        muscleId = map[groupId];
      }

      // 2. Mapare directa pe orice stramos (unele path-uri au id-uri generice)
      if (muscleId === undefined) {
        for (const anc of ancestors) {
          if (Object.prototype.hasOwnProperty.call(map, anc)) {
            muscleId = map[anc];
            break;
          }
        }
      }

      // 3. Neutru explicit
      if (muscleId === undefined && NEUTRU_IDS.has(groupId)) {
        muscleId = null;
      }

      // 4. Reguli pe tipare, pe id-ul propriu si apoi pe stramosi
      if (muscleId === undefined) {
        for (const candidate of [groupId, ...ancestors]) {
          for (const [regex, mid] of PATTERN_MAP) {
            if (regex.test(candidate)) {
              muscleId = mid;
              break;
            }
          }
          if (muscleId !== undefined) break;
        }
      }

      // 5. Nemapat → neutru, dar il raportam ca sa poata fi adaugat in map
      if (muscleId === undefined) {
        unmapped.add(groupId);
        muscleId = null;
      }

      // Determine role based on luminance
      const lum = relativeLuminance(fill);
      const role = lum < 0.18 ? 'outline' : 'fill';

      // For gradient fills that we replaced, make them fill
      const actualFill = rawFill.startsWith('url(#') ? fill : rawFill;

      // ─── VALIDARE PATH DATA (previne crash-ul la runtime) ───
      const PATH_DATA_RE = /^[MmZzLlHhVvCcSsQqTtAa][\s\d.,+\-eE]/;
      if (!PATH_DATA_RE.test(d.trim())) {
        const pathIdForError = pathSlug || 'unknown';
        throw new Error(
          `❌ Path invalid în ${isFront ? 'față' : 'spate'} — id="${pathIdForError}", ` +
          `d începe cu "${d.slice(0, 30)}". Buildul OPRIT.`
        );
      }

      paths.push({
        d,
        muscleId,
        baseColor: actualFill === 'none' ? '#000000' : actualFill,
        role,
      });
    }
  }

  return { paths, unmapped: [...unmapped] };
}

// ─── MAIN ──────────────────────────────────────────────────────

console.log('🔧 buildAnatomy.mjs — parsing SVG files...\n');

const front = parseSVG(resolve(ROOT, 'assets/body/front_body.svg'), FRONT_MAP, true);
const back = parseSVG(resolve(ROOT, 'assets/body/back_body.svg'), BACK_MAP, false);

const frontPaths = front.paths;
const backPaths = back.paths;

console.log(`  📐 Față: ${frontPaths.length} path-uri`);
console.log(`  📐 Spate: ${backPaths.length} path-uri`);

// ─── REPORT ────────────────────────────────────────────────────

const ALL_MUSCLE_IDS = [
  'pectorali', 'deltoid_anterior', 'deltoid_lateral', 'deltoid_posterior',
  'biceps', 'triceps', 'antebrate', 'abdomen', 'oblici',
  'trapez', 'dorsali', 'lombari', 'romboizi',
  'fesieri', 'cvadriceps', 'ischiogambieri', 'gambe', 'adductori', 'abductori',
];

function countByMuscle(paths) {
  const counts = {};
  for (const p of paths) {
    // Doar path-urile de tip `fill` pot fi colorate; cele `outline` sunt mereu
    // negre, deci nu conteaza pentru acoperirea hartii.
    if (p.role !== 'fill') continue;
    const key = p.muscleId || '__neutru__';
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

const frontCounts = countByMuscle(frontPaths);
const backCounts = countByMuscle(backPaths);

console.log('\n📊 RAPORT PATH-URI COLORABILE (role=fill) PER MUSCLE ID:\n');
console.log('MuscleId          | Față | Spate | Total');
console.log('──────────────────┬──────┬───────┬──────');

const musclesWithZero = [];

for (const mid of ALL_MUSCLE_IDS) {
  const f = frontCounts[mid] || 0;
  const b = backCounts[mid] || 0;
  const total = f + b;
  const label = mid.padEnd(17);
  console.log(`${label} | ${String(f).padStart(4)} | ${String(b).padStart(5)} | ${String(total).padStart(4)}`);
  if (total === 0) {
    musclesWithZero.push(mid);
  }
}

console.log(`\n🧪 NEUTRU: Față=${frontCounts.__neutru__ || 0}, Spate=${backCounts.__neutru__ || 0}`);

if (musclesWithZero.length > 0) {
  console.log(`\n⚠️  ERORI: Următoarele MuscleId au 0 path-uri colorabile pe AMBELE vederi:`);
  for (const m of musclesWithZero) {
    console.log(`   ❌ ${m}`);
  }
}

if (front.unmapped.length > 0) {
  console.log(`\n🔍 ID-uri FAȚĂ nemapate (${front.unmapped.length}) — adaugă-le în FRONT_MAP sau PATTERN_MAP:`);
  for (const id of front.unmapped) console.log(`   → ${id}`);
}

if (back.unmapped.length > 0) {
  console.log(`\n🔍 ID-uri SPATE nemapate (${back.unmapped.length}) — adaugă-le în BACK_MAP sau PATTERN_MAP:`);
  for (const id of back.unmapped) console.log(`   → ${id}`);
}

// ─── GENERATE TS FILE ────────────────────────────────────────────

function escapeString(str) {
  return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function formatPathObj(p, indent) {
  const sp = ' '.repeat(indent);
  const muscleStr = p.muscleId ? `'${p.muscleId}'` : 'null';
  return `${sp}{ d:'${escapeString(p.d)}', muscleId:${muscleStr}, baseColor:'${p.baseColor}', role:'${p.role}' }`;
}

function formatArray(paths, name, indent) {
  const inner = indent + 2;
  const lines = paths.map(p => formatPathObj(p, inner));
  return `export const ${name}: AnatomyPath[] = [\n${lines.join(',\n')}\n${' '.repeat(indent)}];`;
}

const tsContent = `// AUTO-GENERAT de scripts/buildAnatomy.mjs — NU EDITA MANUAL
// Generat la: ${new Date().toISOString()}

import type { MuscleId } from './heatColor';

export type AnatomyPath = {
  d: string;
  muscleId: MuscleId | null;
  baseColor: string;
  role: 'fill' | 'outline';
};

export const VIEWBOX = { width: 431, height: 808 };

${formatArray(frontPaths, 'FRONT_PATHS', 0)}

${formatArray(backPaths, 'BACK_PATHS', 0)}
`;

const outPath = resolve(ROOT, 'components/fitness/anatomyPaths.generated.ts');
writeFileSync(outPath, tsContent, 'utf-8');
console.log(`\n✅ Fișier generat: ${outPath}`);
console.log(`   Dimensiune: ${(tsContent.length / 1024).toFixed(1)} KB`);

if (musclesWithZero.length > 0) {
  process.exit(1);
}
