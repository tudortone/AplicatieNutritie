/**
 * heatColor.ts — Scală continuă și în trepte 0..1 și opacitate pentru Heatmap pe Mușchi
 * Conform specificației NutriAI Magma Pulse (Legendă: Gri = 0 / Inactiv, Albastru = 0.25, Galben = 0.5, Portocaliu = 0.75, Roșu / Magmă = 1.0)
 */

export type MuscleId =
  | 'pectorali'
  | 'deltoid_anterior'
  | 'deltoid_lateral'
  | 'deltoid_posterior'
  | 'biceps'
  | 'triceps'
  | 'antebrate'
  | 'abdomen'
  | 'oblici'
  | 'trapez'
  | 'dorsali'
  | 'lombari'
  | 'romboizi'
  | 'fesieri'
  | 'cvadriceps'
  | 'ischiogambieri'
  | 'gambe'
  | 'adductori';

export const HEAT_COLORS = {
  inactive: '#505050',
  light: '#00BFFF',
  medium: '#FFD700',
  intense: '#FF8C00',
  max: '#FF0000',
};

const HEAT_STOPS: { t: number; c: [number, number, number]; hex: string; label: string }[] = [
  { t: 0.00, c: [80, 80, 80],   hex: '#505050', label: 'Inactiv' }, // Gri
  { t: 0.25, c: [0, 191, 255],  hex: '#00BFFF', label: 'Ușor' },    // Albastru
  { t: 0.50, c: [255, 215, 0],  hex: '#FFD700', label: 'Mediu' },   // Galben
  { t: 0.75, c: [255, 140, 0],  hex: '#FF8C00', label: 'Intens' },  // Portocaliu
  { t: 1.00, c: [255, 0, 0],    hex: '#FF0000', label: 'Magmă' },   // Roșu
];

export const STOPS_v7 = [
  { t: 0.00, c: 0x505050 },
  { t: 0.25, c: 0x00BFFF },
  { t: 0.50, c: 0xFFD700 },
  { t: 0.75, c: 0xFF8C00 },
  { t: 1.00, c: 0xFF0000 },
];

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Returnează culoarea interpolată rgb(r,g,b) pentru o intensitate de la 0 la 1 */
export function heatColor(rawT: number): string {
  const x = Math.max(0, Math.min(1, Number(rawT) || 0));
  if (x <= 0.01) return HEAT_COLORS.inactive;

  for (let i = 1; i < HEAT_STOPS.length; i++) {
    if (x <= HEAT_STOPS[i].t) {
      const a = HEAT_STOPS[i - 1];
      const b = HEAT_STOPS[i];
      const k = (x - a.t) / (b.t - a.t || 1);
      const r = Math.round(lerp(a.c[0], b.c[0], k));
      const g = Math.round(lerp(a.c[1], b.c[1], k));
      const bl = Math.round(lerp(a.c[2], b.c[2], k));
      return `rgb(${r},${g},${bl})`;
    }
  }
  return HEAT_COLORS.max;
}

/** Returnează culoarea hex din legendă în trepte (Gri, Albastru, Galben, Portocaliu, Roșu) */
export function heatStepColor(rawT: number): string {
  const x = Math.max(0, Math.min(1, Number(rawT) || 0));
  if (x <= 0.05) return HEAT_COLORS.inactive;
  if (x < 0.38) return HEAT_COLORS.light;
  if (x < 0.63) return HEAT_COLORS.medium;
  if (x <= 0.8) return HEAT_COLORS.intense;
  return HEAT_COLORS.max;
}

export function heatLabel(rawT: number): string {
  const x = Math.max(0, Math.min(1, Number(rawT) || 0));
  if (x <= 0.05) return 'Inactiv';
  if (x < 0.38) return 'Ușor';
  if (x < 0.63) return 'Mediu';
  if (x <= 0.8) return 'Intens';
  return 'Magmă (Maxim)';
}

export function heatFillOpacity(t: number): number {
  const x = Math.max(0, Math.min(1, Number(t) || 0));
  if (x <= 0.01) return 0.25;
  return 0.40 + 0.60 * x; // 0.40 .. 1.0
}

