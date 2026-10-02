'use strict';

/**
 * P1-12 (a doua remediere) — compare-and-delete pe registrul PARTAJAT real.
 *
 * Testele de ruta folosesc un registru fals cu aceeasi semantica. Acesta verifica
 * implementarea REALA din utils/storePartajat.js, pentru ca de ea depinde
 * corectitudinea lock-ului distribuit in productie.
 *
 * Defectul pe care il previne: proprietarul A isi depaseste TTL-ul, B revendica
 * aceeasi cheie, apoi curatenia intarziata a lui A ruleaza si sterge zalogul lui B.
 * Un `del` simplu face exact asta; `delIfMatch` nu.
 */

const { creeazaRegistruCheiValori } = require('../utils/storePartajat');

describe('P1-12 — delIfMatch (eliberare doar de catre proprietar)', () => {
  let registru;

  beforeEach(() => {
    // Fara REDIS_URL => ramura locala. Aceeasi semantica pe care o impune scriptul
    // Lua pe ramura Redis: sterge DOAR daca valoarea curenta e a celui ce elibereaza.
    registru = creeazaRegistruCheiValori({ prefix: `test:${Math.random()}` });
  });

  test('sterge cand jetonul se potriveste', async () => {
    await registru.setIfAbsent('k', 'token-a', 60000);
    await expect(registru.delIfMatch('k', 'token-a')).resolves.toBe(true);
    await expect(registru.get('k')).resolves.toBeNull();
  });

  test('NU sterge cand jetonul difera — zalogul noului proprietar supravietuieste', async () => {
    await registru.setIfAbsent('k', 'token-b-nou', 60000);

    // Proprietarul vechi incearca sa curete dupa expirarea propriului zalog.
    await expect(registru.delIfMatch('k', 'token-a-vechi')).resolves.toBe(false);

    await expect(registru.get('k')).resolves.toBe('token-b-nou');
  });

  test('pe cheie inexistenta raporteaza ca nu a sters nimic', async () => {
    await expect(registru.delIfMatch('lipsa', 'token')).resolves.toBe(false);
  });

  test('setIfAbsent ramane exclusiv: al doilea pretendent pierde', async () => {
    await expect(registru.setIfAbsent('k', 'primul', 60000)).resolves.toBe(true);
    await expect(registru.setIfAbsent('k', 'al-doilea', 60000)).resolves.toBe(false);
    await expect(registru.get('k')).resolves.toBe('primul');
  });

  test('dupa eliberarea corecta, cheia poate fi revendicata din nou', async () => {
    await registru.setIfAbsent('k', 'token-a', 60000);
    await registru.delIfMatch('k', 'token-a');
    await expect(registru.setIfAbsent('k', 'token-c', 60000)).resolves.toBe(true);
  });
});
