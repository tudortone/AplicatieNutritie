import { localDayKey, startOfLocalDayISO, endOfLocalDayISO } from '../lib/dateUtils';
import { calculeazaTotaluriZi, totaluriPentruAfisare } from '../lib/nutritionTotals';
import type { Masa } from '../types';

/**
 * P1-03 — identitatea ZILEI și invarianța la LOCALE.
 *
 * Fereastra zilei este testată direct pe `lib/dateUtils` (autoritatea reală),
 * nu dedusă printr-un client Supabase simulat: aici se poate verifica exact
 * granița, inclusiv în jurul miezului nopții și când ziua UTC diferă de cea locală.
 * Faptul că `useMeseAzi` chiar folosește aceste helpere este verificat separat,
 * pe hook-ul real (`p103HookZiConturiLocale.test.ts`, testul ferestrei locale).
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

describe('P1-03 — ziua logică este ziua LOCALĂ, deterministă', () => {
  test('1. granițele zilei sunt miezul nopții local, nu 00:00 UTC', () => {
    const start = new Date(startOfLocalDayISO(new Date('2026-09-15T13:27:11')));
    const sfarsit = new Date(endOfLocalDayISO(new Date('2026-09-15T13:27:11')));

    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(start.getSeconds()).toBe(0);
    expect(sfarsit.getHours()).toBe(23);
    expect(sfarsit.getMinutes()).toBe(59);
    expect(sfarsit.getSeconds()).toBe(59);
  });

  test('2. 23:50 și 00:10 local cad în zile DIFERITE', () => {
    const seara = new Date('2026-09-15T23:50:00');
    const dupaMiezulNoptii = new Date('2026-09-16T00:10:00');

    expect(localDayKey(seara)).not.toBe(localDayKey(dupaMiezulNoptii));
    expect(startOfLocalDayISO(seara)).not.toBe(startOfLocalDayISO(dupaMiezulNoptii));
  });

  test('3. 23:59:59 și 00:00:00 sunt de o parte și de alta a graniței', () => {
    const inainte = new Date('2026-09-15T23:59:59');
    const dupa = new Date('2026-09-16T00:00:00');
    expect(localDayKey(inainte)).toBe('2026-09-15');
    expect(localDayKey(dupa)).toBe('2026-09-16');
  });

  test('4. ore diferite din aceeași zi locală → aceeași fereastră', () => {
    const dimineata = new Date('2026-09-15T08:00:00');
    const seara = new Date('2026-09-15T21:00:00');

    expect(startOfLocalDayISO(dimineata)).toBe(startOfLocalDayISO(seara));
    expect(endOfLocalDayISO(dimineata)).toBe(endOfLocalDayISO(seara));
    expect(localDayKey(dimineata)).toBe(localDayKey(seara));
  });

  test('5. o masă de seară rămâne în ziua ei locală chiar dacă în UTC e ziua următoare', () => {
    // Ora locală 23:30; în funcție de fusul mașinii, instantul UTC poate cădea deja
    // în ziua următoare. Cheia de zi trebuie să rămână cea LOCALĂ.
    const searaLocala = new Date('2026-09-15T23:30:00');
    const start = new Date(startOfLocalDayISO(searaLocala));
    const sfarsit = new Date(endOfLocalDayISO(searaLocala));

    expect(searaLocala.getTime()).toBeGreaterThanOrEqual(start.getTime());
    expect(searaLocala.getTime()).toBeLessThanOrEqual(sfarsit.getTime());
    expect(localDayKey(searaLocala)).toBe('2026-09-15');
  });

  test('6. fereastra acoperă exact 24h minus o milisecundă', () => {
    const start = new Date(startOfLocalDayISO(new Date('2026-09-15T12:00:00')));
    const sfarsit = new Date(endOfLocalDayISO(new Date('2026-09-15T12:00:00')));
    expect(sfarsit.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000 - 1);
  });

  test('7. o masă exact la graniță aparține unei singure zile', () => {
    const miezulNoptii = new Date('2026-09-16T00:00:00');
    const ziPrecedenta = new Date('2026-09-15T12:00:00');

    const sfarsitPrecedent = new Date(endOfLocalDayISO(ziPrecedenta)).getTime();
    const startNou = new Date(startOfLocalDayISO(miezulNoptii)).getTime();

    expect(miezulNoptii.getTime()).toBeGreaterThan(sfarsitPrecedent);
    expect(miezulNoptii.getTime()).toBe(startNou);
  });
});

describe('P1-03 — locale afectează DOAR afișarea, niciodată aritmetica', () => {
  const LOCALE = ['ro-RO', 'en-US', 'fr-FR', 'de-DE'];

  const FIXTURA: Masa[] = [
    masa({ id: 'm1', calorii: 312.4, proteine: 20.04, grasimi: 22.35, carbohidrati: 3.17 }),
    masa({ id: 'm2', calorii: 648.7, proteine: 52.46, grasimi: 14.82, carbohidrati: 71.55 }),
  ];

  test.each(LOCALE)('8. %s → valoarea canonică este identică', (locale) => {
    const canonic = totaluriPentruAfisare(calculeazaTotaluriZi(FIXTURA));

    // Formatarea se aplică PESTE valoarea canonică și nu o modifică.
    const formatat = canonic.calorii.toLocaleString(locale);
    expect(typeof formatat).toBe('string');

    expect(canonic.calorii).toBe(961);
    expect(canonic.proteine).toBe(72.5);
  });

  test('9. toate locale-urile produc exact același obiect de totaluri', () => {
    const rezultate = LOCALE.map(() => totaluriPentruAfisare(calculeazaTotaluriZi(FIXTURA)));
    for (const r of rezultate) expect(r).toEqual(rezultate[0]);
  });

  test('10. un șir formatat localizat NU se re-parsează în aritmetica canonică', () => {
    // În `de-DE`, 1.234,5 folosește punctul ca separator de mii. Dacă un astfel de
    // șir ar fi dat înapoi calculatorului, `Number()` l-ar citi greșit — de aceea
    // normalizarea acceptă doar forma canonică, iar afișarea e capătul lanțului.
    const formatatDe = (1234.5).toLocaleString('de-DE');
    expect(formatatDe).toContain('.');
    const totaluri = calculeazaTotaluriZi([masa({ id: 'x', calorii: 1234.5 })]);
    expect(totaluri.calorii).toBe(1234.5);
  });
});
