'use strict';

/**
 * F-06 — exportul GDPR era truncat tacut de plafonul `max-rows` din PostgREST
 *        (implicit 1000 pe Supabase): un utilizator cu istoric lung primea un
 *        export INCOMPLET, prezentat ca fiind complet.
 * F-07 — stergerea contului nu atingea tabelele dead-letter (`credite_esuate`,
 *        `clerk_webhook_esuate`), care pastreaza `payload jsonb` cu PII si nu au
 *        cheie straina catre `auth.users` (deci nici cascada `deleteUser`).
 */

const {
  citesteTotPaginat,
  stergeDeadLetterUtilizator,
  stergeEvenimenteRtdnUtilizator,
  DIMENSIUNE_PAGINA_EXPORT,
} = require('../utils/gdprServices');
const {
  TABELE_CU_RLS_UTILIZATOR,
  TABELE_STERGERE_GDPR_UTILIZATOR,
} = require('../utils/clientUtilizator');
const express = require('express');
const request = require('supertest');
const createGdprRouter = require('../routes/gdpr');

const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CLERK = 'user_clerk_123';

/**
 * Client fals care imita plafonul PostgREST: onoreaza `.range()` si nu
 * intoarce niciodata mai mult de `maxRows` randuri intr-un singur raspuns.
 */
function creeazaClientCuPlafon(randuri, maxRows = DIMENSIUNE_PAGINA_EXPORT) {
  let apeluri = 0;
  const client = {
    apeluri: () => apeluri,
    from: () => {
      const q = {
        _de_la: 0,
        _pana_la: maxRows - 1,
        select: () => q,
        eq: () => q,
        order: () => q,
        range: (de_la, pana_la) => {
          q._de_la = de_la;
          q._pana_la = pana_la;
          return q;
        },
        then: (resolve) => {
          apeluri += 1;
          const cerute = q._pana_la - q._de_la + 1;
          const felie = randuri.slice(q._de_la, q._de_la + Math.min(cerute, maxRows));
          resolve({ data: felie, error: null });
        },
      };
      return q;
    },
  };
  return client;
}

