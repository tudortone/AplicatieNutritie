'use strict';

// Client admin controlabil, ca sa verificam scrierile reale catre `profil`.
let apeluri = []; // fiecare intrare: { tabela, tip, payload, eq, onConflict }

const adminFake = {
  from(tabela) {
    return {
      upsert: async (payload, options) => {
        apeluri.push({ tabela, tip: 'upsert', payload, onConflict: options?.onConflict });
        return { error: null };
      },
      update: (payload) => ({
        eq: async (col, val) => {
          apeluri.push({ tabela, tip: 'update', payload, eq: [col, val] });
          return { error: null };
        },
      }),
      delete: () => ({
        eq: async (col, val) => {
          apeluri.push({ tabela, tip: 'delete', eq: [col, val] });
          return { error: null };
        },
      }),
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: null }),
        }),
      }),
    };
  },
};

describe('user-sync Trigger task — persistenta reala (nu doar raspuns)', () => {
  let executa;

  beforeAll(() => {
    const mod = require('../src/trigger/user-sync');
    executa = mod.executaSincronizare;
  });

  beforeEach(() => {
    apeluri = [];
  });

  test('user.created -> upsert in profil cu coloanele reale', async () => {
    const rezultat = await executa({
      admin: adminFake,
      action: 'user.created',
      clerkUserId: 'user_123',
      supabaseUserId: '11111111-1111-4111-8111-111111111111',
      email: 'a@b.c',
      meta: { calorii_tinta: 2200, proteine_tinta: 160 },
    });

    expect(rezultat.status).toBe('completed');
    const upserturi = apeluri.filter((a) => a.tabela === 'profil' && a.tip === 'upsert');
    expect(upserturi.length).toBe(1);
    expect(upserturi[0].onConflict).toBe('user_id');
    // Coloanele scrise trebuie sa fie cele reale din migrarea 0001, nu greutate_kg.
    const rand = upserturi[0].payload;
    expect(rand.calorii_tinta).toBe(2200);
    expect(rand.proteine_tinta).toBe(160);
    expect('greutate_kg' in rand).toBe(false);
    expect('greutate_tinta_kg' in rand).toBe(false);
  });

  test('user.updated -> update in profil pe user_id', async () => {
    const rezultat = await executa({
      admin: adminFake,
      action: 'user.updated',
      clerkUserId: 'user_123',
      supabaseUserId: '11111111-1111-4111-8111-111111111111',
      meta: { nume: 'Test User' },
    });

    expect(rezultat.status).toBe('completed');
    const updateuri = apeluri.filter((a) => a.tabela === 'profil' && a.tip === 'update');
    expect(updateuri.length).toBe(1);
    expect(updateuri[0].eq).toEqual(['user_id', '11111111-1111-4111-8111-111111111111']);
    expect(updateuri[0].payload.nume).toBe('Test User');
  });

  test('user.deleted -> sterge pe tabelele GDPR', async () => {
    const rezultat = await executa({
      admin: adminFake,
      action: 'user.deleted',
      clerkUserId: 'user_123',
      supabaseUserId: '11111111-1111-4111-8111-111111111111',
    });
    expect(rezultat.status).toBe('completed');
    const stergeri = apeluri
      .filter((a) => a.tip === 'delete')
      .filter((a) => ['mese', 'antrenamente', 'profil', 'barcode_estimari_utilizator'].includes(a.tabela));
    expect(stergeri.length).toBe(4);
  });

  test('user.deleted fara supabaseUserId, mapare lipsa -> deja purjat (idempotent)', async () => {
    const rezultat = await executa({
      admin: adminFake,
      action: 'user.deleted',
      clerkUserId: 'user_nemapat',
    });
    expect(rezultat.status).toBe('completed');
    expect(rezultat.alreadyPurged).toBe(true);
    expect(apeluri.filter((a) => a.tip === 'delete').length).toBe(0);
  });

  test('actiune necunoscuta -> ignored', async () => {
    const rezultat = await executa({ admin: adminFake, action: 'session.created', clerkUserId: 'x' });
    expect(rezultat.status).toBe('ignored');
  });
});