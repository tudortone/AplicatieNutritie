'use strict';

const mockState = {
  reservation: null,
  job: null,
  inferenceCalls: 0,
  generationError: null,
  loseCommitResponse: false,
  events: [],
};

function mockBuildQuery(table) {
  let operation = 'select';
  let patch = null;
  const filters = [];
  const query = {
    select() { operation = 'select'; return this; },
    update(value) { operation = 'update'; patch = value; return this; },
    eq(column, value) { filters.push(['eq', column, value]); return this; },
    not(column, operator, value) { filters.push(['not', column, operator, value]); return this; },
    async maybeSingle() {
      const row = table === 'ai_jobs' ? mockState.job : mockState.reservation;
      const matches = filters.every(([kind, column, value]) => {
        if (kind !== 'eq') return true;
        return row?.[column] === value;
      });
      return { data: matches ? row : null, error: null };
    },
    then(resolve, reject) {
      if (operation === 'update' && table === 'ai_jobs') {
        const allowed = filters.every(([kind, column, operator, value]) => {
          if (kind === 'eq') return mockState.job?.[column] === operator;
          return kind !== 'not' || mockState.job?.[column] !== value;
        });
        if (allowed) Object.assign(mockState.job, patch);
      }
      return Promise.resolve({ data: null, error: null }).then(resolve, reject);
    },
  };
  return query;
}

jest.mock('@trigger.dev/sdk/v3', () => ({ task: (definition) => definition }));
jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table) => mockBuildQuery(table),
    async rpc(name, args) {
      if (name === 'claim_flow_photo_inference') {
        if (mockState.reservation.inference_claimed_at) {
          return { data: { ok: true, acquired: false, result: mockState.reservation.result }, error: null };
        }
        mockState.reservation.inference_claimed_at = args.p_now;
        mockState.job.status = 'running';
        return { data: { ok: true, acquired: true }, error: null };
      }
      if (name === 'record_flow_photo_result') {
        mockState.events.push('record');
        if (!mockState.reservation.result) mockState.reservation.result = args.p_result;
        mockState.job.result = mockState.reservation.result;
        return { data: { ok: true, result: mockState.reservation.result }, error: null };
      }
      if (name === 'mark_flow_photo_outcome_unknown') {
        mockState.reservation.outcome_unknown_at = args.p_now;
        mockState.job.status = 'failed';
        mockState.job.error_code = 'PHOTO_OUTCOME_UNKNOWN';
        return { data: { ok: true, pending: true, code: 'PHOTO_OUTCOME_UNKNOWN' }, error: null };
      }
      if (name === 'settle_flow_photo_credit_v2') {
        mockState.events.push(args.p_action);
        if (mockState.reservation.status === 'RESERVED') {
          mockState.reservation.status = args.p_action === 'commit' ? 'COMMITTED' : 'RELEASED';
          mockState.job.status = args.p_action === 'commit' ? 'succeeded' : 'failed';
        }
        if (mockState.loseCommitResponse && args.p_action === 'commit') {
          mockState.loseCommitResponse = false;
          return { data: null, error: new Error('simulated response loss after commit') };
        }
        return { data: { ok: true, status: mockState.reservation.status }, error: null };
      }
      throw new Error(`Unexpected RPC ${name}`);
    },
  }),
}));
jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel() {
      return {
        generateContent: async () => {
          mockState.inferenceCalls += 1;
          if (mockState.generationError) throw mockState.generationError;
          return { response: { text: () => JSON.stringify([{
            nume: 'Orez', estimare_grame: 150, calorii_per_100g: 130,
            proteine_per_100g: 2.7, grasimi_per_100g: 0.3, carbohidrati_per_100g: 28,
          }]) } };
        },
      };
    }
  },
}));

