import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabase';
import { sincronizeazaTargeturiLocale, TARGETURI_PENDING_KEY } from '../lib/sincronizeazaTargeturi';

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

jest.mock('../supabase', () => ({
  supabase: { auth: { updateUser: jest.fn() } },
}));

const updateUserMock = supabase.auth.updateUser as jest.Mock;

describe('BUG-035 — sincronizeazaTargeturiLocale', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  it('fara flag -> nu apeleaza serverul', async () => {
    await AsyncStorage.setItem('caloriiTinta', '2100');
    await sincronizeazaTargeturiLocale();
    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it('cu flag -> impinge valorile locale si curata flag-ul', async () => {
    await AsyncStorage.setItem(TARGETURI_PENDING_KEY, '1');
    await AsyncStorage.setItem('caloriiTinta', '2100');
    await AsyncStorage.setItem('proteineTinta', '160');
    await AsyncStorage.setItem('greutate', '82');
    updateUserMock.mockResolvedValue({ error: null });

    await sincronizeazaTargeturiLocale();

    expect(updateUserMock).toHaveBeenCalledWith({
      data: { caloriiTinta: 2100, proteineTinta: 160, greutate: 82 },
    });
    expect(await AsyncStorage.getItem(TARGETURI_PENDING_KEY)).toBeNull();
  });

  it('cu flag dar updateUser esuata -> flag-ul ramane', async () => {
    await AsyncStorage.setItem(TARGETURI_PENDING_KEY, '1');
    await AsyncStorage.setItem('caloriiTinta', '2100');
    updateUserMock.mockResolvedValue({ error: new Error('offline') });

    await sincronizeazaTargeturiLocale();

    expect(updateUserMock).toHaveBeenCalled();
    expect(await AsyncStorage.getItem(TARGETURI_PENDING_KEY)).toBe('1');
  });

  it('flag fara valori locale valide -> nu impinge defaults, curata flag-ul', async () => {
    await AsyncStorage.setItem(TARGETURI_PENDING_KEY, '1');
    updateUserMock.mockResolvedValue({ error: null });

    await sincronizeazaTargeturiLocale();

    expect(updateUserMock).not.toHaveBeenCalled();
    expect(await AsyncStorage.getItem(TARGETURI_PENDING_KEY)).toBeNull();
  });
});
