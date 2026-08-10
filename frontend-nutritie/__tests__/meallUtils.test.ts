import { obtinePozaMasa, recalculeazaTotaluri, parseAlimente, construiesteAlimenteLaSalvare } from '../lib/mealUtils';
import { Masa, AlimentDetaliat } from '../types';

function masa(overrides: Partial<Masa>): Masa {
  return {
    id: 'm1',
    user_id: 'u1',
    nume: 'Pranz',
    calorii: 0,
    proteine: 0,
    grasimi: 0,
    carbohidrati: 0,
    created_at: '2026-08-08T12:00:00Z',
    ...overrides,
  };
}

describe('lib/mealUtils — poza mesei', () => {
  it('ia imagine_url din coloana daca exista (are prioritate)', () => {
    const m = masa({
      imagine_url: 'https://ik.imagekit.io/abc123/camera/a.jpg',
      alimente: [{ id: 'x', nume: 'a', calorii: 1, proteine: 0, carbohidrati: 0, grasimi: 0, imageUrl: 'https://ik.imagekit.io/abc123/other/b.jpg' }],
    });
    expect(obtinePozaMasa(m)).toBe('https://ik.imagekit.io/abc123/camera/a.jpg');
  });

  it('cade pe prima imagine din alimente[] daca imagine_url lipseste', () => {
    const m = masa({
      alimente: [
        { id: 'x', nume: 'a', calorii: 1, proteine: 0, carbohidrati: 0, grasimi: 0, imageUrl: 'https://ik.imagekit.io/abc123/camera/c.jpg' },
        { id: 'y', nume: 'b', calorii: 2, proteine: 0, carbohidrati: 0, grasimi: 0, imageUrl: 'https://ik.imagekit.io/abc123/camera/d.jpg' },
      ],
    });
    expect(obtinePozaMasa(m)).toBe('https://ik.imagekit.io/abc123/camera/c.jpg');
  });

  it('nu se blocheaza pe alimente string JSON (schema veche)', () => {
    const m = masa({ alimente: JSON.stringify([{ nume: 'a', calorii: 1, proteine: 0, carbohidrati: 0, grasimi: 0, imageUrl: 'https://ik.imagekit.io/abc123/camera/e.jpg' }]) as unknown as AlimentDetaliat[] });
    expect(obtinePozaMasa(m)).toBe('https://ik.imagekit.io/abc123/camera/e.jpg');
    expect(parseAlimente(m)).toHaveLength(1);
  });

  it('returneaza null cand nu exista nicio poza', () => {
    expect(obtinePozaMasa(masa({}))).toBeNull();
    expect(obtinePozaMasa(masa({ alimente: [] }))).toBeNull();
  });
});

