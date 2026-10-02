/**
 * F-02 — izolarea datelor de onboarding intre conturi pe acelasi dispozitiv.
 *
 * Defectul original: `nutriai-onboarding-date` (raspunsurile brute din
 * chestionar) era o zona de staging GLOBALA, care nu era stearsa niciodata.
 * `sincronizeazaOnboardingLaProfil` rula la fiecare aplicare de sesiune si
 * scria acel blob in profilul oricarui utilizator care se autentifica ulterior:
 * greutatea/inaltimea/sexul lui A ajungeau in contul lui B, cu tinte calorice
 * calculate din datele altcuiva.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  CHEIE_ONBOARDING,
  salveazaDateOnboarding,
  incarcaDateOnboarding,
  sincronizeazaOnboardingLaProfil,
  calculeazaPlan,
  type DateOnboarding,
} from '../lib/onboarding';
import { clearLocalUserData, prepareLocalDataForUser } from '../lib/userDataCleanup';

jest.mock('@react-native-async-storage/async-storage', () => {
  let store: Record<string, string> = {};
  return {
    __store: () => store,
    getItem: jest.fn(async (k: string) => store[k] ?? null),
    setItem: jest.fn(async (k: string, v: string) => { store[k] = v; }),
    removeItem: jest.fn(async (k: string) => { delete store[k]; }),
    multiSet: jest.fn(async (pairs: [string, string][]) => {
      for (const [k, v] of pairs) store[k] = v;
    }),
    multiRemove: jest.fn(async (keys: string[]) => { for (const k of keys) delete store[k]; }),
    multiGet: jest.fn(async (keys: string[]) => keys.map((k) => [k, store[k] ?? null])),
    getAllKeys: jest.fn(async () => Object.keys(store)),
    clear: jest.fn(async () => { store = {}; }),
  };
});

const DATE_A: DateOnboarding = {
  gen: 'masculin',
  dataNasterii: '1990-05-10',
  inaltimeCm: 185,
  greutateKg: 90,
  scop: 'slabire',
  greutateTintaKg: 80,
  activitate: 'intens',
  ritmKgSaptamana: 0.5,
  dieta: 'bogata_proteine',
};

const DATE_B: DateOnboarding = {
  gen: 'feminin',
  dataNasterii: '2000-01-20',
  inaltimeCm: 160,
  greutateKg: 55,
  scop: 'masa',
  greutateTintaKg: 60,
  activitate: 'sedentar',
  ritmKgSaptamana: 0.25,
  dieta: 'vegana',
};

/**
 * Client Supabase fals: retine ultimul upsert per user_id si raspunde la
 * verificarea „exista deja profil?" pe baza a ceea ce s-a scris pana acum.
 */
function creeazaSupabaseFals(profiluriInitiale: Record<string, any> = {}) {
  const profiluri: Record<string, any> = { ...profiluriInitiale };
  return {
    profiluri,
    from: () => ({
      upsert: async (payload: any) => {
        profiluri[payload.user_id] = { ...payload };
        return { error: null };
      },
      select: () => ({
        eq: (_coloana: string, valoare: string) => ({
          maybeSingle: async () => ({
            data: profiluri[valoare] ? { user_id: valoare } : null,
            error: null,
          }),
        }),
      }),
    }),
  };
}

const CHEI_TINTE = ['caloriiTinta', 'proteineTinta', 'carbiTinta', 'grasimiTinta'];

async function citesteTinteLocale() {
  const out: Record<string, string | null> = {};
  for (const k of CHEI_TINTE) out[k] = await AsyncStorage.getItem(k);
  return out;
}

