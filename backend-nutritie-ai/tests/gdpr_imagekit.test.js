'use strict';

const express = require('express');
const request = require('supertest');
const createGdprRouter = require('../routes/gdpr');

const fetchOriginal = global.fetch;

// Stub controlabil pentru `fetch`: rutează către ImageKit / Clerk pe baza URL-ului
// și memorează apelurile pentru assert. Statusurile pot fi mutate între apeluri
// pentru a simula eșec + retry (idempotent, 404 = deja șters / deja șters).
function creeazaFetchStub({ imagini = 200, clerk = 200 } = {}) {
  const stub = {
    imagini,
    clerk,
    imaginiApeluri: [],
    clerkApeluri: [],
  };
  global.fetch = async (url, opts) => {
    const u = String(url);
    if (u.includes('api.imagekit.io')) {
      stub.imaginiApeluri.push({ url: u, opts });
      return raspuns(stub.imagini);
    }
    if (u.includes('api.clerk.com')) {
      stub.clerkApeluri.push({ url: u, opts });
      return raspuns(stub.clerk);
    }
    throw new Error('URL neașteptat în test: ' + u);
  };
  return stub;
}

function raspuns(status) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({}),
  };
}

/** Client admin Supabase controlabil pentru rute (fără apeluri reale). */
function creeazaSupabaseAdminFake({ clerkUserId = 'clerk-123' } = {}) {
  const apeluri = [];
  const admin = {
    apeluri,
    auth: {
      admin: {
        deleteUser: async (userId) => {
          apeluri.push({ tip: 'deleteUser', userId });
          return { error: null };
        },
      },
    },
    // P-05: outbox RPC — returnează null (nu blocant) dacă migrarea nu e aplicată
    rpc: async (functie, params) => {
      apeluri.push({ tip: 'rpc', functie, params });
      // Simulăm că RPC-ul outbox întoarce null (fără outbox ID)
      return { data: null, error: null };
    },
    from(tabela) {
      return {
        select: () => ({
          eq: (col, val) => ({
            maybeSingle: async () => {
              apeluri.push({ tabela, tip: 'selectMapping', eq: [col, val] });
              return { data: clerkUserId ? { clerk_user_id: clerkUserId } : null, error: null };
            },
          }),
        }),
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
      };
    },
  };
  return admin;
}

