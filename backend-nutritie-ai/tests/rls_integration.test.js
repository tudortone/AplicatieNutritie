'use strict';

/**
 * B-05 — Test REAL de RLS, pe Postgres (nu pe un mock).
 *
 * RLS traieste in Postgres; un jest.mock('@supabase/supabase-js') nu poate
 * demonstra nimic despre el. Acest test se conecteaza la o baza Supabase reala
 * cu doua JWT-uri autentice si probeaza, pe un tabel de proba, ca utilizatorul B
 * nu poate citi randul lui A chiar daca interogheaza direct.
 *
 * SE RULEAZA SEPARAT: `npm run test:integration`. Nu se include in suita CI
 * rapida. Daca variabilele de mai jos lipsesc, suita se salta (describe.skip),
 * ca CI-ul rapid sa nu fie blocat de un Postgres absent.
 *
 * Variabile de mediu necesare (ex. dupa `supabase start` local):
 *   INTEGRATION_SUPABASE_URL   http://localhost:54321
 *   INTEGRATION_ANON_KEY       cheia anon a proiectului
 *   INTEGRATION_JWT_SECRET     secretul JWT (postgres.role din config.toml)
 *   INTEGRATION_DB_URL         postgres://postgres:postgres@localhost:54322/postgres
 */

const pg = require('pg');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');

const URL = process.env.INTEGRATION_SUPABASE_URL;
const ANON_KEY = process.env.INTEGRATION_ANON_KEY;
const JWT_SECRET = process.env.INTEGRATION_JWT_SECRET;
const DB_URL = process.env.INTEGRATION_DB_URL;

const configurat = Boolean(URL && ANON_KEY && JWT_SECRET && DB_URL);

const USER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const RAND_A = '11111111-1111-4111-8111-111111111111';
const RAND_B = '22222222-2222-4222-8222-222222222222';

/** Emite un JWT real, cu claims identice unui access token Supabase. */
function emiteJwt(sub) {
  const acum = Math.floor(Date.now() / 1000);
  return jwt.sign(
    { aud: 'authenticated', role: 'authenticated', sub, iat: acum, exp: acum + 3600 },
    JWT_SECRET,
    { algorithm: 'HS256' },
  );
}

// Daca nu e configurat, suita e skipp-ata; `npm test` nu e blocat.
const testDescribe = configurat ? describe : describe.skip;

testDescribe('B-05 — RLS pe Postgres real (fara jest.mock)', () => {
  let pool;
  let clientA;
  let clientB;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: DB_URL, max: 2 });

    // Tabel de proba, izolat de schema reala, ca sa nu depinda testul de ce
    // exista deja si sa nu lase gunoi in urma. Politica identica cu cele reale:
    // fiecare utilizator vede doar randurile cu user_id = auth.uid().
    await pool.query('CREATE TABLE IF NOT EXISTS rls_probe (id uuid PRIMARY KEY, user_id uuid NOT NULL, val text);');
    await pool.query('ALTER TABLE rls_probe ENABLE ROW LEVEL SECURITY;');
    await pool.query('DROP POLICY IF EXISTS rls_probe_own ON rls_probe;');
    await pool.query(
      'CREATE POLICY rls_probe_own ON rls_probe FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);',
    );
    await pool.query('DELETE FROM rls_probe;');

    // Doi clienti reali, legati de cate un JWT autentic diferit.
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
    try { await pool.query('DROP TABLE IF EXISTS rls_probe;'); } catch { /* curatenie best-effort */ }
    try { await pool.end(); } catch { /* ignoram */ }
  });

  it('A isi poate scrie si citi propriul rand (control pozitiv)', async () => {
    const { error: errIns } = await clientA
      .from('rls_probe')
      .insert({ id: RAND_A, user_id: USER_A, val: 'secretul lui A' });
    expect(errIns).toBeNull();

    const { data } = await clientA.from('rls_probe').select('*').eq('user_id', USER_A);
    expect(data).toHaveLength(1);
    expect(data[0].val).toBe('secretul lui A');
  });

  it('utilizatorul B NU poate citi randul lui A nici cu interogare directa', async () => {
    const { data } = await clientB.from('rls_probe').select('*').eq('user_id', USER_A);
    expect(data).toHaveLength(0);
  });

  it('utilizatorul B nu poate insera pe numele lui A (WITH CHECK respinge)', async () => {
    const { error } = await clientB
      .from('rls_probe')
      .insert({ id: RAND_B, user_id: USER_A, val: 'atac' });
    expect(error).not.toBeNull();
  });

  it('politicile exista in pg_policies pentru toate tabelele cu date de utilizator (B-06)', async () => {
    const tabeleAsteptate = [
      'mese', 'profil', 'antrenamente', 'produse_camara',
      'gamificare', 'workout_logs', 'audit_log', 'barcode_estimari_utilizator',
    ];

    const { rows } = await pool.query(
      `select tablename
         from pg_policies
        where schemaname = 'public'
          and tablename = any($1::text[])
        group by tablename;`,
      [tabeleAsteptate],
    );
    const acoperite = new Set(rows.map((r) => r.tablename));
    for (const t of tabeleAsteptate) {
      expect(acoperite.has(t)).toBe(true);
    }
  });
});