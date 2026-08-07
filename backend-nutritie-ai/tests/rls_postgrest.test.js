'use strict';

/**
 * P-15 / C2 — partea END-TO-END prin PostgREST (supabase-js + JWT real).
 *
 * Aici trăiesc afirmațiile care chiar au nevoie de PostgREST: verifică întregul
 * lanț JWT → claims → role → RLS așa cum îl folosește clientul real al aplicației.
 * Se testează pe tabela reală `mese` (politica reală `auth.uid() = user_id`).
 *
 * CI-ul `rls-integration` NU o rulează: imaginea `supabase/postgres` pornește
 * doar Postgres, iar `INTEGRATION_SUPABASE_URL` nu există acolo. Această suită
 * se SARE automat când URL-ul lipsește — prin design, nu un bug. (RLS-ul pur
 * Postgres, mereu rulat în CI, trăiește în `rls_integration.test.js`.)
 *
 * Cum se rulează LOCAL (necesită `supabase start` care pornește și PostgREST):
 *
 *   cd backend-nutritie-ai
 *   INTEGRATION_DB_URL='postgres://postgres:postgres@localhost:54322/postgres' \
 *   INTEGRATION_SUPABASE_URL='http://localhost:54321' \
 *   INTEGRATION_ANON_KEY='<cheia anon afișată de supabase start>' \
 *   INTEGRATION_JWT_SECRET='<secretul postgres.role din supabase/config.toml>' \
 *   node tests/runJestWithAnnotations.js tests/rls_postgrest.test.js
 *
 * Fără variabile, suita e sarită (describe.skip), nu eșuată — CI-ul rapid nu
 * trebuie blocat de un PostgREST absent.
 */

const pg = require('pg');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');

const URL = process.env.INTEGRATION_SUPABASE_URL;
const ANON_KEY = process.env.INTEGRATION_ANON_KEY;
const JWT_SECRET = process.env.INTEGRATION_JWT_SECRET;
const DB_URL = process.env.INTEGRATION_DB_URL;

const lipsesc = [];
if (!URL) lipsesc.push('INTEGRATION_SUPABASE_URL');
if (!ANON_KEY) lipsesc.push('INTEGRATION_ANON_KEY');
if (!JWT_SECRET) lipsesc.push('INTEGRATION_JWT_SECRET');

const configurat = lipsesc.length === 0;
if (!configurat) {
  console.warn(`[E-1] Suita RLS end-to-end (PostgREST) e SĂRITĂ. Lipsește: ${lipsesc.join(', ')}. Rulează doar cu 'supabase start'.`);
}

const describePostgrest = configurat ? describe : describe.skip;

const USER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

/** Emite un JWT real, cu claims identice unui access token Supabase. */
function emiteJwt(sub) {
  const acum = Math.floor(Date.now() / 1000);
  return jwt.sign(
    { aud: 'authenticated', role: 'authenticated', sub, iat: acum, exp: acum + 3600 },
    JWT_SECRET,
    { algorithm: 'HS256' },
  );
}

describePostgrest('B-05 — RLS pe Postgres real prin PostgREST (tabela reala mese)', () => {
  let pool;
  let clientA;
  let clientB;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: DB_URL, max: 2 });

    // Curățăm resturile unei eventuale rulări anterioare (rol postgres = BYPASSRLS).
    await pool.query('DELETE FROM public.mese WHERE user_id = ANY($1::uuid[])', [[USER_A, USER_B]]);

    // FK pe auth.users(id): fără rânduri în auth.users, INSERT-ul prin clientA
    // ar cădea. Idem trigger-ul on_auth_user_created din imagine, dacă există.
    await pool.query(
      'CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN RETURN NEW; END $$;',
    );
    await pool.query(
      'INSERT INTO auth.users (id, email, aud, role) VALUES ($1, $2, \'authenticated\', \'authenticated\'), ($3, $4, \'authenticated\', \'authenticated\') ON CONFLICT (id) DO NOTHING',
      [USER_A, 'rls_a@test.local', USER_B, 'rls_b@test.local'],
    );

    const jwtA = emiteJwt(USER_A);
    const jwtB = emiteJwt(USER_B);
    clientA = createClient(URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${jwtA}` } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    clientB = createClient(URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${jwtB}` } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  });

  afterAll(async () => {
    // Curățare finală, indiferent de rezultat (rol postgres = BYPASSRLS).
    try {
      await pool.query('DELETE FROM public.mese WHERE user_id = ANY($1::uuid[])', [[USER_A, USER_B]]);
    } catch { /* pool poate fi deja închis după un eșec */ }
    try { await pool.end(); } catch { /* pool deja închis */ }
  });

  it('A își poate scrie și citi propria masă (lanț JWT → claims → RLS)', async () => {
    const { error: errIns } = await clientA
      .from('mese')
      .insert({ user_id: USER_A, nume: 'masa secreta a lui A' });
    expect(errIns).toBeNull();

    const { data } = await clientA.from('mese').select('*').eq('user_id', USER_A);
    expect(data).toHaveLength(1);
    expect(data[0].nume).toBe('masa secreta a lui A');
  });

  it('B NU poate citi masa lui A nici prin PostgREST', async () => {
    const { data } = await clientB.from('mese').select('*').eq('user_id', USER_A);
    expect(data).toHaveLength(0);
  });

  it('B nu poate insera o masă pe user_id-ul lui A (WITH CHECK prin PostgREST)', async () => {
    const { error } = await clientB
      .from('mese')
      .insert({ user_id: USER_A, nume: 'atac' });
    expect(error).not.toBeNull();
  });
});
