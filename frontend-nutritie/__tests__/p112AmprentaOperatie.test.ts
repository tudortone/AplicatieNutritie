import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';

import { amprentaOperatieFoto } from '../lib/imageOptimizer';

/**
 * P1-12 — amprenta OPERAȚIEI LOGICE de analiză foto.
 *
 * Identitatea de transport (request id, socket, token) nu identifică operația:
 * un retry după timeout e o cerere nouă, dar ACEEAȘI operație logică. Amprenta
 * de mai jos e derivată din conținutul imaginii + parametrii care schimbă
 * rezultatul (furnizor AI, limbă), deci e stabilă între retry-uri și diferită
 * când utilizatorul chiar cere altceva.
 */

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///data/user/0/com.app/files/',
  getInfoAsync: jest.fn(),
  makeDirectoryAsync: jest.fn(),
  copyAsync: jest.fn(),
  deleteAsync: jest.fn(async () => {}),
}));

jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest.fn(),
  SaveFormat: { JPEG: 'jpeg' },
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

// SHA-256 simulat determinist: testăm derivarea amprentei, nu implementarea hash-ului.
jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  randomUUID: jest.fn(),
  digestStringAsync: jest.fn(async (_alg: string, text: string) => {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16).padStart(8, '0').repeat(8);
  }),
}));

const mockGetInfo = FileSystem.getInfoAsync as jest.Mock;

describe('P1-12 — amprenta operației logice de analiză foto', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetInfo.mockResolvedValue({ exists: true, md5: 'abc123', size: 4096 });
  });

  test('returnează un SHA-256 hex de 64 de caractere (formatul cerut de server)', async () => {
    const amprenta = await amprentaOperatieFoto('file:///tmp/a.jpg', 'auto', 'ro');
    expect(amprenta).toMatch(/^[0-9a-f]{64}$/);
  });

  test('aceeași imagine + aceiași parametri → aceeași amprentă (retry = același logic op)', async () => {
    const a = await amprentaOperatieFoto('file:///tmp/a.jpg', 'auto', 'ro');
    const b = await amprentaOperatieFoto('file:///tmp/a.jpg', 'auto', 'ro');
    expect(a).toBe(b);
  });

  test('conținut diferit (alt md5) → amprentă diferită', async () => {
    const a = await amprentaOperatieFoto('file:///tmp/a.jpg', 'auto', 'ro');
    mockGetInfo.mockResolvedValue({ exists: true, md5: 'zzz999', size: 4096 });
    const b = await amprentaOperatieFoto('file:///tmp/a.jpg', 'auto', 'ro');
    expect(a).not.toBe(b);
  });

  test('alt furnizor AI → amprentă diferită (utilizatorul chiar cere altă analiză)', async () => {
    const a = await amprentaOperatieFoto('file:///tmp/a.jpg', 'auto', 'ro');
    const b = await amprentaOperatieFoto('file:///tmp/a.jpg', 'gemini', 'ro');
    expect(a).not.toBe(b);
  });

  test('altă limbă → amprentă diferită (răspunsul diferă)', async () => {
    const a = await amprentaOperatieFoto('file:///tmp/a.jpg', 'auto', 'ro');
    const b = await amprentaOperatieFoto('file:///tmp/a.jpg', 'auto', 'en');
    expect(a).not.toBe(b);
  });

  test('fără md5 disponibil, amprenta rămâne validă și stabilă (fallback pe uri+size)', async () => {
    mockGetInfo.mockResolvedValue({ exists: true, size: 4096 });
    const a = await amprentaOperatieFoto('file:///tmp/a.jpg', 'auto', 'ro');
    const b = await amprentaOperatieFoto('file:///tmp/a.jpg', 'auto', 'ro');
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).toBe(b);
  });

  test('md5 este cerut explicit — fără el amprenta nu ar reflecta conținutul', async () => {
    await amprentaOperatieFoto('file:///tmp/a.jpg', 'auto', 'ro');
    expect(mockGetInfo).toHaveBeenCalledWith('file:///tmp/a.jpg', { md5: true });
  });

  test('digest-ul este SHA-256, nu un hash slab', async () => {
    await amprentaOperatieFoto('file:///tmp/a.jpg', 'auto', 'ro');
    expect(Crypto.digestStringAsync).toHaveBeenCalledWith(
      Crypto.CryptoDigestAlgorithm.SHA256,
      expect.any(String),
    );
  });
});
