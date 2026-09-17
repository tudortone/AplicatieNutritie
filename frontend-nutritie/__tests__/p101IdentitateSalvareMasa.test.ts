import {
  construiesteRinduriMasaChat,
  construiestePayloadMasaCamera,
  esteEroareDuplicate,
} from '../lib/payloadMese';
import { idMasaDinOperatie, MAX_LUNGIME_ID_OPERATIE } from '../lib/idUtils';

/**
 * P1-01 — identitatea LOGICĂ a unei salvări de masă.
 *
 * ==========================================================================
 * REGULA
 * ==========================================================================
 * Identitatea unui rând `mese` trebuie să vină din ACȚIUNEA de salvare
 * (un `idOperatie` generat o singură dată la apăsarea butonului), NU din
 * conținutul mesei.
 *
 *   mese.id = uuidDeterminist(`${user_id}|${idOperatie}`)
 *
 * Consecințe cerute:
 *   - aceeași acțiune reluată (timeout, retry, replay din coadă) → același id
 *     → coliziune pe PK (23505) → UN singur rând;
 *   - două acțiuni deliberate cu conținut identic → id-uri diferite → DOUĂ rânduri.
 *
 * Înainte, chat-ul și camera derivau id-ul din conținut
 * (`user|tip|zi|nume|gramaj`), ceea ce bloca a doua masă identică intenționată.
 */

const ITEM = { name: 'Iaurt grecesc', qty: 200, unit: 'g', kcal: 150, protein_g: 15, carbs_g: 6, fat_g: 7, fiber_g: 0 };
const SCAN = {
  user_id: 'user-a',
  rezultat: [{ nume: 'Omletă', estimare_grame: 150, calorii_per_100g: 150, proteine_per_100g: 11, grasimi_per_100g: 11, carbohidrati_per_100g: 1 }],
  now: new Date('2026-09-16T09:00:00'),
} as unknown as Parameters<typeof construiestePayloadMasaCamera>[0];

describe('P1-01 — două mese INTENȚIONAT identice trebuie să producă două rânduri', () => {
  test('1. CHAT: același iaurt salvat de două ori deliberat → identități DIFERITE', () => {
    const comun = { user_id: 'user-a', items: [ITEM], now: new Date('2026-09-16T09:00:00'), meal_type: 'mic_dejun' };

    const primaSalvare = construiesteRinduriMasaChat({ ...comun, idOperatie: 'OP-1' });
    const aDouaSalvare = construiesteRinduriMasaChat({ ...comun, idOperatie: 'OP-2' });

    expect(aDouaSalvare[0].id).not.toBe(primaSalvare[0].id);
  });

  test('2. CAMERĂ: aceeași farfurie scanată și salvată de două ori → identități DIFERITE', () => {
    const prima = construiestePayloadMasaCamera({ ...SCAN, idOperatie: 'OP-1' }).payload;
    const aDoua = construiestePayloadMasaCamera({ ...SCAN, idOperatie: 'OP-2' }).payload;

    expect(aDoua.id).not.toBe(prima.id);
  });
});

describe('P1-01 — reluarea ACELEIAȘI acțiuni logice păstrează o singură identitate', () => {
  test('3. CHAT: același idOperatie → același id de rând', () => {
    const comun = { user_id: 'user-a', items: [ITEM], now: new Date('2026-09-16T09:00:00'), meal_type: 'mic_dejun', idOperatie: 'OP-1' };

    // A doua încercare simulează un retry de transport: alt moment, același gest.
    const incercare1 = construiesteRinduriMasaChat(comun);
    const incercare2 = construiesteRinduriMasaChat({ ...comun, now: new Date('2026-09-16T09:00:31') });

    expect(incercare2[0].id).toBe(incercare1[0].id);
  });

  test('4. CAMERĂ: același idOperatie → același id de rând', () => {
    const prima = construiestePayloadMasaCamera({ ...SCAN, idOperatie: 'OP-7' }).payload;
    const aDoua = construiestePayloadMasaCamera({ ...SCAN, now: new Date('2026-09-16T09:02:00'), idOperatie: 'OP-7' }).payload;

    expect(aDoua.id).toBe(prima.id);
  });

  test('5. identitatea NU mai depinde de conținut: același idOperatie, alt conținut → același id', () => {
    // Dovada că sursa identității s-a mutat pe operație. Un payload diferit sub
    // aceeași operație NU devine o masă nouă — prima scriere rămâne autoritatea.
    const baza = { user_id: 'user-a', now: new Date('2026-09-16T09:00:00'), idOperatie: 'OP-9' };
    const unu = construiesteRinduriMasaChat({ ...baza, items: [ITEM] });
    const doi = construiesteRinduriMasaChat({ ...baza, items: [{ ...ITEM, name: 'Banană', kcal: 90 }] });

    expect(doi[0].id).toBe(unu[0].id);
  });
});

