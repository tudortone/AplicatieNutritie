/**
 * F-08 — paritatea matematicii nutritionale intre frontend si backend.
 *
 * Acelasi fisier de vectori este asertat si de
 * backend-nutritie-ai/tests/f08_paritate_nutritie.test.js. Daca cele doua
 * implementari (lib/onboarding.ts si utils/calculNutritional.js) diverg din nou,
 * unul dintre cele doua teste pica imediat.
 *
 * Divergenta initiala: endpointul POST /calculeaza-profil folosea deficit fix
 * (-500/+350), proteine in g/kg si grasimi 25% — deci acelasi utilizator primea
 * tinte diferite dupa cum trecea prin chestionar sau prin „Asistent Profil".
 */

// `lib/onboarding.ts` importa AsyncStorage la nivel de modul (pentru staging-ul
// raspunsurilor); testul de fata verifica doar matematica pura, deci il mockuim.
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
  multiSet: jest.fn(async () => undefined),
}));

import vectori from '../../backend-nutritie-ai/contracts/nutritie/vectori-nutritie.json';
import {
  calculeazaPlan,
  calculeazaBMR,
  calculeazaVarsta,
  type DateOnboarding,
  type Gen,
  type Scop,
  type Activitate,
  type TipDieta,
} from '../lib/onboarding';

type Vector = {
  nume: string;
  intrare: {
    gen: Gen;
    varsta: number;
    greutateKg: number;
    inaltimeCm: number;
    activitate: Activitate;
    scop: Scop;
    dieta?: TipDieta;
  };
  asteptat: {
    bmr: number;
    tdee: number;
    calorii: number;
    proteineG: number;
    carbohidratiG: number;
    grasimiG: number;
    limitatLaMinim: boolean;
  };
};

/** Data de referinta fixa: testele nu trebuie sa depinda de ziua rularii. */
const ACUM = new Date('2026-06-15T12:00:00Z');

/** Construieste o data de nastere care da exact varsta ceruta la `ACUM`. */
function dataNasteriiPentruVarsta(varsta: number): string {
  const an = ACUM.getFullYear() - varsta;
  // Ziua/luna anterioare celei curente => aniversarea a trecut deja in acest an.
  return `${an}-01-01`;
}

describe('F-08 — vectori canonici, identici cu backendul', () => {
  it.each((vectori as Vector[]).map((v) => [v.nume, v] as const))('%s', (_nume, vector) => {
    const date: DateOnboarding = {
      gen: vector.intrare.gen,
      dataNasterii: dataNasteriiPentruVarsta(vector.intrare.varsta),
      inaltimeCm: vector.intrare.inaltimeCm,
      greutateKg: vector.intrare.greutateKg,
      scop: vector.intrare.scop,
      greutateTintaKg: null,
      activitate: vector.intrare.activitate,
      ritmKgSaptamana: null, // => implicit 0.5, ca pe backend
      dieta: vector.intrare.dieta ?? 'echilibrata',
    };

    const plan = calculeazaPlan(date, ACUM);
    expect(plan).not.toBeNull();

    // Varsta derivata din data de nastere trebuie sa fie cea din vector.
    expect(plan!.varsta).toBe(vector.intrare.varsta);

    expect(plan!.bmr).toBe(vector.asteptat.bmr);
    expect(plan!.tdee).toBe(vector.asteptat.tdee);
    expect(plan!.calorii).toBe(vector.asteptat.calorii);
    expect(plan!.proteineG).toBe(vector.asteptat.proteineG);
    expect(plan!.carbohidratiG).toBe(vector.asteptat.carbohidratiG);
    expect(plan!.grasimiG).toBe(vector.asteptat.grasimiG);
    expect(plan!.limitatLaMinim).toBe(vector.asteptat.limitatLaMinim);
  });
});

describe('F-08 — Mifflin-St Jeor pe frontend', () => {
  it('barbat: 10*kg + 6.25*cm - 5*ani + 5', () => {
    expect(calculeazaBMR({ gen: 'masculin', greutateKg: 80, inaltimeCm: 180, varsta: 30 })).toBe(1780);
  });

  it('femeie: 10*kg + 6.25*cm - 5*ani - 161', () => {
    expect(calculeazaBMR({ gen: 'feminin', greutateKg: 60, inaltimeCm: 165, varsta: 25 })).toBe(1345.25);
  });
});

describe('F-08 — varsta la granite de calendar', () => {
  it('cu o zi inainte de aniversare inca nu s-a implinit anul', () => {
    const acum = new Date('2026-06-15T12:00:00Z');
    expect(calculeazaVarsta('1996-06-16', acum)).toBe(29);
    expect(calculeazaVarsta('1996-06-15', acum)).toBe(30);
    expect(calculeazaVarsta('1996-06-14', acum)).toBe(30);
  });

  it('trecerea de an nu sare o varsta', () => {
    expect(calculeazaVarsta('2000-12-31', new Date('2025-12-30T12:00:00Z'))).toBe(24);
    expect(calculeazaVarsta('2000-12-31', new Date('2025-12-31T12:00:00Z'))).toBe(25);
    expect(calculeazaVarsta('2000-01-01', new Date('2026-01-01T12:00:00Z'))).toBe(26);
  });
});

describe('F-08 — plan incomplet nu produce numere inventate', () => {
  const complet: DateOnboarding = {
    gen: 'masculin',
    dataNasterii: '1996-01-01',
    inaltimeCm: 180,
    greutateKg: 80,
    scop: 'mentinere',
    greutateTintaKg: 80,
    activitate: 'moderat',
    ritmKgSaptamana: 0.5,
    dieta: 'echilibrata',
  };

  it.each([
    ['gen', 'gen'],
    ['dataNasterii', 'dataNasterii'],
    ['inaltimeCm', 'inaltimeCm'],
    ['greutateKg', 'greutateKg'],
    ['scop', 'scop'],
    ['activitate', 'activitate'],
    ['dieta', 'dieta'],
  ])('fara %s => null', (_eticheta, cheie) => {
    const partial = { ...complet, [cheie as keyof DateOnboarding]: null } as DateOnboarding;
    expect(calculeazaPlan(partial, ACUM)).toBeNull();
  });

  it.each([
    ['data calendaristica invalida', { dataNasterii: 'nu-este-data' }],
    ['greutate NaN', { greutateKg: Number.NaN }],
    ['inaltime infinita', { inaltimeCm: Number.POSITIVE_INFINITY }],
    ['varsta sub limita produsului', { dataNasterii: '2020-01-01' }],
    ['ritm negativ', { ritmKgSaptamana: -0.5 }],
    ['ritm enorm', { ritmKgSaptamana: 99 }],
  ])('%s => null', (_eticheta, modificare) => {
    expect(calculeazaPlan({ ...complet, ...modificare }, ACUM)).toBeNull();
  });
});
