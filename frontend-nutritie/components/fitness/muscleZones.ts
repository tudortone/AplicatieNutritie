/**
 * muscleZones.ts — Partiție completă a siluetei pe zone anatomice.
 *
 * Spre deosebire de `muscleRegions.ts` (care este DESENUL simplificat de rezervă),
 * fișierul acesta NU se desenează niciodată. Este folosit exclusiv de
 * `scripts/buildAnatomy.mjs` pentru etapa geometrică: fiecare suprafață din
 * SVG-ul anatomic care nu are un id recunoscut primește mușchiul zonei în care
 * cade centrul ei.
 *
 * Reguli:
 *  - zonele acoperă TOATĂ figura, ca să nu mai rămână suprafețe neutre din greșeală;
 *  - zona `__neutral__` (cap, gât, palme, tălpi) marchează explicit ce NU se colorează;
 *  - ordinea contează: zonele mai specifice trebuie scrise înaintea celor mari,
 *    pentru că se oprește la prima potrivire;
 *  - coordonatele sunt în același spațiu ca `BODY_VIEWBOX` din `muscleRegions.ts`
 *    ('0 0 280 410'); calibrarea către SVG-ul real se face automat în generator.
 */

import type { MuscleId } from './heatColor';
import type { BodySide } from './muscleRegions';

export type ZoneId = MuscleId | '__neutral__';

export interface MuscleZone {
  id: ZoneId;
  side: BodySide;
  d: string[];
}

export const MUSCLE_ZONES: MuscleZone[] = [
  /* ═══════════ FAȚĂ ═══════════ */
  {
    id: '__neutral__',
    side: 'front',
    d: [
      'M108,4 L172,4 L172,54 L108,54 Z',
      'M118,54 L162,54 L162,70 L118,70 Z',
      'M26,264 L86,264 L86,306 L26,306 Z',
      'M194,264 L254,264 L254,306 L194,306 Z',
      'M84,392 L196,392 L196,410 L84,410 Z',
    ],
  },
  {
    id: 'deltoid_lateral',
    side: 'front',
    d: [
      'M32,72 L60,72 L60,122 L32,122 Z',
      'M220,72 L248,72 L248,122 L220,122 Z',
    ],
  },
  {
    id: 'deltoid_anterior',
    side: 'front',
    d: [
      'M60,64 L94,64 L94,110 L60,110 Z',
      'M186,64 L220,64 L220,110 L186,110 Z',
    ],
  },
  {
    id: 'trapez',
    side: 'front',
    d: [
      'M100,54 L180,54 L180,76 L100,76 Z',
    ],
  },
  {
    id: 'pectorali',
    side: 'front',
    d: [
      'M88,76 L192,76 L192,128 L88,128 Z',
    ],
  },
  {
    id: 'biceps',
    side: 'front',
    d: [
      'M36,110 L88,110 L88,192 L36,192 Z',
      'M192,110 L244,110 L244,192 L192,192 Z',
    ],
  },
  {
    id: 'antebrate',
    side: 'front',
    d: [
      'M30,192 L88,192 L88,264 L30,264 Z',
      'M192,192 L250,192 L250,264 L192,264 Z',
    ],
  },
  {
    id: 'oblici',
    side: 'front',
    d: [
      'M84,128 L102,128 L102,216 L84,216 Z',
      'M178,128 L196,128 L196,216 L178,216 Z',
    ],
  },
  {
    id: 'abdomen',
    side: 'front',
    d: [
      'M102,128 L178,128 L178,216 L102,216 Z',
    ],
  },
  {
    id: 'abductori',
    side: 'front',
    d: [
      'M86,212 L108,212 L108,252 L86,252 Z',
      'M172,212 L194,212 L194,252 L172,252 Z',
    ],
  },
  {
    id: 'adductori',
    side: 'front',
    d: [
      'M126,216 L154,216 L154,302 L126,302 Z',
    ],
  },
  {
    id: 'cvadriceps',
    side: 'front',
    d: [
      'M90,214 L126,214 L126,338 L90,338 Z',
      'M154,214 L190,214 L190,338 L154,338 Z',
    ],
  },
  {
    id: 'gambe',
    side: 'front',
    d: [
      'M86,338 L134,338 L134,394 L86,394 Z',
      'M146,338 L194,338 L194,394 L146,394 Z',
    ],
  },

  /* ═══════════ SPATE ═══════════ */
  {
    id: '__neutral__',
    side: 'back',
    d: [
      'M108,4 L172,4 L172,56 L108,56 Z',
      'M120,56 L160,56 L160,68 L120,68 Z',
      'M26,264 L86,264 L86,306 L26,306 Z',
      'M194,264 L254,264 L254,306 L194,306 Z',
      'M84,394 L196,394 L196,410 L84,410 Z',
    ],
  },
  {
    id: 'deltoid_lateral',
    side: 'back',
    d: [
      'M32,72 L58,72 L58,120 L32,120 Z',
      'M222,72 L248,72 L248,120 L222,120 Z',
    ],
  },
  {
    id: 'deltoid_posterior',
    side: 'back',
    d: [
      'M58,64 L94,64 L94,112 L58,112 Z',
      'M186,64 L222,64 L222,112 L186,112 Z',
    ],
  },
  {
    id: 'romboizi',
    side: 'back',
    d: [
      'M116,96 L164,96 L164,132 L116,132 Z',
    ],
  },
  {
    id: 'trapez',
    side: 'back',
    d: [
      'M94,58 L186,58 L186,124 L94,124 Z',
    ],
  },
  {
    id: 'triceps',
    side: 'back',
    d: [
      'M36,112 L90,112 L90,192 L36,192 Z',
      'M190,112 L244,112 L244,192 L190,192 Z',
    ],
  },
  {
    id: 'antebrate',
    side: 'back',
    d: [
      'M30,192 L88,192 L88,264 L30,264 Z',
      'M192,192 L250,192 L250,264 L192,264 Z',
    ],
  },
  {
    id: 'oblici',
    side: 'back',
    d: [
      'M84,138 L100,138 L100,206 L84,206 Z',
      'M180,138 L196,138 L196,206 L180,206 Z',
    ],
  },
  {
    id: 'dorsali',
    side: 'back',
    d: [
      'M96,120 L184,120 L184,198 L96,198 Z',
    ],
  },
  {
    id: 'lombari',
    side: 'back',
    d: [
      'M106,198 L174,198 L174,230 L106,230 Z',
    ],
  },
  {
    id: 'abductori',
    side: 'back',
    d: [
      'M94,224 L112,224 L112,262 L94,262 Z',
      'M168,224 L186,224 L186,262 L168,262 Z',
    ],
  },
  {
    id: 'fesieri',
    side: 'back',
    d: [
      'M100,228 L180,228 L180,270 L100,270 Z',
    ],
  },
  {
    id: 'adductori',
    side: 'back',
    d: [
      'M130,256 L150,256 L150,318 L130,318 Z',
    ],
  },
  {
    id: 'ischiogambieri',
    side: 'back',
    d: [
      'M94,268 L134,268 L134,340 L94,340 Z',
      'M146,268 L186,268 L186,340 L146,340 Z',
    ],
  },
  {
    id: 'gambe',
    side: 'back',
    d: [
      'M86,340 L134,340 L134,396 L86,396 Z',
      'M146,340 L194,340 L194,396 L146,396 Z',
    ],
  },
];
