import { obtinePozaMasa, recalculeazaTotaluri, parseAlimente } from '../lib/mealUtils';
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