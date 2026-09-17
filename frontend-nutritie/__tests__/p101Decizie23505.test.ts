import {
  decideRezultatInsertMasa,
  construiestePayloadMasaManuala,
  construiesteRinduriMasaChat,
} from '../lib/payloadMese';

/**
 * P1-01 (remediere finală) — decizia pe `23505`, în TOATE cele patru căi de scriere.
 *
 * ==========================================================================
 * CE AM RATAT
 * ==========================================================================
 * Raportul precedent afirma „aplicat în toate cele patru locuri". Fals: doar
 * `camera.tsx` și `lib/offlineQueue.ts` chiar verificau rândul persistat.
 *
 *  - `chat.tsx` trecea prin `clasificaRezultatInsertMasa`, care întoarce
 *    `{tip:'duplicat'}` doar pe baza codului de eroare, fără nicio citire, iar
 *    chat-ul trata `duplicat` exact ca `succes` și construia modalul din
 *    payload-ul LOCAL;
 *  - `AddMealBottomSheet.tsx` arunca ORICE eroare de insert (inclusiv 23505) în
 *    ramura generică offline și afișa „Salvat offline".
 *
 * Ambele puteau confirma utilizatorului o masă care nu este cea din bază.
 *
 * `decideRezultatInsertMasa` este acum singurul loc unde se ia această decizie,
 * ca regula să nu mai poată diverge între ecrane. Nu dublează logica de
 * comparare — o delegă lui `verificaReluareMasa`.
 */

const NUTRITIE = { calorii: 500, proteine: 40, grasimi: 20, carbohidrati: 30, fibre: 4 };
const EROARE_23505 = { error: { code: '23505', message: 'duplicate key value violates unique constraint "mese_pkey"' } };

const manual = (idOperatie: string, peste: Partial<typeof NUTRITIE> & { nume?: string; tip_masa?: string } = {}) =>
  construiestePayloadMasaManuala({
    user_id: 'user-a',
    idOperatie,
    nume: peste.nume ?? 'Pui cu orez',
    calorii: peste.calorii ?? NUTRITIE.calorii,
    proteine: peste.proteine ?? NUTRITIE.proteine,
    grasimi: peste.grasimi ?? NUTRITIE.grasimi,
    carbohidrati: peste.carbohidrati ?? NUTRITIE.carbohidrati,
    fibre: peste.fibre ?? NUTRITIE.fibre,
    tip_masa: peste.tip_masa ?? 'pranz',
  });

/** Client care întoarce rândurile persistate cunoscute, indexate după id. */
function clientCu(randuri: Record<string, unknown>[], eroareCitire: unknown = null) {
  const index = new Map(randuri.map((r) => [String(r.id), r]));
  return {
    from: () => ({
      select: () => ({
        eq: (_c: string, valoare: string) => ({
          maybeSingle: async () => ({
            data: eroareCitire ? null : (index.get(valoare) ?? null),
            error: eroareCitire,
          }),
        }),
      }),
    }),
  } as never;
}

describe('P1-01 — decizia pe 23505 este una singură, pentru toate căile', () => {
  test('1. fără eroare → succes', async () => {
    const p = manual('OP-1');
    const d = await decideRezultatInsertMasa(clientCu([p]), p, { error: null });
    expect(d.tip).toBe('succes');
  });

  test('2. 23505 + rând identic → reluare confirmată (succes permis)', async () => {
    const p = manual('OP-1');
    const d = await decideRezultatInsertMasa(clientCu([{ ...p }]), p, EROARE_23505);
    expect(d.tip).toBe('reluare_confirmata');
  });

  test('3. 23505 + ALTE valori nutriționale → conflict, NU succes', async () => {
    const trimis = manual('OP-1', { calorii: 650 });
    const persistat = manual('OP-1', { calorii: 500 });
    const d = await decideRezultatInsertMasa(clientCu([persistat]), trimis, EROARE_23505);
    expect(d.tip).toBe('conflict_continut');
  });

  test('4. 23505 + ALTĂ categorie (mic dejun vs cină) → conflict', async () => {
    const trimis = manual('OP-1', { tip_masa: 'cina' });
    const persistat = { ...manual('OP-1'), tip_masa: 'mic_dejun' };
    const d = await decideRezultatInsertMasa(clientCu([persistat]), trimis, EROARE_23505);
    expect(d.tip).toBe('conflict_continut');
  });

  test('5. 23505 + rândul nu poate fi citit → verificare eșuată, niciodată succes', async () => {
    const p = manual('OP-1');
    const d = await decideRezultatInsertMasa(clientCu([p], { message: 'network' }), p, EROARE_23505);
    expect(d.tip).toBe('verificare_esuata');
  });

  test('6. eroare structurată de server (RLS 42501) rămâne eroare de server', async () => {
    const p = manual('OP-1');
    const d = await decideRezultatInsertMasa(clientCu([]), p, { error: { code: '42501', message: 'RLS' } });
    expect(d.tip).toBe('eroare_server');
  });

  test('7. eroare de transport rămâne „offline" (ramura generică neatinsă)', async () => {
    const p = manual('OP-1');
    const d = await decideRezultatInsertMasa(clientCu([]), p, new Error('Network request failed'));
    expect(d.tip).toBe('offline');
  });
});

describe('P1-01 — chat: propunere cu mai multe alimente', () => {
  const items = [
    { name: 'Iaurt', qty: 200, unit: 'g', kcal: 150, protein_g: 15, carbs_g: 6, fat_g: 7, fiber_g: 0 },
    { name: 'Banană', qty: 120, unit: 'g', kcal: 105, protein_g: 1, carbs_g: 27, fat_g: 0, fiber_g: 3 },
  ];
  const randuriChat = (idOperatie: string, peste: Partial<typeof items[0]> = {}) =>
    construiesteRinduriMasaChat({
      user_id: 'user-a',
      items: items.map((it) => ({ ...it, ...peste })),
      now: new Date('2026-09-16T09:00:00'),
      meal_type: 'mic_dejun',
      idOperatie,
    });

  test('8. toate rândurile corespund → reluare confirmată', async () => {
    const randuri = randuriChat('OP-CHAT');
    const d = await decideRezultatInsertMasa(clientCu(randuri as never), randuri as never, EROARE_23505);
    expect(d.tip).toBe('reluare_confirmata');
  });

  test('9. UN SINGUR rând diferă → conflict pentru întreaga propunere', async () => {
    const persistate = randuriChat('OP-CHAT');
    const trimise = randuriChat('OP-CHAT');
    // Al doilea aliment a fost modificat între încercări.
    (trimise[1] as unknown as Record<string, unknown>).calorii = 999;

    const d = await decideRezultatInsertMasa(clientCu(persistate as never), trimise as never, EROARE_23505);
    expect(d.tip).toBe('conflict_continut');
  });

  test('10. un rând lipsă din bază → verificare eșuată, nu succes', async () => {
    const persistate = randuriChat('OP-CHAT');
    const trimise = randuriChat('OP-CHAT');
    const d = await decideRezultatInsertMasa(clientCu([persistate[0]] as never), trimise as never, EROARE_23505);
    expect(d.tip).toBe('verificare_esuata');
  });
});