describe('F-02 — izolarea onboarding-ului intre conturi', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  it('datele lui A nu ajung in profilul lui B dupa logout/login', async () => {
    const supabase = creeazaSupabaseFals();

    // --- USER A: parcurge chestionarul si se autentifica ---
    await salveazaDateOnboarding(DATE_A);
    await prepareLocalDataForUser('user-A');
    const okA = await sincronizeazaOnboardingLaProfil('user-A', supabase);
    expect(okA).toBe(true);

    const profilA = supabase.profiluri['user-A'];
    expect(profilA).toBeDefined();
    expect(profilA.greutate).toBe(90);
    expect(profilA.inaltime).toBe(185);
    expect(profilA.sex).toBe('masculin');

    // --- LOGOUT A ---
    await clearLocalUserData();

    // Blob-ul de staging nu mai exista dupa sincronizare + logout.
    expect(await AsyncStorage.getItem(CHEIE_ONBOARDING)).toBeNull();

    // --- USER B se autentifica pe acelasi dispozitiv, FARA sa faca onboarding ---
    await prepareLocalDataForUser('user-B');
    const okB = await sincronizeazaOnboardingLaProfil('user-B', supabase);

    // Nu exista date de onboarding pentru B -> nu se scrie nimic in profilul lui.
    expect(okB).toBe(false);
    expect(supabase.profiluri['user-B']).toBeUndefined();

    // Profilul lui A ramane neatins.
    expect(supabase.profiluri['user-A'].greutate).toBe(90);
  });

  it('B care isi face propriul onboarding primeste EXCLUSIV datele lui', async () => {
    const supabase = creeazaSupabaseFals();

    await salveazaDateOnboarding(DATE_A);
    await prepareLocalDataForUser('user-A');
    await sincronizeazaOnboardingLaProfil('user-A', supabase);
    await clearLocalUserData();

    // B completeaza propriul chestionar.
    await salveazaDateOnboarding(DATE_B);
    await prepareLocalDataForUser('user-B');
    await sincronizeazaOnboardingLaProfil('user-B', supabase);

    const a = supabase.profiluri['user-A'];
    const b = supabase.profiluri['user-B'];

    // Niciun camp din onboarding-ul lui A nu apare la B.
    expect(b.greutate).toBe(55);
    expect(b.inaltime).toBe(160);
    expect(b.sex).toBe('feminin');
    expect(b.obiectiv).toBe('masa');
    expect(b.greutate).not.toBe(a.greutate);
    expect(b.inaltime).not.toBe(a.inaltime);
    expect(b.sex).not.toBe(a.sex);
    expect(b.calorii_tinta).not.toBe(a.calorii_tinta);

    // Tintele lui B corespund matematic propriilor date.
    const planB = calculeazaPlan(DATE_B)!;
    expect(b.calorii_tinta).toBe(planB.calorii);
    expect(b.proteine_tinta).toBe(planB.proteineG);
  });

  it('A -> B -> A: revenirea lui A nu reaplica datele lui B si nici invers', async () => {
    const supabase = creeazaSupabaseFals();

    await salveazaDateOnboarding(DATE_A);
    await prepareLocalDataForUser('user-A');
    await sincronizeazaOnboardingLaProfil('user-A', supabase);
    const caloriiA = supabase.profiluri['user-A'].calorii_tinta;
    await clearLocalUserData();

    await salveazaDateOnboarding(DATE_B);
    await prepareLocalDataForUser('user-B');
    await sincronizeazaOnboardingLaProfil('user-B', supabase);
    await clearLocalUserData();

    // A revine: nu mai exista blob, deci profilul lui nu e rescris cu date B.
    await prepareLocalDataForUser('user-A');
    const okA2 = await sincronizeazaOnboardingLaProfil('user-A', supabase);
    expect(okA2).toBe(false);

    expect(supabase.profiluri['user-A'].calorii_tinta).toBe(caloriiA);
    expect(supabase.profiluri['user-A'].sex).toBe('masculin');
    expect(supabase.profiluri['user-B'].sex).toBe('feminin');
  });

  it('schimbarea utilizatorului este raportata, ca apelantul sa reseteze flag-urile MMKV', async () => {
    expect(await prepareLocalDataForUser('user-A')).toBe(false); // prima sesiune
    expect(await prepareLocalDataForUser('user-A')).toBe(false); // aceeasi sesiune
    expect(await prepareLocalDataForUser('user-B')).toBe(true);  // schimbare reala
  });

  it('flag-ul de onboarding terminat NU mai supravietuieste schimbarii de cont', async () => {
    await AsyncStorage.setItem('nutriai-onboarding_done', 'true');
    await prepareLocalDataForUser('user-A');
    await prepareLocalDataForUser('user-B');
    expect(await AsyncStorage.getItem('nutriai-onboarding_done')).toBeNull();
  });

  it('primul cont păstrează flag-ul doar când există chestionarul pre-auth curent', async () => {
    await salveazaDateOnboarding(DATE_B);
    await AsyncStorage.setItem('nutriai-onboarding_done', 'true');

    await prepareLocalDataForUser('user-nou');

    expect(await AsyncStorage.getItem('nutriai-onboarding_done')).toBe('true');
    expect(await incarcaDateOnboarding()).toMatchObject({ greutateKg: 55, gen: 'feminin' });
  });

  it('tintele locale ale lui A sunt sterse la logout, nu mostenite de B', async () => {
    const supabase = creeazaSupabaseFals();
    await salveazaDateOnboarding(DATE_A);
    await prepareLocalDataForUser('user-A');
    await sincronizeazaOnboardingLaProfil('user-A', supabase);

    const tinteA = await citesteTinteLocale();
    expect(tinteA.caloriiTinta).not.toBeNull();

    await clearLocalUserData();
    await prepareLocalDataForUser('user-B');

    const tinteB = await citesteTinteLocale();
    for (const k of CHEI_TINTE) expect(tinteB[k]).toBeNull();
  });

  // --- A doua trecere, adversariala: cai care ocolesc curatarea la schimbare ---

  it('blob orfan (onboarding abandonat inainte de login) NU suprascrie profilul unui utilizator existent', async () => {
    // B are deja profil in DB (utilizator vechi, dispozitiv nou pentru el).
    const supabase = creeazaSupabaseFals({
      'user-B': { user_id: 'user-B', greutate: 55, inaltime: 160, sex: 'feminin', calorii_tinta: 1800 },
    });

    // Altcineva parcurge chestionarul pe acest dispozitiv si ABANDONEAZA
    // inainte de autentificare: nu exista sesiune anterioara, deci
    // `prepareLocalDataForUser` nu detecteaza nicio schimbare de utilizator.
    await salveazaDateOnboarding(DATE_A);

    const aSchimbat = await prepareLocalDataForUser('user-B');
    expect(aSchimbat).toBe(false); // exact conditia care ocolea curatarea

    const rezultat = await sincronizeazaOnboardingLaProfil('user-B', supabase);

    expect(rezultat).toBe(false);
    // Profilul lui B a ramas EXACT cum era.
    expect(supabase.profiluri['user-B'].greutate).toBe(55);
    expect(supabase.profiluri['user-B'].sex).toBe('feminin');
    expect(supabase.profiluri['user-B'].calorii_tinta).toBe(1800);
    // Blob-ul strain a fost aruncat, ca sa nu mai poata fi aplicat ulterior.
    expect(await AsyncStorage.getItem(CHEIE_ONBOARDING)).toBeNull();
  });

  it('utilizator NOU (fara profil in DB) primeste normal datele din chestionar', async () => {
    const supabase = creeazaSupabaseFals();
    await salveazaDateOnboarding(DATE_B);
    await prepareLocalDataForUser('user-nou');

    const rezultat = await sincronizeazaOnboardingLaProfil('user-nou', supabase);

    expect(rezultat).toBe(true);
    expect(supabase.profiluri['user-nou'].greutate).toBe(55);
    expect(supabase.profiluri['user-nou'].sex).toBe('feminin');
  });

  it('o eroare la citirea profilului nu produce suprascriere (fail-closed)', async () => {
    await salveazaDateOnboarding(DATE_A);
    const supabaseCitireStricata = {
      from: () => ({
        upsert: async () => {
          throw new Error('nu ar trebui apelat');
        },
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: { message: 'citire esuata' } }),
          }),
        }),
      }),
    };

    await expect(
      sincronizeazaOnboardingLaProfil('user-X', supabaseCitireStricata),
    ).resolves.toBe(false);

    // Blob-ul ramane pentru o reincercare ulterioara.
    expect(await incarcaDateOnboarding()).not.toBeNull();
  });

  it('un upsert esuat pastreaza blob-ul, ca sincronizarea sa poata fi reincercata', async () => {
    await salveazaDateOnboarding(DATE_A);
    const supabaseCrapat = {
      from: () => ({ upsert: async () => ({ error: { message: 'network down' } }) }),
    };
    await sincronizeazaOnboardingLaProfil('user-A', supabaseCrapat);

    // Blob-ul ramane: altfel profilul din DB nu s-ar mai popula niciodata.
    expect(await incarcaDateOnboarding()).not.toBeNull();
  });
});
