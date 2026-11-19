import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabase';
import {
  sincronizeazaTargeturiLocale,
  salveazaTargeturiPending,
  citesteTargeturiPending,
  stergeTargeturiPending,
  TARGETURI_PENDING_KEY,
} from '../lib/sincronizeazaTargeturi';

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
    multiRemove: jest.fn(async (keys: string[]) => {
      for (const k of keys) delete store[k];
    }),
    clear: jest.fn(async () => {
      store = {};
    }),
  };
});

const mockProfilUpdate = jest.fn();
const mockProfilEq = jest.fn();
const mockProfilSelect = jest.fn();
const mockProfilUpsert = jest.fn();
const mockGetSession = jest.fn();

jest.mock('../supabase', () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
    },
    from: jest.fn(() => ({
      update: (...args: unknown[]) => {
        mockProfilUpdate(...args);
        return {
          eq: (...eqArgs: unknown[]) => {
            mockProfilEq(...eqArgs);
            return {
              select: (...selArgs: unknown[]) => mockProfilSelect(...selArgs),
            };
          },
        };
      },
      upsert: (...args: unknown[]) => mockProfilUpsert(...args),
    })),
  },
}));

describe('REV-003 / P0-12 — sincronizeazaTargeturiLocale pe tabela RLS profil & izolare conturi', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'user_A' } } }, error: null });
    mockProfilSelect.mockResolvedValue({ data: [{ user_id: 'user_A' }], error: null });
    mockProfilUpsert.mockResolvedValue({ error: null });
  });

  it('1. pending targets pentru utilizatorul A nu sunt vizibile pentru utilizatorul B', async () => {
    await salveazaTargeturiPending('user_A', { caloriiTinta: 2500, proteineTinta: 180, greutate: 80 });

    const targeturiA = await citesteTargeturiPending('user_A');
    expect(targeturiA).not.toBeNull();
    expect(targeturiA?.userId).toBe('user_A');
    expect(targeturiA?.targets.caloriiTinta).toBe(2500);

    const targeturiB = await citesteTargeturiPending('user_B');
    expect(targeturiB).toBeNull();
  });

  it('2. utilizatorul B nu poate sincroniza targeturile utilizatorului A', async () => {
    await salveazaTargeturiPending('user_A', { caloriiTinta: 2500, proteineTinta: 180 });
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'user_B' } } }, error: null });

    const synced = await sincronizeazaTargeturiLocale('user_B');
    expect(synced).toBe(false);
    expect(mockProfilUpdate).not.toHaveBeenCalled();

    // Payload-ul lui A rămâne neatins
    const targeturiA = await citesteTargeturiPending('user_A');
    expect(targeturiA?.targets.caloriiTinta).toBe(2500);
  });

  it('2b. respinge scrierea cross-account când sesiunea activă s-a schimbat la alt cont', async () => {
    await salveazaTargeturiPending('user_A', { caloriiTinta: 2500, proteineTinta: 180 });
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'user_B' } } }, error: null });

    const synced = await sincronizeazaTargeturiLocale('user_A');
    expect(synced).toBe(false);
    expect(mockProfilUpdate).not.toHaveBeenCalled();
    expect(mockProfilUpsert).not.toHaveBeenCalled();

    const targeturiA = await citesteTargeturiPending('user_A');
    expect(targeturiA?.targets.caloriiTinta).toBe(2500);
  });

  it('3. utilizatorul A își sincronizează propriile targeturi pe tabela RLS profil', async () => {
    await salveazaTargeturiPending('user_A', {
      caloriiTinta: 2400,
      proteineTinta: 160,
      carbiTinta: 220,
      grasimiTinta: 65,
      greutate: 82.5,
      nume: 'Alex',
    });

    const synced = await sincronizeazaTargeturiLocale('user_A');
    expect(synced).toBe(true);
    expect(supabase.from).toHaveBeenCalledWith('profil');
    expect(mockProfilUpdate).toHaveBeenCalledWith(expect.objectContaining({
      calorii_tinta: 2400,
      proteine_tinta: 160,
      carbi_tinta: 220,
      grasimi_tinta: 65,
      greutate: 82.5,
      nume: 'Alex',
    }));
    expect(mockProfilEq).toHaveBeenCalledWith('user_id', 'user_A');

    // După sincronizare reușită, payload-ul lui A este șters
    const ramas = await citesteTargeturiPending('user_A');
    expect(ramas).toBeNull();
  });

  it('4. eșecul sincronizării (rețea/offline) păstrează payload-ul lui A pentru retry', async () => {
    await salveazaTargeturiPending('user_A', { caloriiTinta: 2200, proteineTinta: 150 });
    mockProfilSelect.mockResolvedValue({ data: null, error: new Error('Network error') });

    const synced = await sincronizeazaTargeturiLocale('user_A');
    expect(synced).toBe(false);
    expect(mockProfilUpdate).toHaveBeenCalled();

    // Payload-ul lui A este păstrat pentru boot-ul/relogin-ul următor
    const targeturiA = await citesteTargeturiPending('user_A');
    expect(targeturiA?.targets.caloriiTinta).toBe(2200);
  });

  it('5. sincronizarea reușită pentru A elimină DOAR payload-ul lui A (izolare multi-user)', async () => {
    await salveazaTargeturiPending('user_A', { caloriiTinta: 2100 });
    await salveazaTargeturiPending('user_B', { caloriiTinta: 2800 });

    const syncedA = await sincronizeazaTargeturiLocale('user_A');
    expect(syncedA).toBe(true);

    // A este curățat, B rămâne intact
    expect(await citesteTargeturiPending('user_A')).toBeNull();
    const targeturiB = await citesteTargeturiPending('user_B');
    expect(targeturiB?.targets.caloriiTinta).toBe(2800);
  });

  it('6. datele globale legacy fără ownership nu sunt atribuite unui cont arbitrar și sunt curățate', async () => {
    await AsyncStorage.setItem(TARGETURI_PENDING_KEY, '1');
    await AsyncStorage.setItem('caloriiTinta', '3000');
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'user_Nou' } } }, error: null });

    const synced = await sincronizeazaTargeturiLocale('user_Nou');
    expect(synced).toBe(false);
    expect(mockProfilUpdate).not.toHaveBeenCalled();
    expect(await AsyncStorage.getItem(TARGETURI_PENDING_KEY)).toBeNull();
  });
});
