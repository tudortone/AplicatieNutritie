'use strict';

/**
 * F-08 — paritatea matematicii nutritionale intre frontend si backend.
 *
 * Vectorii din contracts/nutritie/vectori-nutritie.json sunt sursa comuna:
 * ii asertam si aici, si in frontend-nutritie/__tests__/paritateNutritie.test.ts.
 * Daca cele doua implementari diverg din nou, unul dintre cele doua teste pica.
 */

const vectori = require('../contracts/nutritie/vectori-nutritie.json');
const {
  calculeazaPlanNutritional,
  calculeazaBMR,
  MAPARE_SEX,
  MAPARE_ACTIVITATE,
  MAPARE_OBIECTIV,
} = require('../utils/calculNutritional');

describe('F-08 — vectori canonici de calcul nutritional', () => {
  it.each(vectori.map((v) => [v.nume, v]))('%s', (_nume, vector) => {
    expect(calculeazaPlanNutritional(vector.intrare)).toEqual(vector.asteptat);
  });

  it('acopera ambele sexe, toate scopurile si pragul de siguranta', () => {
    const genuri = new Set(vectori.map((v) => v.intrare.gen));
    const scopuri = new Set(vectori.map((v) => v.intrare.scop));
    expect(genuri).toEqual(new Set(['masculin', 'feminin']));
    expect(scopuri).toEqual(new Set(['slabire', 'masa', 'mentinere']));
    expect(vectori.some((v) => v.asteptat.limitatLaMinim)).toBe(true);
  });
});

describe('F-08 — Mifflin-St Jeor, constante verificate independent', () => {
  it('barbat: 10*kg + 6.25*cm - 5*ani + 5', () => {
    // 10*80 + 6.25*180 - 5*30 + 5 = 800 + 1125 - 150 + 5 = 1780
    expect(calculeazaBMR({ gen: 'masculin', greutateKg: 80, inaltimeCm: 180, varsta: 30 })).toBe(1780);
  });

  it('femeie: 10*kg + 6.25*cm - 5*ani - 161', () => {
    // 10*60 + 6.25*165 - 5*25 - 161 = 600 + 1031.25 - 125 - 161 = 1345.25
    expect(calculeazaBMR({ gen: 'feminin', greutateKg: 60, inaltimeCm: 165, varsta: 25 })).toBe(1345.25);
  });

  it('diferenta barbat-femeie este exact 166 kcal la aceleasi masuratori', () => {
    const comun = { greutateKg: 70, inaltimeCm: 175, varsta: 30 };
    const m = calculeazaBMR({ gen: 'masculin', ...comun });
    const f = calculeazaBMR({ gen: 'feminin', ...comun });
    expect(m - f).toBe(166); // +5 vs -161
  });
});

describe('F-08 — proprietati ale planului', () => {
  const baza = {
    gen: 'masculin',
    varsta: 30,
    greutateKg: 80,
    inaltimeCm: 180,
    activitate: 'moderat',
    scop: 'mentinere',
  };

  it('macro-urile insumeaza (aproximativ) caloriile tinta', () => {
    const p = calculeazaPlanNutritional(baza);
    const dinMacro = p.proteineG * 4 + p.carbohidratiG * 4 + p.grasimiG * 9;
    // Diferenta provine exclusiv din rotunjirea la gram intreg.
    expect(Math.abs(dinMacro - p.calorii)).toBeLessThanOrEqual(10);
  });

  it('mentinere => calorii == TDEE', () => {
    const p = calculeazaPlanNutritional(baza);
    expect(p.calorii).toBe(p.tdee);
  });

  it('slabire scade, masa creste fata de mentinere', () => {
    const m = calculeazaPlanNutritional(baza).calorii;
    const s = calculeazaPlanNutritional({ ...baza, scop: 'slabire' }).calorii;
    const g = calculeazaPlanNutritional({ ...baza, scop: 'masa' }).calorii;
    expect(s).toBeLessThan(m);
    expect(g).toBeGreaterThan(m);
    // 0.5 kg/saptamana => 7700*0.5/7 = 550 kcal/zi
    expect(m - s).toBe(550);
    expect(g - m).toBe(550);
  });

  it('activitatea mai mare => calorii mai multe, monoton', () => {
    const niveluri = ['sedentar', 'usor', 'moderat', 'intens', 'foarte_intens'];
    const valori = niveluri.map((a) => calculeazaPlanNutritional({ ...baza, activitate: a }).calorii);
    for (let i = 1; i < valori.length; i += 1) {
      expect(valori[i]).toBeGreaterThan(valori[i - 1]);
    }
  });

  it('niciodata sub pragul de siguranta pe gen', () => {
    const f = calculeazaPlanNutritional({
      ...baza, gen: 'feminin', greutateKg: 35, inaltimeCm: 140, varsta: 90,
      activitate: 'sedentar', scop: 'slabire',
    });
    expect(f.calorii).toBeGreaterThanOrEqual(1200);
    expect(f.limitatLaMinim).toBe(true);
  });

  it('intrari invalide intorc null, nu NaN', () => {
    expect(calculeazaPlanNutritional({ ...baza, activitate: 'inexistent' })).toBeNull();
    expect(calculeazaPlanNutritional({ ...baza, gen: 'altceva' })).toBeNull();
    expect(calculeazaPlanNutritional({ ...baza, dieta: 'inexistenta' })).toBeNull();
    expect(calculeazaPlanNutritional({ ...baza, greutateKg: NaN })).toBeNull();
    expect(calculeazaPlanNutritional({ ...baza, varsta: Infinity })).toBeNull();
    expect(calculeazaPlanNutritional({ ...baza, greutateKg: -1 })).toBeNull();
    expect(calculeazaPlanNutritional({ ...baza, inaltimeCm: 9999 })).toBeNull();
    expect(calculeazaPlanNutritional({ ...baza, ritmKgSaptamana: -0.5 })).toBeNull();
    expect(calculeazaPlanNutritional({ ...baza, ritmKgSaptamana: 99 })).toBeNull();
  });

  it('niciun camp nu este NaN pentru valori extreme admise', () => {
    const p = calculeazaPlanNutritional({
      gen: 'masculin', varsta: 100, greutateKg: 250, inaltimeCm: 230,
      activitate: 'foarte_intens', scop: 'masa',
    });
    for (const [cheie, val] of Object.entries(p)) {
      if (typeof val === 'number') expect(Number.isFinite(val)).toBe(true);
      expect(val).not.toBeNaN();
      expect(cheie).toBeTruthy();
    }
  });
});

