import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const bodyRegionsPath = resolve(root, 'node_modules/react-native-body-parts-anatomy/lib/module/data/bodyRegions.generated.js');

// Import BODY_REGIONS from package
const { BODY_REGIONS } = await import(`file://${bodyRegionsPath.replace(/\\/g, '/')}`);

const maleFront = {
  viewBox: BODY_REGIONS.male.front.viewBox,
  outlineD: BODY_REGIONS.male.front.outlineD,
  fragments: BODY_REGIONS.male.front.fragments.map(f => ({
    slug: f.slug,
    parentSlug: f.parentSlug,
    pathData: f.pathData,
  })),
};

const maleBack = {
  viewBox: BODY_REGIONS.male.back.viewBox,
  outlineD: BODY_REGIONS.male.back.outlineD,
  fragments: BODY_REGIONS.male.back.fragments.map(f => ({
    slug: f.slug,
    parentSlug: f.parentSlug,
    pathData: f.pathData,
  })),
};

const htmlContent = `<!DOCTYPE html>
<html lang="ro">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>GetFlow — Workout / Anatomy V2 Visual Polish</title>
<style>
  :root {
    --bg: #090C0E;
    --surface: #12161A;
    --surface-elevated: #181D22;
    --border: #222933;
    --accent: #CCFF00;
    --accent-cyan: #00F0FF;
    --accent-slate: #0284C7;
    --accent-chartreuse: #A3E635;
    --accent-purple: #A855F7;
    --warning: #F59E0B;
    --danger: #EF4444;
    --text-primary: #FFFFFF;
    --text-secondary: #8B93A0;
    --text-tertiary: #525C66;
    --muscle-base: #1C222B;
    --muscle-outline: rgba(255, 255, 255, 0.16);
  }
  * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  body { background: var(--bg); color: var(--text-primary); padding: 12px; display: flex; justify-content: center; }
  #app { width: 100%; max-width: 420px; min-height: 100vh; display: flex; flex-direction: column; gap: 12px; }

  /* Header */
  .header { display: flex; align-items: center; gap: 12px; min-height: 52px; }
  .back-btn { width: 38px; height: 38px; border-radius: 12px; border: 1px solid var(--border); background: var(--surface); color: var(--text-primary); display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 16px; }
  .header-titles h1 { font-size: 17px; font-weight: 800; letter-spacing: -0.3px; }
  .header-titles p { font-size: 11px; color: var(--text-secondary); }

  /* QA Scenario Quick Switcher */
  .qa-bar { display: flex; flex-direction: column; gap: 6px; background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 10px; }
  .qa-title { font-size: 10px; font-weight: 800; letter-spacing: 0.8px; color: var(--accent); text-transform: uppercase; }
  .qa-chips { display: flex; flex-wrap: wrap; gap: 4px; }
  .qa-chip { padding: 4px 8px; border-radius: 8px; border: 1px solid var(--border); background: #161B22; color: var(--text-secondary); font-size: 10px; font-weight: 700; cursor: pointer; transition: all 0.15s; }
  .qa-chip:hover { border-color: var(--accent); color: #fff; }
  .qa-chip.active { border-color: var(--accent); background: rgba(204, 255, 0, 0.12); color: var(--accent); }

  /* Summary Card */
  .summary-card { background: var(--surface); border: 1px solid var(--border); border-radius: 18px; padding: 14px; display: flex; flex-direction: column; gap: 10px; }
  .rank-badge-row { display: flex; justify-content: space-between; align-items: center; }
  .rank-pill { background: rgba(204, 255, 0, 0.12); border: 1px solid var(--accent); color: var(--accent); padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 900; letter-spacing: 0.8px; }
  .score-val { font-size: 22px; font-weight: 900; letter-spacing: -0.5px; }
  .metrics-row { display: flex; gap: 8px; }
  .metric-item { flex: 1; background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border); border-radius: 10px; padding: 8px; }
  .metric-item span { font-size: 9px; color: var(--text-secondary); display: block; text-transform: uppercase; font-weight: 700; }
  .metric-item strong { font-size: 13px; font-weight: 800; color: var(--text-primary); }

  /* Anatomy Card */
  .anatomy-card { background: var(--surface); border: 1px solid var(--border); border-radius: 20px; padding: 14px; display: flex; flex-direction: column; align-items: center; gap: 12px; }
  .view-toggle { display: flex; border: 1px solid var(--border); border-radius: 14px; padding: 3px; background: #0E1216; }
  .view-btn { padding: 6px 20px; font-size: 12px; font-weight: 700; border: none; border-radius: 11px; background: transparent; color: var(--text-secondary); cursor: pointer; transition: all 0.2s; }
  .view-btn.active { background: var(--accent); color: #000000; font-weight: 800; }

  /* SVG Map */
  .anatomy-svg-wrapper { width: 230px; height: 460px; display: flex; align-items: center; justify-content: center; position: relative; }
  .anatomy-svg { width: 100%; height: 100%; display: block; }
  .anatomy-svg path.fragment-path {
    cursor: pointer;
    transition: fill 0.25s ease, opacity 0.25s ease, stroke 0.2s ease, stroke-width 0.2s ease;
  }
  .anatomy-svg path.fragment-path:hover {
    filter: brightness(1.22);
  }
  .anatomy-svg path.fragment-path.selected {
    stroke: #FFFFFF !important;
    stroke-width: 1.6px !important;
    filter: drop-shadow(0 0 4px rgba(255,255,255,0.4));
  }

  /* Legend */
  .legend { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; font-size: 10px; font-weight: 700; color: var(--text-secondary); }
  .legend-item { display: flex; align-items: center; gap: 5px; }
  .legend-dot { width: 8px; height: 8px; border-radius: 3px; }

  /* Muscle Detail Sheet */
  .detail-sheet { background: #161C23; border: 1px solid var(--border); border-radius: 16px; padding: 14px; display: flex; flex-direction: column; gap: 8px; }
  .sheet-header { display: flex; justify-content: space-between; align-items: center; }
  .sheet-header h4 { font-size: 14px; font-weight: 800; color: #fff; }
  .close-sheet { background: transparent; border: none; color: var(--text-secondary); font-size: 16px; cursor: pointer; }
  .contributors-list { font-size: 11px; color: var(--text-secondary); display: flex; flex-direction: column; gap: 5px; }
  .contrib-row { display: flex; justify-content: space-between; padding: 6px 8px; background: rgba(255,255,255,0.03); border-radius: 6px; }

  .hidden { display: none !important; }
</style>
</head>
<body>

<div id="app">
  <!-- Top App Navigation -->
  <div class="header">
    <button class="back-btn" id="nav-back-btn" onclick="resetToNeutral()">←</button>
    <div class="header-titles">
      <h1 id="screen-title">GetFlow — Anatomy V2</h1>
      <p id="screen-subtitle">react-native-body-parts-anatomy@1.2.0 (Audited Source)</p>
    </div>
  </div>

  <!-- QA Scenario Switcher (Direct access to all 12 evaluation states) -->
  <div class="qa-bar">
    <div class="qa-title">Selectare Rapidă Scenariu Vizual (12 Stări)</div>
    <div class="qa-chips">
      <button class="qa-chip active" id="qa-neutral-front" onclick="setQaScenario('neutral-front')">1. Front Neutral</button>
      <button class="qa-chip" id="qa-neutral-back" onclick="setQaScenario('neutral-back')">2. Back Neutral</button>
      <button class="qa-chip" id="qa-exercise-front" onclick="setQaScenario('exercise-front')">3. Front Exercițiu</button>
      <button class="qa-chip" id="qa-exercise-back" onclick="setQaScenario('exercise-back')">4. Back Exercițiu</button>
      <button class="qa-chip" id="qa-level-1" onclick="setQaScenario('level-1')">5. Forță Nivel 1</button>
      <button class="qa-chip" id="qa-level-2" onclick="setQaScenario('level-2')">6. Forță Nivel 2</button>
      <button class="qa-chip" id="qa-level-3" onclick="setQaScenario('level-3')">7. Forță Nivel 3</button>
      <button class="qa-chip" id="qa-level-4" onclick="setQaScenario('level-4')">8. Forță Nivel 4</button>
      <button class="qa-chip" id="qa-level-5" onclick="setQaScenario('level-5')">9. Forță Nivel 5</button>
      <button class="qa-chip" id="qa-full-workout-front" onclick="setQaScenario('full-workout-front')">10. Full Workout Front</button>
      <button class="qa-chip" id="qa-full-workout-back" onclick="setQaScenario('full-workout-back')">11. Full Workout Back</button>
      <button class="qa-chip" id="qa-detail-selected" onclick="setQaScenario('detail-selected')">12. Detaliu Mușchi Selectat</button>
    </div>
  </div>

  <!-- Summary Card -->
  <div class="summary-card" id="summary-card">
    <div class="rank-badge-row">
      <div>
        <span style="font-size: 10px; color: var(--text-secondary); font-weight: 700;">STATUS CURENT</span>
        <div class="score-val" id="rank-name" style="color: var(--accent);">NEUTRAL (FĂRĂ DATE)</div>
      </div>
      <div class="rank-pill" id="rank-level-pill">NIVEL 0</div>
    </div>
    <div class="metrics-row">
      <div class="metric-item">
        <span>Scor General</span>
        <strong id="overall-score">0 / 100</strong>
      </div>
      <div class="metric-item">
        <span>Regiuni Lucrate</span>
        <strong id="represented-regions">0 / 6</strong>
      </div>
      <div class="metric-item">
        <span>Momentum</span>
        <strong id="momentum-score">0%</strong>
      </div>
    </div>
  </div>

  <!-- Anatomy Card -->
  <div class="anatomy-card">
    <div class="view-toggle">
      <button class="view-btn active" id="btn-view-front" onclick="switchAnatomyView('front')">Față</button>
      <button class="view-btn" id="btn-view-back" onclick="switchAnatomyView('back')">Spate</button>
    </div>

    <!-- SVG Container with authentic package data -->
    <div class="anatomy-svg-wrapper" id="anatomy-svg-container"></div>

    <!-- Dynamic Legend -->
    <div class="legend" id="anatomy-legend"></div>
  </div>

  <!-- Muscle Detail Sheet -->
  <div class="detail-sheet hidden" id="muscle-detail-sheet">
    <div class="sheet-header">
      <h4 id="detail-muscle-name">Pectorali (Piept)</h4>
      <button class="close-sheet" onclick="closeMuscleDetail()">✕</button>
    </div>
    <div style="display: flex; gap: 14px; font-size: 12px;">
      <div>Nivel: <strong id="detail-muscle-rank" style="color: var(--accent);">NIVEL 3 (DRIVE)</strong></div>
      <div>Scor Forță: <strong id="detail-muscle-score">52 / 100</strong></div>
    </div>
    <div class="contributors-list" id="detail-contributors-list"></div>
  </div>
</div>

<script>
// Audited Package 1.2.0 Data (male.front & male.back)
const ANATOMY_SOURCE = ${JSON.stringify({ front: maleFront, back: maleBack })};

// Canonical Mapping (19 GetFlow Canonical IDs Accounted For)
const CANONICAL_MAPPING = {
  front: {
    chest: { canonicalIds: ['chest', 'upper_chest'], selectionTarget: 'chest', label: 'Pectorali (Piept)' },
    deltoids: { canonicalIds: ['front_delts', 'side_delts'], selectionTarget: 'front_delts', label: 'Deltoizi (Anterior/Lateral)' },
    biceps: { canonicalIds: ['biceps'], selectionTarget: 'biceps', label: 'Biceps Brahial' },
    triceps: { canonicalIds: ['triceps'], selectionTarget: 'triceps', label: 'Triceps Brahial' },
    forearm: { canonicalIds: ['forearms'], selectionTarget: 'forearms', label: 'Antebrațe' },
    abs: { canonicalIds: ['abs'], selectionTarget: 'abs', label: 'Abdomen' },
    obliques: { canonicalIds: ['obliques'], selectionTarget: 'obliques', label: 'Oblici' },
    trapezius: { canonicalIds: ['traps'], selectionTarget: 'traps', label: 'Trapez (Superior)' },
    quadriceps: { canonicalIds: ['quads'], selectionTarget: 'quads', label: 'Cvadriceps' },
    adductors: { canonicalIds: ['adductors'], selectionTarget: 'adductors', label: 'Adductori' },
    tibialis: { canonicalIds: ['calves'], selectionTarget: 'calves', label: 'Tibial / Gambă Anterioară' },
    calves: { canonicalIds: ['calves'], selectionTarget: 'calves', label: 'Gambe' },
  },
  back: {
    deltoids: { canonicalIds: ['rear_delts', 'side_delts'], selectionTarget: 'rear_delts', label: 'Deltoid Posterior' },
    trapezius: { canonicalIds: ['traps'], selectionTarget: 'traps', label: 'Trapez (Spate)' },
    'upper-back': { canonicalIds: ['lats'], selectionTarget: 'lats', label: 'Dorsali (Lats)' },
    'lower-back': { canonicalIds: ['lower_back'], selectionTarget: 'lower_back', label: 'Zona Lombară' },
    triceps: { canonicalIds: ['triceps'], selectionTarget: 'triceps', label: 'Triceps (Toate cele 3 capete)' },
    forearm: { canonicalIds: ['forearms'], selectionTarget: 'forearms', label: 'Antebrațe Posterior' },
    gluteal: { canonicalIds: ['glutes'], selectionTarget: 'glutes', label: 'Glutei' },
    hamstring: { canonicalIds: ['hamstrings'], selectionTarget: 'hamstrings', label: 'Femurali (Ischiogambieri)' },
    adductors: { canonicalIds: ['adductors'], selectionTarget: 'adductors', label: 'Adductori' },
    calves: { canonicalIds: ['calves'], selectionTarget: 'calves', label: 'Gambe (Gastrocnemian/Solear)' },
  }
};

const MUSCLE_NAMES = {
  chest: 'Pectorali (Piept)',
  upper_chest: 'Pectoral Superior',
  front_delts: 'Deltoid Anterior',
  side_delts: 'Deltoid Lateral',
  rear_delts: 'Deltoid Posterior',
  biceps: 'Biceps Brahial',
  triceps: 'Triceps Brahial',
  forearms: 'Antebrațe',
  traps: 'Trapez',
  lats: 'Dorsali (Lats)',
  lower_back: 'Zona Lombară',
  abs: 'Abdomen (Drept Abdominal)',
  obliques: 'Oblici',
  glutes: 'Glutei',
  quads: 'Cvadriceps',
  hamstrings: 'Femurali (Ischiogambieri)',
  adductors: 'Adductori',
  calves: 'Gambe',
  hip_flexors: 'Flexori Șold (Nesupus)',
};

// Current State
let currentView = 'front';
let currentMode = 'neutral'; // 'neutral' | 'exercise' | 'strength' | 'full-workout'
let currentScenario = 'neutral-front';
let selectedMuscleId = null;
let currentExerciseData = { primary: [], secondary: [], stabilizers: [] };
let currentStrengthScores = {};

// Palette Configuration
const PALETTE = {
  // Neutral graphite with subtle tonal separation
  neutralTones: ['#1C222B', '#202732', '#242D38'],
  unmappedTone: '#141820',
  // Refined strength progression
  strength: {
    1: { color: '#0284C7', opacity: 0.45, label: 'Niv 1 (Slate Cyan)' },
    2: { color: '#00F0FF', opacity: 0.68, label: 'Niv 2 (Electric Cyan)' },
    3: { color: '#A3E635', opacity: 0.78, label: 'Niv 3 (Chartreuse)' },
    4: { color: '#CCFF00', opacity: 0.88, label: 'Niv 4 (Strong Lime)' },
    5: { color: '#CCFF00', opacity: 1.00, label: 'Niv 5 (Apex Lime)' },
  },
  // Exercise roles
  roles: {
    primary: { color: '#CCFF00', opacity: 0.98, label: 'Principal (Lime)' },
    secondary: { color: '#00F0FF', opacity: 0.84, label: 'Secundar (Cyan)' },
    stabilizer: { color: '#F59E0B', opacity: 0.72, label: 'Stabilizator (Amber)' },
  }
};

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  return hash;
}

function resolveFragmentVisual(fragment, view) {
  const mapping = CANONICAL_MAPPING[view][fragment.parentSlug];
  const hash = hashString(fragment.slug);
  const mod = ((hash % 5) - 2) * 0.015; // -0.03 to +0.03 micro-modulation to reveal contours

  if (!mapping) {
    // Unmapped anatomical structures (neck, head, hands, feet, knees, ankles)
    return {
      fill: PALETTE.unmappedTone,
      opacity: 0.85,
      isMapped: false,
    };
  }

  // 1. EXERCISE MODE OR FULL WORKOUT
  if (currentMode === 'exercise' || currentMode === 'full-workout') {
    const canonicals = mapping.canonicalIds;
    const isPrimary = canonicals.some(c => currentExerciseData.primary.includes(c));
    const isSecondary = canonicals.some(c => currentExerciseData.secondary.includes(c));
    const isStabilizer = canonicals.some(c => currentExerciseData.stabilizers.includes(c));

    if (isPrimary) {
      return { fill: PALETTE.roles.primary.color, opacity: Math.min(1, PALETTE.roles.primary.opacity + mod), isMapped: true };
    }
    if (isSecondary) {
      return { fill: PALETTE.roles.secondary.color, opacity: Math.min(1, PALETTE.roles.secondary.opacity + mod), isMapped: true };
    }
    if (isStabilizer) {
      return { fill: PALETTE.roles.stabilizer.color, opacity: Math.min(1, PALETTE.roles.stabilizer.opacity + mod), isMapped: true };
    }
    // Inactive muscle in workout
    const tone = PALETTE.neutralTones[hash % PALETTE.neutralTones.length];
    return { fill: tone, opacity: 0.72, isMapped: true };
  }

  // 2. STRENGTH MODE
  if (currentMode === 'strength') {
    const canonicals = mapping.canonicalIds;
    const scores = canonicals.map(c => currentStrengthScores[c]).filter(s => typeof s === 'number');
    if (scores.length > 0) {
      const maxScore = Math.max(...scores);
      let level = 1;
      if (maxScore >= 80) level = 5;
      else if (maxScore >= 60) level = 4;
      else if (maxScore >= 40) level = 3;
      else if (maxScore >= 20) level = 2;
      else level = 1;

      const conf = PALETTE.strength[level];
      return { fill: conf.color, opacity: Math.min(1, conf.opacity + mod), isMapped: true, level };
    }
    // No data for this muscle
    const tone = PALETTE.neutralTones[hash % PALETTE.neutralTones.length];
    return { fill: tone, opacity: 0.88, isMapped: true };
  }

  // 3. NEUTRAL MODE
  // Dark graphite with subtle tonal separation across adjacent fragments
  const tone = PALETTE.neutralTones[hash % PALETTE.neutralTones.length];
  return { fill: tone, opacity: 0.88, isMapped: true };
}

function renderAnatomy() {
  const container = document.getElementById('anatomy-svg-container');
  const regionSet = ANATOMY_SOURCE[currentView];
  const fragments = regionSet.fragments;

  let fragmentsSvg = '';
  fragments.forEach(f => {
    const visual = resolveFragmentVisual(f, currentView);
    const mapping = CANONICAL_MAPPING[currentView][f.parentSlug];
    const isSelected = selectedMuscleId && mapping && mapping.canonicalIds.includes(selectedMuscleId);

    // Subtle internal boundaries between fragments without sticker/comic effect
    const stroke = isSelected ? '#FFFFFF' : 'rgba(10, 14, 18, 0.45)';
    const strokeWidth = isSelected ? '1.8' : '0.65';
    const selectedClass = isSelected ? 'fragment-path selected' : 'fragment-path';
    const label = mapping ? mapping.label : f.parentSlug;

    fragmentsSvg += \`
      <path
        id="\${f.slug}"
        class="\${selectedClass}"
        data-slug="\${f.slug}"
        data-group="\${f.parentSlug}"
        d="\${f.pathData}"
        fill="\${visual.fill}"
        fill-opacity="\${visual.opacity}"
        stroke="\${stroke}"
        stroke-width="\${strokeWidth}"
        vector-effect="non-scaling-stroke"
        onclick="handleFragmentClick('\${f.slug}')"
      >
        <title>\${label} (\${f.slug})</title>
      </path>
    \`;
  });

  // Outer body silhouette outline with refined subtle opacity
  const outlineSvg = \`
    <path
      d="\${regionSet.outlineD}"
      fill="none"
      stroke="rgba(255, 255, 255, 0.16)"
      stroke-width="1.2"
      vector-effect="non-scaling-stroke"
    />
  \`;

  container.innerHTML = \`
    <svg class="anatomy-svg" viewBox="\${regionSet.viewBox}" xmlns="http://www.w3.org/2000/svg">
      \${outlineSvg}
      \${fragmentsSvg}
    </svg>
  \`;

  updateLegend();
}

function updateLegend() {
  const legend = document.getElementById('anatomy-legend');
  if (currentMode === 'exercise' || currentMode === 'full-workout') {
    legend.innerHTML = \`
      <div class="legend-item"><div class="legend-dot" style="background: \${PALETTE.roles.primary.color};"></div>Principal</div>
      <div class="legend-item"><div class="legend-dot" style="background: \${PALETTE.roles.secondary.color};"></div>Secundar</div>
      <div class="legend-item"><div class="legend-dot" style="background: \${PALETTE.roles.stabilizer.color};"></div>Stabilizator</div>
      <div class="legend-item"><div class="legend-dot" style="background: #1C222B;"></div>Inactiv</div>
    \`;
  } else if (currentMode === 'strength') {
    legend.innerHTML = \`
      <div class="legend-item"><div class="legend-dot" style="background: #1C222B;"></div>Fără date</div>
      <div class="legend-item"><div class="legend-dot" style="background: \${PALETTE.strength[1].color};"></div>Niv 1</div>
      <div class="legend-item"><div class="legend-dot" style="background: \${PALETTE.strength[2].color};"></div>Niv 2</div>
      <div class="legend-item"><div class="legend-dot" style="background: \${PALETTE.strength[3].color};"></div>Niv 3</div>
      <div class="legend-item"><div class="legend-dot" style="background: \${PALETTE.strength[4].color};"></div>Niv 4</div>
      <div class="legend-item"><div class="legend-dot" style="background: \${PALETTE.strength[5].color};"></div>Niv 5</div>
    \`;
  } else {
    // Neutral
    legend.innerHTML = \`
      <div class="legend-item"><div class="legend-dot" style="background: #242D38;"></div>Contur Grafit Neutru</div>
      <div class="legend-item"><div class="legend-dot" style="background: #141820;"></div>Siluetă Bază</div>
    \`;
  }
}

function handleFragmentClick(slug) {
  const mapping = CANONICAL_MAPPING[currentView][findParentSlug(slug)];
  if (!mapping) return;
  const targetId = mapping.selectionTarget;
  selectedMuscleId = (selectedMuscleId === targetId) ? null : targetId;

  if (selectedMuscleId) {
    showDetailSheet(selectedMuscleId);
  } else {
    closeMuscleDetail();
  }
  renderAnatomy();
}

function findParentSlug(slug) {
  const regionSet = ANATOMY_SOURCE[currentView];
  const f = regionSet.fragments.find(frag => frag.slug === slug);
  return f ? f.parentSlug : slug;
}

function showDetailSheet(muscleId) {
  const sheet = document.getElementById('muscle-detail-sheet');
  const nameEl = document.getElementById('detail-muscle-name');
  const rankEl = document.getElementById('detail-muscle-rank');
  const scoreEl = document.getElementById('detail-muscle-score');
  const contribEl = document.getElementById('detail-contributors-list');

  const name = MUSCLE_NAMES[muscleId] || muscleId;
  nameEl.innerText = name;

  const score = currentStrengthScores[muscleId] || (currentMode === 'strength' ? 52 : 0);
  let rank = 'NO_DATA';
  if (score >= 80) rank = 'LEVEL 5 (APEX)';
  else if (score >= 60) rank = 'LEVEL 4 (SURGE)';
  else if (score >= 40) rank = 'LEVEL 3 (DRIVE)';
  else if (score >= 20) rank = 'LEVEL 2 (FORGE)';
  else if (score > 0) rank = 'LEVEL 1 (FOUNDATION)';

  rankEl.innerText = rank;
  scoreEl.innerText = score > 0 ? \`\${score} / 100\` : 'Fără înregistrări';
  contribEl.innerHTML = \`
    <div class="contrib-row"><span>Contribuție principală</span><strong>Seturi recente de lucru</strong></div>
    <div class="contrib-row"><span>Consistență 90 de zile</span><strong>\${score > 40 ? 'Ridicată' : 'Normală'}</strong></div>
  \`;
  sheet.classList.remove('hidden');
}

function closeMuscleDetail() {
  selectedMuscleId = null;
  document.getElementById('muscle-detail-sheet').classList.add('hidden');
  renderAnatomy();
}

function switchAnatomyView(view) {
  currentView = view;
  document.getElementById('btn-view-front').classList.toggle('active', view === 'front');
  document.getElementById('btn-view-back').classList.toggle('active', view === 'back');
  renderAnatomy();
}

// 12 QA SCENARIOS
function setQaScenario(scenario) {
  currentScenario = scenario;
  document.querySelectorAll('.qa-chip').forEach(c => c.classList.remove('active'));
  const btn = document.getElementById(\`qa-\${scenario}\`);
  if (btn) btn.classList.add('active');

  selectedMuscleId = null;
  document.getElementById('muscle-detail-sheet').classList.add('hidden');

  switch (scenario) {
    case 'neutral-front':
      currentMode = 'neutral';
      currentView = 'front';
      currentStrengthScores = {};
      updateSummaryUI('NEUTRAL GRAPHITE', 'NIVEL 0', '0 / 100', '0 / 6', '0%');
      break;

    case 'neutral-back':
      currentMode = 'neutral';
      currentView = 'back';
      currentStrengthScores = {};
      updateSummaryUI('NEUTRAL GRAPHITE', 'NIVEL 0', '0 / 100', '0 / 6', '0%');
      break;

    case 'exercise-front':
      currentMode = 'exercise';
      currentView = 'front';
      currentExerciseData = {
        primary: ['chest', 'upper_chest', 'front_delts'],
        secondary: ['triceps', 'side_delts'],
        stabilizers: ['abs'],
      };
      updateSummaryUI('BENCH PRESS FOCUS', 'ROLURI ACTIVE', '3 GRUPE', '4 SECUNDARE', 'PRIMAR > SEC > STAB');
      break;

    case 'exercise-back':
      currentMode = 'exercise';
      currentView = 'back';
      currentExerciseData = {
        primary: ['lats', 'traps', 'rear_delts'],
        secondary: ['triceps', 'hamstrings'],
        stabilizers: ['lower_back'],
      };
      updateSummaryUI('BARBELL ROW FOCUS', 'ROLURI ACTIVE', '3 GRUPE', '2 SECUNDARE', 'PRIMAR > SEC > STAB');
      break;

    case 'level-1':
      currentMode = 'strength';
      currentView = 'front';
      currentStrengthScores = { chest: 12, upper_chest: 12, front_delts: 12, quads: 12, biceps: 12 };
      updateSummaryUI('FOUNDATION (NIVEL 1)', 'SLATE CYAN', '12 / 100', '3 / 6', '+8%');
      break;

    case 'level-2':
      currentMode = 'strength';
      currentView = 'front';
      currentStrengthScores = { chest: 28, upper_chest: 28, front_delts: 28, quads: 28, biceps: 28 };
      updateSummaryUI('FORGE (NIVEL 2)', 'ELECTRIC CYAN', '28 / 100', '4 / 6', '+22%');
      break;

    case 'level-3':
      currentMode = 'strength';
      currentView = 'front';
      currentStrengthScores = { chest: 52, upper_chest: 52, front_delts: 52, quads: 52, biceps: 52 };
      updateSummaryUI('DRIVE (NIVEL 3)', 'CHARTREUSE', '52 / 100', '5 / 6', '+34%');
      break;

    case 'level-4':
      currentMode = 'strength';
      currentView = 'front';
      currentStrengthScores = { chest: 72, upper_chest: 72, front_delts: 72, quads: 72, biceps: 72 };
      updateSummaryUI('SURGE (NIVEL 4)', 'STRONG LIME', '72 / 100', '6 / 6', '+48%');
      break;

    case 'level-5':
      currentMode = 'strength';
      currentView = 'front';
      currentStrengthScores = { chest: 92, upper_chest: 92, front_delts: 92, quads: 92, biceps: 92 };
      updateSummaryUI('APEX (NIVEL 5)', 'VIVID APEX LIME', '92 / 100', '6 / 6', '+65%');
      break;

    case 'full-workout-front':
      currentMode = 'full-workout';
      currentView = 'front';
      currentExerciseData = {
        primary: ['chest', 'quads'],
        secondary: ['front_delts', 'side_delts', 'triceps', 'adductors'],
        stabilizers: ['abs', 'obliques', 'calves'],
      };
      updateSummaryUI('FULL BODY (FRONT)', 'IERARHIE OPTIMĂ', '2 PRIMARI', '4 SECUNDARI', '3 STABILIZATORI');
      break;

    case 'full-workout-back':
      currentMode = 'full-workout';
      currentView = 'back';
      currentExerciseData = {
        primary: ['lats', 'glutes', 'hamstrings'],
        secondary: ['traps', 'rear_delts', 'triceps', 'calves'],
        stabilizers: ['lower_back', 'forearms'],
      };
      updateSummaryUI('FULL BODY (BACK)', 'IERARHIE OPTIMĂ', '3 PRIMARI', '4 SECUNDARI', '2 STABILIZATORI');
      break;

    case 'detail-selected':
      currentMode = 'strength';
      currentView = 'front';
      currentStrengthScores = { chest: 52, upper_chest: 52, front_delts: 52, quads: 52 };
      selectedMuscleId = 'chest';
      updateSummaryUI('DETALIU SELECTAT', 'CONTUR ALB 1.8PX', '52 / 100', '4 / 6', '+34%');
      showDetailSheet('chest');
      break;
  }

  document.getElementById('btn-view-front').classList.toggle('active', currentView === 'front');
  document.getElementById('btn-view-back').classList.toggle('active', currentView === 'back');
  renderAnatomy();
}

function updateSummaryUI(rank, level, score, regions, momentum) {
  document.getElementById('rank-name').innerText = rank;
  document.getElementById('rank-level-pill').innerText = level;
  document.getElementById('overall-score').innerText = score;
  document.getElementById('represented-regions').innerText = regions;
  document.getElementById('momentum-score').innerText = momentum;
}

function resetToNeutral() {
  setQaScenario('neutral-front');
}

// Initial Render
setQaScenario('neutral-front');
</script>
</body>
</html>
`;

const outputPath = resolve(root, 'artifacts/workout_v2_preview/index.html');
writeFileSync(outputPath, htmlContent, 'utf8');
console.log('Successfully generated artifacts/workout_v2_preview/index.html with real audited anatomy source fragments and visual polish engine.');
