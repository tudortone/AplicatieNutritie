'use strict';

/**
 * P-15 / C2 — Test REAL de RLS, pe Postgres (nu pe un mock).
 *
 * RLS traieste in Postgres; un jest.mock('@supabase/supabase-js') nu poate
 * demonstra nimic despre el. Acest test se conecteaza la un Postgres Supabase
 * si probeaza, pe un tabel de proba, ca utilizatorul B nu poate citi randul lui
 * A chiar daca interogheaza direct.
 *
 * DOUA PARTI, ca CI-ul sa treaca cu numere reale:
 *   (a) PROBA DIRECTA pe pool-ul Postgres (fara PostgREST): foloseste
 *       `SET LOCAL role authenticated` + `SET LOCAL request.jwt.claims`, exact
 *       claims-urile pe care le pune PostgREST, si verifica RLS la nivel de baza.
 *       RULEAZA MEREU in CI (job-ul `rls-integration` da doar un Postgres
 *       Supabase, fara PostgREST; imaginea `supabase/postgres` include schema
 *       `auth` si functia `auth.uid()`).
 *   (b) END-TO-END prin PostgREST (supabase-js + JWT real): optional, se sare
 *       automat cand `INTEGRATION_SUPABASE_URL` lipseste. CI-ul nu o ruleaza
 *       (nu are PostgREST prin design); un developer cu `supabase start` da.
 *
 * SE RULEAZA SEPARAT: `npm run test:integration`. Nu se include in suita CI
 * rapida. Daca variabilele lipsesc, suita se salta (describe.skip), ca CI-ul
 * rapid sa nu fie blocat de un Postgres absent.
 * E-1: cu `RLS_TESTS_REQUIRED=1`, lipsa configurarii devine EȘEC (nu skip) si
 * motivul exact (ce variabile lipsesc) e raportat in consola.
 *
 * Variabile de mediu necesare (ex. dupa `supabase start` local):
 *   INTEGRATION_DB_URL         postgres://postgres:postgres@localhost:54322/postgres  (partea a)
 *   INTEGRATION_SUPABASE_URL   http://localhost:54321                                  (partea b)
 *   INTEGRATION_ANON_KEY       cheia anon a proiectului                               (partea b)
 *   INTEGRATION_JWT_SECRET     secretul JWT (postgres.role din config.toml)           (partea b)
 */

const pg = require('pg');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');

const URL = process.env.INTEGRATION_SUPABASE_URL;
const ANON_KEY = process.env.INTEGRATION_ANON_KEY;
const JWT_SECRET = process.env.INTEGRATION_JWT_SECRET;
const DB_URL = process.env.INTEGRATION_DB_URL;

// E-1: motivul exact al sării — care variabile lipsesc, nu doar un boolean.
const lipsescA = [];
if (!DB_URL) lipsescA.push('INTEGRATION_DB_URL');

const lipsescB = [];
if (!URL) lipsescB.push('INTEGRATION_SUPABASE_URL');
if (!ANON_KEY) lipsescB.push('INTEGRATION_ANON_KEY');
if (!JWT_SECRET) lipsescB.push('INTEGRATION_JWT_SECRET');

const configuratA = lipsescA.length === 0;
const configuratB = lipsescB.length === 0;

// E-1: în dev lipsa configurării = skip; cu RLS_TESTS_REQUIRED=1 devine EȘEC,
// ca CI-ul RLS să nu sară testele pe tăcere.
const RLS_REQUIRED = process.env.RLS_TESTS_REQUIRED === '1';

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

if (!configuratA) {
  if (RLS_REQUIRED) {
    console.error(`[E-1] RLS_TESTS_REQUIRED=1, dar configurarea de bază lipsește: ${lipsescA.join(', ')}. Testele RLS vor EȘUA.`);
  } else {
    console.warn(`[E-1] Suita RLS direct (Postgres) e SĂRITĂ (dev). Lipsește: ${lipsescA.join(', ')}.`);
  }
}
if (!configuratB) {
  console.warn(`[E-1] Suita RLS end-to-end (PostgREST) e SĂRITĂ. Lipsește: ${lipsescB.join(', ')}. Rulează numai cu 'supabase start' (necesită INTEGRATION_SUPABASE_URL).`);
}

// Parte (a): rulează ori de câte ori avem un Postgres (DB_URL) — în CI intotdeauna.
// Parte (b): rulează doar dacă avem și PostgREST (URL); altfel skip, NU eșuează,
//   pentru că CI-ul de RLS nu rulează PostgREST prin design.
const describeDirect = configuratA ? describe : (RLS_REQUIRED ? describe : describe.skip);
const describePostgrest = configuratB ? describe : describe.skip;

