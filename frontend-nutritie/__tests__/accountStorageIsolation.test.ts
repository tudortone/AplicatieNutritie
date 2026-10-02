import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import {
  ACTIVE_LOCAL_USER_KEY,
  clearLocalUserData,
  PENDING_DELETED_USER_KEY,
  prepareLocalDataForNoSession,
  prepareLocalDataForUser,
  purgeLocalDataForUser,
  userStorageKey,
} from '../lib/userDataCleanup';
import {
  discardLocalImageDraft,
  listPendingDrafts,
  saveLocalImageDraft,
} from '../lib/imageOptimizer';
import {
  clearOfflineQueue,
  getOfflineQueue,
  pushOfflineMeal,
  type MasaOfflinePayload,
} from '../lib/offlineQueue';
import { LANGUAGE_STORAGE_KEY } from '../i18n';

type StorageMock = typeof AsyncStorage & {
  __store: () => Record<string, string>;
  __failNextMultiRemove: () => void;
};

jest.mock('@react-native-async-storage/async-storage', () => {
  let store: Record<string, string> = {};
  let failNextMultiRemove = false;
  return {
    __store: () => store,
    __failNextMultiRemove: () => { failNextMultiRemove = true; },
    getItem: jest.fn(async (key: string) => store[key] ?? null),
    setItem: jest.fn(async (key: string, value: string) => { store[key] = value; }),
    removeItem: jest.fn(async (key: string) => { delete store[key]; }),
    multiGet: jest.fn(async (keys: string[]) => keys.map((key) => [key, store[key] ?? null])),
    multiSet: jest.fn(async (pairs: [string, string][]) => {
      for (const [key, value] of pairs) store[key] = value;
    }),
    multiRemove: jest.fn(async (keys: string[]) => {
      if (failNextMultiRemove) {
        failNextMultiRemove = false;
        if (keys[0]) delete store[keys[0]];
        throw new Error('simulated process interruption');
      }
      for (const key of keys) delete store[key];
    }),
    getAllKeys: jest.fn(async () => Object.keys(store)),
    clear: jest.fn(async () => { store = {}; failNextMultiRemove = false; }),
  };
});

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///data/user/0/com.app/files/',
  getInfoAsync: jest.fn(async () => ({ exists: true })),
  makeDirectoryAsync: jest.fn(async () => {}),
  copyAsync: jest.fn(async () => {}),
  deleteAsync: jest.fn(async () => {}),
}));

jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest.fn(),
  SaveFormat: { JPEG: 'jpeg' },
}));

const storage = AsyncStorage as StorageMock;
const DAY = '2026-09-13';

const MEAL_A: MasaOfflinePayload = {
  id: '11111111-1111-4111-8111-111111111111',
  user_id: 'user-A',
  nume: 'Masa A',
  calorii: 420,
  proteine: 30,
  grasimi: 12,
  carbohidrati: 45,
  fibre: 6,
  tip_masa: 'pranz',
  alimente: [],
  data: DAY,
  created_at: `${DAY}T12:00:00.000Z`,
};

async function seedAState(): Promise<string> {
  await prepareLocalDataForUser('user-A');
  await AsyncStorage.multiSet([
    [`apa_${DAY}`, '7'],
    [`steps_total_${DAY}`, '8123'],
    ['gamificare_v2_server_authoritative', JSON.stringify({ xpTotal: 400 })],
    ['nutriai_rewards_v1', JSON.stringify({ totalXp: 220 })],
  ]);
  return saveLocalImageDraft('file:///tmp/a.jpg', 'user-A');
}

