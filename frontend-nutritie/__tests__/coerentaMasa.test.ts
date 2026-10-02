/**
 * F-04 — invariantul „totalul mesei == suma descompunerii".
 *
 * Defectul original: la editarea unei mese cu mai multe ingrediente, formularul
 * plat scria un total NOU peste o descompunere VECHE. Cardul afisa 600 kcal
 * peste ingrediente insumand 500, iar o editare ulterioara a unui ingredient
 * recalcula totalul din descompunere si stergea tacut corectia manuala.
 *
 * Decizie: cand exista o descompunere cu date nutritionale, EA este sursa de
 * adevar si totalul se deriva mereu din ea.
 */

import {
  recalculeazaTotaluri,
  totaluriPentruPersistare,
  descompunereAreDateNutritionale,
  construiesteAlimenteLaSalvare,
} from '../lib/mealUtils';
import type { AlimentDetaliat } from '../types';

const FORMULAR_GOL = { calorii: 0, proteine: 0, carbohidrati: 0, grasimi: 0, fibre: 0 };

const pui = (): AlimentDetaliat => ({
  nume: 'Piept de pui', grame: 200, calorii: 300, proteine: 60, carbohidrati: 0, grasimi: 7, fibre: 0,
});
const orez = (): AlimentDetaliat => ({
  nume: 'Orez', grame: 150, calorii: 200, proteine: 4, carbohidrati: 44, grasimi: 0.5, fibre: 1,
});

/** Suma reala a unei liste, calculata independent de implementare. */
function sumaIndependenta(alimente: AlimentDetaliat[]) {
  return alimente.reduce(
    (a, x) => ({
      calorii: a.calorii + (Number(x.calorii) || 0),
      proteine: a.proteine + (Number(x.proteine) || 0),
      carbohidrati: a.carbohidrati + (Number(x.carbohidrati) || 0),
      grasimi: a.grasimi + (Number(x.grasimi) || 0),
      fibre: a.fibre + (Number(x.fibre) || 0),
    }),
    { ...FORMULAR_GOL },
  );
}

describe('F-04 — un singur ingredient', () => {
  it('totalul urmeaza ingredientul, nu formularul', () => {
    const alimente = [pui()];
    const total = totaluriPentruPersistare(alimente, { ...FORMULAR_GOL, calorii: 9999 });
    expect(total.calorii).toBe(300);
    expect(total.proteine).toBe(60);
  });

  it('un ingredient construit din formular pastreaza exact valorile formularului', () => {
    const dinFormular: AlimentDetaliat = {
      nume: 'Iaurt', grame: 200, calorii: 120, proteine: 10, carbohidrati: 8, grasimi: 5, fibre: 0,
    };
    const total = totaluriPentruPersistare([dinFormular], {
      calorii: 120, proteine: 10, carbohidrati: 8, grasimi: 5, fibre: 0,
    });
    expect(total).toEqual({ calorii: 120, proteine: 10, carbohidrati: 8, grasimi: 5, fibre: 0 });
  });
});

describe('F-04 — mai multe ingrediente', () => {
  it('totalul este suma, nu valoarea tastata manual', () => {
    const alimente = [pui(), orez()];
    const asteptat = sumaIndependenta(alimente);

    // Utilizatorul a tastat 600 kcal peste o descompunere care insumeaza 500.
    const total = totaluriPentruPersistare(alimente, { ...FORMULAR_GOL, calorii: 600 });

    expect(total.calorii).toBe(asteptat.calorii); // 500, nu 600
    expect(total.calorii).toBe(500);
    expect(total.proteine).toBe(64);
    expect(total.carbohidrati).toBe(44);
    expect(total.grasimi).toBe(7.5);
    expect(total.fibre).toBe(1);
  });

  it('invariantul se mentine dupa editarea unui ingredient', () => {
    const alimente = [pui(), orez()];
    // Se corecteaza gramajul/nutritia orezului.
    const dupaEditare = [alimente[0], { ...alimente[1], calorii: 260, carbohidrati: 57 }];
    const total = totaluriPentruPersistare(dupaEditare, { ...FORMULAR_GOL, calorii: 500 });
    expect(total.calorii).toBe(560);
    expect(total).toEqual(recalculeazaTotaluri(dupaEditare));
  });

  it('invariantul se mentine dupa stergerea unui ingredient', () => {
    const dupaStergere = [pui()];
    const total = totaluriPentruPersistare(dupaStergere, { ...FORMULAR_GOL, calorii: 500 });
    expect(total.calorii).toBe(300);
  });

  it('ingrediente duplicate se insumeaza, nu se deduplica', () => {
    const alimente = [pui(), pui()];
    const total = totaluriPentruPersistare(alimente, FORMULAR_GOL);
    expect(total.calorii).toBe(600);
    expect(total.proteine).toBe(120);
  });
});

