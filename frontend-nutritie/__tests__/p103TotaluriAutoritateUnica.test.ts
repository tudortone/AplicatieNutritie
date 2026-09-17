import {
  calculeazaTotaluriZi,
  totaluriPentruAfisare,
  normalizeazaNutrient,
  TOTALURI_ZERO,
} from '../lib/nutritionTotals';
import type { Masa } from '../types';

/**
 * P1-03 — o singură autoritate pentru totalurile nutriționale consumate.
 *
 * ==========================================================================
 * DE CE EXISTĂ ACEST TEST
 * ==========================================================================
 * Înainte existau patru calculatoare independente, toate în `useMeseAzi`:
 *   1. `fetchData`            — sumă + rotunjire + plafonare
 *   2. `meseGrupate`          — sumă pe categorii, FĂRĂ rotunjire/plafonare
 *   3. `optimisticAddMeal`    — deltă adăugată peste totalul DEJA rotunjit
 *   4. `optimisticDeleteMeal` — deltă scăzută din totalul DEJA rotunjit
 *
 * Aritmetica pe deltă peste valori rotunjite nu este inversabilă: „adaugă apoi
 * șterge" nu readuce totalul inițial. Iar suma categoriilor (nerotunjite) putea
 * să difere de totalul zilei (rotunjit) pe același set de mese.
 *
 * Testele de mai jos fixează o singură autoritate: totalurile se DERIVĂ mereu din
 * setul canonic de mese, iar rotunjirea se aplică o singură dată, la afișare.
 */

const masa = (p: Partial<Masa> & { id: string }): Masa => ({
  user_id: 'u1',
  nume: 'Masă',
  calorii: 0,
  proteine: 0,
  grasimi: 0,
  carbohidrati: 0,
  created_at: '2026-09-15T10:00:00.000Z',
  tip_masa: 'pranz',
  ...p,
});

/** Fixtura canonică folosită de TOATE căile producătoare de totaluri. */
const FIXTURA_ZI: Masa[] = [
  masa({
    id: 'm1', tip_masa: 'mic_dejun', nume: 'Omletă',
    calorii: 312.4, proteine: 20.04, grasimi: 22.35, carbohidrati: 3.17, fibre: 0.9,
  }),
  masa({
    id: 'm2', tip_masa: 'pranz', nume: 'Pui cu orez',
    calorii: 648.7, proteine: 52.46, grasimi: 14.82, carbohidrati: 71.55, fibre: 3.4,
  }),
  masa({
    id: 'm3', tip_masa: 'cina', nume: 'Somon',
    calorii: 431.25, proteine: 38.11, grasimi: 26.43, carbohidrati: 8.02, fibre: 1.1,
  }),
  masa({
    id: 'm4', tip_masa: 'gustare', nume: 'Iaurt',
    calorii: 118.9, proteine: 10.39, grasimi: 3.24, carbohidrati: 12.66, fibre: 0.2,
  }),
];

