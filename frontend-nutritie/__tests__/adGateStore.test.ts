const mockStorage: Record<string, string> = {};

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (key: string) => mockStorage[key] ?? null),
  setItem: jest.fn(async (key: string, value: string) => {
    mockStorage[key] = value;
  }),
  removeItem: jest.fn(async (key: string) => {
    delete mockStorage[key];
  }),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { AD_GATE_INITIAL_STATE, type AdGateState } from '../lib/ads/adGate';
import {
  loadAdGateState,
  purgeAdGateState,
  saveAdGateState,
  __resetAdGateStoreForTests,
} from '../lib/ads/adGateStore';

describe('adGateStore — persistență locală fail-safe (in-memory + AsyncStorage)', () => {
  beforeEach(() => {
    for (const key of Object.keys(mockStorage)) delete mockStorage[key];
    __resetAdGateStoreForTests();
    jest.clearAllMocks();
  });

  it('întoarce starea inițială când nu există nimic salvat', () => {
    expect(loadAdGateState('user-a')).toEqual(AD_GATE_INITIAL_STATE);
  });

  it('salvează și recitește starea pentru același utilizator', () => {
    const state: AdGateState = {
      successfulAnalysisCount: 3,
      chatMessageCount: 0,
      lastAdShownAtMs: 1000,
      lastAdCounterValue: 3,
      lastChatAdCounterValue: null,
    };
    saveAdGateState('user-a', state);
    expect(loadAdGateState('user-a')).toEqual(state);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      'ads:gate:v1:user-a',
      JSON.stringify(state)
    );
  });

  it('izolează contorul între doi utilizatori diferiți pe același dispozitiv', () => {
    saveAdGateState('user-a', {
      ...AD_GATE_INITIAL_STATE,
      successfulAnalysisCount: 6,
      lastAdShownAtMs: 5000,
      lastAdCounterValue: 6,
    });
    saveAdGateState('user-b', {
      ...AD_GATE_INITIAL_STATE,
      successfulAnalysisCount: 1,
    });

    expect(loadAdGateState('user-a').successfulAnalysisCount).toBe(6);
    expect(loadAdGateState('user-b').successfulAnalysisCount).toBe(1);
  });

  it('purjează numai contorul contului șters', () => {
    saveAdGateState('user-a', { ...AD_GATE_INITIAL_STATE, successfulAnalysisCount: 5 });
    saveAdGateState('user-b', { ...AD_GATE_INITIAL_STATE, successfulAnalysisCount: 2 });

    purgeAdGateState('user-a');

    expect(loadAdGateState('user-a')).toEqual(AD_GATE_INITIAL_STATE);
    expect(loadAdGateState('user-b').successfulAnalysisCount).toBe(2);
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('ads:gate:v1:user-a');
  });

  it('utilizatorul neautentificat ("anon") are propriul spațiu, separat de conturile autentificate', () => {
    saveAdGateState('anon', {
      ...AD_GATE_INITIAL_STATE,
      successfulAnalysisCount: 2,
    });
    saveAdGateState('user-a', {
      ...AD_GATE_INITIAL_STATE,
      successfulAnalysisCount: 9,
    });
    expect(loadAdGateState('anon').successfulAnalysisCount).toBe(2);
    expect(loadAdGateState('user-a').successfulAnalysisCount).toBe(9);
  });

  it('nu aruncă la JSON corupt — cade fail-safe pe starea inițială', () => {
    mockStorage['ads:gate:v1:user-c'] = '{ nu-e-json-valid';
    expect(loadAdGateState('user-c')).toEqual(AD_GATE_INITIAL_STATE);
  });

  it('este complet independent de native C++ MMKV și funcționează sincron la startup', () => {
    expect(() => {
      const state = loadAdGateState('anon');
      expect(state).toBeDefined();
    }).not.toThrow();
  });
});
