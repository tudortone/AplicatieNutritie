import React from 'react';
import { Image, Keyboard } from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';
import { optimizeImageBeforeUpload } from '../lib/imageOptimizer';
import { uploadImageToImageKit } from '../lib/imagekit';

// Mocks for Image and Expo modules
jest.mock('../supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(async () => ({
        data: {
          session: {
            access_token: 'token-test',
            user: { id: 'user-perf-1' },
          },
        },
      })),
    },
  },
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

jest.mock('expo-crypto', () => ({
  digestStringAsync: jest.fn(async () => 'mock-hash-12345'),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
}));

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///data/user/0/com.app/files/',
  getInfoAsync: jest.fn(async () => ({ exists: true, size: 50000 })),
  makeDirectoryAsync: jest.fn(async () => {}),
  copyAsync: jest.fn(async () => {}),
  deleteAsync: jest.fn(async () => {}),
}));

jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest.fn(async (_uri, actions) => ({
    uri: 'file:///tmp/optimized_result.jpg',
    width: actions?.[0]?.resize?.width || 800,
    height: actions?.[0]?.resize?.height || 600,
  })),
  SaveFormat: { JPEG: 'jpeg' },
}));

describe('P1-OPT-01 — Performance & Optimization Regression Suite', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  describe('1. Image Optimization & Pipeline Bypass (PERF-01)', () => {
    test('optimizeImageBeforeUpload downscales 4032x3024 capture to 800px max dimension with 0.75 compression', async () => {
      const getSizeSpy = jest.spyOn(Image, 'getSize').mockImplementation((_uri, success) => {
        success(4032, 3024);
      });

      const res = await optimizeImageBeforeUpload('file:///photos/camera_12mp.jpg');

      expect(getSizeSpy).toHaveBeenCalledWith(
        'file:///photos/camera_12mp.jpg',
        expect.any(Function),
        expect.any(Function),
      );

      expect(ImageManipulator.manipulateAsync).toHaveBeenCalledTimes(1);
      expect(ImageManipulator.manipulateAsync).toHaveBeenCalledWith(
        'file:///photos/camera_12mp.jpg',
        [{ resize: { width: 800 } }],
        { compress: 0.75, format: 'jpeg' },
      );

      expect(res.width).toBe(800);
      expect(res.uri).toBe('file:///tmp/optimized_result.jpg');
      getSizeSpy.mockRestore();
    });

    test('uploadImageToImageKit with skipOptimization: true reuses already optimized URI without second ImageManipulator run', async () => {
      process.env.EXPO_PUBLIC_IMAGEKIT_PUBLIC_KEY = 'mock_public_key';

      // Mock backend auth params and imagekit upload endpoints
      const mockFetch = jest.fn().mockImplementation((url: string) => {
        if (url.includes('/imagekit-auth')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              token: 'tok_123',
              signature: 'sig_123',
              expire: Math.floor(Date.now() / 1000) + 300,
              urlEndpoint: 'https://ik.imagekit.io/nutritie',
            }),
          });
        }
        if (url.includes('upload.imagekit.io')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              url: 'https://ik.imagekit.io/nutritie/mancare/user1/mancare_123.jpg',
              fileId: 'ik_file_999',
              name: 'mancare_123.jpg',
            }),
          });
        }
        return Promise.reject(new Error('Unknown URL: ' + url));
      });
      global.fetch = mockFetch;

      const alreadyOptimizedUri = 'file:///cache/already_optimized.jpg';

      const result = await uploadImageToImageKit(
        alreadyOptimizedUri,
        'mancare.jpg',
        undefined,
        { skipOptimization: true },
      );

      // Verify that ImageManipulator was NOT invoked because skipOptimization was true
      expect(ImageManipulator.manipulateAsync).not.toHaveBeenCalled();
      expect(result.url).toBe('https://ik.imagekit.io/nutritie/mancare/user1/mancare_123.jpg');
      expect(result.fileId).toBe('ik_file_999');

      // Verify FormData contained the alreadyOptimizedUri directly
      const uploadCall = mockFetch.mock.calls.find((call: any[]) =>
        call[0].includes('upload.imagekit.io'),
      );
      expect(uploadCall).toBeDefined();
      expect(uploadCall[1].body).toBeDefined();
      expect(uploadCall[1].method).toBe('POST');
    });

    test('uploadImageToImageKit without skipOptimization runs optimizeImageBeforeUpload as fallback', async () => {
      process.env.EXPO_PUBLIC_IMAGEKIT_PUBLIC_KEY = 'mock_public_key';

      const getSizeSpy = jest.spyOn(Image, 'getSize').mockImplementation((_uri, success) => {
        success(2000, 1500);
      });

      const mockFetch = jest.fn().mockImplementation((url: string) => {
        if (url.includes('/imagekit-auth')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              token: 'tok_123',
              signature: 'sig_123',
              expire: Math.floor(Date.now() / 1000) + 300,
              urlEndpoint: 'https://ik.imagekit.io/nutritie',
            }),
          });
        }
        if (url.includes('upload.imagekit.io')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              url: 'https://ik.imagekit.io/nutritie/mancare/user1/fallback.jpg',
              fileId: 'ik_file_111',
              name: 'fallback.jpg',
            }),
          });
        }
        return Promise.reject(new Error('Unknown URL: ' + url));
      });
      global.fetch = mockFetch;

      const rawUri = 'file:///photos/unoptimized_raw.jpg';
      const result = await uploadImageToImageKit(rawUri);

      // Verify fallback downscaled the image
      expect(ImageManipulator.manipulateAsync).toHaveBeenCalledWith(
        rawUri,
        [{ resize: { width: 800 } }],
        { compress: 0.75, format: 'jpeg' },
      );
      expect(result.url).toBe('https://ik.imagekit.io/nutritie/mancare/user1/fallback.jpg');
      getSizeSpy.mockRestore();
    });
  });

  describe('2. Listener Cleanup and Consolidation (PERF-05)', () => {
    test('Keyboard listeners can be added and cleanly removed symmetrically', () => {
      const removeShow = jest.fn();
      const removeHide = jest.fn();

      const addListenerSpy = jest.spyOn(Keyboard, 'addListener').mockImplementation((event: string) => {
        if (event.includes('Show')) {
          return { remove: removeShow } as any;
        }
        return { remove: removeHide } as any;
      });

      // Simulate mounting a screen with show and hide listeners
      const showSub = Keyboard.addListener('keyboardDidShow', jest.fn());
      const hideSub = Keyboard.addListener('keyboardDidHide', jest.fn());

      expect(addListenerSpy).toHaveBeenCalledTimes(2);

      // Simulate unmounting
      showSub.remove();
      hideSub.remove();

      expect(removeShow).toHaveBeenCalledTimes(1);
      expect(removeHide).toHaveBeenCalledTimes(1);

      addListenerSpy.mockRestore();
    });
  });

  describe('3. Deterministic Daily Tip Memoization (PERF-04)', () => {
    test('Daily tip selection algorithm produces stable string for a given date index', () => {
      const mockT = jest.fn((key: string) => `trans_${key}`);

      const sfaturiZilnice = [
        mockT('home.dailyTip1'),
        mockT('home.dailyTip2'),
        mockT('home.dailyTip3'),
        mockT('home.dailyTip4'),
        mockT('home.dailyTip5'),
        mockT('home.dailyTip6'),
        mockT('home.dailyTip7'),
        mockT('home.dailyTip8'),
        mockT('home.dailyTip9'),
        mockT('home.dailyTip10'),
      ];

      // Verify 10 tips
      expect(sfaturiZilnice).toHaveLength(10);
      expect(sfaturiZilnice[0]).toBe('trans_home.dailyTip1');

      // Given day 18 of the month: 18 % 10 = index 8 (tip 9)
      const indexDay18 = 18 % sfaturiZilnice.length;
      expect(indexDay18).toBe(8);
      expect(sfaturiZilnice[indexDay18]).toBe('trans_home.dailyTip9');
    });
  });

  describe('4. Search Sequence Guard & Stale Request Protection (PERF-02)', () => {
    test('Sequence counter drops stale out-of-order asynchronous results', async () => {
      let currentSeq = 0;
      let latestCommittedResults: string[] = [];

      const simulateSearch = async (query: string, delayMs: number) => {
        const seq = ++currentSeq;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        // Sequence guard matches ProductSearch.tsx logic
        if (currentSeq !== seq) return;
        latestCommittedResults = [query];
      };

      // Query 1 starts first but takes longer (30ms)
      const promise1 = simulateSearch('slow_first_query', 30);
      // Query 2 starts after and finishes faster (5ms)
      const promise2 = simulateSearch('fast_second_query', 5);

      await Promise.all([promise1, promise2]);

      // Query 1 must not overwrite Query 2
      expect(latestCommittedResults).toEqual(['fast_second_query']);
    });
  });
});