describe('P1-03 — normalizarea valorilor la intrarea în aritmetica canonică', () => {
  test('1. zi goală → toate totalurile 0', () => {
    expect(calculeazaTotaluriZi([])).toEqual(TOTALURI_ZERO);
  });

  test('2. o singură masă → exact valorile ei', () => {
    const t = calculeazaTotaluriZi([FIXTURA_ZI[0]]);
    expect(t.calorii).toBeCloseTo(312.4, 6);
    expect(t.proteine).toBeCloseTo(20.04, 6);
  });

  test('3. mai multe mese → agregat exact pe valori brute', () => {
    const t = calculeazaTotaluriZi(FIXTURA_ZI);
    expect(t.calorii).toBeCloseTo(312.4 + 648.7 + 431.25 + 118.9, 6);
    expect(t.proteine).toBeCloseTo(20.04 + 52.46 + 38.11 + 10.39, 6);
    expect(t.grasimi).toBeCloseTo(22.35 + 14.82 + 26.43 + 3.24, 6);
    expect(t.carbohidrati).toBeCloseTo(3.17 + 71.55 + 8.02 + 12.66, 6);
  });

  test('4. NaN nu otrăvește totalul', () => {
    const t = calculeazaTotaluriZi([masa({ id: 'x', calorii: NaN, proteine: NaN })]);
    expect(t.calorii).toBe(0);
    expect(Number.isNaN(t.proteine)).toBe(false);
  });

  test('5. Infinity nu devine total vizibil și nu se transformă în date plauzibile', () => {
    const t = calculeazaTotaluriZi([
      masa({ id: 'x', calorii: Infinity }),
      masa({ id: 'y', calorii: -Infinity }),
      masa({ id: 'z', calorii: 100 }),
    ]);
    expect(Number.isFinite(t.calorii)).toBe(true);
    // Valoarea invalidă e IGNORATĂ, nu plafonată la un număr care pare real.
    expect(t.calorii).toBe(100);
  });

  test('6. șir numeric: normalizat, NU concatenat', () => {
    const t = calculeazaTotaluriZi([
      masa({ id: 'a', calorii: '120' as unknown as number }),
      masa({ id: 'b', calorii: '50' as unknown as number }),
    ]);
    expect(t.calorii).toBe(170);
  });

  test('7. valori lipsă / null / undefined → tratate ca 0', () => {
    const t = calculeazaTotaluriZi([
      masa({ id: 'a', calorii: null as unknown as number, proteine: undefined as unknown as number }),
      masa({ id: 'b', calorii: 200, proteine: 10 }),
    ]);
    expect(t.calorii).toBe(200);
    expect(t.proteine).toBe(10);
  });

  test('8. valorile negative nu scad consumul (invalide prin regulile produsului)', () => {
    const t = calculeazaTotaluriZi([
      masa({ id: 'a', calorii: -500 }),
      masa({ id: 'b', calorii: 300 }),
    ]);
    expect(t.calorii).toBe(300);
  });

  test('9. valori mari dar finite rămân finite', () => {
    const t = calculeazaTotaluriZi([masa({ id: 'a', calorii: 9e8 })]);
    expect(Number.isFinite(t.calorii)).toBe(true);
  });

  test('10. normalizeazaNutrient acoperă explicit fiecare clasă de intrare', () => {
    expect(normalizeazaNutrient(12.5)).toBe(12.5);
    expect(normalizeazaNutrient('12.5')).toBe(12.5);
    expect(normalizeazaNutrient(null)).toBe(0);
    expect(normalizeazaNutrient(undefined)).toBe(0);
    expect(normalizeazaNutrient(NaN)).toBe(0);
    expect(normalizeazaNutrient(Infinity)).toBe(0);
    expect(normalizeazaNutrient(-Infinity)).toBe(0);
    expect(normalizeazaNutrient(-3)).toBe(0);
    expect(normalizeazaNutrient('abc')).toBe(0);
    expect(normalizeazaNutrient({} as unknown as number)).toBe(0);
  });
});

describe('P1-03 — rotunjirea se aplică O SINGURĂ DATĂ, la afișare', () => {
  test('11. sumă pe valori brute, rotunjire abia la prezentare', () => {
    const brut = calculeazaTotaluriZi(FIXTURA_ZI);
    const afisat = totaluriPentruAfisare(brut);
    expect(afisat.calorii).toBe(Math.round(brut.calorii));
    expect(afisat.proteine).toBe(Math.round(brut.proteine * 10) / 10);
  });

  test('12. rotunjirea per-masă ar da alt rezultat — dovada că ordinea contează', () => {
    const perMasa = FIXTURA_ZI.reduce((s, m) => s + Math.round(m.proteine), 0);
    const canonic = totaluriPentruAfisare(calculeazaTotaluriZi(FIXTURA_ZI)).proteine;
    // Nu sunt egale: de aceea politica trebuie să fie una singură, documentată.
    expect(canonic).not.toBe(perMasa);
    expect(canonic).toBeCloseTo(121, 0);
  });

  test('13. niciun total afișat nu poate fi NaN sau Infinity', () => {
    const afisat = totaluriPentruAfisare(calculeazaTotaluriZi([
      masa({ id: 'a', calorii: Infinity, proteine: NaN, grasimi: -Infinity }),
    ]));
    for (const valoare of Object.values(afisat)) {
      expect(Number.isFinite(valoare)).toBe(true);
    }
  });
});

