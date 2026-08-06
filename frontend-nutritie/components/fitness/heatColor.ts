/**
 * heatColor.ts — Hartă termică musculară NutriAI
 * Interpolare liniară RGB pe stops: 0.00→COLOR_REST, 0.40→COLOR_STAB, 0.75→COLOR_SECONDARY, 1.00→COLOR_PRIMARY
 */

export type MuscleId =
  | 'abs'
  | 'adductors'
  | 'biceps'
  | 'calves'
  | 'chest'
  | 'delts'
  | 'forearms'
  | 'glutes'
  | 'hamstrings'
  | 'hip_flexors'
  | 'infraspinatus'
  | 'lats'
  | 'lower_back'
  | 'neck'
  | 'obliques'
  | 'quads'
  | 'serratus'
  | 'traps'
  | 'triceps';

export const ALL_MUSCLE_IDS: MuscleId[] = [
  'chest', 'delts', 'traps', 'lats', 'infraspinatus', 'lower_back', 'neck',
  'biceps', 'triceps', 'forearms', 'abs', 'obliques', 'serratus',
  'glutes', 'quads', 'hamstrings', 'calves', 'adductors', 'hip_flexors',
];

/**
 * Determină dacă un fill original din SVG este contur (outline).
 * Contururile sunt păstrate mereu vizibile, indiferent de intensitate.
 */
export function isOutline(fill?: string): boolean {
  if (!fill || fill === 'none') return false;
  const h = fill.replace('#', '');
  if (h.length !== 6) return false;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  // Luminanța relativă < 0.18 = contur/umbră (negru, maro închis, roșu foarte închis)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.18;
}

/**
 * Culoare pentru mușchi NEANTRENAT (intensitate 0 / lipsă de date).
 * Un corp neantrenat primeste o culoare neutra, nu albastru "odihnit".
 */
export const COLOR_INACTIVE = '#2A323D';

/** Culoare de repaus — activitate prezentă, dar foarte mică */
export const COLOR_REST = '#38BDF8';
export const COLOR_STAB = '#FACC15';
export const COLOR_SECONDARY = '#FF7B00';
export const COLOR_PRIMARY = '#FF0033';

/** Stops: t, culoare hex, RGB tuple */
const STOPS: { t: number; hex: string; rgb: [number, number, number] }[] = [
  { t: 0.00, hex: COLOR_REST,      rgb: [56, 189, 248] },  // Albastru
  { t: 0.40, hex: COLOR_STAB,      rgb: [250, 204, 21] },   // Galben
  { t: 0.75, hex: COLOR_SECONDARY, rgb: [255, 123, 0] },    // Portocaliu
  { t: 1.00, hex: COLOR_PRIMARY,   rgb: [255, 0, 51] },     // Roșu
];

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Returnează culoarea interpolată rgb(r,g,b) pentru intensitate 0..1.
 * REGULĂ CRITICĂ: intensity undefined / null / NaN / <= 0 => COLOR_INACTIVE (gri neutru).
 * Activitate reală, dar minimă (0 < x <= 0.01) => COLOR_REST.
 */
export function heatColor(intensity?: number | null): string {
  if (intensity == null || isNaN(intensity) || intensity <= 0.001) {
    return COLOR_INACTIVE;
  }
  const x = Math.max(0, Math.min(1, intensity));
  if (x <= 0.01) return COLOR_REST;

  for (let i = 1; i < STOPS.length; i++) {
    if (x <= STOPS[i].t) {
      const a = STOPS[i - 1];
      const b = STOPS[i];
      const k = (x - a.t) / (b.t - a.t || 1);
      const r = Math.round(lerp(a.rgb[0], b.rgb[0], k));
      const g = Math.round(lerp(a.rgb[1], b.rgb[1], k));
      const bl = Math.round(lerp(a.rgb[2], b.rgb[2], k));
      return `rgb(${r},${g},${bl})`;
    }
  }
  return COLOR_PRIMARY;
}

/**
 * Opacitate: 0.35 pentru mușchi neantrenați, 0.55 la repaus → 1.0 la 100%,
 * pentru ca mușchii inactivi să se estompeze.
 */
export function heatOpacity(intensity?: number | null): number {
  if (intensity == null || isNaN(intensity) || intensity <= 0.001) return 0.35;
  const x = Math.max(0, Math.min(1, intensity));
  return 0.55 + 0.45 * x;
}

// ─── Legacy exports (păstrate pentru compatibilitate) ─────────────────────

export const HEAT_COLORS = {
  inactive: COLOR_INACTIVE,
  light: COLOR_REST,
  medium: COLOR_STAB,
  intense: COLOR_SECONDARY,
  max: COLOR_PRIMARY,
};

/** @deprecated Folosește heatColor() */
export function heatStepColor(rawT: number): string {
  const x = Math.max(0, Math.min(1, Number(rawT) || 0));
  if (x <= 0.05) return HEAT_COLORS.inactive;
  if (x < 0.38) return HEAT_COLORS.light;
  if (x < 0.63) return HEAT_COLORS.medium;
  if (x <= 0.8) return HEAT_COLORS.intense;
  return HEAT_COLORS.max;
}

/** @deprecated */
export function heatLabel(rawT: number): string {
  const x = Math.max(0, Math.min(1, Number(rawT) || 0));
  if (x <= 0.05) return 'Inactiv';
  if (x < 0.38) return 'Ușor';
  if (x < 0.63) return 'Mediu';
  if (x <= 0.8) return 'Intens';
  return 'Magmă (Maxim)';
}

/** @deprecated Folosește heatOpacity() */
export function heatFillOpacity(t: number): number {
  return heatOpacity(t);
}

export const STOPS_v7 = [
  { t: 0.00, c: 0x505050 },
  { t: 0.25, c: 0x00BFFF },
  { t: 0.50, c: 0xFFD700 },
  { t: 0.75, c: 0xFF8C00 },
  { t: 1.00, c: 0xFF0000 },
];
