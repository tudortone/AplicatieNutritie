/**
 * buildAnatomy.mjs — Node ESM script
 * Citește SVG-urile anatomice și generează anatomyPaths.generated.ts
 * Rulează cu: node scripts/buildAnatomy.mjs
 *
 * Maparea se face în două etape:
 *   1. după id-ul din SVG (hărțile FRONT_MAP / BACK_MAP / PATTERN_MAP);
 *   2. GEOMETRIC — suprafețele rămase fără mușchi sunt atribuite după poziția lor
 *      pe corp, folosind zonele din components/fitness/muscleZones.ts (partiție
 *      completă a siluetei) și regiunile din components/fitness/muscleRegions.ts.
 *      Etapa 2 se auto-calibrează din suprafețele deja mapate la etapa 1.
 *      Zona `__neutral__` (cap, gât, palme, tălpi) rămâne necolorată.
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const NEUTRAL_ID = '__neutral__';

// ─── HELPERS ────────────────────────────────────────

/**
 * Decode HTML entities where UTF-8 bytes are individually encoded as &#NNN;.
 * Example: &#200;&#152; → UTF-8 0xC8 0x98 → Ș (U+0218)
 */
function decodeEntities(str) {
  const bytes = [];
  let result = '';
  const re = /&#(\d+);/g;
  let m;
  let lastIdx = 0;

  while ((m = re.exec(str)) !== null) {
    result += str.substring(lastIdx, m.index);
    const byte = parseInt(m[1], 10);

    if (byte <= 0xFF) {
      bytes.push(byte);
    }

    const nextIdx = m.index + m[0].length;
    const nextMatch = str.substring(nextIdx).match(/^\s*&#(\d+);/);

    if (!nextMatch || parseInt(nextMatch[1], 10) > 0xFF) {
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
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .trim();
}

/** Calculate relative luminance from hex color (sRGB formula) */
function relativeLuminance(hex) {
  if (!hex || hex === 'none') return 1;
  const h = hex.replace('#', '');
  if (h.length < 6) return 0.5;
  const r = parseInt(h.substring(0, 2), 16) / 255;
  const g = parseInt(h.substring(2, 4), 16) / 255;
  const b = parseInt(h.substring(4, 6), 16) / 255;
  const toLin = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b);
}

// ─── GEOMETRIE ───────────────────────────────────

/**
 * Extrage punctele unui path SVG (ancore + puncte de control).
 * Nu desenează curbele exact, dar e suficient pentru bounding box și centru.
 */
function pathPoints(d) {
  const tokens = d.match(/[MmZzLlHhVvCcSsQqTtAa]|-?\d*\.?\d+(?:[eE][-+]?\d+)?/g) || [];
  let i = 0;
  let cmd = null;
  let x = 0, y = 0, sx = 0, sy = 0;
  const pts = [];
  const num = () => {
    const v = parseFloat(tokens[i++]);
    return Number.isFinite(v) ? v : 0;
  };

  while (i < tokens.length) {
    const t = tokens[i];
    if (/^[A-Za-z]$/.test(t)) {
      cmd = t;
      i++;
      if (cmd === 'Z' || cmd === 'z') { x = sx; y = sy; }
      continue;
    }
    if (!cmd) { i++; continue; }

    const rel = cmd === cmd.toLowerCase();
    const c = cmd.toUpperCase();

    if (c === 'M' || c === 'L' || c === 'T') {
      const nx = num(), ny = num();
      x = rel ? x + nx : nx;
      y = rel ? y + ny : ny;
      if (c === 'M') { sx = x; sy = y; cmd = rel ? 'l' : 'L'; }
      pts.push([x, y]);
    } else if (c === 'H') {
      const nx = num();
      x = rel ? x + nx : nx;
      pts.push([x, y]);
    } else if (c === 'V') {
      const ny = num();
      y = rel ? y + ny : ny;
      pts.push([x, y]);
    } else if (c === 'C') {
      const x1 = num(), y1 = num(), x2 = num(), y2 = num(), ex = num(), ey = num();
      pts.push([rel ? x + x1 : x1, rel ? y + y1 : y1]);
      pts.push([rel ? x + x2 : x2, rel ? y + y2 : y2]);
      x = rel ? x + ex : ex;
      y = rel ? y + ey : ey;
      pts.push([x, y]);
    } else if (c === 'S' || c === 'Q') {
      const x1 = num(), y1 = num(), ex = num(), ey = num();
      pts.push([rel ? x + x1 : x1, rel ? y + y1 : y1]);
      x = rel ? x + ex : ex;
      y = rel ? y + ey : ey;
      pts.push([x, y]);
    } else if (c === 'A') {
      num(); num(); num(); num(); num();
      const ex = num(), ey = num();
      x = rel ? x + ex : ex;
      y = rel ? y + ey : ey;
      pts.push([x, y]);
    } else {
      i++;
    }
  }

  return pts;
}

function bboxOf(pts) {
  if (!pts.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [px, py] of pts) {
    if (px < minX) minX = px;
    if (px > maxX) maxX = px;
    if (py < minY) minY = py;
    if (py > maxY) maxY = py;
  }
  if (!Number.isFinite(minX)) return null;
  return {
    minX, minY, maxX, maxY,
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
    w: maxX - minX,
    h: maxY - minY,
  };
}

function pointInPolygon(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    const intersect = (yi > py) !== (yj > py) &&
      px < ((xj - xi) * (py - yi)) / ((yj - yi) || 1e-9) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Regresie liniară simplă: y = a*x + b */
function fit1d(xs, ys) {
  const n = xs.length;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let cov = 0, varx = 0;
  for (let i = 0; i < n; i++) {
    cov += (xs[i] - mx) * (ys[i] - my);
    varx += (xs[i] - mx) ** 2;
  }
  const a = varx === 0 ? 1 : cov / varx;
  return { a, b: my - a * mx };
}

/**
 * Citește regiunile și zonele aproximative per mușchi.
 *
 * Ordinea contează: întâi regiunile precise din `muscleRegions.ts`, apoi zonele
 * de acoperire din `muscleZones.ts`. Căutarea se oprește la prima potrivire.
 */
function loadRegions() {
  const out = { front: [], back: [] };
  const blockRe = /id:\s*'([a-z_]+)',\s*side:\s*'(front|back)',\s*d:\s*\[([\s\S]*?)\],\s*\}/g;

  const readBlocks = (relPath, optional) => {
    let src;
    try {
      src = readFileSync(resolve(ROOT, relPath), 'utf-8');
    } catch (err) {
      if (optional) return 0;
      throw err;
    }
    let m;
    let count = 0;
    blockRe.lastIndex = 0;
    while ((m = blockRe.exec(src)) !== null) {
      const id = m[1];
      const side = m[2];
      const polys = [...m[3].matchAll(/'([^']+)'/g)]
        .map((q) => pathPoints(q[1]))
        .filter((p) => p.length >= 3);
      if (polys.length) {
        out[side].push({ id, polys });
        count++;
      }
    }
    return count;
  };

  readBlocks('components/fitness/muscleRegions.ts', false);
  const zones = readBlocks('components/fitness/muscleZones.ts', true);
  if (zones > 0) {
    console.log(`   🗺️  ${zones} zone de acoperire încărcate din muscleZones.ts`);
  } else {
    console.log('   ⚠️  muscleZones.ts lipsește — se folosesc doar regiunile simplificate.');
  }

  return out;
}

/**
 * Etapa 2 — atribuie un mușchi suprafețelor rămase neutre, după poziție.
 *
 * Calibrarea (regiuni → coordonatele SVG-ului real) se deduce din perechile de
 * centre ale mușchilor deja mapați la etapa 1, deci nu depinde de dimensiunile
 * exacte ale desenului.
 */
function applyGeometricFallback(paths, regions, label) {
  if (!regions || regions.length === 0) {
    console.log(`   ⚠️  ${label}: nicio regiune definită, etapa geometrică s-a sărit.`);
    return 0;
  }

  const fills = [];
  for (const p of paths) {
    if (p.role !== 'fill') continue;
    const box = bboxOf(pathPoints(p.d));
    if (box) fills.push({ p, box });
  }
  if (fills.length === 0) return 0;

  // Centre pe mușchi din etapa 1
  const genCenters = new Map();
  for (const f of fills) {
    if (!f.p.muscleId) continue;
    if (!genCenters.has(f.p.muscleId)) genCenters.set(f.p.muscleId, []);
    genCenters.get(f.p.muscleId).push([f.box.cx, f.box.cy]);
  }

  // Centre pe mușchi din regiuni
  const regCenters = new Map();
  const regionPolys = [];
  for (const r of regions) {
    const all = r.polys.flat();
    const box = bboxOf(all);
    if (box && r.id !== NEUTRAL_ID) regCenters.set(r.id, [box.cx, box.cy]);
    for (const poly of r.polys) regionPolys.push({ id: r.id, poly, box: bboxOf(poly) });
  }

  const pairs = [];
  for (const [mid, list] of genCenters) {
    const reg = regCenters.get(mid);
    if (!reg) continue;
    const gx = list.reduce((s, v) => s + v[0], 0) / list.length;
    const gy = list.reduce((s, v) => s + v[1], 0) / list.length;
    pairs.push({ rx: reg[0], ry: reg[1], gx, gy });
  }

  if (pairs.length < 4) {
    console.log(`   ⚠️  ${label}: doar ${pairs.length} mușchi de referință, calibrarea nu e sigură — etapa geometrică s-a sărit.`);
    return 0;
  }

  const fx = fit1d(pairs.map((p) => p.rx), pairs.map((p) => p.gx));
  const fy = fit1d(pairs.map((p) => p.ry), pairs.map((p) => p.gy));

  // Transformare inversă: coordonate SVG real → spațiul regiunilor
  const toRegion = (gx, gy) => [
    fx.a === 0 ? 0 : (gx - fx.b) / fx.a,
    fy.a === 0 ? 0 : (gy - fy.b) / fy.a,
  ];

  const guess = (gx, gy, maxDist) => {
    const [rx, ry] = toRegion(gx, gy);
    for (const rp of regionPolys) {
      if (pointInPolygon(rx, ry, rp.poly)) return rp.id;
    }
    let best = null;
    let bestD = Infinity;
    for (const rp of regionPolys) {
      if (!rp.box) continue;
      const dx = rx - rp.box.cx;
      const dy = ry - rp.box.cy;
      const dist = Math.hypot(dx, dy);
      if (dist < bestD) { bestD = dist; best = rp.id; }
    }
    return bestD <= maxDist ? best : null;
  };

  // Verificare: cât de bine reproduce geometria maparea explicită?
  let checked = 0;
  let agreed = 0;
  for (const f of fills) {
    if (!f.p.muscleId) continue;
    checked++;
    if (guess(f.box.cx, f.box.cy, 40) === f.p.muscleId) agreed++;
  }
  const agreement = checked ? agreed / checked : 0;
  console.log(`   📐 ${label}: calibrare pe ${pairs.length} mușchi, concordanță cu maparea după id = ${(agreement * 100).toFixed(0)}%`);

  if (agreement < 0.30) {
    console.log(`   ⚠️  ${label}: concordanță prea mică, etapa geometrică NU se aplică (risc de colorare greșită).`);
    return 0;
  }

  // Dimensiunea corpului, pentru a exclude siluetele mari (contur, umbră generală)
  const bodyBox = bboxOf(fills.flatMap((f) => [[f.box.minX, f.box.minY], [f.box.maxX, f.box.maxY]]));
  const maxW = bodyBox.w * 0.45;
  const maxH = bodyBox.h * 0.30;

  let assigned = 0;
  let skippedBig = 0;
  let skippedNeutral = 0;
  let skippedLocked = 0;
  const perMuscle = {};
  for (const f of fills) {
    if (f.p.muscleId) continue;
    // Cap, gât, claviculă — marcate explicit ca neutre la etapa 1.
    if (f.p.locked) { skippedLocked++; continue; }
    if (f.box.w > maxW || f.box.h > maxH) { skippedBig++; continue; }
    const mid = guess(f.box.cx, f.box.cy, 45);
    if (!mid) continue;
    if (mid === NEUTRAL_ID) { skippedNeutral++; continue; }
    f.p.muscleId = mid;
    perMuscle[mid] = (perMuscle[mid] || 0) + 1;
    assigned++;
  }

  const notes = [];
  if (skippedBig) notes.push(`${skippedBig} siluete mari`);
  if (skippedNeutral) notes.push(`${skippedNeutral} în zona cap/gât/palme/tălpi`);
  if (skippedLocked) notes.push(`${skippedLocked} marcate neutre după id`);
  console.log(`   ➕ ${label}: ${assigned} suprafețe atribuite geometric` +
    (notes.length ? `, lăsate neutre: ${notes.join(', ')}` : ''));
  const summary = Object.entries(perMuscle)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}:${v}`)
    .join(', ');
  if (summary) console.log(`      ${summary}`);

  return assigned;
}

// ─── MUSCLE MAPS ────────────────────────────────────

const SKIP_GROUP_IDS = new Set([
  '1', '2', '4', 'a', '1_2', '1_3', '1_4',
  'group_1', 'group_2', 'group_3', 'group_4', 'group_5',
]);

// NEUTRU (null) — IDs that should NOT be colored by name.
// Atenție: grupurile "generale" conțin de fapt majoritatea desenului anatomic,
// deci conținutul lor este recuperat de etapa geometrică.
const NEUTRU_IDS = new Set([
  // FAȚĂ
  'head_front', 'neck_front_left', 'neck_front_right', 'neck_tendons_left',
  'neck_tendons_right', 'clavicula_fata_satnga_dreapta',
  'corp_fata',
  // SPATE
  'head_back', 'corp_spate',
]);

// Grupuri "container" — nu dau un mușchi, dar nici nu blochează etapa geometrică.
const CONTAINER_IDS = new Set([
  'muschii_generali_corp_front', 'muschii_generali_strat_spate',
  'm_uschi_generali_fata', 'parte_abdomen_trb_rsmsd_spate',
  'muschi_spate_generali',
]);

const FRONT_MAP = {
  chest_upper_left: 'pectorali', chest_upper_right: 'pectorali',
  chest_middle_left: 'pectorali', chest_middle_right: 'pectorali',
  chest_lower_left: 'pectorali', chest_lower_right: 'pectorali',
  chest_right: 'pectorali',
  delts_front_left: 'deltoid_anterior', delts_front_right: 'deltoid_anterior',
  delts_side_left: 'deltoid_lateral', delts_side_right: 'deltoid_lateral',
  delts_rear_left: 'deltoid_posterior', delts_rear_right: 'deltoid_posterior',
  biceps_left: 'biceps', biceps_right: 'biceps',
  triceps_brachii_left: 'triceps', triceps_brachii_right: 'triceps',
  forearms_brachio_left: 'antebrate', forearms_brachio_right: 'antebrate',
  abs_upper: 'abdomen', abs_middle: 'abdomen',
  abs_lower_left: 'abdomen', abs_lower_right: 'abdomen',
  obliques_left: 'oblici', obliques_right: 'oblici',
  obliques_left_2: 'oblici', obliques_right_2: 'oblici',
  serratus_left: 'oblici', serratus_right: 'oblici',
  quads_vastus_lateralis_left: 'cvadriceps', quads_vastus_lateralis_right: 'cvadriceps',
  quads_vastus_medialis_left: 'cvadriceps', quads_vastus_medialis_right: 'cvadriceps',
  adductors_left: 'adductori', adductors_right: 'adductori',
  calves_gastrocnemius_left: 'gambe', calves_gastrocnemius_right: 'gambe',
  tibialis_anterior_left: 'gambe', tibialis_anterior_right: 'gambe',
  tibialis_anterior_left_2: 'gambe', tibialis_anterior_right_2: 'gambe',
  hip_flexors_left: 'abductori', hip_flexors_right: 'abductori',
};

const BACK_MAP = {
  traps_upper_left: 'trapez', traps_upper_right: 'trapez',
  traps_middle_left: 'trapez', traps_middle_right: 'trapez',
  lats_left: 'dorsali', lats_right: 'dorsali',
  infraspinatus_left: 'romboizi', infraspinatus_right: 'romboizi',
  lower_back_left: 'lombari', lower_back_right: 'lombari',
  delts_rear_left: 'deltoid_posterior', delts_rear_right: 'deltoid_posterior',
  delts_lateral_left: 'deltoid_lateral', delts_lateral_right: 'deltoid_lateral',
  triceps_long_left: 'triceps', triceps_long_right: 'triceps',
  muschiul_brahial_left: 'biceps', muschiul_brahial_right: 'biceps',
  glutes_maximus_left: 'fesieri', glutes_maximus_right: 'fesieri',
  glutes_medius_left: 'abductori', glutes_medius_right: 'abductori',
  biceps_femoris_left: 'ischiogambieri', biceps_femoris_right: 'ischiogambieri',
  semitendinosus_left: 'ischiogambieri', semitendinosus_right: 'ischiogambieri',
  semimembranosus_left: 'ischiogambieri', semimembranosus_right: 'ischiogambieri',
  adductors_left: 'adductori', adductors_right: 'adductori',
  quads_vastus_lateralis_left: 'cvadriceps', quads_vastus_lateralis_right: 'cvadriceps',
  obliques_left: 'oblici', obliques_right: 'oblici',
};

/**
 * Reguli pe tipare, aplicate pe AMBELE vederi.
 * ORDINEA CONTEAZĂ: regulile mai specifice trebuie să fie primele.
 */
const PATTERN_MAP = [
  [/antebrat|forearm|extensor|brachiorad|brahioradial|muschi_mana/i, 'antebrate'],
  [/biceps_femoris|semitendinos|semimembranos|hamstring|ischiogambier/i, 'ischiogambieri'],
  [/triceps|capatul_medial|lateral_head|long_head/i, 'triceps'],
  [/biceps|brahial|brachii/i, 'biceps'],
  [/soleus|gastrocnem|tibialis|calf|calves|gamba|gambe/i, 'gambe'],
  [/glutes_medius|gluteus_medius|abductor/i, 'abductori'],
  [/glute|fesier/i, 'fesieri'],
  [/adductor/i, 'adductori'],
  [/quad|vastus|rectus_femoris|sartorius|cvadriceps/i, 'cvadriceps'],
  [/lats|latissimus|dorsal/i, 'dorsali'],
  [/rhomboid|romboiz|infraspinatus|teres/i, 'romboizi'],
  [/lower_back|erector|lombar/i, 'lombari'],
  [/trapez|traps/i, 'trapez'],
  [/oblique|oblic|serratus/i, 'oblici'],
  [/abs_|abdomen|rectus_abdominis/i, 'abdomen'],
  [/delts?_front|front_delt|deltoid_anterior/i, 'deltoid_anterior'],
  [/delts?_side|delts?_lateral|deltoid_lateral/i, 'deltoid_lateral'],
  [/delts?_rear|rear_delt|deltoid_posterior/i, 'deltoid_posterior'],
  [/chest|pector/i, 'pectorali'],
];

// ─── PARSE SVG ──────────────────────────────────────

function parseSVG(filePath, map, isFront) {
  let raw = readFileSync(filePath, 'utf-8');
  raw = decodeEntities(raw);

  raw = raw.replace(/<rect[^>]*fill="#1E1E1E"[^>]*\/>/gi, '');
  raw = raw.replace(/<defs>[\s\S]*?<\/defs>/gi, '');
  raw = raw.replace(/<linearGradient[\s\S]*?<\/linearGradient>/gi, '');

  const paths = [];
  const unmapped = new Set();
  const groupStack = [];

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
      // ⚠️ \s înaintea atributului previne confuzia cu id="Vector_2" etc.
      const dMatch = attrs.match(/\sd\s*=\s*"([^"]*)"/i);
      if (!dMatch) continue;

      const fillMatch = attrs.match(/\sfill\s*=\s*"([^"]*)"/i);
      const rawFill = fillMatch ? fillMatch[1] : 'none';

      let fill = rawFill;
      if (fill.startsWith('url(#')) {
        fill = '#555555';
      }

      const d = dMatch[1];

      const pathIdMatch = attrs.match(/\sid\s*=\s*"([^"]*)"/i);
      const pathRawId = pathIdMatch ? pathIdMatch[1] : null;
      const pathSlug = pathRawId ? slugify(pathRawId) : null;
      const isVectorLike = pathSlug && /^vector(_\d+)?$/i.test(pathSlug);

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

      if (!groupId) continue;

      // ─── Mapare după id ───
      // `undefined` = încă nedecis, `null` = neutru intenționat.
      let muscleId;
      let locked = false;

      if (Object.prototype.hasOwnProperty.call(map, groupId)) {
        muscleId = map[groupId];
      }

      if (muscleId === undefined) {
        for (const anc of ancestors) {
          if (Object.prototype.hasOwnProperty.call(map, anc)) {
            muscleId = map[anc];
            break;
          }
        }
      }

      if (muscleId === undefined && NEUTRU_IDS.has(groupId)) {
        muscleId = null;
        locked = true;
      }

      if (muscleId === undefined && !CONTAINER_IDS.has(groupId)) {
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

      if (muscleId === undefined) {
        if (!CONTAINER_IDS.has(groupId)) unmapped.add(groupId);
        muscleId = null;
      }

      const lum = relativeLuminance(fill);
      const role = lum < 0.18 ? 'outline' : 'fill';

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
        locked,
      });
    }
  }

  return { paths, unmapped: [...unmapped] };
}

// ─── MAIN ───────────────────────────────────────────

console.log('🔧 buildAnatomy.mjs — parsing SVG files...\n');

const front = parseSVG(resolve(ROOT, 'assets/body/front_body.svg'), FRONT_MAP, true);
const back = parseSVG(resolve(ROOT, 'assets/body/back_body.svg'), BACK_MAP, false);

const frontPaths = front.paths;
const backPaths = back.paths;

console.log(`  📐 Față: ${frontPaths.length} path-uri`);
console.log(`  📐 Spate: ${backPaths.length} path-uri`);

console.log('\n🧩 Etapa 2 — mapare geometrică a suprafețelor fără id:\n');
const regions = loadRegions();
applyGeometricFallback(frontPaths, regions.front, 'FAȚĂ');
applyGeometricFallback(backPaths, regions.back, 'SPATE');

// ─── REPORT ─────────────────────────────────────────

const ALL_MUSCLE_IDS = [
  'pectorali', 'deltoid_anterior', 'deltoid_lateral', 'deltoid_posterior',
  'biceps', 'triceps', 'antebrate', 'abdomen', 'oblici',
  'trapez', 'dorsali', 'lombari', 'romboizi',
  'fesieri', 'cvadriceps', 'ischiogambieri', 'gambe', 'adductori', 'abductori',
];

function countByMuscle(paths) {
  const counts = {};
  for (const p of paths) {
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

const frontFills = frontPaths.filter((p) => p.role === 'fill').length;
const backFills = backPaths.filter((p) => p.role === 'fill').length;
const frontNeutral = frontCounts.__neutru__ || 0;
const backNeutral = backCounts.__neutru__ || 0;
const totalFills = frontFills + backFills;
const totalNeutral = frontNeutral + backNeutral;
const coverage = totalFills ? ((totalFills - totalNeutral) / totalFills) * 100 : 0;

console.log(`\n🧪 NEUTRU: Față=${frontNeutral}, Spate=${backNeutral}`);
console.log(`🎯 ACOPERIRE: ${coverage.toFixed(0)}% din suprafețele colorabile au un mușchi atribuit`);

if (musclesWithZero.length > 0) {
  console.log(`\n⚠️  ERORI: Următoarele MuscleId au 0 path-uri colorabile pe AMBELE vederi:`);
  for (const m of musclesWithZero) {
    console.log(`   ❌ ${m}`);
  }
}

if (front.unmapped.length > 0) {
  console.log(`\n🔍 ID-uri FAȚĂ nemapate (${front.unmapped.length}):`);
  for (const id of front.unmapped) console.log(`   → ${id}`);
}

if (back.unmapped.length > 0) {
  console.log(`\n🔍 ID-uri SPATE nemapate (${back.unmapped.length}):`);
  for (const id of back.unmapped) console.log(`   → ${id}`);
}

// ─── GENERATE TS FILE ───────────────────────────────────

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
