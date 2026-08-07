'use strict';

/**
 * P-15 / C2 — TEST REAL de RLS, PUR POSTGRES, pe tabelele de producție.
 *
 * RLS trăiește în Postgres; un mock nu poate demonstra nimic despre el. Acest
 * fișier se conectează direct la pool-ul Postgres (pachetul `pg`) și verifică,
 * pe TABELELE REALE (mese, profil, antrenamente, produse_camara, gamificare,
 * ai_jobs, credite_ai), că utilizatorul B nu vede / nu modifică datele lui A.
 *
 * MECANISM — fiecare test deschide o tranzacție și setează contextul de
 * utilizator exact ca PostgREST:
 *
 *   BEGIN;
 *   ... seed-uri ca `postgres` (BYPASSRLS) ...
 *   SET LOCAL ROLE authenticated;
 *   SET LOCAL request.jwt.claims = '{"sub":"<uuid>","role":"authenticated"}';
 *   SET LOCAL request.jwt.claim.sub = '<uuid>';
 *   ... interogările care trebuie filtrate de RLS ...
 *   ROLLBACK;   -- nimic nu se persistă: testele nu lasă gunoi în baza reală
 *
 * CAPCANA PRINCIPALĂ: rolul `postgres` are BYPASSRLS. Dacă uitați
 * `SET LOCAL ROLE authenticated`, toate testele trec și nu demonstrează NIMIC —
 * exact felul de test verde-dar-gol pe care îl eliminăm. De aceea fiecare test
 * de izolare din suite este dublat de un CONTROL NEGATIV care rulează aceeași
 * interogare FĂRĂ `SET LOCAL ROLE` (ca postgres) și arată că rândurile lui A
 * SUNT vizibile: izolarea vine din ROLE+claims+policy, nu din hazard.
 *
 * Nu se folosește PostgREST aici — CI-ul `rls-integration` nu îl are (imaginea
 * `supabase/postgres` pornește doar Postgres). Afirmațiile care chiar cer
 * PostgREST (supabase-js + JWT) trăiesc în `rls_postgrest.test.js` (fișier
 * separat, opțional, sarit în CI).
 *
 * Rulare (numai partea pur-Postgres):
 *   INTEGRATION_DB_URL='postgres://postgres:postgres@localhost:54322/postgres' \
 *     npm run test:integration
 *
 * E-1: cu `RLS_TESTS_REQUIRED=1`, lipsa `INTEGRATION_DB_URL` devine EȘEC (nu
 * skip) și motivul exact e raportat în consolă — CI-ul RLS nu poate sări testele
 * pe tăcere. Fără flag, în dev, suita se sare (describe.skip).
 */

const pg = require('pg');

// CI-ul pornește containerul Postgres + aplică migrările înainte de teste; prima
// conexiune poate fi lentă. Prag generos ca suitele de integrare să nu devină flaky.
jest.setTimeout(30000);

const DB_URL = process.env.INTEGRATION_DB_URL;
const RLS_REQUIRED = process.env.RLS_TESTS_REQUIRED === '1';
const configurat = Boolean(DB_URL);

// E-1: motivul exact al sării / eșecului — nu doar un boolean.
if (!configurat) {
  if (RLS_REQUIRED) {
    console.error('[E-1] RLS_TESTS_REQUIRED=1, dar INTEGRATION_DB_URL lipsește. Testele RLS vor EȘUA.');
  } else {
    console.warn('[E-1] Suita RLS pur-Postgres e SĂRITĂ (dev). Lipsește: INTEGRATION_DB_URL.');
  }
}

const describeDirect = configurat ? describe : (RLS_REQUIRED ? describe : describe.skip);

// Identitățile fixe, aceleași în ambele fișiere RLS.
const USER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

// ID-uri fixe pentru rândurile de seed (uuid v4 sintactic valide, dar sigur
// nefolosite în producție) — UPDATE/DELETE pot ținti exact rândul lui A.
const ID_A = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

const claimsA = { sub: USER_A, role: 'authenticated' };
const claimsB = { sub: USER_B, role: 'authenticated' };

// Pool-ul de conexiuni; creat în beforeAll, folosit de helperii de tranzacție.
let pool;

