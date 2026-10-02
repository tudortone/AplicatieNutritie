'use strict';

jest.mock('../utils/barcode', () => ({
  citesteDinCacheGlobal: jest.fn(async () => null),
  citesteEstimareUtilizator: jest.fn(async () => null),
  salveazaProdusOff: jest.fn(async () => undefined),
  salveazaEstimareUtilizator: jest.fn(async () => undefined),
  verificaDreptDeScriere: jest.fn(async () => ({ permis: true })),
  salveazaProdusManual: jest.fn(async () => undefined),
}));

const barcode = require('../utils/barcode');
const createBarcodeRepo = require('../repositories/barcodeRepo');

describe('TASK-001 — separarea clientului RLS de serviciile backend-only', () => {
  beforeEach(() => jest.clearAllMocks());

  it('repo-ul tine service-role privat si contextul cererii contine doar clientul RLS', async () => {
    const supabaseAdmin = { nume: 'service-role' };
    const db = { nume: 'user-jwt-rls' };
    const ctx = {
      db,
      userId: '11111111-1111-4111-8111-111111111111',
    };
    const repo = createBarcodeRepo({ supabaseAdmin });

    await repo.getProdusBarcode(ctx, '5940000000014');
    await repo.citesteEstimareUtilizator(ctx, '5940000000014');

    expect(barcode.citesteDinCacheGlobal).toHaveBeenCalledWith(
      supabaseAdmin,
      '5940000000014',
    );
    expect(barcode.citesteEstimareUtilizator).toHaveBeenCalledWith(db, {
      userId: ctx.userId,
      cod: '5940000000014',
    });
    expect(ctx).not.toHaveProperty('admin');
  });

  it('scrierile backend-only folosesc service-role, iar estimarea utilizatorului foloseste ctx.db', async () => {
    const supabaseAdmin = { nume: 'service-role' };
    const db = { nume: 'user-jwt-rls' };
    const ctx = {
      db,
      userId: '11111111-1111-4111-8111-111111111111',
    };
    const repo = createBarcodeRepo({ supabaseAdmin });
    const produs = { nume: 'Produs' };

    await repo.salveazaProdusOff(ctx, {
      cod: '5940000000014',
      produs,
      payload: { sursa: 'off' },
    });
    await repo.salveazaEstimareUtilizator(ctx, {
      cod: '5940000000014',
      produs,
    });
    await repo.salveazaProdusBarcode(ctx, {
      code: '5940000000014',
      valori: produs,
    });

    expect(barcode.salveazaProdusOff).toHaveBeenCalledWith(supabaseAdmin, {
      cod: '5940000000014',
      produs,
      payload: { sursa: 'off' },
    });
    expect(barcode.salveazaEstimareUtilizator).toHaveBeenCalledWith(db, {
      userId: ctx.userId,
      cod: '5940000000014',
      produs,
    });
    expect(barcode.verificaDreptDeScriere).toHaveBeenCalledWith(supabaseAdmin, {
      cod: '5940000000014',
      userId: ctx.userId,
    });
    expect(barcode.salveazaProdusManual).toHaveBeenCalledWith(supabaseAdmin, {
      cod: '5940000000014',
      userId: ctx.userId,
      valori: produs,
    });
  });
});
