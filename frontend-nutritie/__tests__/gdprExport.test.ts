import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  buildCompleteUserExport,
  fetchServerGdprExport,
} from '../lib/gdprExport';
import { ACTIVE_LOCAL_USER_KEY, userStorageKey } from '../lib/userDataCleanup';

jest.mock('@react-native-async-storage/async-storage', () => {
  let store: Record<string, string> = {};
  return {
    getItem: jest.fn(async (key: string) => store[key] ?? null),
    getAllKeys: jest.fn(async () => Object.keys(store)),
    multiGet: jest.fn(async (keys: string[]) => keys.map((key) => [key, store[key] ?? null])),
    __seed: (next: Record<string, string>) => { store = { ...next }; },
  };
});

type StorageMock = typeof AsyncStorage & { __seed(next: Record<string, string>): void };
const storage = AsyncStorage as StorageMock;

describe('P1-13 — export GDPR complet pe dispozitiv', () => {
  beforeEach(() => {
    storage.__seed({
      [ACTIVE_LOCAL_USER_KEY]: 'user-A',
      greutate: '72',
      [`chat_history_user-A_2026-09-19`]: JSON.stringify([{ role: 'user', text: 'private A' }]),
      ['@nutri_offline_meals_queue_user-A']: JSON.stringify([{ user_id: 'user-A', nume: 'masa A' }]),
      [userStorageKey('user-A', 'favorite_foods')]: JSON.stringify(['mere']),
      [`chat_history_user-B_2026-09-19`]: JSON.stringify([{ text: 'private B' }]),
      ['@nutri_offline_meals_queue_user-B']: JSON.stringify([{ user_id: 'user-B' }]),
      [userStorageKey('user-B', 'favorite_foods')]: JSON.stringify(['pere']),
      getflow_language: 'en',
    });
  });

  test('imbina exportul server cu datele locale strict ale contului activ', async () => {
    const document = await buildCompleteUserExport({
      userId: 'user-A',
      serverExport: { exportDate: '2026-09-19T10:00:00.000Z', user_id: 'user-A', mese: [] },
    });
    const encoded = JSON.stringify(document);

    expect(document.schema_version).toBe(1);
    expect(document.server.user_id).toBe('user-A');
    expect(document.local_device.active_workspace.greutate).toBe(72);
    expect(document.local_device.account_scoped).toHaveProperty('chat_history_user-A_2026-09-19');
    expect(encoded).toContain('private A');
    expect(encoded).not.toContain('private B');
    expect(encoded).not.toContain('user-B');
    expect(document.local_device).not.toHaveProperty('getflow_language');
  });

  test('refuza exportul server pentru alt user si nu accepta succes partial', async () => {
    await expect(fetchServerGdprExport({
      apiUrl: 'https://api.example',
      apiPrefix: '/api/v1',
      token: 'secret-token',
      expectedUserId: 'user-A',
      fetchImpl: jest.fn(async () => ({
        ok: true,
        json: async () => ({ user_id: 'user-B' }),
      })) as never,
    })).rejects.toThrow('GDPR_EXPORT_IDENTITY_MISMATCH');

    await expect(fetchServerGdprExport({
      apiUrl: 'https://api.example',
      apiPrefix: '/api/v1',
      token: 'secret-token',
      expectedUserId: 'user-A',
      fetchImpl: jest.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })) as never,
    })).rejects.toThrow('GDPR_EXPORT_FAILED');
  });
});