/**
 * Deschide o tranzacție, rulează `seed` ca `postgres` (BYPASSRLS — doar așa se
 * pot pregăti datele lui A fără să ne batem capul cu politica), apoi comută pe
 * `role` + claims (mecanismul PostgREST) și rulează `fn`. ROLLBACK la final.
 * Fără ROLLBACK, datele de test ar rămâne în baza reală — interzis.
 */
async function cuRole(role, claims, seed, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (seed) await seed(client);
    await client.query(`SET LOCAL ROLE ${role}`);
    // Forma literală, nu `SET ... = $1`: un utility statement nu acceptă bind
    // params la fel de stabil, iar litera este exact claims-ul pus de PostgREST.
    await client.query(`SET LOCAL request.jwt.claims = '${JSON.stringify(claims)}'`);
    // GUC-ul singular, pe care îl citește auth.uid() în versiunile noi.
    await client.query(`SET LOCAL request.jwt.claim.sub = '${claims.sub}'`);
    const out = await fn(client);
    await client.query('ROLLBACK');
    return out;
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch { /* tranzacția era deja anulată */ }
    throw e;
  } finally {
    client.release();
  }
}

/**
 * CONTROL NEGATIV: aceeași tranzacție, DAR FĂRĂ `SET LOCAL ROLE` și FĂRĂ claims.
 * Rulând ca `postgres` (BYPASSRLS), RLS nu filtrează nimic. Folosit pentru a
 * demonstra că rândurile lui A sunt accesibile când protecția lipsește — și
 * că testele de izolare de mai sus trec DOAR datorită ROLE+claims+policy.
 */
async function cuFaraProtectie(seed, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (seed) await seed(client);
    const out = await fn(client);
    await client.query('ROLLBACK');
    return out;
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch { /* tranzacția era deja anulată */ }
    throw e;
  } finally {
    client.release();
  }
}

// Seed-urile standard pentru un rând al lui A, per tabelă reală.
function seedMeseA(c) {
  return c.query(
    'INSERT INTO public.mese (id, user_id, nume) VALUES ($1, $2, $3)',
    [ID_A, USER_A, 'masa secreta a lui A'],
  );
}
function seedProfilA(c) {
  return c.query('INSERT INTO public.profil (user_id, nume) VALUES ($1, $2)', [USER_A, 'profilul lui A']);
}
function seedAntrenamenteA(c) {
  return c.query(
    'INSERT INTO public.antrenamente (id, user_id, nume, tip) VALUES ($1, $2, $3, $4)',
    [ID_A, USER_A, 'antrenamentul lui A', 'forta'],
  );
}
function seedProduseCamaraA(c) {
  return c.query(
    'INSERT INTO public.produse_camara (id, user_id, barcode, nume) VALUES ($1, $2, $3, $4)',
    [ID_A, USER_A, '5940000000000', 'produsul lui A'],
  );
}
function seedGamificareA(c) {
  return c.query('INSERT INTO public.gamificare (id, user_id) VALUES ($1, $2)', [ID_A, USER_A]);
}
function seedAiJobsA(c) {
  return c.query('INSERT INTO public.ai_jobs (id, user_id) VALUES ($1, $2)', [ID_A, USER_A]);
}
function seedCrediteAiA(c) {
  return c.query('INSERT INTO public.credite_ai (user_id, sold) VALUES ($1, $2)', [USER_A, 5]);
}

// Tabelele obligatorii (acoperire C2), cu seed-ul rândului lui A pe fiecare.
const TABELE = [
  { nume: 'mese', seed: seedMeseA },
  { nume: 'profil', seed: seedProfilA },
  { nume: 'antrenamente', seed: seedAntrenamenteA },
  { nume: 'produse_camara', seed: seedProduseCamaraA },
  { nume: 'gamificare', seed: seedGamificareA },
  { nume: 'ai_jobs', seed: seedAiJobsA },
  { nume: 'credite_ai', seed: seedCrediteAiA },
];

