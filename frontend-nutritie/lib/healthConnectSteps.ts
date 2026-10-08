export type HealthConnectPermission = {
  accessType: 'read' | 'write';
  recordType: string;
};

export type HealthConnectStepsApi = {
  initialize: () => Promise<boolean>;
  getGrantedPermissions: () => Promise<HealthConnectPermission[]>;
  requestPermission: (permissions: HealthConnectPermission[]) => Promise<HealthConnectPermission[]>;
  aggregateRecord: (request: {
    recordType: 'Steps';
    timeRangeFilter: {
      operator: 'between';
      startTime: string;
      endTime: string;
    };
  }) => Promise<{ COUNT_TOTAL?: unknown }>;
};

const READ_STEPS_PERMISSION: HealthConnectPermission = {
  accessType: 'read',
  recordType: 'Steps',
};

function includesReadSteps(permissions: HealthConnectPermission[]): boolean {
  return permissions.some((permission) =>
    permission.accessType === 'read' && permission.recordType === 'Steps');
}

export function getLocalDayRange(now: Date = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return { startTime: start.toISOString(), endTime: now.toISOString() };
}

export function createHealthConnectStepProvider(api: HealthConnectStepsApi) {
  return Object.freeze({
    initialize: () => api.initialize(),
    async hasReadPermission() {
      return includesReadSteps(await api.getGrantedPermissions());
    },
    async requestReadPermission() {
      return includesReadSteps(await api.requestPermission([READ_STEPS_PERMISSION]));
    },
    async readToday(now: Date = new Date()): Promise<number | null> {
      const result = await api.aggregateRecord({
        recordType: 'Steps',
        timeRangeFilter: {
          operator: 'between',
          ...getLocalDayRange(now),
        },
      });
      const total = Number(result?.COUNT_TOTAL);
      return Number.isFinite(total) && total >= 0 ? Math.round(total) : null;
    },
  });
}

export type HealthConnectStepProvider = ReturnType<typeof createHealthConnectStepProvider>;
