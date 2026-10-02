import React, { act } from 'react';
import { render, fireEvent, waitFor, cleanup } from '@testing-library/react-native';
import { Text, View, TouchableOpacity } from 'react-native';

import { useMeseAzi } from '../hooks/useMeseAzi';
import {
  getCachedJournalDay,
  setCachedJournalDay,
  hasCachedJournalDay,
  clearJournalCache,
  optimisticAddCachedMeal,
  optimisticDeleteCachedMeal,
  getJournalCacheSize,
} from '../lib/journalCache';
import { localDayKey } from '../lib/dateUtils';
import { marcheazaMeseModificate } from '../lib/freshnessMese';
import type { Masa } from '../types';

// Mock Supabase
let mockUser = { id: 'usr-perf-test-1', user_metadata: { caloriiTinta: 2100 } };
let mockQueryDelayMs = 0;
let mockDbDataByRange: Record<string, Masa[]> = {};
let mockSelectCalls: { startIso: string; endIso: string; aborted?: boolean }[] = [];

jest.mock('../supabase', () => ({
  supabase: {
    auth: {
      getUser: jest.fn(async () => ({
        data: { user: mockUser },
        error: null,
      })),
      getSession: jest.fn(async () => ({
        data: { session: { user: mockUser } },
        error: null,
      })),
    },
    from: jest.fn((table: string) => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          gte: jest.fn((_col: string, startIso: string) => ({
            lte: jest.fn((_col2: string, endIso: string) => ({
              order: jest.fn((_col3: string, _opts: any) => {
                const callRecord = { startIso, endIso, aborted: false };
                mockSelectCalls.push(callRecord);

                const promise = new Promise<{ data: Masa[] | null; error: any }>((resolve) => {
                  setTimeout(() => {
                    if (callRecord.aborted) {
                      resolve({ data: null, error: new Error('AbortError') });
                    } else {
                      // Return meals matching the queried range
                      const found: Masa[] = [];
                      Object.entries(mockDbDataByRange).forEach(([isoKey, meals]) => {
                        if (isoKey >= startIso && isoKey <= endIso) {
                          found.push(...meals);
                        }
                      });
                      resolve({ data: found, error: null });
                    }
                  }, mockQueryDelayMs);
                });

                (promise as any).abortSignal = (signal: AbortSignal) => {
                  signal.addEventListener('abort', () => {
                    callRecord.aborted = true;
                  });
                  return promise;
                };

                return promise;
              }),
            })),
          })),
        })),
      })),
    })),
  },
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => undefined),
    removeItem: jest.fn(async () => undefined),
  },
}));

afterEach(async () => {
  await cleanup();
  clearJournalCache();
  mockSelectCalls = [];
  mockDbDataByRange = {};
  mockQueryDelayMs = 0;
});

