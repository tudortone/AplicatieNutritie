'use strict';

jest.mock('@sentry/node', () => ({
  withScope: jest.fn((cb) => cb({
    setLevel: jest.fn(),
    setTag: jest.fn(),
    captureException: jest.fn(),
  })),
}));

const Sentry = require('@sentry/node');
const { reconciliaCrediteConsumate } = require('../utils/reconcileCredite');

describe('Reconciliere credite (H3)', () => {
  test('RPC returneaza randuri orfane => raportate ca procesate', async () => {
    const randuri = [
      { consum_id: 'a', user_id: 'u1', event_id: 'evt-1', refund_event_id: 'refund:evt-1', sold_nou: 3 },
      { consum_id: 'b', user_id: 'u2', event_id: 'evt-2', refund_event_id: 'refund:evt-2', sold_nou: 2 },
    ];
    const supabaseAdmin = { rpc: jest.fn(async () => ({ data: randuri, error: null })) };
    const rezultat = await reconciliaCrediteConsumate({ supabaseAdmin });

    expect(supabaseAdmin.rpc).toHaveBeenCalledWith('reconcilia_credite_consumate');
    expect(rezultat).toEqual({ procesate: 2, erori: 0 });
  });

  test('fara randuri orfane => procesate 0, fara eroare', async () => {
    const supabaseAdmin = { rpc: jest.fn(async () => ({ data: [], error: null })) };
    const rezultat = await reconciliaCrediteConsumate({ supabaseAdmin });
    expect(rezultat).toEqual({ procesate: 0, erori: 0 });
  });

  test('eroare RPC => fail-loud in Sentry (banii nu se inghit)', async () => {
    const supabaseAdmin = { rpc: jest.fn(async () => ({ data: null, error: { message: 'RPC failed' } })) };
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const rezultat = await reconciliaCrediteConsumate({ supabaseAdmin });

    expect(rezultat).toEqual({ procesate: 0, erori: 1 });
    expect(Sentry.withScope).toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  test('fara supabaseAdmin => tick ratat, procesate 0, erori 1', async () => {
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const rezultat = await reconciliaCrediteConsumate({});
    expect(rezultat).toEqual({ procesate: 0, erori: 1 });
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