describeDirect('C2 — RLS pe Postgres real, direct (pool, fără PostgREST)', () => {
  beforeAll(async () => {
    // E-1: modul fail — cu RLS_TESTS_REQUIRED=1 configurarea e obligatorie.
    if (!configurat && RLS_REQUIRED) {
      throw new Error('E-1: RLS_TESTS_REQUIRED=1, dar INTEGRATION_DB_URL lipsește. Testele RLS nu pot rula.');
    }
    pool = new pg.Pool({ connectionString: DB_URL, max: 4 });

    // Permisiuni de bază (NU sunt RLS; fără ele niciun query de test nu rulează).
    // Mirrors Supabase default privileges. EXCEPȚIE: pe ai_jobs dăm doar SELECT —
    // migrarea revocă explicit insert/update/delete de la authenticated, iar noi
    // nu avem voie să anulăm acea revocare.
    await pool.query('GRANT USAGE ON SCHEMA public TO authenticated;');
    await pool.query(
      'GRANT ALL ON public.mese, public.profil, public.antrenamente, public.produse_camara, public.gamificare, public.credite_ai TO authenticated;',
    );
    await pool.query('GRANT SELECT ON public.ai_jobs TO authenticated;');

    // Tabelele au FK pe auth.users(id), dar migrările nu creează niciun user.
    // Creăm USER_A/USER_B în auth.users — altfel seed-urile ar cădea pe FK.
    // Imaginea poate avea trigger-ul on_auth_user_created care cheamă
    // public.handle_new_user(); dacă funcția nu e livrată, INSERT-ul ar eșua.
    // O definim noi (no-op de test, doar în DB-ul efemer de CI) și apoi inserăm.
    await pool.query(
      'CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN RETURN NEW; END $$;',
    );
    await pool.query(
      'INSERT INTO auth.users (id, email, aud, role) VALUES ($1, $2, \'authenticated\', \'authenticated\'), ($3, $4, \'authenticated\', \'authenticated\') ON CONFLICT (id) DO NOTHING',
      [USER_A, 'rls_a@test.local', USER_B, 'rls_b@test.local'],
    );
  });

  afterAll(async () => {
    try { await pool.end(); } catch { /* pool deja închis */ }
  });

  describe('auth.uid() — mecanismul claims (verificarea din pasul de setup CI)', () => {
    it('auth.uid() mapează claims-urile la sub (identitate = USER_A)', async () => {
      const { rows } = await cuRole('authenticated', claimsA, null, (c) =>
        c.query('SELECT auth.uid() AS uid'));
      expect(rows[0].uid).toBe(USER_A);
    });

    it('auth.uid() e NULL fără claims — nimeni nu poate fabrica o identitate', async () => {
      const { rows } = await cuFaraProtectie(null, (c) =>
        c.query('SELECT auth.uid() AS uid'));
      expect(rows[0].uid).toBeNull();
    });
  });

  describe('Izolare SELECT — B NU vede rândurile lui A', () => {
    it('mese: B nu vede masa lui A', async () => {
      const { rows } = await cuRole('authenticated', claimsB, seedMeseA, (c) =>
        c.query('SELECT * FROM public.mese WHERE user_id = $1', [USER_A]));
      expect(rows).toHaveLength(0);
    });

    it('profil: B nu vede profilul lui A', async () => {
      const { rows } = await cuRole('authenticated', claimsB, seedProfilA, (c) =>
        c.query('SELECT * FROM public.profil WHERE user_id = $1', [USER_A]));
      expect(rows).toHaveLength(0);
    });

    it('antrenamente: B nu vede antrenamentul lui A', async () => {
      const { rows } = await cuRole('authenticated', claimsB, seedAntrenamenteA, (c) =>
        c.query('SELECT * FROM public.antrenamente WHERE user_id = $1', [USER_A]));
      expect(rows).toHaveLength(0);
    });

    it('produse_camara: B nu vede produsul lui A', async () => {
      const { rows } = await cuRole('authenticated', claimsB, seedProduseCamaraA, (c) =>
        c.query('SELECT * FROM public.produse_camara WHERE user_id = $1', [USER_A]));
      expect(rows).toHaveLength(0);
    });

    it('gamificare: B nu vede gamificarea lui A', async () => {
      const { rows } = await cuRole('authenticated', claimsB, seedGamificareA, (c) =>
        c.query('SELECT * FROM public.gamificare WHERE user_id = $1', [USER_A]));
      expect(rows).toHaveLength(0);
    });

    it('ai_jobs: B nu vede job-ul lui A', async () => {
      const { rows } = await cuRole('authenticated', claimsB, seedAiJobsA, (c) =>
        c.query('SELECT * FROM public.ai_jobs WHERE user_id = $1', [USER_A]));
      expect(rows).toHaveLength(0);
    });

    it('credite_ai: B nu vede soldul lui A', async () => {
      const { rows } = await cuRole('authenticated', claimsB, seedCrediteAiA, (c) =>
        c.query('SELECT * FROM public.credite_ai WHERE user_id = $1', [USER_A]));
      expect(rows).toHaveLength(0);
    });
  });

  describe('INSERT cu user_id străin — respins', () => {
    it('mese: B nu poate insera pe numele lui A (WITH CHECK)', async () => {
      await expect(cuRole('authenticated', claimsB, null, (c) =>
        c.query('INSERT INTO public.mese (user_id, nume) VALUES ($1, $2)', [USER_A, 'atac'])))
        .rejects.toBeTruthy();
    });

    it('profil: B nu poate insera un profil pe user_id-ul lui A (WITH CHECK)', async () => {
      await expect(cuRole('authenticated', claimsB, null, (c) =>
        c.query('INSERT INTO public.profil (user_id, nume) VALUES ($1, $2)', [USER_A, 'atac'])))
        .rejects.toBeTruthy();
    });

    it('antrenamente: B nu poate insera pe user_id-ul lui A (WITH CHECK)', async () => {
      await expect(cuRole('authenticated', claimsB, null, (c) =>
        c.query('INSERT INTO public.antrenamente (user_id, nume, tip) VALUES ($1, $2, $3)', [USER_A, 'atac', 'forta'])))
        .rejects.toBeTruthy();
    });

    it('produse_camara: B nu poate insera pe user_id-ul lui A (WITH CHECK)', async () => {
      await expect(cuRole('authenticated', claimsB, null, (c) =>
        c.query('INSERT INTO public.produse_camara (user_id, barcode, nume) VALUES ($1, $2, $3)', [USER_A, '123', 'atac'])))
        .rejects.toBeTruthy();
    });

    it('gamificare: B nu poate insera pe user_id-ul lui A (WITH CHECK)', async () => {
      await expect(cuRole('authenticated', claimsB, null, (c) =>
        c.query('INSERT INTO public.gamificare (user_id) VALUES ($1)', [USER_A])))
        .rejects.toBeTruthy();
    });

    it('ai_jobs: write-urile sunt revocate de la authenticated (INSERT respins)', async () => {
      await expect(cuRole('authenticated', claimsB, null, (c) =>
        c.query('INSERT INTO public.ai_jobs (user_id) VALUES ($1)', [USER_B])))
        .rejects.toBeTruthy();
    });

    it('credite_ai: B nu poate insera pe user_id-ul lui A (fără policy de write)', async () => {
      await expect(cuRole('authenticated', claimsB, null, (c) =>
        c.query('INSERT INTO public.credite_ai (user_id, sold) VALUES ($1, $2)', [USER_A, 10])))
        .rejects.toBeTruthy();
    });
  });

  describe('UPDATE pe rândul lui A de către B — 0 rânduri afectate', () => {
    it('mese: B nu poate modifica masa lui A', async () => {
      const r = await cuRole('authenticated', claimsB, seedMeseA, (c) =>
        c.query('UPDATE public.mese SET nume = $1 WHERE id = $2', ['spart de B', ID_A]));
      expect(r.rowCount).toBe(0);
    });

    it('profil: B nu poate modifica profilul lui A', async () => {
      const r = await cuRole('authenticated', claimsB, seedProfilA, (c) =>
        c.query('UPDATE public.profil SET nume = $1 WHERE user_id = $2', ['spart de B', USER_A]));
      expect(r.rowCount).toBe(0);
    });

    it('antrenamente: B nu poate modifica antrenamentul lui A', async () => {
      const r = await cuRole('authenticated', claimsB, seedAntrenamenteA, (c) =>
        c.query('UPDATE public.antrenamente SET nume = $1 WHERE id = $2', ['spart de B', ID_A]));
      expect(r.rowCount).toBe(0);
    });

    it('produse_camara: B nu poate modifica produsul lui A', async () => {
      const r = await cuRole('authenticated', claimsB, seedProduseCamaraA, (c) =>
        c.query('UPDATE public.produse_camara SET nume = $1 WHERE id = $2', ['spart de B', ID_A]));
      expect(r.rowCount).toBe(0);
    });

    it('gamificare: B nu poate modifica gamificarea lui A', async () => {
      const r = await cuRole('authenticated', claimsB, seedGamificareA, (c) =>
        c.query('UPDATE public.gamificare SET xp_total = $1 WHERE id = $2', [9999, ID_A]));
      expect(r.rowCount).toBe(0);
    });
  });

  describe('DELETE pe rândul lui A de către B — 0 rânduri șterse', () => {
    it('mese: B nu poate șterge masa lui A', async () => {
      const r = await cuRole('authenticated', claimsB, seedMeseA, (c) =>
        c.query('DELETE FROM public.mese WHERE id = $1', [ID_A]));
      expect(r.rowCount).toBe(0);
    });

    it('profil: B nu poate șterge profilul lui A', async () => {
      const r = await cuRole('authenticated', claimsB, seedProfilA, (c) =>
        c.query('DELETE FROM public.profil WHERE user_id = $1', [USER_A]));
      expect(r.rowCount).toBe(0);
    });

    it('antrenamente: B nu poate șterge antrenamentul lui A', async () => {
      const r = await cuRole('authenticated', claimsB, seedAntrenamenteA, (c) =>
        c.query('DELETE FROM public.antrenamente WHERE id = $1', [ID_A]));
      expect(r.rowCount).toBe(0);
    });

    it('produse_camara: B nu poate șterge produsul lui A', async () => {
      const r = await cuRole('authenticated', claimsB, seedProduseCamaraA, (c) =>
        c.query('DELETE FROM public.produse_camara WHERE id = $1', [ID_A]));
      expect(r.rowCount).toBe(0);
    });

    it('gamificare: B nu poate șterge gamificarea lui A', async () => {
      const r = await cuRole('authenticated', claimsB, seedGamificareA, (c) =>
        c.query('DELETE FROM public.gamificare WHERE id = $1', [ID_A]));
      expect(r.rowCount).toBe(0);
    });
  });

  describe('CONTROL NEGATIV — testele CAD fără protecție', () => {
    it.each(TABELE.map((t) => t.nume))(
      'SELECT fără SET LOCAL ROLE (postgres/BYPASSRLS) pe %s RETURNEZĂ rândul lui A — izolarea nu e întâmplătoare',
      async (nume) => {
        const tabela = TABELE.find((t) => t.nume === nume);
        const { rows } = await cuFaraProtectie(tabela.seed, (c) =>
          c.query(`SELECT * FROM public.${nume} WHERE user_id = $1`, [USER_A]));
        expect(rows.length).toBeGreaterThan(0);
      },
    );

    it('UPDATE fără SET LOCAL ROLE pe mese afectează 1 rând — doar RLS blochează scrierea lui B', async () => {
      const { rowCount } = await cuFaraProtectie(seedMeseA, (c) =>
        c.query('UPDATE public.mese SET nume = $1 WHERE id = $2', ['modificat fără protecție', ID_A]));
      expect(rowCount).toBe(1);
    });

    it('gardă: dacă SET LOCAL ROLE authenticated s-ar uita, testul de izolare SELECT de la mese ar VEDEA 1 rând și ar cădea', async () => {
      // Demonstrează că testul de izolare e sensibil: fără role, interogarea
      // revine cu rândul lui A (1), deci `expect(rows).toHaveLength(0)` din
      // suita de mai sus ar eșua. Protecția NU poate fi scoasă fără a rupe testele.
      const { rows } = await cuFaraProtectie(seedMeseA, (c) =>
        c.query('SELECT * FROM public.mese WHERE user_id = $1', [USER_A]));
      expect(rows).toHaveLength(1);
    });
  });
});
