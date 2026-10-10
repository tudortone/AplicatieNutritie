'use strict';

// Client admin controlabil, ca sa verificam scrierile reale catre `profil`.
let apeluri = []; // fiecare intrare: { tabela, tip, payload, eq, onConflict }

const adminFake = {
  from(tabela) {
    return {
      upsert: async (payload, options) => {
        apeluri.push({ tabela, tip: 'upsert', payload, onConflict: options?.onConflict, ignoreDuplicates: options?.ignoreDuplicates });
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
        eq: (_col, value) => ({
          maybeSingle: async () => ({
            data: value === 'user_123'
              ? { supabase_user_id: '11111111-1111-4111-8111-111111111111' }
              : null,
            error: null,
          }),
        }),
      }),
    };
  },
};

describe('user-sync Trigger task — containment pentru evenimente Clerk și joburi aflate în coadă', () => {
  let executa;

  beforeAll(() => {
    const mod = require('../src/trigger/user-sync');
    executa = mod.executaSincronizare;
  });

  beforeEach(() => {
    apeluri = [];
  });

  test.each(['user.created', 'user.updated', 'user.deleted'])(
    '%s vechi/reîncercat rămâne fără side effect indiferent de identity claims',
    async (action) => {
      const rezultat = await executa({
        admin: adminFake,
        action,
        clerkUserId: 'clerk_legacy',
        supabaseUserId: '11111111-1111-4111-8111-111111111111',
        email: 'victim@example.test',
        meta: { nume: 'spoofed', calorii_tinta: 9999 },
        data: { external_id: '11111111-1111-4111-8111-111111111111' },
      });

      expect(rezultat.status).toBe('ignored');
      expect(rezultat.motiv).toBe(action === 'user.deleted'
        ? 'CLERK_DELETE_NOT_SUPABASE_AUTHORITY'
        : 'CLERK_SYNC_REQUIRES_VERIFIED_ACCOUNT_LINK');
      expect(apeluri).toEqual([]);
    },
  );

  test('identități lipsă sau contradictorii nu citesc maparea și nu modifică profilul', async () => {
    for (const claims of [
      { action: 'user.updated', clerkUserId: 'unmapped' },
      { action: 'user.updated', clerkUserId: 'mapped', supabaseUserId: 'victim-a', data: { external_id: 'victim-b' } },
      { action: 'user.created', clerkUserId: 'legacy', email: 'victim@example.test' },
    ]) {
      expect((await executa({ admin: adminFake, ...claims })).status).toBe('ignored');
    }
    expect(apeluri).toEqual([]);
  });

  test('actiune necunoscuta -> ignored', async () => {
    const rezultat = await executa({ admin: adminFake, action: 'session.created', clerkUserId: 'x' });
    expect(rezultat.status).toBe('ignored');
  });
});