describe('P1-03 — invarianți de agregare (o autoritate nu poate deriva)', () => {
  test('14. reordonarea meselor nu schimbă totalul', () => {
    const a = calculeazaTotaluriZi(FIXTURA_ZI);
    const b = calculeazaTotaluriZi([...FIXTURA_ZI].reverse());
    expect(totaluriPentruAfisare(b)).toEqual(totaluriPentruAfisare(a));
  });

  test('15. schimbarea categoriei nu schimbă totalul zilei', () => {
    const mutat = FIXTURA_ZI.map((m) => (m.id === 'm1' ? { ...m, tip_masa: 'cina' as const } : m));
    expect(totaluriPentruAfisare(calculeazaTotaluriZi(mutat)))
      .toEqual(totaluriPentruAfisare(calculeazaTotaluriZi(FIXTURA_ZI)));
  });

  test('16. o masă cu zero nutrienți nu schimbă totalul', () => {
    const cuZero = [...FIXTURA_ZI, masa({ id: 'zero' })];
    expect(totaluriPentruAfisare(calculeazaTotaluriZi(cuZero)))
      .toEqual(totaluriPentruAfisare(calculeazaTotaluriZi(FIXTURA_ZI)));
  });

  test('17. adaugă apoi șterge → totalul inițial REVINE exact', () => {
    const initial = totaluriPentruAfisare(calculeazaTotaluriZi(FIXTURA_ZI));
    const nou = masa({ id: 'temp', calorii: 250.44, proteine: 10.06, grasimi: 5.05, carbohidrati: 20.04 });

    const dupaAdaugare = [nou, ...FIXTURA_ZI];
    const dupaStergere = dupaAdaugare.filter((m) => m.id !== 'temp');

    expect(totaluriPentruAfisare(calculeazaTotaluriZi(dupaStergere))).toEqual(initial);
  });

  test('18. agregarea e aditivă pe seturi disjuncte de mese', () => {
    const a = FIXTURA_ZI.slice(0, 2);
    const b = FIXTURA_ZI.slice(2);
    const separat = calculeazaTotaluriZi(a);
    const celalalt = calculeazaTotaluriZi(b);
    const impreuna = calculeazaTotaluriZi(FIXTURA_ZI);
    expect(impreuna.calorii).toBeCloseTo(separat.calorii + celalalt.calorii, 6);
    expect(impreuna.proteine).toBeCloseTo(separat.proteine + celalalt.proteine, 6);
  });

  test('19. editarea unei mese 500 → 650 crește totalul cu exact 150', () => {
    const baza = [masa({ id: 'e1', calorii: 500 }), masa({ id: 'e2', calorii: 200 })];
    const inainte = calculeazaTotaluriZi(baza).calorii;
    const dupa = calculeazaTotaluriZi(
      baza.map((m) => (m.id === 'e1' ? { ...m, calorii: 650 } : m)),
    ).calorii;
    expect(dupa - inainte).toBe(150);
  });

  test('20. ștergerea scade contribuția exact o dată', () => {
    const baza = [masa({ id: 'd1', calorii: 500 }), masa({ id: 'd2', calorii: 500 })];
    const dupa = calculeazaTotaluriZi(baza.filter((m) => m.id !== 'd1')).calorii;
    expect(dupa).toBe(500);
  });

  test('21. aceeași masă prezentă o singură dată în setul canonic contribuie o singură dată', () => {
    const unaSingura = calculeazaTotaluriZi([FIXTURA_ZI[0]]).calorii;
    expect(unaSingura).toBeCloseTo(312.4, 6);
  });
});

describe('P1-03 — paritate între ecrane pe ACEEAȘI fixtură canonică', () => {
  test('22. suma categoriilor este identică cu totalul zilei', () => {
    const peCategorii = (['mic_dejun', 'pranz', 'cina', 'gustare'] as const).map((tip) =>
      calculeazaTotaluriZi(FIXTURA_ZI.filter((m) => m.tip_masa === tip)));

    const sumaCategorii = peCategorii.reduce((acc, t) => ({
      calorii: acc.calorii + t.calorii,
      proteine: acc.proteine + t.proteine,
      grasimi: acc.grasimi + t.grasimi,
      carbohidrati: acc.carbohidrati + t.carbohidrati,
      fibre: acc.fibre + t.fibre,
    }), TOTALURI_ZERO);

    const totalZi = calculeazaTotaluriZi(FIXTURA_ZI);
    expect(totaluriPentruAfisare(sumaCategorii)).toEqual(totaluriPentruAfisare(totalZi));
  });

  test('23. o masă fără categorie validă este tot numărată în totalul zilei', () => {
    const faraTip = [...FIXTURA_ZI, masa({ id: 'ft', calorii: 100, tip_masa: undefined })];
    expect(calculeazaTotaluriZi(faraTip).calorii)
      .toBeCloseTo(calculeazaTotaluriZi(FIXTURA_ZI).calorii + 100, 6);
  });
});

describe('P1-03 — date vechi (legacy) și robustețe', () => {
  test('24. rând legacy fără macro-uri → comportament determinist, fără NaN', () => {
    const legacy = { id: 'l1', user_id: 'u1', nume: 'Vechi', created_at: '2026-09-15T10:00:00.000Z' } as unknown as Masa;
    const t = calculeazaTotaluriZi([legacy, FIXTURA_ZI[0]]);
    expect(t.calorii).toBeCloseTo(312.4, 6);
    expect(Number.isFinite(t.proteine)).toBe(true);
  });

  test('25. o listă null/undefined nu aruncă', () => {
    expect(calculeazaTotaluriZi(null as unknown as Masa[])).toEqual(TOTALURI_ZERO);
    expect(calculeazaTotaluriZi(undefined as unknown as Masa[])).toEqual(TOTALURI_ZERO);
  });

  test('26. intrări non-obiect din listă sunt ignorate, nu aruncă', () => {
    const murdar = [null, undefined, 42, 'x', FIXTURA_ZI[0]] as unknown as Masa[];
    expect(calculeazaTotaluriZi(murdar).calorii).toBeCloseTo(312.4, 6);
  });
});
