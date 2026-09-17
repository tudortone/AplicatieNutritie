import {
  verificaReluareMasa,
  construiestePayloadMasaManuala,
} from '../lib/payloadMese';
import { creeazaIdentitateOperatie } from '../lib/identitateOperatie';

/**
 * P1-01 (remediere) — 23505 NU dovedește singur „aceeași salvare".
 *
 * ==========================================================================
 * BLOCANT 1
 * ==========================================================================
 * Fiecare ramură de duplicat clasifica orice `23505` drept succes și confirma
 * utilizatorului valorile din payload-ul LOCAL, nu din rândul chiar persistat.
 * Dacă aceeași identitate de operație ajunge să fie folosită pentru un conținut
 * diferit, utilizatorul vede „salvat: 650 kcal" în timp ce jurnalul conține 500.
 * Pierdere silențioasă de date, fără nicio eroare.
 *
 * Regula corectă: pe `23505` se citește rândul existent și se compară câmpurile
 * canonice. Succesul se raportează DOAR dacă rândul chiar corespunde.
 *
 * ==========================================================================
 * BLOCANTELE 2 și 3
 * ==========================================================================
 * Identitatea acțiunii supraviețuia unei încercări ABANDONATE (scan anulat /
 * propunere respinsă de server și apoi înlocuită), deci o masă complet diferită
 * refolosea id-ul operației precedente. `AddMealBottomSheet` reseta corect la
 * `open()`; camera și chat-ul nu aveau echivalentul.
 */

const NUTRITIE = { calorii: 500, proteine: 40, grasimi: 20, carbohidrati: 30, fibre: 4 };

const payload = (idOperatie: string, peste: Partial<typeof NUTRITIE> & { nume?: string } = {}) =>
  construiestePayloadMasaManuala({
    user_id: 'user-a',
    idOperatie,
    nume: peste.nume ?? 'Pui cu orez',
    calorii: peste.calorii ?? NUTRITIE.calorii,
    proteine: peste.proteine ?? NUTRITIE.proteine,
    grasimi: peste.grasimi ?? NUTRITIE.grasimi,
    carbohidrati: peste.carbohidrati ?? NUTRITIE.carbohidrati,
    fibre: peste.fibre ?? NUTRITIE.fibre,
    tip_masa: 'pranz',
  });

/** Client Supabase minimal care întoarce un rând persistat cunoscut. */
function clientCuRand(rand: Record<string, unknown> | null, eroare: unknown = null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: rand, error: eroare }),
        }),
      }),
    }),
  } as never;
}

describe('P1-01 — verificarea reluării pe 23505 (Blocant 1)', () => {
  test('1. rândul persistat corespunde → reluare confirmată', async () => {
    const p = payload('OP-1');
    const rezultat = await verificaReluareMasa(clientCuRand({ ...p }), p);

    expect(rezultat.tip).toBe('reluare_confirmata');
  });

  test('2. rândul persistat are ALTE valori nutriționale → CONFLICT, nu succes', async () => {
    const trimis = payload('OP-1', { calorii: 650 });
    const persistat = { ...payload('OP-1'), calorii: 500 };

    const rezultat = await verificaReluareMasa(clientCuRand(persistat), trimis);

    expect(rezultat.tip).toBe('conflict_continut');
  });

  test('3. rândul persistat are alt nume → CONFLICT', async () => {
    const trimis = payload('OP-1', { nume: 'Somon' });
    const persistat = payload('OP-1', { nume: 'Pui cu orez' });

    const rezultat = await verificaReluareMasa(clientCuRand(persistat), trimis);

    expect(rezultat.tip).toBe('conflict_continut');
  });

  test('4. rândul persistat are altă categorie → CONFLICT', async () => {
    const trimis = payload('OP-1');
    const persistat = { ...payload('OP-1'), tip_masa: 'cina' };

    const rezultat = await verificaReluareMasa(clientCuRand(persistat), trimis);

    expect(rezultat.tip).toBe('conflict_continut');
  });

  test('5. diferențe numerice nesemnificative (float) NU sunt conflict', async () => {
    const trimis = payload('OP-1', { proteine: 40 });
    const persistat = { ...payload('OP-1'), proteine: '40.0' };

    const rezultat = await verificaReluareMasa(clientCuRand(persistat), trimis);

    expect(rezultat.tip).toBe('reluare_confirmata');
  });

  test('6. rândul nu poate fi citit (rețea) → NECUNOSCUT, niciodată succes presupus', async () => {
    const p = payload('OP-1');
    const rezultat = await verificaReluareMasa(clientCuRand(null, { message: 'network' }), p);

    expect(rezultat.tip).toBe('necunoscut');
  });

  test('7. rândul lipsește (șters între timp) → NECUNOSCUT, nu se revendică succes', async () => {
    const p = payload('OP-1');
    const rezultat = await verificaReluareMasa(clientCuRand(null), p);

    expect(rezultat.tip).toBe('necunoscut');
  });
});

describe('P1-01 — ciclul identității de operație (Blocantele 2 și 3)', () => {
  test('8. aceeași acțiune reluată păstrează identitatea', () => {
    const identitate = creeazaIdentitateOperatie();
    const primul = identitate.pentruActiuneaCurenta();
    expect(identitate.pentruActiuneaCurenta()).toBe(primul);
  });

  test('9. ÎNCHEIEREA confirmată eliberează identitatea → acțiunea următoare e nouă', () => {
    const identitate = creeazaIdentitateOperatie();
    const primul = identitate.pentruActiuneaCurenta();
    identitate.incheiePersistata();
    expect(identitate.pentruActiuneaCurenta()).not.toBe(primul);
  });

  test('10. ABANDONAREA eliberează identitatea → conținut nou nu moștenește id vechi', () => {
    // Exact Blocantele 2/3: scan anulat / propunere respinsă și înlocuită.
    const identitate = creeazaIdentitateOperatie();
    const abandonat = identitate.pentruActiuneaCurenta();
    identitate.abandoneaza();
    expect(identitate.pentruActiuneaCurenta()).not.toBe(abandonat);
  });

  test('11. un eșec de TRANSPORT nu eliberează identitatea (reluarea rămâne aceeași operație)', () => {
    const identitate = creeazaIdentitateOperatie();
    const primul = identitate.pentruActiuneaCurenta();
    // Nu se apelează nici `incheiePersistata`, nici `abandoneaza`.
    expect(identitate.pentruActiuneaCurenta()).toBe(primul);
  });

  test('12. abandonarea repetată este inofensivă', () => {
    const identitate = creeazaIdentitateOperatie();
    identitate.abandoneaza();
    identitate.abandoneaza();
    const id = identitate.pentruActiuneaCurenta();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });
});
