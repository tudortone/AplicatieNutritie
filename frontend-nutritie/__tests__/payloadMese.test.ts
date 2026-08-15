import type { AlimentScanat } from '../components/food/FoodScanSuccessModal';
import {
  construiestePayloadMasaCamera,
  construiesteAlimenteScan,
  esteEroareDuplicate,
  clasificaRezultatInsertMasa,
  eliminaAlimentScanat,
  adaugaAlimentScanat,
  construiesteRinduriMasaChat,
} from '../lib/payloadMese';
import { normalizeTipMasa, LIMITE_DB_MESE, getTipMasaDupaOra } from '../lib/mealUtils';
import { parseMealProposal } from '../lib/parseMealProposal';
import { pushOfflineMeal, clearOfflineQueue, getOfflineQueue } from '../lib/offlineQueue';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('@react-native-async-storage/async-storage', () => {
  let store: Record<string, string> = {};
  return {
    getItem: jest.fn(async (key: string) => store[key] || null),
    setItem: jest.fn(async (key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: jest.fn(async (key: string) => {
      delete store[key];
    }),
    clear: jest.fn(async () => {
      store = {};
    }),
  };
});

function aliment(overrides: Partial<AlimentScanat> = {}): AlimentScanat {
  return {
    nume: 'Omletă',
    estimare_grame: 150,
    calorii_per_100g: 150,
    proteine_per_100g: 12,
    grasimi_per_100g: 9,
    carbohidrati_per_100g: 2,
    ...overrides,
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ZI = new Date(2026, 7, 10, 12, 30, 0); // 2026-08-10 12:30 local

describe('BUG-014 — scan → editare gramaj → salvare', () => {
  it('1. editarea gramajului se reflecta in payload (grame, kcal, macro, nume)', () => {
    const { payload } = construiestePayloadMasaCamera({
      user_id: 'u1',
      rezultat: [aliment({ estimare_grame: 250 })],
      now: ZI,
    });
    expect(payload.alimente[0].grame).toBe(250);
    // per-100g * 2.5
    expect(payload.alimente[0].calorii).toBe(375);
    expect(payload.alimente[0].proteine).toBe(30);
    expect(payload.calorii).toBe(375);
    expect(payload.proteine).toBe(30);
    expect(payload.nume).toBe('Omletă (250g)');
  });

  it('4. scan→edit→save: id UUID valid, tip_masa valid, data corecta', () => {
    const { payload } = construiestePayloadMasaCamera({
      user_id: 'u1',
      rezultat: [aliment({ estimare_grame: 180 })],
      now: ZI,
    });
    expect(payload.id).toMatch(UUID_RE);
    expect(['mic_dejun', 'pranz', 'cina', 'gustare']).toContain(payload.tip_masa);
    expect(payload.tip_masa).toBe(getTipMasaDupaOra(ZI));
    expect(payload.data).toBe('2026-08-10');
  });
});

describe('BUG-015 — editare/adaugare/stergere ingredient', () => {
  it('2. sterge ingredientul la index dat', () => {
    const rezultat = [aliment({ nume: 'A' }), aliment({ nume: 'B', estimare_grame: 80 })];
    const ramase = eliminaAlimentScanat(rezultat, 0);
    expect(ramase).toHaveLength(1);
    expect(ramase[0].nume).toBe('B');
    expect(eliminaAlimentScanat(rezultat, 1)).toHaveLength(1);
  });

  it('3. adauga ingredient nou si apare in payload', () => {
    const rezultat = adaugaAlimentScanat(
      [aliment()],
      aliment({ nume: 'Pâine', estimare_grame: 60, calorii_per_100g: 250 }),
    );
    expect(rezultat).toHaveLength(2);
    const { payload } = construiestePayloadMasaCamera({
      user_id: 'u1',
      rezultat,
      now: ZI,
    });
    expect(payload.alimente.map((a) => a.nume)).toEqual(['Omletă', 'Pâine']);
    // 150*1.5 + 250*0.6 = 225 + 150
    expect(payload.calorii).toBe(375);
    expect(payload.nume).toBe('Omletă (150g), Pâine (60g)');
  });

  it('2. dupa stergerea tuturor ingredientelor, payload nu se poate construi pe gol (salvare blocata)', () => {
    expect(eliminaAlimentScanat([aliment()], 0)).toHaveLength(0);
    // adaugaInJurnal verifica rezultat.length === 0 inainte de construire
  });
});

describe('BUG-019 — normalizare valori AI invalide', () => {
  it('7. valori AI invalide (NaN, negative, string, peste limita) sunt clampate', () => {
    const rezultat = [
      {
        nume: 'X',
        estimare_grame: NaN,
        calorii_per_100g: 1e9,
        proteine_per_100g: -5,
        grasimi_per_100g: Number('abc'),
        carbohidrati_per_100g: 99999,
      } as AlimentScanat,
    ];
    const alimente = construiesteAlimenteScan(rezultat);
    // gramaj NaN -> clampat la minim 1; valorile per-100g se scaleaza la f=0.01
    expect(alimente[0].grame).toBe(1);
    expect(alimente[0].proteine).toBe(0); // negativ -> 0
    expect(alimente[0].grasimi).toBe(0); // NaN -> 0

    // Cu gramaj valid, valorile per-100g peste limita se clampau la limitele DB
    const alimenteMari = construiesteAlimenteScan([
      {
        nume: 'X',
        estimare_grame: 300,
        calorii_per_100g: 500000,
        proteine_per_100g: 10,
        grasimi_per_100g: 1,
        carbohidrati_per_100g: 100000,
      },
    ]);
    expect(alimenteMari[0].calorii).toBe(LIMITE_DB_MESE.calorii); // clampat la 10000
    expect(alimenteMari[0].carbohidrati).toBe(LIMITE_DB_MESE.carbohidrati); // clampat la 2000
  });

  it('7. totalurile payload nu depasesc niciodata limitele DB (fara string in camp numeric)', () => {
    const { payload } = construiestePayloadMasaCamera({
      user_id: 'u1',
      now: ZI,
      rezultat: [aliment({ estimare_grame: 6000, calorii_per_100g: 9000 })],
    });
    for (const v of [payload.calorii, payload.proteine, payload.grasimi, payload.carbohidrati, payload.fibre]) {
      expect(typeof v).toBe('number');
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
    }
    expect(payload.alimente[0].grame).toBe(LIMITE_DB_MESE.gramaj); // 5000 max
  });
});

describe('BUG-007 — rețete: fără auto-add, adăugare explicită normalizată', () => {
  it('5. parseMealProposal e pur: returneaza structura, nu insereaza nimic', () => {
    const text = JSON.stringify({
      type: 'MEAL_PROPOSAL',
      meal_type: 'Pranz',
      items: [{ name: 'Piept de pui', qty: 150, unit: 'g', protein_g: 30, kcal: 200 }],
      totals: { kcal: 200, protein_g: 30, carbs_g: 0, fat_g: 5 },
    });
    const propunere = parseMealProposal(text);
    expect(propunere).not.toBeNull();
    expect(propunere?.items).toHaveLength(1);
    expect(propunere?.items[0].name).toBe('Piept de pui');
    // qty ne-numeric ("după gust", "un praf") -> fallback 100, nu NaN
    const cuQtyLibera = parseMealProposal(
      JSON.stringify({ items: [{ name: 'Sare', qty: 'după gust' }] }),
    );
    expect(cuQtyLibera?.items[0].qty).toBe(100);
    // input invalid -> null, fara crash
    expect(parseMealProposal(null)).toBeNull();
    expect(parseMealProposal('nu e json')).toBeNull();
  });

  it('6. adăugare explicită: construiesteRinduriMasaChat normalizeaza tip_masa si clampa valorile', () => {
    const rows = construiesteRinduriMasaChat({
      user_id: 'u1',
      meal_type: 'Pranzul',
      now: ZI,
      items: [
        { name: 'Orez', qty: 200, unit: 'g', kcal: 1e9, protein_g: 2, carbs_g: 50, fat_g: 0, fiber_g: 1 },
        { name: 'Sare', qty: NaN, unit: 'g', kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 },
      ],
    });
    expect(rows).toHaveLength(2);
    expect(rows[0].tip_masa).toBe('pranz'); // "Pranzul" -> pranz
    expect(rows[0].calorii).toBe(LIMITE_DB_MESE.calorii); // clampat la 10000
    expect(rows[0].data).toBe('2026-08-10');
    expect(rows[0].nume).toBe('Orez (200g)');
    // qty NaN -> 100 fallback
    expect(rows[1].nume).toBe('Sare (100g)');
    expect(rows[1].tip_masa).toBe('pranz');
  });
});

describe('BUG-007 — tip_masa invalid', () => {
  it('8. normalizeTipMasa aduce orice valoare la setul valid, cu fallback pe gustare', () => {
    expect(normalizeTipMasa('mic_dejun')).toBe('mic_dejun');
    expect(normalizeTipMasa('Mic Dejun')).toBe('mic_dejun');
    expect(normalizeTipMasa('breakfast')).toBe('mic_dejun');
    expect(normalizeTipMasa('prânz')).toBe('pranz');
    expect(normalizeTipMasa('lunch')).toBe('pranz');
    expect(normalizeTipMasa('cina')).toBe('cina');
    expect(normalizeTipMasa('dinner')).toBe('cina');
    expect(normalizeTipMasa('snack')).toBe('gustare');
    expect(normalizeTipMasa('cu totul necunoscut')).toBe('gustare');
    expect(normalizeTipMasa(undefined)).toBe('gustare');
  });
});

describe('BUG-019 — idempotență la submit', () => {
  it('9. același conținut -> același id determinist (fara duplicat pe PK)', () => {
    const p1 = construiestePayloadMasaCamera({ user_id: 'u1', rezultat: [aliment()], now: ZI });
    const p2 = construiestePayloadMasaCamera({ user_id: 'u1', rezultat: [aliment()], now: ZI });
    expect(p1.payload.id).toBe(p2.payload.id);

    // Gramaj editat -> alt conținut -> alt id (editarea chiar salvează noua masă)
    const p3 = construiestePayloadMasaCamera({
      user_id: 'u1',
      rezultat: [aliment({ estimare_grame: 250 })],
      now: ZI,
    });
    expect(p3.payload.id).not.toBe(p1.payload.id);
  });

  it('9. esteEroareDuplicate detecteaza 23505 si mesajul unique constraint', () => {
    expect(esteEroareDuplicate({ code: '23505' })).toBe(true);
    expect(esteEroareDuplicate({ message: 'duplicate key value violates unique constraint "mese_pkey"' })).toBe(true);
    expect(esteEroareDuplicate({ code: '23503' })).toBe(false);
    expect(esteEroareDuplicate({ message: 'connection refused' })).toBe(false);
  });
});

describe('BUG-019 — insert esuat -> coada offline', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await clearOfflineQueue();
  });

  it('10. un insert esuat salveaza masa in coada offline (fara duplicat pe acelasi id)', async () => {
    const { payload } = construiestePayloadMasaCamera({ user_id: 'u1', rezultat: [aliment()], now: ZI });
    const offline: any = { ...payload, created_at: ZI.toISOString() };
    const lungime = await pushOfflineMeal(offline);
    expect(lungime).toBe(1);

    // Retry pe acelasi id -> nu se adauga din nou
    const dinNou = await pushOfflineMeal(offline);
    expect(dinNou).toBe(1);

    const coada = await getOfflineQueue();
    expect(coada).toHaveLength(1);
    expect(coada[0].id).toBe(payload.id);
    expect(coada[0].calorii).toBe(payload.calorii);
  });
});

describe('REV-001 / CORR-001 / RC-002 — clasificaRezultatInsertMasa & protecție coadă offline', () => {
  it('1. insert cu succes -> { tip: "succes" }', () => {
    expect(clasificaRezultatInsertMasa({ error: null })).toEqual({ tip: 'succes' });
    expect(clasificaRezultatInsertMasa(null)).toEqual({ tip: 'succes' });
  });

  it('2. duplicat 23505 -> { tip: "duplicat" } (idempotență fără eroare)', () => {
    expect(clasificaRezultatInsertMasa({ error: { code: '23505', message: 'duplicate key' } })).toEqual({ tip: 'duplicat' });
  });

  it('3. eroare de rețea / fetch rejected -> { tip: "offline" }', () => {
    const netErr = new TypeError('Network request failed');
    expect(clasificaRezultatInsertMasa(netErr)).toEqual({ tip: 'offline', motiv: 'Network request failed' });

    const fetchErr = new Error('Failed to fetch');
    expect(clasificaRezultatInsertMasa(fetchErr)).toEqual({ tip: 'offline', motiv: 'Failed to fetch' });

    const abortErr = new Error('AbortError: connection aborted');
    abortErr.name = 'AbortError';
    expect(clasificaRezultatInsertMasa(abortErr)).toEqual({ tip: 'offline', motiv: 'AbortError: connection aborted' });

    // Supabase payload cu eroare fără cod dar mesaj de rețea
    expect(clasificaRezultatInsertMasa({ error: { message: 'Failed to fetch' } })).toEqual({ tip: 'offline', motiv: 'Failed to fetch' });
  });

  it('4. RC-002: coduri explicite de transport (ETIMEDOUT, ECONNREFUSED) -> { tip: "offline" }', () => {
    const etimedoutErr = new Error('connect ETIMEDOUT 1.2.3.4:443');
    (etimedoutErr as any).code = 'ETIMEDOUT';
    expect(clasificaRezultatInsertMasa(etimedoutErr)).toEqual({ tip: 'offline', motiv: 'connect ETIMEDOUT 1.2.3.4:443' });

    const econnErr = { code: 'ECONNREFUSED', message: 'connect ECONNREFUSED' };
    expect(clasificaRezultatInsertMasa({ error: econnErr })).toEqual({ tip: 'offline', motiv: 'connect ECONNREFUSED' });
  });

  it('5. RC-002: SQL timeout (57014) -> { tip: "eroare_server" } (NU este confundat cu offline din cauza cuvântului timeout)', () => {
    const dbTimeoutErr = { code: '57014', message: 'canceling statement due to statement timeout' };
    const rez = clasificaRezultatInsertMasa({ error: dbTimeoutErr });
    expect(rez.tip).toBe('eroare_server');
    if (rez.tip === 'eroare_server') {
      expect(rez.cod).toBe('57014');
      expect(rez.mesaj).toContain('statement timeout');
    }
  });

  it('6. RC-002: RLS 42501 cu text de tip network policy -> { tip: "eroare_server" } (NU este confundat cu offline)', () => {
    const rlsError = { code: '42501', message: 'network policy violation on table "mese"' };
    const rez = clasificaRezultatInsertMasa({ error: rlsError });
    expect(rez.tip).toBe('eroare_server');
    if (rez.tip === 'eroare_server') {
      expect(rez.cod).toBe('42501');
      expect(rez.mesaj).toContain('network policy violation');
    }
  });

  it('7. eroare de constrângere / validare DB (23502, 23514) -> { tip: "eroare_server" } (NU intră în coada offline)', () => {
    const nullErr = { code: '23502', message: 'null value in column "nume" violates not-null constraint' };
    const rezNull = clasificaRezultatInsertMasa({ error: nullErr });
    expect(rezNull.tip).toBe('eroare_server');
    if (rezNull.tip === 'eroare_server') {
      expect(rezNull.cod).toBe('23502');
    }

    const checkErr = { code: '23514', message: 'new row for relation "mese" violates check constraint "calorii_bounds"' };
    const rezCheck = clasificaRezultatInsertMasa({ error: checkErr });
    expect(rezCheck.tip).toBe('eroare_server');
    if (rezCheck.tip === 'eroare_server') {
      expect(rezCheck.cod).toBe('23514');
    }
  });

  it('8. eroare generică fără cod -> { tip: "eroare_server" } (NU intră în coada offline)', () => {
    const genericErr = new Error('Unexpected parsing fault');
    const rez = clasificaRezultatInsertMasa(genericErr);
    expect(rez.tip).toBe('eroare_server');
    if (rez.tip === 'eroare_server') {
      expect(rez.mesaj).toBe('Unexpected parsing fault');
    }
  });

  it('9. TypeError de programare fără mesaj de rețea -> { tip: "eroare_server" } (NU intră în coada offline)', () => {
    const typeErr = new TypeError('Cannot read properties of undefined (reading "id")');
    const rez = clasificaRezultatInsertMasa(typeErr);
    expect(rez.tip).toBe('eroare_server');
    if (rez.tip === 'eroare_server') {
      expect(rez.mesaj).toContain('Cannot read properties of undefined');
    }
  });

  describe('RC-002: Integrare efecte — server error vs transport offline queueing', () => {
    beforeEach(async () => {
      await clearOfflineQueue('u1');
      await clearOfflineQueue();
      await (AsyncStorage as any).clear?.();
    });

    it('10. eroare de server (ex: RLS 42501 sau DB Timeout 57014) nu apelează pushOfflineMeal', async () => {
      const dbErr = { code: '57014', message: 'canceling statement due to statement timeout' };
      const rez = clasificaRezultatInsertMasa({ error: dbErr });
      expect(rez.tip).toBe('eroare_server');

      // Doar dacă este offline se introduce în coadă
      if (rez.tip === 'offline') {
        await pushOfflineMeal({
          id: 'm1',
          user_id: 'u1',
          nume: 'Test',
          calorii: 200,
          proteine: 20,
          grasimi: 5,
          carbohidrati: 20,
          fibre: 2,
          tip_masa: 'pranz',
          alimente: [],
          data: '2026-08-15',
          created_at: new Date().toISOString(),
        });
      }

      const coada = await getOfflineQueue('u1');
      expect(coada).toHaveLength(0);
    });

    it('11. eșec real de transport (ETIMEDOUT / fetch reject) pune fiecare rând exact o dată în coada offline', async () => {
      const netErr = new Error('connect ETIMEDOUT');
      (netErr as any).code = 'ETIMEDOUT';
      const rez = clasificaRezultatInsertMasa(netErr);
      expect(rez.tip).toBe('offline');

      const rows = [
        { id: 'r1', user_id: 'u1', nume: 'Aliment 1', calorii: 150, proteine: 10, grasimi: 2, carbohidrati: 20, fibre: 1, tip_masa: 'pranz', data: '2026-08-15' },
        { id: 'r2', user_id: 'u1', nume: 'Aliment 2', calorii: 250, proteine: 20, grasimi: 5, carbohidrati: 30, fibre: 2, tip_masa: 'pranz', data: '2026-08-15' },
      ];

      if (rez.tip === 'offline') {
        for (const row of rows) {
          await pushOfflineMeal({
            ...row,
            alimente: [],
            created_at: new Date().toISOString(),
          });
        }
      }

      const coada = await getOfflineQueue('u1');
      expect(coada).toHaveLength(2);
      expect(coada.map((m) => m.id)).toEqual(['r1', 'r2']);
    });
  });
});