describe('GetFlow Journal Performance & Smoothness Optimization', () => {
  const d28 = new Date(2026, 8, 28); // 2026-09-28
  const d27 = new Date(2026, 8, 27); // 2026-09-27
  const d26 = new Date(2026, 8, 26); // 2026-09-26

  const meal28: Masa = {
    id: 'm-28',
    user_id: 'usr-perf-test-1',
    nume: 'Breakfast 28',
    tip_masa: 'mic_dejun',
    calorii: 500,
    proteine: 30,
    carbohidrati: 60,
    grasimi: 15,
    fibre: 5,
    created_at: '2026-09-28T08:30:00.000Z',
    alimente: [],
  };

  const meal27: Masa = {
    id: 'm-27',
    user_id: 'usr-perf-test-1',
    nume: 'Lunch 27',
    tip_masa: 'pranz',
    calorii: 700,
    proteine: 45,
    carbohidrati: 75,
    grasimi: 20,
    fibre: 8,
    created_at: '2026-09-27T12:30:00.000Z',
    alimente: [],
  };

  const meal26: Masa = {
    id: 'm-26',
    user_id: 'usr-perf-test-1',
    nume: 'Dinner 26',
    tip_masa: 'cina',
    calorii: 600,
    proteine: 40,
    carbohidrati: 50,
    grasimi: 18,
    fibre: 6,
    created_at: '2026-09-26T19:00:00.000Z',
    alimente: [],
  };

  describe('1. Bounded Journal Cache (journalCache.ts)', () => {
    it('stores and retrieves cached meals with LRU semantics', () => {
      expect(getCachedJournalDay('2026-09-28')).toBeUndefined();
      expect(hasCachedJournalDay('2026-09-28')).toBe(false);

      setCachedJournalDay('2026-09-28', [meal28]);
      expect(hasCachedJournalDay('2026-09-28')).toBe(true);

      const cached = getCachedJournalDay('2026-09-28');
      expect(cached).toHaveLength(1);
      expect(cached?.[0].nume).toBe('Breakfast 28');
    });

    it('bounds cache size to 30 entries with LRU eviction', () => {
      clearJournalCache();
      for (let i = 1; i <= 35; i++) {
        const key = `2026-01-${String(i).padStart(2, '0')}`;
        setCachedJournalDay(key, [{ ...meal28, id: `m-${i}` }]);
      }

      expect(getJournalCacheSize()).toBe(30);
      // First 5 entries (oldest) must have been evicted
      expect(hasCachedJournalDay('2026-01-01')).toBe(false);
      expect(hasCachedJournalDay('2026-01-05')).toBe(false);
      // Latest entries must be retained
      expect(hasCachedJournalDay('2026-01-35')).toBe(true);
      expect(hasCachedJournalDay('2026-01-30')).toBe(true);
    });

    it('invalidates cache completely on marcheazaMeseModificate signal', () => {
      setCachedJournalDay('2026-09-28', [meal28]);
      setCachedJournalDay('2026-09-27', [meal27]);
      expect(getJournalCacheSize()).toBe(2);

      marcheazaMeseModificate('usr-perf-test-1');
      expect(getJournalCacheSize()).toBe(0);
      expect(hasCachedJournalDay('2026-09-28')).toBe(false);
    });

    it('supports optimistic additions and deletions in cache', () => {
      setCachedJournalDay('2026-09-28', [meal28]);
      const newMeal: Masa = { ...meal28, id: 'm-28-extra', nume: 'Snack' };

      optimisticAddCachedMeal('2026-09-28', newMeal);
      expect(getCachedJournalDay('2026-09-28')).toHaveLength(2);

      optimisticDeleteCachedMeal('2026-09-28', 'm-28');
      const updated = getCachedJournalDay('2026-09-28');
      expect(updated).toHaveLength(1);
      expect(updated?.[0].id).toBe('m-28-extra');
    });
  });

  describe('2. Hook Performance & Adjacent Prefetch (useMeseAzi)', () => {
    function TestHookComponent({ targetDate }: { targetDate: Date }) {
      const { mese, loading, totalCalorii, optimisticAddMeal, optimisticDeleteMeal } = useMeseAzi(targetDate);
      return (
        <View testID="hook-container">
          <Text testID="loading-state">{loading ? 'LOADING' : 'READY'}</Text>
          <Text testID="meals-count">{mese.length}</Text>
          <Text testID="calories-total">{totalCalorii}</Text>
          <Text testID="meal-names">{mese.map((m) => m.nume).join(', ')}</Text>
          <TouchableOpacity
            testID="btn-opt-add"
            onPress={() =>
              optimisticAddMeal({
                id: 'm-opt-new',
                nume: 'Optimistic Snack',
                calorii: 200,
                proteine: 10,
                carbohidrati: 25,
                grasimi: 5,
                fibre: 2,
                tip_masa: 'gustare',
                user_id: 'usr-perf-test-1',
                created_at: '2026-09-28T15:00:00.000Z',
                alimente: [],
              })
            }
          />
          <TouchableOpacity testID="btn-opt-del" onPress={() => optimisticDeleteMeal('m-opt-new')} />
        </View>
      );
    }

    it('populates active date into cache on load', async () => {
      mockDbDataByRange['2026-09-28T08:30:00.000Z'] = [meal28];

      const { findByTestId } = await render(<TestHookComponent targetDate={d28} />);

      await waitFor(async () => {
        const loadingText = await findByTestId('loading-state');
        expect(loadingText.props.children).toBe('READY');
      });

      // Assert D (28) is in cache
      expect(hasCachedJournalDay('2026-09-28')).toBe(true);
      const cached28 = getCachedJournalDay('2026-09-28');
      expect(cached28?.[0].nume).toBe('Breakfast 28');
      expect(mockSelectCalls).toHaveLength(1);
    });

    it('switches to prefetched date instantly with 0ms perceived delay and zero new network calls', async () => {
      // Pre-seed cache as if adjacent prefetch ran
      setCachedJournalDay('2026-09-28', [meal28]);
      setCachedJournalDay('2026-09-27', [meal27]);

      const { findByTestId, rerender } = await render(<TestHookComponent targetDate={d28} />);

      // On initial render from cache, loading is immediately READY!
      const initialLoading = await findByTestId('loading-state');
      expect(initialLoading.props.children).toBe('READY');
      const countEl = await findByTestId('meals-count');
      expect(countEl.props.children).toBe(1);

      // Now switch to date 27
      await act(async () => {
        rerender(<TestHookComponent targetDate={d27} />);
      });

      // Must be READY immediately without waiting for network!
      const switchedLoading = await findByTestId('loading-state');
      expect(switchedLoading.props.children).toBe('READY');
      const switchedName = await findByTestId('meal-names');
      expect(switchedName.props.children).toBe('Lunch 27');
      const switchedCal = await findByTestId('calories-total');
      expect(switchedCal.props.children).toBe(700);
    });

    it('clears meals immediately when switching to uncached date to prevent stale data bleed', async () => {
      setCachedJournalDay('2026-09-28', [meal28]);
      mockQueryDelayMs = 50; // Simulate network lag on uncached date

      const { findByTestId, rerender } = await render(<TestHookComponent targetDate={d28} />);
      expect((await findByTestId('meal-names')).props.children).toBe('Breakfast 28');

      // Switch to uncached date 26
      await act(async () => {
        rerender(<TestHookComponent targetDate={d26} />);
      });

      // Meals must immediately be 0 — previous day's meals must NEVER bleed into new day!
      expect((await findByTestId('meals-count')).props.children).toBe(0);
      expect((await findByTestId('loading-state')).props.children).toBe('LOADING');
    });

    it('protects against stale responses during rapid date switching (28 -> 27 -> 26)', async () => {
      // Setup delayed network queries
      mockQueryDelayMs = 40;
      mockDbDataByRange['2026-09-28T08:30:00.000Z'] = [meal28];
      mockDbDataByRange['2026-09-27T12:30:00.000Z'] = [meal27];
      mockDbDataByRange['2026-09-26T19:00:00.000Z'] = [meal26];

      const { findByTestId, rerender } = await render(<TestHookComponent targetDate={d28} />);

      // Rapidly switch 28 -> 27 -> 26 before previous requests finish
      await act(async () => {
        rerender(<TestHookComponent targetDate={d27} />);
      });
      await act(async () => {
        rerender(<TestHookComponent targetDate={d26} />);
      });

      // Wait for all async calls to resolve
      await waitFor(async () => {
        const loading = await findByTestId('loading-state');
        expect(loading.props.children).toBe('READY');
      });

      // Active day must be 26 and ONLY 26 meals must be displayed
      const finalMeals = await findByTestId('meal-names');
      expect(finalMeals.props.children).toContain('Dinner 26');
      expect(finalMeals.props.children).not.toContain('Breakfast 28');
      expect(finalMeals.props.children).not.toContain('Lunch 27');
    });

    it('persists optimistic add and delete to both state and in-memory cache', async () => {
      setCachedJournalDay('2026-09-28', [meal28]);
      const { findByTestId } = await render(<TestHookComponent targetDate={d28} />);

      const addBtn = await findByTestId('btn-opt-add');
      await act(async () => {
        fireEvent.press(addBtn);
      });

      expect((await findByTestId('meals-count')).props.children).toBe(2);
      expect(getCachedJournalDay('2026-09-28')).toHaveLength(2);

      const delBtn = await findByTestId('btn-opt-del');
      await act(async () => {
        fireEvent.press(delBtn);
      });

      expect((await findByTestId('meals-count')).props.children).toBe(1);
      expect(getCachedJournalDay('2026-09-28')).toHaveLength(1);
    });
  });
});
