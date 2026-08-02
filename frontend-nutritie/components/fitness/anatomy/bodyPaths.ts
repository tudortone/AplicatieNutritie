/**
 * bodyPaths.ts — anatomia hartii musculare, desenata de mana.
 *
 * Inlocuieste `anatomyPaths.generated.ts` (575 KB, generat automat din SVG-uri
 * externe). Fisierul generat avea trei probleme majore:
 *   1. dimensiune — 575 KB parsati la fiecare pornire, cat 12 ecrane la un loc;
 *   2. atribuirea suprafetelor se facea prin "in ce regiune cade centrul geometric",
 *      deci suprafete intregi ajungeau la muschiul gresit;
 *   3. nu era editabil de mana — orice corectie cerea rularea unui script.
 *
 * PRINCIPIU DE PROIECTARE: SIMETRIE PRIN OGLINDIRE
 * Pentru muschii pereche se stocheaza DOAR jumatatea stanga. Renderer-ul deseneaza
 * a doua copie cu `transform="translate(280,0) scale(-1,1)"`.
 * Consecinte:
 *   - corpul este simetric perfect prin constructie, nu prin coordonate copiate manual;
 *   - datele se injumatatesc;
 *   - o corectie de forma se face intr-un singur loc.
 *
 * SISTEM DE COORDONATE: viewBox 280 x 420, axa de simetrie la x = 140.
 * Reper vertical: cap 12-56, umeri 72, talie 200, sold 215, genunchi 330, glezna 400.
 */

import type { BodyView, MuscleSlot } from '../../../constants/muscles';

export const BODY_VIEWBOX = '0 0 280 420';
export const BODY_WIDTH = 280;
export const BODY_HEIGHT = 420;

/** Axa de simetrie. Oglindirea se face cu translate(MIRROR_AXIS, 0) scale(-1, 1). */
export const MIRROR_AXIS = BODY_WIDTH;

export interface MuscleShape {
  /** Cheia unica muschi + vedere (vezi constants/muscles.ts). */
  slot: MuscleSlot;
  /** Path-uri SVG. Pentru muschii pereche contin doar jumatatea stanga. */
  d: string[];
  /** Daca `true`, renderer-ul deseneaza si copia oglindita. */
  mirrored: boolean;
  /**
   * Ordinea de desenare. Valorile mici se deseneaza primele (dedesubt).
   * Ex: dorsalii intra sub trapez, cvadricepsul sub adductori.
   */
  z: number;
}

/**
 * Silueta corpului — desenata sub muschi, ca sa existe contur si acolo unde
 * nu avem suprafete musculare (cap, maini, picioare, articulatii).
 * Si ea este stocata doar pe jumatate si oglindita.
 */
export const SILHOUETTE: Record<BodyView, string> = {
  front:
    'M140,10 C127,10 117,20 117,33 C117,43 122,51 130,55 L130,64 ' +
    'L106,72 C90,78 79,91 75,108 L63,168 C59,188 56,208 54,228 ' +
    'C53,238 60,244 68,241 C74,220 79,199 84,178 L91,148 ' +
    'L91,196 C91,214 94,231 99,247 L103,300 ' +
    'C105,332 107,364 109,392 C109,400 106,404 106,409 L131,409 ' +
    'L133,330 L136,262 L140,262 Z',
  back:
    'M140,10 C127,10 117,20 117,33 C117,43 122,51 130,55 L130,64 ' +
    'L106,72 C90,78 79,91 75,108 L63,168 C59,188 56,208 54,228 ' +
    'C53,238 60,244 68,241 C74,220 79,199 84,178 L91,148 ' +
    'L91,198 C91,216 94,232 99,248 L103,300 ' +
    'C105,332 107,364 109,392 C109,400 106,404 106,409 L131,409 ' +
    'L133,330 L136,262 L140,262 Z',
};

/* ══════════════════════════════════════════════════════════════════
   VEDERE DIN FATA
   ══════════════════════════════════════════════════════════════════ */

const FRONT: MuscleShape[] = [
  {
    // Trapezul superior: suprafata unica peste linia mediana, de la gat spre umeri.
    slot: 'trapez:front',
    mirrored: false,
    z: 1,
    d: ['M112,63 C124,57 156,57 168,63 L178,80 C160,73 120,73 102,80 Z'],
  },
  {
    slot: 'deltoid_anterior:front',
    mirrored: true,
    z: 2,
    d: [
      'M105,75 C89,80 77,94 75,112 C74,124 81,132 89,127 ' +
      'C96,114 101,95 109,83 Z',
    ],
  },
  {
    // Capul lateral se vede si din fata, in exteriorul umarului.
    slot: 'deltoid_lateral:front',
    mirrored: true,
    z: 3,
    d: ['M77,95 C69,105 67,121 71,133 C76,139 83,137 86,130 C82,119 79,106 81,95 Z'],
  },
  {
    slot: 'pectorali:front',
    mirrored: true,
    z: 4,
    d: [
      'M137,80 L112,79 C101,85 93,98 91,113 ' +
      'C99,127 119,133 137,125 Z',
    ],
  },
  {
    slot: 'biceps:front',
    mirrored: true,
    z: 3,
    d: ['M73,133 C65,151 63,173 67,189 C73,197 83,195 85,185 C87,165 87,147 85,133 Z'],
  },
  {
    slot: 'antebrate:front',
    mirrored: true,
    z: 3,
    d: ['M67,193 C61,213 59,233 63,249 C69,255 79,253 81,245 C83,227 85,209 85,191 Z'],
  },
  {
    // Abdomenul este o suprafata unica pe linia mediana (nu se oglindeste).
    slot: 'abdomen:front',
    mirrored: false,
    z: 4,
    d: ['M121,129 L159,129 L157,197 C149,207 131,207 123,197 Z'],
  },
  {
    slot: 'oblici:front',
    mirrored: true,
    z: 3,
    d: ['M119,131 L105,139 C104,158 105,177 108,192 L121,198 Z'],
  },
  {
    slot: 'abductori:front',
    mirrored: true,
    z: 3,
    d: ['M101,211 L113,214 L109,247 C102,246 98,238 98,229 Z'],
  },
  {
    slot: 'cvadriceps:front',
    mirrored: true,
    z: 4,
    d: [
      'M105,216 C97,247 93,287 97,327 ' +
      'C105,335 121,333 125,323 C129,287 131,248 129,218 Z',
    ],
  },
  {
    slot: 'adductori:front',
    mirrored: true,
    z: 5,
    d: ['M131,219 L139,219 L137,287 C131,291 127,287 127,281 Z'],
  },
  {
    // Tibialul anterior — partea din fata a gambei.
    slot: 'gambe:front',
    mirrored: true,
    z: 4,
    d: ['M101,337 C95,357 93,383 97,399 L119,399 C121,379 123,357 121,337 Z'],
  },
];