describe('F-06 — exportul GDPR nu mai este truncat', () => {
  it('citeste TOATE randurile peste plafonul implicit de 1000', async () => {
    const total = 2500;
    const randuri = Array.from({ length: total }, (_, i) => ({ id: i + 1, user_id: USER }));
    const client = creeazaClientCuPlafon(randuri);

    const rezultat = await citesteTotPaginat({ client, tabela: 'mese', userId: USER });

    expect(rezultat).toHaveLength(total);
    expect(rezultat[0].id).toBe(1);
    expect(rezultat[total - 1].id).toBe(total);
    // 1000 + 1000 + 500 => 3 pagini
    expect(client.apeluri()).toBe(3);
  });

  it('exact la limita (1000) nu pierde randuri si nu bucleaza la infinit', async () => {
    const randuri = Array.from({ length: 1000 }, (_, i) => ({ id: i + 1, user_id: USER }));
    const client = creeazaClientCuPlafon(randuri);
    const rezultat = await citesteTotPaginat({ client, tabela: 'mese', userId: USER });
    expect(rezultat).toHaveLength(1000);
    expect(client.apeluri()).toBe(2); // a doua pagina vine goala si opreste bucla
  });

  it('tabela goala intoarce lista goala, cu un singur apel', async () => {
    const client = creeazaClientCuPlafon([]);
    const rezultat = await citesteTotPaginat({ client, tabela: 'mese', userId: USER });
    expect(rezultat).toEqual([]);
    expect(client.apeluri()).toBe(1);
  });

  it('propaga eroarea in loc sa intoarca un export partial ca succes', async () => {
    const client = {
      from: () => {
        const q = {
          select: () => q,
          eq: () => q,
          order: () => q,
          range: () => q,
          then: (resolve) => resolve({ data: null, error: { message: 'boom' } }),
        };
        return q;
      },
    };
    await expect(
      citesteTotPaginat({ client, tabela: 'mese', userId: USER }),
    ).rejects.toBeDefined();
  });

  it('include jurnalul de audit in exportul portabil al utilizatorului', async () => {
    const randuriPeTabela = {
      mese: [],
      antrenamente: [],
      barcode_estimari_utilizator: [],
      audit_log: [{ id: 7, user_id: USER, action: 'login' }],
    };
    const db = {
      from: (tabela) => {
        const q = {
          select: () => q,
          eq: () => q,
          order: () => q,
          range: async (deLa, panaLa) => ({
            data: (randuriPeTabela[tabela] || []).slice(deLa, panaLa + 1),
            error: null,
          }),
        };
        return q;
      },
    };
    const app = express();
    app.use(express.json());
    app.use('/api/user', createGdprRouter({
      requireAuth: (_req, _res, next) => next(),
      generalLimiter: (_req, _res, next) => next(),
      supabaseAdmin: {
        from: () => {
          const q = {
            select: () => q,
            eq: () => q,
            order: () => q,
            range: async () => ({ data: [], error: null }),
          };
          return q;
        },
      },
      contextDate: () => ({ db, userId: USER }),
      profilRepo: { getProfil: async () => ({ user_id: USER }) },
    }));

    const raspuns = await request(app).get('/api/user/export-data');

    expect(raspuns.status).toBe(200);
    expect(raspuns.body.audit_log).toEqual(randuriPeTabela.audit_log);
  });

  it('include toate autoritatile user-owned si abonamentul fara tokenuri brute', async () => {
    const orderByTable = {};
    const randuriPeTabela = Object.fromEntries(
      TABELE_CU_RLS_UTILIZATOR.map((tabela) => [
        tabela,
        tabela === 'profil' ? [] : [{ id: `${tabela}-1`, user_id: USER }],
      ]),
    );
    const db = {
      from: (tabela) => {
        const q = {
          select: () => q,
          eq: () => q,
          order: (coloana) => {
            orderByTable[tabela] = coloana;
            return q;
          },
          range: async (deLa, panaLa) => ({
            data: (randuriPeTabela[tabela] || []).slice(deLa, panaLa + 1),
            error: null,
          }),
        };
        return q;
      },
    };
    const abonament = {
      purchase_token_hash: 'a'.repeat(64),
      product_id: 'getflow_pro',
      subscription_state: 'SUBSCRIPTION_STATE_ACTIVE',
      is_entitled: true,
      purchase_token: 'SECRET_TOKEN_NU_TREBUIE_EXPORTAT',
    };
    const supabaseAdmin = {
      from: (tabela) => {
        expect(tabela).toBe('google_play_subscriptions');
        const q = {
          select: (coloane) => {
            expect(coloane).not.toContain('purchase_token,');
            expect(coloane).not.toContain('linked_purchase_token');
            expect(coloane).not.toContain('replaced_by_purchase_token');
            return q;
          },
          eq: (_coloana, valoare) => {
            expect(valoare).toBe(USER);
            return q;
          },
          order: () => q,
          range: async () => ({ data: [{ ...abonament, purchase_token: undefined }], error: null }),
        };
        return q;
      },
    };
    const app = express();
    app.use('/api/user', createGdprRouter({
      requireAuth: (req, _res, next) => {
        req.user = { id: USER, email: 'user@example.test', provider: 'supabase' };
        next();
      },
      generalLimiter: (_req, _res, next) => next(),
      supabaseAdmin,
      contextDate: () => ({ db, userId: USER }),
      profilRepo: { getProfil: async () => ({ user_id: USER, nume: 'Test' }) },
    }));

    const raspuns = await request(app).get('/api/user/export-data');

    expect(raspuns.status).toBe(200);
    expect(Object.keys(raspuns.body).slice(3)).toEqual([
      'profil',
      'mese',
      'antrenamente',
      'produse_camara',
      'gamificare',
      'gamificare_evenimente',
      'workout_logs',
      'audit_log',
      'estimari_barcode',
      'ai_jobs',
      'credite_ai',
      'credite_tranzactii',
      'flow_credit_reservations',
      'flow_reward_intents',
      'abonamente_google_play',
    ]);
    expect(raspuns.body.abonamente_google_play[0]).not.toHaveProperty('purchase_token');
    expect(JSON.stringify(raspuns.body)).not.toContain('SECRET_TOKEN_NU_TREBUIE_EXPORTAT');
    expect(orderByTable.barcode_estimari_utilizator).toBe('code');
    expect(orderByTable.credite_ai).toBe('user_id');
  });
});

