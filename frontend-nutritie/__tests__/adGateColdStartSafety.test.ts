jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

import { AD_GATE_INITIAL_STATE } from '../lib/ads/adGate';

describe('adGateColdStartSafety — P0 Android cold-start safety verification', () => {
  it('must NOT call react-native-mmkv during loadAdGateState or saveAdGateState', () => {
    let mmkvCalled = false;
    jest.doMock('react-native-mmkv', () => {
      mmkvCalled = true;
      throw new Error('FATAL: react-native-mmkv must not be invoked during ad gate startup!');
    });

    // Reset module registry to force re-evaluation of adGateStore
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { loadAdGateState, saveAdGateState, purgeAdGateState } = require('../lib/ads/adGateStore');

    // Startup call made synchronously during AdsProvider render
    const initial = loadAdGateState('anon');
    expect(initial).toEqual(AD_GATE_INITIAL_STATE);

    // Save and purge operations must also be completely free of MMKV calls
    expect(() => {
      saveAdGateState('anon', {
        ...AD_GATE_INITIAL_STATE,
        successfulAnalysisCount: 2,
      });
    }).not.toThrow();

    expect(() => {
      purgeAdGateState('anon');
    }).not.toThrow();

    // Verify MMKV was NEVER invoked
    expect(mmkvCalled).toBe(false);
  });
});