/* ══════════════════════════════════════════════════════════════════
   VEDERE DIN SPATE
   ══════════════════════════════════════════════════════════════════ */

const BACK: MuscleShape[] = [
  {
    // Trapezul complet (superior + mijlociu), suprafata unica in diamant.
    slot: 'trapez:back',
    mirrored: false,
    z: 3,
    d: ['M112,61 C124,55 156,55 168,61 L178,98 L140,122 L102,98 Z'],
  },
  {
    slot: 'romboizi:back',
    mirrored: false,
    z: 2,
    d: ['M119,95 L161,95 L155,125 L125,125 Z'],
  },
  {
    slot: 'deltoid_posterior:back',
    mirrored: true,
    z: 4,
    d: ['M105,77 C89,83 77,97 75,115 C75,127 82,134 90,128 C97,113 101,94 109,83 Z'],
  },
  {
    slot: 'deltoid_lateral:back',
    mirrored: true,
    z: 5,
    d: ['M75,99 C69,111 69,127 73,137 C79,141 85,137 87,129 C83,119 81,109 81,99 Z'],
  },
  {
    // Dorsalii: se desfasoara in evantai de la axila spre talie.
    slot: 'dorsali:back',
    mirrored: true,
    z: 2,
    d: [
      'M104,101 C96,121 96,151 105,177 ' +
      'L137,193 L137,111 Z',
    ],
  },
  {
    slot: 'triceps:back',
    mirrored: true,
    z: 3,
    d: ['M71,131 C63,151 61,175 67,191 C75,197 85,193 87,183 C87,163 85,145 83,131 Z'],
  },
  {
    slot: 'antebrate:back',
    mirrored: true,
    z: 3,
    d: ['M65,195 C59,215 57,235 61,249 C69,255 79,251 81,243 C83,225 85,209 83,193 Z'],
  },
  {
    slot: 'lombari:back',
    mirrored: false,
    z: 3,
    d: ['M123,181 L157,181 L153,215 L127,215 Z'],
  },
  {
    slot: 'abductori:back',
    mirrored: true,
    z: 3,
    d: ['M101,209 L111,212 L107,241 C101,239 98,229 98,220 Z'],
  },
  {
    slot: 'fesieri:back',
    mirrored: true,
    z: 4,
    d: [
      'M109,212 C100,225 98,245 105,259 ' +
      'C115,267 133,263 137,251 L137,215 Z',
    ],
  },
  {
    slot: 'ischiogambieri:back',
    mirrored: true,
    z: 4,
    d: [
      'M105,263 C99,293 97,315 101,333 ' +
      'C111,339 125,337 129,327 C133,301 135,279 135,263 Z',
    ],
  },
  {
    // Gastrocnemianul — cele doua capete ale gambei posterioare.
    slot: 'gambe:back',
    mirrored: true,
    z: 4,
    d: ['M101,339 C95,359 93,385 99,401 L121,401 C123,379 125,357 123,339 Z'],
  },
];

/** Toate formele, grupate pe vedere si sortate dupa ordinea de desenare. */
export const BODY_SHAPES: Record<BodyView, MuscleShape[]> = {
  front: [...FRONT].sort((a, b) => a.z - b.z),
  back: [...BACK].sort((a, b) => a.z - b.z),
};

/** Formele dintr-o vedere. */
export function shapesForView(view: BodyView): MuscleShape[] {
  return BODY_SHAPES[view];
}

/**
 * Verificare de integritate, rulata doar in development:
 * fiecare slot declarat in `constants/muscles.ts` trebuie sa aiba geometrie,
 * si invers. Prinde din prima o eroare de tastare intr-un slot.
 */
export function slotsFaraGeometrie(slots: MuscleSlot[]): MuscleSlot[] {
  const desenate = new Set<MuscleSlot>([
    ...BODY_SHAPES.front.map((s) => s.slot),
    ...BODY_SHAPES.back.map((s) => s.slot),
  ]);
  return slots.filter((s) => !desenate.has(s));
}