describe('P1-01 — izolare între conturi (P0-02/P0-08 păstrate)', () => {
  test('6. același idOperatie la doi utilizatori → identități DIFERITE', () => {
    const comun = { items: [ITEM], now: new Date('2026-09-16T09:00:00'), idOperatie: 'OP-PARTAJAT' };
    const a = construiesteRinduriMasaChat({ ...comun, user_id: 'user-a' });
    const b = construiesteRinduriMasaChat({ ...comun, user_id: 'user-b' });

    expect(a[0].id).not.toBe(b[0].id);
  });

  test('7. identitatea derivă din utilizator + operație, verificabil direct', () => {
    expect(idMasaDinOperatie('user-a', 'OP-1')).toBe(idMasaDinOperatie('user-a', 'OP-1'));
    expect(idMasaDinOperatie('user-a', 'OP-1')).not.toBe(idMasaDinOperatie('user-b', 'OP-1'));
    expect(idMasaDinOperatie('user-a', 'OP-1')).not.toBe(idMasaDinOperatie('user-a', 'OP-2'));
    expect(idMasaDinOperatie('user-a', 'OP-1')).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('P1-01 — o acțiune cu mai multe alimente rămâne stabilă rând cu rând', () => {
  test('8. fiecare rând are identitate proprie, dar stabilă la reluare', () => {
    const items = [ITEM, { ...ITEM, name: 'Banană', qty: 120 }, { ...ITEM, name: 'Miere', qty: 20 }];
    const comun = { user_id: 'user-a', items, now: new Date('2026-09-16T09:00:00'), idOperatie: 'OP-MULTI' };

    const prima = construiesteRinduriMasaChat(comun);
    const reluare = construiesteRinduriMasaChat(comun);

    expect(prima).toHaveLength(3);
    expect(new Set(prima.map((r) => r.id)).size).toBe(3); // rânduri distincte
    expect(reluare.map((r) => r.id)).toEqual(prima.map((r) => r.id)); // stabile la retry
  });

  test('9. două acțiuni distincte pe aceeași listă → niciun id comun', () => {
    const items = [ITEM, { ...ITEM, name: 'Banană', qty: 120 }];
    const baza = { user_id: 'user-a', items, now: new Date('2026-09-16T09:00:00') };

    const a = construiesteRinduriMasaChat({ ...baza, idOperatie: 'OP-A' }).map((r) => r.id);
    const b = construiesteRinduriMasaChat({ ...baza, idOperatie: 'OP-B' }).map((r) => r.id);

    expect(a.some((id) => b.includes(id))).toBe(false);
  });
});

describe('P1-01 — id de operație invalid: comportament sigur, fără identitate instabilă', () => {
  test('10. idOperatie lipsă → se cade pe o identitate generată, nu pe undefined', () => {
    const rinduri = construiesteRinduriMasaChat({ user_id: 'user-a', items: [ITEM], now: new Date('2026-09-16T09:00:00') });
    expect(rinduri[0].id).toMatch(/^[0-9a-f-]{36}$/);
  });

  test('11. idOperatie supradimensionat este respins', () => {
    expect(() => idMasaDinOperatie('user-a', 'x'.repeat(MAX_LUNGIME_ID_OPERATIE + 1))).toThrow();
  });

  test('12. idOperatie gol sau ne-șir este respins', () => {
    expect(() => idMasaDinOperatie('user-a', '')).toThrow();
    expect(() => idMasaDinOperatie('user-a', '   ')).toThrow();
    expect(() => idMasaDinOperatie('', 'OP-1')).toThrow();
  });
});

describe('P1-01 — contract existent păstrat', () => {
  test('13. detectarea coliziunii de cheie primară acoperă formele reale de eroare', () => {
    expect(esteEroareDuplicate({ code: '23505' })).toBe(true);
    expect(esteEroareDuplicate({ message: 'duplicate key value violates unique constraint' })).toBe(true);
    expect(esteEroareDuplicate({ code: '23503' })).toBe(false);
    expect(esteEroareDuplicate(null)).toBe(false);
  });
});