describe('F-04 — cantitati limita', () => {
  it('cantitate zero nu strica totalul', () => {
    const zero: AlimentDetaliat = {
      nume: 'Apa', grame: 0, calorii: 0, proteine: 0, carbohidrati: 0, grasimi: 0, fibre: 0,
    };
    const total = totaluriPentruPersistare([pui(), zero], FORMULAR_GOL);
    expect(total.calorii).toBe(300);
  });

  it('zecimale sunt pastrate cu precizia declarata (1 kcal / 2 macro)', () => {
    const a: AlimentDetaliat = {
      nume: 'A', grame: 10, calorii: 10.25, proteine: 1.005, carbohidrati: 2.004, grasimi: 0.125, fibre: 0.5,
    };
    const b: AlimentDetaliat = {
      nume: 'B', grame: 10, calorii: 10.24, proteine: 1.005, carbohidrati: 2.004, grasimi: 0.125, fibre: 0.5,
    };
    const total = totaluriPentruPersistare([a, b], FORMULAR_GOL);
    expect(total.calorii).toBe(20.5);   // 20.49 -> 1 zecimala
    expect(total.proteine).toBe(2.01);  // 2 zecimale
    expect(total.grasimi).toBe(0.25);
    expect(total.fibre).toBe(1);
  });

  it('valori negative/NaN nu produc totaluri negative sau NaN', () => {
    const stricat = {
      nume: 'Stricat', grame: 10, calorii: NaN, proteine: -5, carbohidrati: undefined, grasimi: 'x', fibre: null,
    } as unknown as AlimentDetaliat;
    const total = totaluriPentruPersistare([pui(), stricat], FORMULAR_GOL);
    expect(Number.isFinite(total.calorii)).toBe(true);
    expect(total.calorii).toBe(300);
    // `recalculeazaTotaluri` taie negativele la 0 (clamp >= 0).
    expect(total.proteine).toBeGreaterThanOrEqual(0);
    for (const v of Object.values(total)) expect(Number.isNaN(v)).toBe(false);
  });
});

describe('F-04 — date mostenite fara macro-uri in descompunere', () => {
  it('pastreaza totalul din formular cand descompunerea nu are date nutritionale', () => {
    const doarNume = [{ nume: 'Ceva vechi', grame: 100 }] as AlimentDetaliat[];
    expect(descompunereAreDateNutritionale(doarNume)).toBe(false);

    const formular = { calorii: 450, proteine: 20, carbohidrati: 50, grasimi: 15, fibre: 3 };
    expect(totaluriPentruPersistare(doarNume, formular)).toEqual(formular);
  });

  it('lista goala / null cad tot pe formular', () => {
    const formular = { calorii: 200, proteine: 5, carbohidrati: 30, grasimi: 4, fibre: 1 };
    expect(totaluriPentruPersistare([], formular)).toEqual(formular);
    expect(totaluriPentruPersistare(null, formular)).toEqual(formular);
    expect(totaluriPentruPersistare(undefined, formular)).toEqual(formular);
  });

  it('o descompunere cu MACAR o valoare nutritionala este considerata autoritara', () => {
    const partial = [{ nume: 'X', grame: 50, calorii: 80 }] as AlimentDetaliat[];
    expect(descompunereAreDateNutritionale(partial)).toBe(true);
    expect(totaluriPentruPersistare(partial, { ...FORMULAR_GOL, calorii: 999 }).calorii).toBe(80);
  });
});

describe('F-04 — integrare cu construiesteAlimenteLaSalvare', () => {
  it('masa cu mai multe ingrediente: descompunerea se pastreaza SI totalul o urmeaza', () => {
    const original = [pui(), orez()];
    const alimenteFinal = construiesteAlimenteLaSalvare({
      original,
      aRedefinitAlimentul: false, // regula existenta pentru mese multi-component
      alimentNou: { nume: 'ignorat', grame: 1, calorii: 1, proteine: 1, carbohidrati: 1, grasimi: 1 },
    });

    expect(alimenteFinal).toHaveLength(2); // BUG-002: nu colapseaza

    // Utilizatorul a tastat 600 in formular; totalul persistat ramane 500.
    const total = totaluriPentruPersistare(alimenteFinal, { ...FORMULAR_GOL, calorii: 600 });
    expect(total.calorii).toBe(500);
    expect(total).toEqual(recalculeazaTotaluri(alimenteFinal));
  });

  it('masa cu un ingredient redefinit: totalul urmeaza noul aliment', () => {
    const alimentNou: AlimentDetaliat = {
      nume: 'Pui la gratar', grame: 250, calorii: 375, proteine: 75, carbohidrati: 0, grasimi: 9, fibre: 0,
    };
    const alimenteFinal = construiesteAlimenteLaSalvare({
      original: [pui()],
      aRedefinitAlimentul: true,
      alimentNou,
    });
    const total = totaluriPentruPersistare(alimenteFinal, { ...FORMULAR_GOL, calorii: 375 });
    expect(total.calorii).toBe(375);
    expect(total.proteine).toBe(75);
  });
});
