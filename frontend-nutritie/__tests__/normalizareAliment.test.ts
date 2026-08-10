import { normalizeazaNumeAliment } from '../lib/normalizareAliment';

describe('normalizeazaNumeAliment', () => {
  it('păstrează un nume deja curat', () => {
    expect(normalizeazaNumeAliment('oua')).toBe('oua');
  });

  it('elimină diacriticele românești', () => {
    expect(normalizeazaNumeAliment('Brânză de vaci')).toBe('branza de vaci');
    expect(normalizeazaNumeAliment('Pâine integrală')).toBe('paine integrala');
    expect(normalizeazaNumeAliment('piept de pui')).toBe('piept de pui');
    expect(normalizeazaNumeAliment('Țărănească')).toBe('taraneasca');
  });

  it('elimină parantezele (mod de gătire)', () => {
    expect(normalizeazaNumeAliment('Piept de pui (fiert)')).toBe('piept de pui');
    expect(normalizeazaNumeAliment('orez (fiert) bravo')).toBe('orez bravo');
  });

  it('convertește la lowercase și strânge spațiile/punctuația', () => {
    expect(normalizeazaNumeAliment('  Piept---de---pui!!!  ')).toBe('piept de pui');
    expect(normalizeazaNumeAliment('MERE')).toBe('mere');
  });

  it('gestionează accentele non-românești comune', () => {
    expect(normalizeazaNumeAliment('Crème caramel')).toBe('creme caramel');
    expect(normalizeazaNumeAliment('café espresso')).toBe('cafe espresso');
  });

  it('returnează string gol pentru input gol', () => {
    expect(normalizeazaNumeAliment('')).toBe('');
    expect(normalizeazaNumeAliment(null)).toBe('');
    expect(normalizeazaNumeAliment(undefined)).toBe('');
    expect(normalizeazaNumeAliment('   ')).toBe('');
  });
});