describe('F-07 — stergerea GDPR curata si tabelele dead-letter', () => {
  it('registrul de stergere include ledger-ele de gamificare si credite', () => {
    expect(TABELE_STERGERE_GDPR_UTILIZATOR).toEqual(expect.arrayContaining([
      'gamificare_evenimente',
      'credite_tranzactii',
    ]));
  });

  it('sterge evenimentele RTDN legate indirect de hash inaintea abonamentului', async () => {
    const operatii = [];
    const hash = 'b'.repeat(64);
    const admin = {
      from: (tabela) => {
        if (tabela === 'google_play_subscriptions') {
          const q = {
            select: () => q,
            eq: () => q,
            order: () => q,
            range: async () => ({ data: [{ purchase_token_hash: hash }], error: null }),
          };
          return q;
        }
        return {
          delete: () => ({
            in: async (coloana, valori) => {
              operatii.push({ tabela, coloana, valori });
              return { error: null };
            },
          }),
        };
      },
    };

    await stergeEvenimenteRtdnUtilizator({ supabaseAdmin: admin, userId: USER });

    expect(operatii).toEqual([{
      tabela: 'google_play_rtdn_events',
      coloana: 'purchase_token_hash',
      valori: [hash],
    }]);
  });

  function creeazaAdminFals() {
    const sterse = [];
    return {
      sterse,
      from: (tabela) => ({
        delete: () => ({
          in: async (coloana, valori) => {
            sterse.push({ tabela, coloana, valori });
            return { error: null };
          },
          eq: async (coloana, valoare) => {
            sterse.push({ tabela, coloana, valori: [valoare] });
            return { error: null };
          },
        }),
      }),
    };
  }

  it('sterge credite_esuate dupa AMBELE identitati (Supabase si Clerk)', async () => {
    const admin = creeazaAdminFals();
    await stergeDeadLetterUtilizator({ supabaseAdmin: admin, userId: USER, clerkUserId: CLERK });

    const credite = admin.sterse.find((s) => s.tabela === 'credite_esuate');
    expect(credite).toBeDefined();
    expect(credite.coloana).toBe('app_user_id');
    expect(credite.valori).toEqual([USER, CLERK]);
  });

  it('sterge clerk_webhook_esuate dupa clerk_user_id', async () => {
    const admin = creeazaAdminFals();
    await stergeDeadLetterUtilizator({ supabaseAdmin: admin, userId: USER, clerkUserId: CLERK });

    const clerk = admin.sterse.find((s) => s.tabela === 'clerk_webhook_esuate');
    expect(clerk).toBeDefined();
    expect(clerk.coloana).toBe('clerk_user_id');
    expect(clerk.valori).toEqual([CLERK]);
  });

  it('utilizator fara identitate Clerk: sterge doar credite_esuate', async () => {
    const admin = creeazaAdminFals();
    await stergeDeadLetterUtilizator({ supabaseAdmin: admin, userId: USER, clerkUserId: null });

    expect(admin.sterse.map((s) => s.tabela)).toEqual(['credite_esuate']);
    expect(admin.sterse[0].valori).toEqual([USER]);
  });

  it('fara nicio identitate nu executa nimic', async () => {
    const admin = creeazaAdminFals();
    await stergeDeadLetterUtilizator({ supabaseAdmin: admin, userId: null, clerkUserId: null });
    expect(admin.sterse).toHaveLength(0);
  });

  it('o tabela inexistenta pe mediu este tolerata, dar alte erori opresc stergerea', async () => {
    const adminTabelaLipsa = {
      from: () => ({
        delete: () => ({
          in: async () => ({ error: { code: '42P01' } }),
          eq: async () => ({ error: { code: '42P01' } }),
        }),
      }),
    };
    await expect(
      stergeDeadLetterUtilizator({ supabaseAdmin: adminTabelaLipsa, userId: USER, clerkUserId: CLERK }),
    ).resolves.toBeUndefined();

    const adminEroareReala = {
      from: () => ({
        delete: () => ({
          in: async () => ({ error: { code: '42501', message: 'permission denied' } }),
          eq: async () => ({ error: null }),
        }),
      }),
    };
    await expect(
      stergeDeadLetterUtilizator({ supabaseAdmin: adminEroareReala, userId: USER, clerkUserId: CLERK }),
    ).rejects.toBeDefined();
  });
});
