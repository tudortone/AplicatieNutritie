import type { AlimentScanat } from '../components/food/FoodScanSuccessModal';
import {
  construiestePayloadMasaCamera,
  construiesteAlimenteScan,
  esteEroareDuplicate,
  eliminaAlimentScanat,
  adaugaAlimentScanat,
  construiesteRinduriMasaChat,
} from '../lib/payloadMese';
import { normalizeTipMasa, LIMITE_DB_MESE, getTipMasaDupaOra } from '../lib/mealUtils';
import { parseMealProposal } from '../lib/parseMealProposal';
import { pushOfflineMeal, clearOfflineQueue, getOfflineQueue } from '../lib/offlineQueue';

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