describe('P0-02 — cross-account local persistence boundary', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    await clearOfflineQueue();
  });

  test('1. A state is inaccessible after logout and B login', async () => {
    await seedAState();
    await clearLocalUserData();
    await prepareLocalDataForUser('user-B');

    expect(await AsyncStorage.getItem(`apa_${DAY}`)).toBeNull();
    expect(await AsyncStorage.getItem(`steps_total_${DAY}`)).toBeNull();
    expect(await AsyncStorage.getItem('gamificare_v2_server_authoritative')).toBeNull();
    expect(await AsyncStorage.getItem('nutriai_rewards_v1')).toBeNull();
    expect(await listPendingDrafts('user-B')).toEqual([]);
  });

  test('2. B bootstrap after a simulated restart still cannot see A state', async () => {
    await seedAState();
    await clearLocalUserData();
    await prepareLocalDataForUser('user-B');

    // A second bootstrap uses only persisted storage; no component memory is required.
    await prepareLocalDataForUser('user-B');
    expect(await AsyncStorage.getItem(`apa_${DAY}`)).toBeNull();
    expect(await AsyncStorage.getItem(`steps_total_${DAY}`)).toBeNull();
    expect(await listPendingDrafts('user-B')).toEqual([]);
  });

  test('3. A -> B -> A restores only A-owned durable state', async () => {
    const draftA = await seedAState();
    await clearLocalUserData();
    await prepareLocalDataForUser('user-B');
    await AsyncStorage.setItem(`apa_${DAY}`, '2');
    await clearLocalUserData();
    await prepareLocalDataForUser('user-A');

    expect(await AsyncStorage.getItem(`apa_${DAY}`)).toBe('7');
    expect(await AsyncStorage.getItem(`steps_total_${DAY}`)).toBe('8123');
    expect(await listPendingDrafts('user-A')).toEqual([draftA]);
  });

  test('4. legacy workspace with a matching explicit owner migrates once', async () => {
    await AsyncStorage.setItem(ACTIVE_LOCAL_USER_KEY, 'user-A');
    await AsyncStorage.setItem('greutate', '81');

    await prepareLocalDataForUser('user-A');
    expect(await AsyncStorage.getItem(userStorageKey('user-A', 'greutate'))).toBe('81');

    await prepareLocalDataForUser('user-A');
    expect(await AsyncStorage.getItem('greutate')).toBe('81');
    expect(Object.keys(storage.__store()).filter((key) => key === userStorageKey('user-A', 'greutate'))).toHaveLength(1);
  });

  test('5. a legacy workspace owned by A is never assigned to mismatching B', async () => {
    await AsyncStorage.setItem(ACTIVE_LOCAL_USER_KEY, 'user-A');
    await AsyncStorage.setItem(`apa_${DAY}`, '9');

    await prepareLocalDataForUser('user-B');
    expect(await AsyncStorage.getItem(`apa_${DAY}`)).toBeNull();
    expect(await AsyncStorage.getItem(userStorageKey('user-B', `apa_${DAY}`))).toBeNull();
  });

  test('6. ownerless ambiguous legacy values are discarded, not claimed by B', async () => {
    await AsyncStorage.setItem(`steps_total_${DAY}`, '9999');

    await prepareLocalDataForUser('user-B');
    expect(await AsyncStorage.getItem(`steps_total_${DAY}`)).toBeNull();
    expect(await AsyncStorage.getItem(userStorageKey('user-B', `steps_total_${DAY}`))).toBeNull();
  });

  test('7. an interrupted cleanup is retryable and remains fail-closed', async () => {
    await seedAState();
    storage.__failNextMultiRemove();

    await expect(prepareLocalDataForUser('user-B')).rejects.toThrow('simulated process interruption');
    await prepareLocalDataForUser('user-B');

    expect(await AsyncStorage.getItem(`apa_${DAY}`)).toBeNull();
    expect(await AsyncStorage.getItem(`steps_total_${DAY}`)).toBeNull();
    expect(await AsyncStorage.getItem(ACTIVE_LOCAL_USER_KEY)).toBe('user-B');
  });

  test('8. A offline queue never appears in B and remains available when A returns', async () => {
    await prepareLocalDataForUser('user-A');
    await pushOfflineMeal(MEAL_A);
    await clearLocalUserData();
    await prepareLocalDataForUser('user-B');

    expect(await getOfflineQueue('user-B')).toEqual([]);
    expect(await getOfflineQueue('user-A')).toEqual([MEAL_A]);
  });

  test('9. image draft files and metadata are owner-bound', async () => {
    const draftA = await seedAState();
    expect(draftA).toContain('/drafts/user-A/');
    await clearLocalUserData();
    await prepareLocalDataForUser('user-B');

    expect(await listPendingDrafts('user-B')).toEqual([]);
    await expect(discardLocalImageDraft(draftA, 'user-B')).resolves.toBeUndefined();
    expect(FileSystem.deleteAsync).not.toHaveBeenCalledWith(draftA, expect.anything());
  });

  test('10. language remains device-global across account transitions', async () => {
    await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, 'fr');
    await prepareLocalDataForUser('user-A');
    await clearLocalUserData();
    await prepareLocalDataForUser('user-B');
    await prepareLocalDataForNoSession();

    expect(await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('fr');
  });

  test('11. confirmed account deletion purges only the deleted account, including queue and photo files', async () => {
    const draftA = await seedAState();
    await pushOfflineMeal(MEAL_A);
    await AsyncStorage.setItem(userStorageKey('user-B', 'greutate'), '64');
    await AsyncStorage.setItem('@nutri_offline_meals_queue_user-B', JSON.stringify([{ user_id: 'user-B' }]));

    await purgeLocalDataForUser('user-A');

    expect(await AsyncStorage.getItem(userStorageKey('user-A', `apa_${DAY}`))).toBeNull();
    expect(await AsyncStorage.getItem('@nutri_offline_meals_queue_user-A')).toBeNull();
    expect(await AsyncStorage.getItem(userStorageKey('user-B', 'greutate'))).toBe('64');
    expect(await AsyncStorage.getItem('@nutri_offline_meals_queue_user-B')).not.toBeNull();
    expect(await AsyncStorage.getItem(ACTIVE_LOCAL_USER_KEY)).toBeNull();
    expect(await AsyncStorage.getItem(PENDING_DELETED_USER_KEY)).toBeNull();
    expect(FileSystem.deleteAsync).toHaveBeenCalledWith(draftA, { idempotent: true });
  });

  test('12. interrupted deletion purge is journaled and retried at no-session bootstrap', async () => {
    await seedAState();
    storage.__failNextMultiRemove();

    await expect(purgeLocalDataForUser('user-A')).rejects.toThrow('simulated process interruption');
    expect(await AsyncStorage.getItem(PENDING_DELETED_USER_KEY)).toBe('user-A');

    await prepareLocalDataForNoSession();

    expect(await AsyncStorage.getItem(PENDING_DELETED_USER_KEY)).toBeNull();
    expect(await AsyncStorage.getItem(userStorageKey('user-A', `apa_${DAY}`))).toBeNull();
    expect(await AsyncStorage.getItem(ACTIVE_LOCAL_USER_KEY)).toBeNull();
  });
});