// ==============================================================
// (a) PROBA DIRECTĂ pe pool-ul Postgres — fără PostgREST
// ==============================================================
describeDirect('C2 — RLS pe Postgres real, direct (pool, fără PostgREST)', () => {
  let pool;

  /** Rulează SQL ca un utilizator `role` cu claims JWT date (același mecanism ca PostgREST). */
  async function ca(role, claims, sql, params) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL role ${role}`);
      // `SET ... = $1` pe un utility statement nu primește bind params la fel de
      // stabil; `set_config` cu is_local=true e form corectă, identică cu ceea ce
      // PostgREST face când aplică claims-urile JWT.
      await client.query("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
      // GUC-ul singular, citit de versiunile vechi de auth.uid()
      await client.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [claims.sub]);
      const r = await client.query(sql, params);
      await client.query('COMMIT');
      return r;
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch { /* curatenie */ }
      throw e;
    } finally {
      client.release();
    }
  }

  beforeAll(async () => {
    // E-1: modul fail — cu RLS_TESTS_REQUIRED=1 configurarea e obligatorie.
    if (!configuratA && RLS_REQUIRED) {
      throw new Error(
        `E-1: RLS_TESTS_REQUIRED=1, dar INTEGRATION_DB_URL lipsește. ` +
        'Testele RLS direct pe Postgres nu pot rula.',
      );
    }
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
    // rola `authenticated` are nevoie de permisiuni tabelare; RLS filtreaza apoi liniile.
    await pool.query('GRANT ALL ON rls_probe TO authenticated;');
    await pool.query('GRANT USAGE ON SCHEMA public TO authenticated;');
    await pool.query('DELETE FROM rls_probe;');
    await pool.query('INSERT INTO rls_probe (id, user_id, val) VALUES ($1, $2, $3)', [RAND_A, USER_A, 'secretul lui A']);
  });

  afterAll(async () => {
    try { await pool.query('DROP TABLE IF EXISTS rls_probe;'); } catch { /* curatenie best-effort */ }
    try { await pool.end(); } catch { /* ignoram */ }
  });

  it('A își poate scrie și citi propriul rând (control pozitiv)', async () => {
    await ca('authenticated', { sub: USER_A, role: 'authenticated' },
      'INSERT INTO rls_probe (id, user_id, val) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING',
      [RAND_A, USER_A, 'secretul lui A']);
    const { rows } = await ca('authenticated', { sub: USER_A, role: 'authenticated' },
      'SELECT * FROM rls_probe WHERE user_id = $1', [USER_A]);
    expect(rows).toHaveLength(1);
    expect(rows[0].val).toBe('secretul lui A');
  });

  it('utilizatorul B NU poate citi rândul lui A nici direct', async () => {
    const { rows } = await ca('authenticated', { sub: USER_B, role: 'authenticated' },
      'SELECT * FROM rls_probe WHERE user_id = $1', [USER_A]);
    expect(rows).toHaveLength(0);
  });

  it('utilizatorul B nu poate insera pe numele lui A (WITH CHECK respinge)', async () => {
    await expect(ca('authenticated', { sub: USER_B, role: 'authenticated' },
      'INSERT INTO rls_probe (id, user_id, val) VALUES ($1, $2, $3)', [RAND_B, USER_A, 'atac']))
      .rejects.toBeTruthy();
  });

  it('politicile există în pg_policies pentru toate tabelele cu date de utilizator (B-06)', async () => {
    const tabeleAsteptate = [
      'mese', 'profil', 'antrenamente', 'produse_camara',
      'gamificare', 'workout_logs', 'audit_log', 'barcode_estimari_utilizator',
      'ai_jobs', 'credite_ai',
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

// ==============================================================
// (b) END-TO-END prin PostgREST (doar dacă INTEGRATION_SUPABASE_URL există)
// ==============================================================
describePostgrest('B-05 — RLS pe Postgres real prin PostgREST', () => {
  let pool;
  let clientA;
  let clientB;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: DB_URL, max: 2 });

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

  it('A își poate scrie și citi propriul rând', async () => {
    const { error: errIns } = await clientA
      .from('rls_probe')
      .insert({ id: RAND_A, user_id: USER_A, val: 'secretul lui A' });
    expect(errIns).toBeNull();

    const { data } = await clientA.from('rls_probe').select('*').eq('user_id', USER_A);
    expect(data).toHaveLength(1);
    expect(data[0].val).toBe('secretul lui A');
  });

  it('utilizatorul B NU poate citi rândul lui A nici cu interogare directă', async () => {
    const { data } = await clientB.from('rls_probe').select('*').eq('user_id', USER_A);
    expect(data).toHaveLength(0);
  });

  it('utilizatorul B nu poate insera pe numele lui A (WITH CHECK respinge)', async () => {
    const { error } = await clientB
      .from('rls_probe')
      .insert({ id: RAND_B, user_id: USER_A, val: 'atac' });
    expect(error).not.toBeNull();
  });
});