describe('lib/mealUtils — construiesteAlimenteLaSalvare (BUG-002)', () => {
  const aliment = (overrides: Partial<AlimentDetaliat> = {}): AlimentDetaliat => ({
    id: 'a1',
    nume: 'Piept de pui',
    grame: 150,
    calorii: 247,
    proteine: 46,
    carbohidrati: 0,
    grasimi: 5.3,
    ...overrides,
  });
  const alimentNou = (overrides: Partial<AlimentDetaliat> = {}): AlimentDetaliat => ({
    nume: 'Piept de pui',
    grame: 200,
    calorii: 330,
    proteine: 62,
    carbohidrati: 0,
    grasimi: 7,
    fibre: 0,
    ...overrides,
  });

  it('1 ingredient + editare nume doar -> pastreaza alimentul original', () => {
    const original = [aliment()];
    const rezultat = construiesteAlimenteLaSalvare({
      original,
      aRedefinitAlimentul: false,
      alimentNou: alimentNou({ nume: 'Piept de pui la gratar' }),
    });
    expect(rezultat).toHaveLength(1);
    expect(rezultat[0]).toEqual(original[0]);
  });

  it('2 ingrediente + editare nume doar -> pastreaza ambele', () => {
    const original = [aliment({ id: 'a1', nume: 'Pui' }), aliment({ id: 'a2', nume: 'Orez', calorii: 195 })];
    const rezultat = construiesteAlimenteLaSalvare({ original, aRedefinitAlimentul: false, alimentNou: alimentNou() });
    expect(rezultat).toHaveLength(2);
    expect(rezultat.map((a) => a.id)).toEqual(['a1', 'a2']);
  });

  it('5+ ingrediente + editare nume doar -> pastreaza toate cele 5', () => {
    const original = [1, 2, 3, 4, 5].map((i) => aliment({ id: `a${i}`, nume: `Aliment ${i}`, calorii: i * 100 }));
    const rezultat = construiesteAlimenteLaSalvare({ original, aRedefinitAlimentul: false, alimentNou: alimentNou() });
    expect(rezultat).toHaveLength(5);
    expect(rezultat.map((a) => a.id)).toEqual(['a1', 'a2', 'a3', 'a4', 'a5']);
  });

  it('ingrediente cu poze + editare nume doar -> pastreaza imageUrl si imageKitFileId', () => {
    const original = [
      aliment({ imageUrl: 'https://ik.imagekit.io/x/a.jpg', imageKitFileId: 'file-a' }),
      aliment({ nume: 'Orez', imageUrl: 'https://ik.imagekit.io/x/b.jpg', imageKitFileId: 'file-b' }),
    ];
    const rezultat = construiesteAlimenteLaSalvare({ original, aRedefinitAlimentul: false, alimentNou: alimentNou() });
    expect(rezultat[0].imageUrl).toBe('https://ik.imagekit.io/x/a.jpg');
    expect(rezultat[0].imageKitFileId).toBe('file-a');
    expect(rezultat[1].imageUrl).toBe('https://ik.imagekit.io/x/b.jpg');
  });

  it('editare gramaj pe masa cu 1 aliment -> actualizeaza DOAR acel aliment, pastreaza id/poza', () => {
    const original = [aliment({ imageUrl: 'https://ik.imagekit.io/x/a.jpg', imageKitFileId: 'file-a' })];
    const rezultat = construiesteAlimenteLaSalvare({
      original,
      aRedefinitAlimentul: true,
      alimentNou: alimentNou({ grame: 200, calorii: 330 }),
    });
    expect(rezultat).toHaveLength(1);
    expect(rezultat[0].id).toBe('a1');
    expect(rezultat[0].imageUrl).toBe('https://ik.imagekit.io/x/a.jpg');
    expect(rezultat[0].imageKitFileId).toBe('file-a');
    expect(rezultat[0].grame).toBe(200);
    expect(rezultat[0].calorii).toBe(330);
  });

  it('editare macro fara gramaj pe masa cu 1 aliment -> pastreaza alimentul original', () => {
    const original = [aliment()];
    const rezultat = construiesteAlimenteLaSalvare({ original, aRedefinitAlimentul: false, alimentNou: alimentNou({ proteine: 50 }) });
    expect(rezultat).toEqual(original);
  });

  it('masa noua (fara original) -> inlocuieste cu alimentNou', () => {
    const nou = alimentNou({ nume: 'Salata' });
    const rezultat = construiesteAlimenteLaSalvare({ original: null, aRedefinitAlimentul: false, alimentNou: nou });
    expect(rezultat).toEqual([nou]);
  });

  it('save fara modificari pe masa multi-ingredient -> identic (deep equal)', () => {
    const original = [
      aliment({ id: 'a1', nume: 'Pui', grame: 200, calorii: 330 }),
      aliment({ id: 'a2', nume: 'Orez', grame: 150, calorii: 195 }),
      aliment({ id: 'a3', nume: 'Salata', grame: 80, calorii: 15 }),
    ];
    const rezultat = construiesteAlimenteLaSalvare({ original, aRedefinitAlimentul: false, alimentNou: alimentNou() });
    expect(rezultat).toStrictEqual(original);
  });

  it('redefinire completa (gramaj) pe masa multi-ingredient -> inlocuieste explicit cu alimentNou', () => {
    const original = [aliment({ id: 'a1' }), aliment({ id: 'a2' })];
    const rezultat = construiesteAlimenteLaSalvare({ original, aRedefinitAlimentul: true, alimentNou: alimentNou() });
    expect(rezultat).toHaveLength(1);
    expect(rezultat[0].nume).toBe('Piept de pui');
  });
});

describe('lib/mealUtils — recalculeazaTotaluri', () => {
  it('insumeaza macro-urile ingredientelor', () => {
    const t = recalculeazaTotaluri([
      { id: 'a', nume: 'pui', grame: 200, calorii: 330, proteine: 62, carbohidrati: 0, grasimi: 7.5 },
      { id: 'b', nume: 'orez', grame: 150, calorii: 195, proteine: 4.5, carbohidrati: 42, grasimi: 0.5 },
    ]);
    expect(t.calorii).toBe(525);
    expect(t.proteine).toBe(66.5);
    expect(t.carbohidrati).toBe(42);
    expect(t.grasimi).toBe(8);
  });

  it('clamp la 0 valorile negative / NaN', () => {
    const t = recalculeazaTotaluri([
      { id: 'a', nume: 'x', calorii: -50, proteine: NaN, carbohidrati: undefined as unknown as number, grasimi: 0 },
    ]);
    expect(t.calorii).toBe(0);
    expect(t.proteine).toBe(0);
    expect(t.carbohidrati).toBe(0);
  });

  it('lista goala = zerouri', () => {
    const t = recalculeazaTotaluri([]);
    expect(t).toEqual({ calorii: 0, proteine: 0, carbohidrati: 0, grasimi: 0, fibre: 0 });
  });

  it('rotunjește kcal la 1 zec, macro la 2', () => {
    const t = recalculeazaTotaluri([
      { id: 'a', nume: 'X', calorii: 123.4567, proteine: 33.345, carbohidrati: 5.678, grasimi: 2.999 },
    ]);
    expect(t.calorii).toBe(123.5);
    expect(t.proteine).toBe(33.35);
    expect(t.carbohidrati).toBe(5.68);
    expect(t.grasimi).toBe(3);
  });
});