describe('F-08 — maparea etichetelor endpointului catre vocabularul canonic', () => {
  it('acopera exact valorile acceptate de POST /calculeaza-profil', () => {
    expect(Object.keys(MAPARE_SEX).sort()).toEqual(['Feminin', 'Masculin']);
    expect(Object.keys(MAPARE_ACTIVITATE).sort()).toEqual(['Foarte Activ', 'Moderat', 'Sedentar']);
    expect(Object.keys(MAPARE_OBIECTIV).sort()).toEqual(['Masă Musculară', 'Menținere', 'Slăbire']);
  });

  it('factorii mapati coincid cu cei din onboarding', () => {
    // Sedentar/Moderat/Foarte Activ = sedentar/moderat/intens = 1.2/1.55/1.725
    expect(MAPARE_ACTIVITATE['Sedentar']).toBe('sedentar');
    expect(MAPARE_ACTIVITATE['Moderat']).toBe('moderat');
    expect(MAPARE_ACTIVITATE['Foarte Activ']).toBe('intens');
  });
});

describe('F-08 — proprietati generative deterministe', () => {
  it('pastreaza invarianti pentru 500 de profiluri valide generate cu seed fix', () => {
    let stare = 0x5eed1234;
    const urmatorul = () => {
      stare = (1664525 * stare + 1013904223) >>> 0;
      return stare / 0x100000000;
    };
    const intreg = (min, max) => Math.floor(urmatorul() * (max - min + 1)) + min;
    const genuri = ['masculin', 'feminin'];
    const activitati = ['sedentar', 'usor', 'moderat', 'intens', 'foarte_intens'];
    const scopuri = ['slabire', 'mentinere', 'masa'];
    const diete = ['echilibrata', 'low_carb', 'bogata_proteine', 'mediteraneana', 'vegetariana', 'vegana', 'keto'];

    for (let index = 0; index < 500; index += 1) {
      const intrare = {
        gen: genuri[intreg(0, genuri.length - 1)],
        varsta: intreg(10, 100),
        greutateKg: intreg(30, 300),
        inaltimeCm: intreg(100, 250),
        activitate: activitati[intreg(0, activitati.length - 1)],
        scop: scopuri[intreg(0, scopuri.length - 1)],
        dieta: diete[intreg(0, diete.length - 1)],
        ritmKgSaptamana: Math.round((0.1 + urmatorul() * 1.4) * 10) / 10,
      };
      const plan = calculeazaPlanNutritional(intrare);

      expect(plan).not.toBeNull();
      expect(Object.values(plan).every((valoare) => typeof valoare !== 'number' || Number.isFinite(valoare))).toBe(true);
      expect(plan.calorii).toBeGreaterThanOrEqual(intrare.gen === 'masculin' ? 1500 : 1200);
      const caloriiMacro = plan.proteineG * 4 + plan.carbohidratiG * 4 + plan.grasimiG * 9;
      expect(Math.abs(caloriiMacro - plan.calorii)).toBeLessThanOrEqual(10);
    }
  });
});