const USER_ID = '11111111-1111-4111-8111-111111111111';
const JOB_ID = '22222222-2222-4222-8222-222222222222';
const RESERVATION_ID = '33333333-3333-4333-8333-333333333333';
const LOGICAL_ID = 'meal-operation-1';
const FINGERPRINT = 'a'.repeat(64);
const IMAGE_URL = `https://ik.imagekit.io/getflow/mancare/${USER_ID}/meal.png`;
const PAYLOAD = Object.freeze({
  userId: USER_ID,
  jobId: JOB_ID,
  reservationId: RESERVATION_ID,
  logicalAnalysisId: LOGICAL_ID,
  requestFingerprint: FINGERPRINT,
  imageUrl: IMAGE_URL,
  imageFileId: null,
  tipMasa: 'pranz',
  limba: 'ro',
});
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe('photo worker durable inference and settlement', () => {
  let task;
  let previousEnv;
  let previousFetch;

  beforeEach(() => {
    mockState.reservation = {
      id: RESERVATION_ID,
      user_id: USER_ID,
      logical_analysis_id: LOGICAL_ID,
      status: 'RESERVED',
      request_fingerprint: FINGERPRINT,
      inference_claimed_at: null,
      outcome_unknown_at: null,
      result: null,
    };
    mockState.job = {
      id: JOB_ID,
      user_id: USER_ID,
      logical_analysis_id: LOGICAL_ID,
      image_url: IMAGE_URL,
      image_file_id: null,
      credit_reservation_id: RESERVATION_ID,
      status: 'queued',
      result: null,
    };
    mockState.inferenceCalls = 0;
    mockState.generationError = null;
    mockState.loseCommitResponse = false;
    mockState.events = [];
    previousEnv = { ...process.env };
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test';
    process.env.IMAGEKIT_URL_ENDPOINT = 'https://ik.imagekit.io/getflow';
    process.env.GEMINI_API_KEY = 'gemini-test';
    previousFetch = global.fetch;
    global.fetch = jest.fn(async () => ({
      status: 200,
      ok: true,
      headers: { get: (name) => name === 'content-type' ? 'image/png' : String(PNG.length) },
      arrayBuffer: async () => PNG,
    }));
    jest.resetModules();
    ({ analizaMancareTask: task } = require('../src/trigger/analiza-mancare-ai'));
  });

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in previousEnv)) delete process.env[key];
    }
    Object.assign(process.env, previousEnv);
    global.fetch = previousFetch;
  });

  test('persists a valid result before commit and reconciles a lost commit response without reinference', async () => {
    mockState.loseCommitResponse = true;
    await expect(task.run(PAYLOAD)).rejects.toThrow('FLOW_CREDIT_SETTLEMENT_FAILED');

    expect(mockState.events.slice(0, 2)).toEqual(['record', 'commit']);
    expect(mockState.reservation.status).toBe('COMMITTED');
    expect(mockState.reservation.result.success).toBe(true);
    expect(mockState.inferenceCalls).toBe(1);

    const replay = await task.run(PAYLOAD);
    expect(replay.success).toBe(true);
    expect(mockState.inferenceCalls).toBe(1);
    expect(mockState.job.status).toBe('succeeded');
  });

  test('a provider timeout after the atomic claim is held for reconciliation and never reinferred', async () => {
    mockState.generationError = new Error('provider timeout');
    await expect(task.run(PAYLOAD)).rejects.toThrow('provider timeout');
    mockState.generationError = null;

    await expect(task.run(PAYLOAD)).rejects.toThrow('PHOTO_OUTCOME_UNKNOWN');
    await task.onFailure({ payload: PAYLOAD, error: new Error('retry exhausted') });

    expect(mockState.inferenceCalls).toBe(1);
    expect(mockState.reservation.status).toBe('RESERVED');
    expect(mockState.reservation.result).toBeNull();
    expect(mockState.reservation.outcome_unknown_at).toEqual(expect.any(String));
    expect(mockState.events).not.toContain('release');
    expect(mockState.job.error_code).toBe('PHOTO_OUTCOME_UNKNOWN');
  });

  test('concurrent delivery grants only one inference claim for the same logical operation', async () => {
    const results = await Promise.allSettled([task.run(PAYLOAD), task.run(PAYLOAD)]);

    expect(results.some((result) => result.status === 'fulfilled')).toBe(true);
    expect(mockState.inferenceCalls).toBe(1);
    expect(mockState.reservation.status).toBe('COMMITTED');
    expect(mockState.job.status).toBe('succeeded');
  });
});
