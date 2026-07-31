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

// ─── HELPERS ────────────────────────────────────────────────────────────────

/** 
 * Decode HTML entities where UTF-8 bytes are individually encoded as &#NNN;.
 * Example: &#200;&#152; → UTF-8 0xC8 0x98 → Ș (U+0218)
 * Standard entities like &#536; decode directly.
 */
function decodeEntities(str) {
  // First, collect consecutive &#NNN; sequences that may form UTF-8 sequences
  const bytes = [];
  let result = '';
  let i = 0;
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

// ─── MUSCLE MAPS ────────────────────────────────────────────────────────────

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
  'head_back', 'muschi_spate_generali', 'corp_spate', 'muschi_mana_spate',
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
  // Antebrațe
  // (handled via regex patterns below)
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
  // Gambe
  // (muschiul_soleus handled via pattern)
};

/** Additional back-side mappings using regex patterns for encoded Romanian names */
const BACK_REGEX_MAP = [
  // MUȘCHIUL TRICEPS BRAHIAL → triceps
  [/muschiul_triceps_brahial/i, 'triceps'],
  // MUȘCHII EXTENSORI AI ANTEBRAȚULUI → antebrate
  [/muschii_extensori_ai_antebratului/i, 'antebrate'],
  // MUȘCHIUL BRAHIAL → biceps
  [/muschiul_brahial/i, 'biceps'],
  // Capătul Medial → triceps
  [/capatul_medial/i, 'triceps'],
  // Lateral Head → triceps
  [/lateral_head/i, 'triceps'],
  // Mușchiul Soleus → gambe
  [/muschiul_soleus/i, 'gambe'],
  // mușchi mână spate → antebrate
  [/muschi_mana_spate/i, 'antebrate'],
];

// ─── PARSE SVG ──────────────────────────────────────────────────────────────

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
      
      // Skip paths with url() fills (gradients) or 'none' fill → treat as outline with original color?
      // Actually, url(#paint...) should become solid. We'll use a fallback.
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
      if (pathSlug && !isVectorLike && !SKIP_GROUP_IDS.has(pathSlug)) {
        groupId = pathSlug;
      } else {
        for (let i = groupStack.length - 1; i >= 0; i--) {
          const gid = groupStack[i].id;
          if (!gid) continue;
          const slug = slugify(gid);
          if (SKIP_GROUP_IDS.has(slug)) continue;
          groupId = slug;
          break;
        }
      }

      if (!groupId) continue; // no meaningful parent

      // Map to muscleId
      let muscleId = null;
      
      // Check direct map
      if (map[groupId] !== undefined) {
        muscleId = map[groupId];
      }
      
      // For back, check regex patterns
      if (muscleId === undefined && !isFront && groupId) {
        for (const [regex, mid] of BACK_REGEX_MAP) {
          if (regex.test(groupId)) {
            muscleId = mid;
            break;
          }
        }
      }

      // Check if it's NEUTRU
      if (muscleId === undefined && NEUTRU_IDS.has(groupId)) {
        muscleId = null;
      }

      // If still undefined, it's unmapped
      if (muscleId === undefined) {
        muscleId = null; // treat as neutru
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

  return paths;
}

// ─── MAIN ───────────────────────────────────────────────────────────────────

console.log('🔧 buildAnatomy.mjs — parsing SVG files...\n');

const frontPaths = parseSVG(
  resolve(ROOT, 'assets/body/front_body.svg'),
  FRONT_MAP,
  true
);
const backPaths = parseSVG(
  resolve(ROOT, 'assets/body/back_body.svg'),
  BACK_MAP,
  false
);

console.log(`  📐 Față: ${frontPaths.length} path-uri`);
console.log(`  📐 Spate: ${backPaths.length} path-uri`);

// ─── REPORT ─────────────────────────────────────────────────────────────────

const ALL_MUSCLE_IDS = [
  'pectorali', 'deltoid_anterior', 'deltoid_lateral', 'deltoid_posterior',
  'biceps', 'triceps', 'antebrate', 'abdomen', 'oblici',
  'trapez', 'dorsali', 'lombari', 'romboizi',
  'fesieri', 'cvadriceps', 'ischiogambieri', 'gambe', 'adductori', 'abductori',
];

function countByMuscle(paths) {
  const counts = {};
  for (const p of paths) {
    const key = p.muscleId || '__neutru__';
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

const frontCounts = countByMuscle(frontPaths);
const backCounts = countByMuscle(backPaths);

console.log('\n📊 RAPORT PATH-URI PER MUSCLE ID:\n');
console.log('MuscleId          | Față | Spate | Total');
console.log('──────────────────┼──────┼───────┼──────');

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
  console.log(`\n⚠️  ERORI: Următoarele MuscleId au 0 path-uri pe AMBELE vederi:`);
  for (const m of musclesWithZero) {
    console.log(`   ❌ ${m}`);
  }
}

// ─── COLLECT UNMAPPED IDs ───────────────────────────────────────────────────

// We need to collect groupIds that weren't mapped (for diagnostic purposes)
// We already tracked them during parsing - but we need the original group IDs

function collectGroupIds(filePath) {
  let raw = readFileSync(filePath, 'utf-8');
  raw = decodeEntities(raw);
  const ids = new Set();
  const tagRegex = /<g\b[^>]*id\s*=\s*"([^"]*)"[^>]*>/gi;
  let match;
  while ((match = tagRegex.exec(raw)) !== null) {
    const slug = slugify(match[1]);
    if (!SKIP_GROUP_IDS.has(slug)) {
      ids.add(slug);
    }
  }
  // Also check path-level ids
  const pathRegex = /<path\b[^>]*id\s*=\s*"([^"]*)"[^>]*\/?>/gi;
  while ((match = pathRegex.exec(raw)) !== null) {
    const id = match[1];
    if (/^vector/i.test(id)) continue;
    const slug = slugify(id);
    ids.add(slug);
  }
  return ids;
}

const frontGroupIds = collectGroupIds(resolve(ROOT, 'assets/body/front_body.svg'));
const backGroupIds = collectGroupIds(resolve(ROOT, 'assets/body/back_body.svg'));

const allKnownIds = new Set([
  ...Object.keys(FRONT_MAP),
  ...Object.keys(BACK_MAP),
  ...NEUTRU_IDS,
]);

// Also add regex-matched patterns for back
const backRegexPatterns = BACK_REGEX_MAP.map(([r]) => r);

const unmappedFront = [...frontGroupIds].filter(id => !allKnownIds.has(id));
const unmappedBack = [...backGroupIds].filter(id => {
  if (allKnownIds.has(id)) return false;
  for (const [regex] of BACK_REGEX_MAP) {
    if (regex.test(id)) return false;
  }
  return true;
});

if (unmappedFront.length > 0) {
  console.log(`\n🔍 ID-uri FAȚĂ nemapate (${unmappedFront.length}):`);
  for (const id of unmappedFront) {
    console.log(`   → ${id}`);
  }
}

if (unmappedBack.length > 0) {
  console.log(`\n🔍 ID-uri SPATE nemapate (${unmappedBack.length}):`);
  for (const id of unmappedBack) {
    console.log(`   → ${id}`);
  }
}

// ─── GENERATE TS FILE ──────────────────────────────────────────────────────

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