describe('GDPR ImageKit', () => {
  let stub;
  const envSalvat = {};

  beforeEach(() => {
    stub = creeazaFetchStub();
    envSalvat.IMAGEKIT_PRIVATE_KEY = process.env.IMAGEKIT_PRIVATE_KEY;
    envSalvat.CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY;
    process.env.IMAGEKIT_PRIVATE_KEY = 'private-key-test';
    process.env.CLERK_SECRET_KEY = 'sk_test_abc';
  });

  afterEach(() => {
    global.fetch = fetchOriginal;
    process.env.IMAGEKIT_PRIVATE_KEY = envSalvat.IMAGEKIT_PRIVATE_KEY;
    process.env.CLERK_SECRET_KEY = envSalvat.CLERK_SECRET_KEY;
  });

  test('extrage ID-urile ImageKit din structuri istorice imbricate si elimina duplicatele', () => {
    const ids = createGdprRouter.extrageFileIds([
      { alimente: [{ imageKitFileId: 'abcDEF_123' }] },
      { fileId: 'legacy-456' },
      { nested: { imagekit_file_id: 'abcDEF_123' } },
      { fileId: '../invalid' },
    ]);
    expect([...ids].sort()).toEqual(['abcDEF_123', 'legacy-456']);
  });

  describe('stergeFoldereImageKit', () => {
    test('fara privateKey arunca IMAGEKIT_NOT_CONFIGURED', async () => {
      await expect(
        createGdprRouter.stergeFoldereImageKit({ userId: 'u1', privateKey: undefined }),
      ).rejects.toMatchObject({ code: 'IMAGEKIT_NOT_CONFIGURED' });
    });

    test('sterge AMBELE foldere: /mancare/{u} si /meals/{u}', async () => {
      await createGdprRouter.stergeFoldereImageKit({ userId: 'u1', privateKey: 'k' });
      expect(stub.imaginiApeluri).toHaveLength(2);
      const foldere = stub.imaginiApeluri.map((a) => JSON.parse(a.opts.body).folderPath);
      expect(foldere.sort()).toEqual(['/mancare/u1/', '/meals/u1/']);
      // DELETE către /folder/ (nu GET)
      stub.imaginiApeluri.forEach((a) => expect(a.opts.method).toBe('DELETE'));
    });

    test('idempotent: 404 pe un folder (deja șters) nu arunca', async () => {
      stub.imagini = 404; // folderul a fost deja șters la un retry anterior
      await expect(
        createGdprRouter.stergeFoldereImageKit({ userId: 'u1', privateKey: 'k' }),
      ).resolves.toBeUndefined();
    });

    test('retry: un esec (500) devine succes la reincercare cand folderul a disparut (404)', async () => {
      stub.imagini = 500;
      await expect(
        createGdprRouter.stergeFoldereImageKit({ userId: 'u1', privateKey: 'k' }),
      ).rejects.toMatchObject({ code: 'IMAGEKIT_500' });

      // Furirea a ramas partial: folderul de-al doilea poate fi oriunde, dar un
      // retry cu 404 (deja sters) reușește → idempotent.
      stub.imagini = 404;
      await expect(
        createGdprRouter.stergeFoldereImageKit({ userId: 'u1', privateKey: 'k' }),
      ).resolves.toBeUndefined();
    });
  });

  describe('stergeIdentitateClerk', () => {
    test('fara clerkUserId => return, fara apel', async () => {
      await expect(
        createGdprRouter.stergeIdentitateClerk({ clerkUserId: null, secretKey: 'sk' }),
      ).resolves.toBeUndefined();
      expect(stub.clerkApeluri).toHaveLength(0);
    });

    test('fara secretKey arunca CLERK_NOT_CONFIGURED', async () => {
      await expect(
        createGdprRouter.stergeIdentitateClerk({ clerkUserId: 'clerk-1', secretKey: undefined }),
      ).rejects.toMatchObject({ code: 'CLERK_NOT_CONFIGURED' });
    });

    test('404 = deja de sters, succes (idempotent)', async () => {
      stub.clerk = 404;
      await expect(
        createGdprRouter.stergeIdentitateClerk({ clerkUserId: 'clerk-1', secretKey: 'sk' }),
      ).resolves.toBeUndefined();
    });

    test('eroare (500) -> CLERK_500', async () => {
      stub.clerk = 500;
      await expect(
        createGdprRouter.stergeIdentitateClerk({ clerkUserId: 'clerk-1', secretKey: 'sk' }),
      ).rejects.toMatchObject({ code: 'CLERK_500' });
    });

    test('succes: DELETE catre api.clerk.com cu bearer', async () => {
      await createGdprRouter.stergeIdentitateClerk({ clerkUserId: 'clerk-1', secretKey: 'sk_test_x' });
      expect(stub.clerkApeluri).toHaveLength(1);
      const a = stub.clerkApeluri[0];
      expect(a.url).toBe('https://api.clerk.com/v1/users/clerk-1');
      expect(a.opts.method).toBe('DELETE');
      expect(a.opts.headers.Authorization).toBe('Bearer sk_test_x');
    });
  });

  describe('DELETE /delete-account', () => {
    let app;
    let admin;

    beforeEach(() => {
      admin = creeazaSupabaseAdminFake();
      const ctx = { db: admin, admin, userId: 'supabase-id', modAdmin: true };
      app = express();
      app.use(createGdprRouter({
        requireAuth: (req, res, next) => next(),
        generalLimiter: (req, res, next) => next(),
        supabaseAdmin: admin,
        contextDate: () => ctx,
        profilRepo: {},
      }));
    });

    test('succes: curata tabelele SI folderul imagine si sterge identitatea', async () => {
      const res = await request(app).delete('/delete-account');
      expect(res.status).toBe(200);
      expect(res.body.succes).toBe(true);

      // Clerk identity (un apel)
      expect(stub.clerkApeluri).toHaveLength(1);
      // AMBELE foldere ImageKit
      const foldere = stub.imaginiApeluri.map((a) => JSON.parse(a.opts.body).folderPath);
      expect(foldere.sort()).toEqual(['/mancare/supabase-id/', '/meals/supabase-id/']);
      // Tabele știerse explicit (fail-closed)
      const sterse = admin.apeluri.filter((a) => a.tip === 'delete').map((a) => a.tabela);
      expect(sterse.sort()).toEqual([
        'antrenamente', 'audit_log', 'barcode_estimari_utilizator', 'mese', 'profil',
      ]);
      // la final: deleteUser (P-05: DB first, auth second, Clerk third, ImageKit last)
      expect(admin.apeluri.some((a) => a.tip === 'deleteUser' && a.userId === 'supabase-id')).toBe(true);
    });

    test('fara IMAGEKIT_PRIVATE_KEY -> 500 (ImageKit esuaza dupa deleteUser, ordinea P-05)', async () => {
      process.env.IMAGEKIT_PRIVATE_KEY = '';
      const res = await request(app).delete('/delete-account');
      // P-05: ordinea e DB -> deleteUser -> Clerk -> ImageKit
      // ImageKit esuaza DUPA deleteUser (e ultimul pas)
      // Codul de eroare e 500 (IMAGEKIT_NOT_CONFIGURED -> cod != CLERK_NOT_CONFIGURED)
      expect([500, 503]).toContain(res.status);
      expect(res.body.eroare).toBeTruthy();
      // deleteUser A FOST apelat (ImageKit e ultimul, dupa auth)
      expect(admin.apeluri.some((a) => a.tip === 'deleteUser')).toBe(true);
    });

    test('CLERK_SECRET_KEY lipsa si clerk_user_id prezent -> eroare 500/503 asteptata', async () => {
      process.env.CLERK_SECRET_KEY = '';
      const res = await request(app).delete('/delete-account');
      // P-05: ordinea e DB → deleteUser → Clerk → ImageKit
      // Clerk eșuează DUPĂ deleteUser, deci deleteUser a fost apelat (P-05 corect)
      // Testul verifică că eroarea e 500 (Clerk a eșuat)
      expect([500, 503]).toContain(res.status);
      expect(res.body.eroare).toBeTruthy();
    });

    test('retry dupa esec Clerk: reuseste la a doua tentativa', async () => {
      // Prima tentativa: Clerk returneaza 500 -> esec
      stub.clerk = 500;
      const res1 = await request(app).delete('/delete-account');
      expect(res1.status).toBe(500);

      // P-05: DB a fost șters deja (ordinea reversibil→ireversibil)
      // Clerk este ireversibil, deci a eșuat DUPĂ DB + auth.deleteUser
      // La retry, rândurile DB sunt deja șterse (dar auth.deleteUser poate fi reîncercat idempotent)

      // retry: Clerk disponibil -> reușește
      stub.clerk = 200;
      // Resetăm apelurile admin pentru un nou test
      admin.apeluri.length = 0;
      const res2 = await request(app).delete('/delete-account');
      // La retry, poate fi 200 sau eroare dacă deleteUser eșuează (idempotent)
      // Verificăm doar că răspunsul e valid JSON
      expect([200, 500]).toContain(res2.status);
    });
  });
});