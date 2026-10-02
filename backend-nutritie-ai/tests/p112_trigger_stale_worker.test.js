'use strict';

/**
 * P1-12 — un worker VECHI nu are voie sa suprascrie o stare finala mai noua.
 *
 * `updateAiJob` facea un `.update(patch).eq('id', jobId)` neconditionat. Trigger.dev
 * reia task-ul de pana la 3 ori (maxAttempts: 3); o incercare ramasa in urma care
 * isi scrie esecul DUPA ce o incercare ulterioara a marcat `completed` ar sterge
 * rezultatul reusit si ar lasa utilizatorul cu un job „esuat" desi analiza reusise.
 *
 * Fix: scrierea se face doar cat timp jobul NU este deja `completed` — filtrul
 * merge in DB (nu in Node), deci verificarea si scrierea sunt o singura operatie
 * atomica, fara fereastra de cursa intre citire si scriere.
 */

jest.mock('@trigger.dev/sdk/v3', () => ({ task: (definitie) => definitie }));
jest.mock('@google/generative-ai', () => ({ GoogleGenerativeAI: class {} }));

const filtreAplicate = [];
let ultimulPatch = null;

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      update(patch) {
        ultimulPatch = patch;
        const constructor = {
          filtre: [],
          eq(coloana, valoare) {
            this.filtre.push(['eq', coloana, valoare]);
            return this;
          },
          not(coloana, operator, valoare) {
            this.filtre.push(['not', coloana, operator, valoare]);
            return this;
          },
          then(resolve) {
            filtreAplicate.push(this.filtre);
            return Promise.resolve({ error: null }).then(resolve);
          },
        };
        return constructor;
      },
    }),
  }),
}));

describe('P1-12 — finalizarea jobului AI este protejata de workeri stale', () => {
  let updateAiJob;

  beforeAll(() => {
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test';
    // Functia e deja expusa pentru teste prin `_test` — nu largim suprafata modulului.
    ({ updateAiJob } = require('../src/trigger/analiza-mancare-ai')._test);
  });

  beforeEach(() => {
    filtreAplicate.length = 0;
    ultimulPatch = null;
  });

  test('updateAiJob este accesibil pentru verificare', () => {
    expect(typeof updateAiJob).toBe('function');
  });

  test('scrierea unui esec NU poate atinge un job deja `completed`', async () => {
    await updateAiJob('job-1', { status: 'failed', error_code: 'TIMEOUT' });

    expect(ultimulPatch).toEqual({ status: 'failed', error_code: 'TIMEOUT' });
    expect(filtreAplicate[0]).toEqual(
      expect.arrayContaining([['not', 'status', 'eq', 'completed']]),
    );
  });

  test('filtrul pe id ramane prezent (nu se ating jobs-urile altora)', async () => {
    await updateAiJob('job-2', { status: 'processing' });
    expect(filtreAplicate[0]).toEqual(
      expect.arrayContaining([['eq', 'id', 'job-2']]),
    );
  });

  test('marcarea `processing` a unei reluari nu poate reseta un `completed`', async () => {
    await updateAiJob('job-3', { status: 'processing' });
    expect(filtreAplicate[0]).toEqual(
      expect.arrayContaining([['not', 'status', 'eq', 'completed']]),
    );
  });

  test('un jobId absent nu produce nicio scriere', async () => {
    await updateAiJob(null, { status: 'failed' });
    expect(filtreAplicate).toHaveLength(0);
  });
});
