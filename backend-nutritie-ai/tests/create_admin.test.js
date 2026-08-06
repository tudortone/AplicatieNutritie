'use strict';

const {
  valideazaParola,
  genereazaParola,
  LUNGIME_MINIMA_PAROLA,
} = require('../scripts/create-admin');

describe('create-admin (H-02)', () => {
  test('#18: parola implicita "admin" este respinsa', () => {
    expect(valideazaParola('admin')).toMatch(/interzis/);
  });

  test('#18: o parola scurta este respinsa', () => {
    expect(valideazaParola('abc123')).toMatch(/cel putin/);
  });

  test('#18: o parola puternica trece validarea', () => {
    expect(valideazaParola('x'.repeat(LUNGIME_MINIMA_PAROLA + 4))).toBeNull();
  });

  test('#18: parola generata este lunga si cu entropie (nu se repeta)', () => {
    const prima = genereazaParola();
    const aDoua = genereazaParola();
    expect(typeof prima).toBe('string');
    expect(prima.length).toBeGreaterThanOrEqual(20);
    expect(prima).not.toBe(aDoua);
  });
});
