import {
  createHealthConnectStepProvider,
  getLocalDayRange,
} from '../lib/healthConnectSteps';

function apiHarness() {
  return {
    initialize: jest.fn().mockResolvedValue(true),
    getGrantedPermissions: jest.fn().mockResolvedValue([
      { accessType: 'read', recordType: 'Steps' },
    ]),
    requestPermission: jest.fn().mockResolvedValue([
      { accessType: 'read', recordType: 'Steps' },
    ]),
    aggregateRecord: jest.fn().mockResolvedValue({ COUNT_TOTAL: 4321 }),
  };
}

describe('Health Connect daily steps authority', () => {
  test('uses the local calendar day while sending exact instants to Health Connect', () => {
    const now = new Date(2026, 9, 2, 13, 45, 30, 250);

    expect(getLocalDayRange(now)).toEqual({
      startTime: new Date(2026, 9, 2, 0, 0, 0, 0).toISOString(),
      endTime: now.toISOString(),
    });
  });

  test('recognizes only the granted read Steps permission', async () => {
    const api = apiHarness();
    const provider = createHealthConnectStepProvider(api);

    await expect(provider.initialize()).resolves.toBe(true);
    await expect(provider.hasReadPermission()).resolves.toBe(true);

    api.getGrantedPermissions.mockResolvedValue([
      { accessType: 'write', recordType: 'Steps' },
    ]);
    await expect(provider.hasReadPermission()).resolves.toBe(false);
  });

  test('requests only read access to Steps', async () => {
    const api = apiHarness();
    const provider = createHealthConnectStepProvider(api);

    await expect(provider.requestReadPermission()).resolves.toBe(true);
    expect(api.requestPermission).toHaveBeenCalledWith([
      { accessType: 'read', recordType: 'Steps' },
    ]);
  });

  test('reads an aggregated daily total to avoid double-counting overlapping sources', async () => {
    const api = apiHarness();
    const provider = createHealthConnectStepProvider(api);
    const now = new Date(2026, 9, 2, 17, 10, 0, 0);

    await expect(provider.readToday(now)).resolves.toBe(4321);
    expect(api.aggregateRecord).toHaveBeenCalledWith({
      recordType: 'Steps',
      timeRangeFilter: {
        operator: 'between',
        ...getLocalDayRange(now),
      },
    });
  });

  test('rejects malformed aggregates instead of fabricating a step value', async () => {
    const api = apiHarness();
    const provider = createHealthConnectStepProvider(api);
    api.aggregateRecord.mockResolvedValue({ COUNT_TOTAL: -7 });

    await expect(provider.readToday(new Date())).resolves.toBeNull();
  });
});
