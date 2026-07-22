/**
 * muscleRegions.ts — Regiuni SVG geometrice per mușchi pe față ('front') și spate ('back')
 * Conform specificației NutriAI v6/v7 (Secțiunea 3.3)
 */

import type { MuscleId } from './heatColor';

export type BodySide = 'front' | 'back';

export interface MuscleRegion {
  id: MuscleId;
  side: BodySide;
  d: string[];
}

export const BODY_VIEWBOX = '0 0 280 410';

export const MUSCLE_REGIONS: MuscleRegion[] = [
  /* ─── FAȚĂ (FRONT / ANTERIOR) ─── */
  {
    id: 'pectorali',
    side: 'front',
    d: [
      'M92,76 C108,73 136,73 138,76 L138,126 C124,133 98,128 88,112 Z', // Stânga (din vedere)
      'M188,76 C172,73 144,73 142,76 L142,126 C156,133 182,128 192,112 Z', // Dreapta
    ],
  },
  {
    id: 'deltoid_anterior',
    side: 'front',
    d: [
      'M86,72 L62,78 C48,84 42,100 46,118 C50,130 62,136 72,122 L88,90 Z',
      'M194,72 L218,78 C232,84 238,100 234,118 C230,130 218,136 208,122 L192,90 Z',
    ],
  },
  {
    id: 'deltoid_lateral',
    side: 'front',
    d: [
      'M62,78 C52,86 46,104 50,118 L64,106 Z',
      'M218,78 C228,86 234,104 230,118 L216,106 Z',
    ],
  },
  {
    id: 'biceps',
    side: 'front',
    d: [
      'M52,120 C44,142 44,170 52,190 C57,200 69,200 76,186 C82,168 84,140 80,122 Z',
      'M228,120 C236,142 236,170 228,190 C223,200 211,200 204,186 C198,168 196,140 200,122 Z',
    ],
  },
  {
    id: 'antebrate',
    side: 'front',
    d: [
      'M52,192 C46,212 44,232 50,248 L68,248 C72,230 74,210 74,190 Z',
      'M228,192 C234,212 236,232 230,248 L212,248 C208,230 206,210 206,190 Z',
    ],
  },
  {
    id: 'abdomen',
    side: 'front',
    d: [
      'M98,130 C114,127 166,127 182,130 L172,214 C154,220 126,220 108,214 Z',
    ],
  },
  {
    id: 'oblici',
    side: 'front',
    d: [
      'M88,140 L98,130 L108,214 L94,210 Z',
      'M192,140 L182,130 L172,214 L186,210 Z',
    ],
  },
  {
    id: 'cvadriceps',
    side: 'front',
    d: [
      'M104,218 C94,250 90,294 96,336 L128,336 C132,294 134,250 132,218 Z',
      'M176,218 C186,250 190,294 184,336 L152,336 C148,294 146,250 148,218 Z',
    ],
  },
  {
    id: 'adductori',
    side: 'front',
    d: [
      'M132,224 L138,300 L128,300 Z',
      'M148,224 L142,300 L152,300 Z',
    ],
  },

  /* ─── SPATE (BACK / POSTERIOR) ─── */
  {
    id: 'trapez',
    side: 'back',
    d: [
      'M96,78 L184,78 L162,120 L118,120 Z',
    ],
  },
  {
    id: 'deltoid_posterior',
    side: 'back',
    d: [
      'M86,74 L60,82 C48,94 48,114 58,124 L76,108 Z',
      'M194,74 L220,82 C232,94 232,114 222,124 L204,108 Z',
    ],
  },
  {
    id: 'dorsali',
    side: 'back',
    d: [
      'M106,122 L138,122 L138,208 L122,208 Z', // Stânga
      'M142,122 L174,122 L158,208 L142,208 Z', // Dreapta
    ],
  },
  {
    id: 'romboizi',
    side: 'back',
    d: [
      'M118,100 L162,100 L154,126 L126,126 Z',
    ],
  },
  {
    id: 'triceps',
    side: 'back',
    d: [
      'M54,118 C46,140 46,168 54,190 L76,190 C80,168 80,140 76,118 Z',
      'M226,118 C234,140 234,168 226,190 L204,190 C200,168 200,140 204,118 Z',
    ],
  },
  {
    id: 'lombari',
    side: 'back',
    d: [
      'M122,195 L158,195 L152,225 L128,225 Z',
    ],
  },
  {
    id: 'fesieri',
    side: 'back',
    d: [
      'M112,210 L138,210 L136,258 L108,258 Z',
      'M168,210 L142,210 L144,258 L172,258 Z',
    ],
  },
  {
    id: 'ischiogambieri',
    side: 'back',
    d: [
      'M110,262 L136,262 L130,336 L104,336 Z',
      'M170,262 L144,262 L150,336 L176,336 Z',
    ],
  },
  {
    id: 'gambe',
    side: 'back',
    d: [
      'M106,338 L128,338 L124,396 L108,396 Z',
      'M174,338 L152,338 L156,396 L172,396 Z',
    ],
  },
];

