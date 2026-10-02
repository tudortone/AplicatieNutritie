'use strict';

/**
 * P0-08 — asigurare de release pentru izolarea datelor intre conturi.
 *
 * ==========================================================================
 * DE CE EXISTA ACEST TEST
 * ==========================================================================
 * Testele PgTAP reale (supabase/tests/*.test.sql) sunt sursa de adevar, dar
 * cer un Postgres local prin Docker. Cand Docker lipseste, singura alternativa
 * onesta este analiza STATICA a migrarilor — nu „presupunem ca e bine".
 *
 * Acest gate calculeaza starea EFECTIVA a schemei (aplicand CREATE/DROP POLICY
 * si GRANT/REVOKE in ordine cronologica, nu doar cautand text) si impune
 * invariantii de securitate. Nu inlocuieste PgTAP; il completeaza si prinde
 * regresii introduse de migrari viitoare, in fiecare rulare de CI.
 *
 * IMPORTANT: gate-ul este verificat impotriva unor scheme INTENTIONAT
 * VULNERABILE (fixture negative). Un gate care trece pe tot nu demonstreaza
 * nimic; acesta trebuie sa DETECTEZE fiecare clasa de defect.
 */

const path = require('path');
const {
  analizeazaSchema,
  CLASIFICARE,
} = require('../utils/rlsSchemaAudit');

const DIR_MIGRARI = path.resolve(__dirname, '..', '..', 'supabase', 'migrations');

/** Ruleaza analizorul pe SQL dat inline (fixture). */
function analizeazaSql(sql) {
  return analizeazaSchema({ fisiere: [{ nume: 'fixture.sql', continut: sql }] });
}

const TABEL_UTILIZATOR_CORECT = `
CREATE TABLE public.demo (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);
ALTER TABLE public.demo ENABLE ROW LEVEL SECURITY;
CREATE POLICY demo_own ON public.demo FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.demo TO authenticated;
`;

describe('P0-08 — gate-ul detecteaza scheme vulnerabile (fixture negative)', () => {
  it('detecteaza o tabela privata FARA RLS activat', () => {
    const r = analizeazaSql(`
      CREATE TABLE public.secrete (user_id UUID);
      CREATE POLICY p ON public.secrete FOR ALL USING (auth.uid() = user_id);
      GRANT SELECT ON TABLE public.secrete TO authenticated;
    `);
    expect(r.probleme.map((p) => p.tip)).toContain('RLS_DEZACTIVAT');
  });

  it('detecteaza o politica de SCRIERE cu USING (true)', () => {
    const r = analizeazaSql(`
      CREATE TABLE public.demo (user_id UUID);
      ALTER TABLE public.demo ENABLE ROW LEVEL SECURITY;
      CREATE POLICY demo_all ON public.demo FOR ALL TO authenticated USING (true) WITH CHECK (true);
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.demo TO authenticated;
    `);
    expect(r.probleme.map((p) => p.tip)).toContain('POLITICA_SCRIERE_PERMISIVA');
  });

  it('detecteaza UPDATE fara WITH CHECK (mutarea proprietarului ramane posibila)', () => {
    const r = analizeazaSql(`
      CREATE TABLE public.demo (user_id UUID);
      ALTER TABLE public.demo ENABLE ROW LEVEL SECURITY;
      CREATE POLICY demo_upd ON public.demo FOR UPDATE TO authenticated USING (auth.uid() = user_id);
      GRANT SELECT, UPDATE ON TABLE public.demo TO authenticated;
    `);
    expect(r.probleme.map((p) => p.tip)).toContain('UPDATE_FARA_WITH_CHECK');
  });

  it('detecteaza INSERT fara WITH CHECK', () => {
    const r = analizeazaSql(`
      CREATE TABLE public.demo (user_id UUID);
      ALTER TABLE public.demo ENABLE ROW LEVEL SECURITY;
      CREATE POLICY demo_ins ON public.demo FOR INSERT TO authenticated;
      GRANT INSERT ON TABLE public.demo TO authenticated;
    `);
    expect(r.probleme.map((p) => p.tip)).toContain('INSERT_FARA_WITH_CHECK');
  });

  it('detecteaza o functie SECURITY DEFINER fara search_path fix', () => {
    const r = analizeazaSql(`
      CREATE FUNCTION public.periculoasa() RETURNS void
      LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN END; $$;
    `);
    expect(r.probleme.map((p) => p.tip)).toContain('DEFINER_FARA_SEARCH_PATH');
  });

  it('detecteaza o tabela de facturare expusa clientului', () => {
    const r = analizeazaSql(`
      CREATE TABLE public.google_play_subscriptions (purchase_token TEXT);
      ALTER TABLE public.google_play_subscriptions ENABLE ROW LEVEL SECURITY;
      GRANT SELECT ON TABLE public.google_play_subscriptions TO authenticated;
    `);
    expect(r.probleme.map((p) => p.tip)).toContain('FACTURARE_EXPUSA_CLIENTULUI');
  });

  it('detecteaza o tabela backend-only expusa clientului', () => {
    const r = analizeazaSql(`
      CREATE TABLE public.gdpr_deletions (user_id UUID);
      ALTER TABLE public.gdpr_deletions ENABLE ROW LEVEL SECURITY;
      GRANT SELECT ON TABLE public.gdpr_deletions TO anon;
    `);
    expect(r.probleme.map((p) => p.tip)).toContain('BACKEND_ONLY_EXPUS');
  });

  it('nu raporteaza fals-pozitive pe o tabela de utilizator corecta', () => {
    const r = analizeazaSql(TABEL_UTILIZATOR_CORECT);
    expect(r.probleme).toEqual([]);
  });

  it('tine cont de DROP POLICY (starea EFECTIVA, nu textul brut)', () => {
    const r = analizeazaSql(`
      CREATE TABLE public.demo (user_id UUID);
      ALTER TABLE public.demo ENABLE ROW LEVEL SECURITY;
      CREATE POLICY demo_all ON public.demo FOR ALL TO authenticated USING (true) WITH CHECK (true);
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.demo TO authenticated;
      DROP POLICY demo_all ON public.demo;
      CREATE POLICY demo_own ON public.demo FOR ALL TO authenticated
        USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
    `);
    expect(r.probleme.map((p) => p.tip)).not.toContain('POLITICA_SCRIERE_PERMISIVA');
  });

  it('tine cont de REVOKE ulterior (privilegii efective)', () => {
    const r = analizeazaSql(`
      CREATE TABLE public.gdpr_deletions (user_id UUID);
      ALTER TABLE public.gdpr_deletions ENABLE ROW LEVEL SECURITY;
      CREATE POLICY p ON public.gdpr_deletions FOR ALL USING (false);
      GRANT SELECT ON TABLE public.gdpr_deletions TO authenticated;
      REVOKE ALL ON TABLE public.gdpr_deletions FROM anon, authenticated;
    `);
    expect(r.probleme.map((p) => p.tip)).not.toContain('BACKEND_ONLY_EXPUS');
  });

  it('detecteaza o tabela creata fara nicio declaratie explicita de privilegii (Oct 30 gate)', () => {
    const r = analizeazaSql(`
      CREATE TABLE public.fara_intentie (user_id UUID);
      ALTER TABLE public.fara_intentie ENABLE ROW LEVEL SECURITY;
      CREATE POLICY p ON public.fara_intentie FOR ALL USING (auth.uid() = user_id);
    `);
    expect(r.probleme.map((p) => p.tip)).toContain('PRIVILEGII_NEEXPLICITE');
  });

  it('detecteaza GRANT ALL acordat rolurilor client (privilegii excesive)', () => {
    const r = analizeazaSql(`
      CREATE TABLE public.demo (user_id UUID);
      ALTER TABLE public.demo ENABLE ROW LEVEL SECURITY;
      CREATE POLICY demo_own ON public.demo FOR ALL TO authenticated
        USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
      GRANT ALL ON TABLE public.demo TO authenticated;
    `);
    expect(r.probleme.map((p) => p.tip)).toContain('PRIVILEGII_EXCESIVE_CLIENT');
  });
});

describe('P0-08 — schema REALA respecta invariantii de securitate', () => {
  let rezultat;
  beforeAll(() => {
    rezultat = analizeazaSchema({ dir: DIR_MIGRARI });
  });

  it('nicio problema de securitate detectata static', () => {
    const rezumat = rezultat.probleme.map((p) => `${p.tip}: ${p.tinta} — ${p.detaliu}`);
    expect(rezumat).toEqual([]);
  });

  it('RLS este ACTIVAT pe fiecare tabela', () => {
    const faraRls = rezultat.tabele.filter((t) => !t.rls).map((t) => t.nume);
    expect(faraRls).toEqual([]);
  });

  it('fiecare tabela cu scriere din client impune proprietarul prin USING si WITH CHECK', () => {
    const scriere = rezultat.tabele.filter((t) => t.privilegiiClient.some(
      (p) => ['insert', 'update', 'delete'].includes(p),
    ));
    expect(scriere.length).toBeGreaterThan(0);
    for (const t of scriere) {
      const politiciScriere = t.politici.filter((p) => ['ALL', 'INSERT', 'UPDATE'].includes(p.comanda));
      expect(politiciScriere.length).toBeGreaterThan(0);
      for (const p of politiciScriere) {
        expect(p.using || p.withCheck).toMatch(/auth\.uid\(\)/);
        // Proprietarul nu poate fi mutat: randul NOU trebuie sa apartina apelantului.
        expect(p.withCheck || p.using).toMatch(/auth\.uid\(\)\s*=\s*user_id/);
      }
    }
  });

  it('tabelele de facturare nu au NICIUN privilegiu de client si nicio politica permisiva', () => {
    const facturare = rezultat.tabele.filter((t) => t.clasificare === CLASIFICARE.FACTURARE);
    expect(facturare.map((t) => t.nume).sort()).toEqual([
      'google_play_rtdn_events',
      'google_play_subscriptions',
    ]);
    for (const t of facturare) {
      expect(t.rls).toBe(true);
      expect(t.privilegiiClient).toEqual([]);
      expect(t.politici).toEqual([]); // RLS activ + zero politici = deny-all
    }
  });

  it('tabelele backend-only nu au privilegii de client', () => {
    const backend = rezultat.tabele.filter((t) => t.clasificare === CLASIFICARE.BACKEND_ONLY);
    expect(backend.length).toBeGreaterThan(0);
    for (const t of backend) expect(t.privilegiiClient).toEqual([]);
  });

  it('nicio functie SECURITY DEFINER fara search_path fix', () => {
    const rele = rezultat.functii.filter((f) => f.securityDefiner && !f.searchPath);
    expect(rele.map((f) => f.nume)).toEqual([]);
  });

  it('o singura functie este apelabila de client, si nu accepta argumente de identitate', () => {
    const clientCallable = rezultat.functii.filter((f) => f.grantClient);
    expect(clientCallable.map((f) => f.nume)).toEqual(['public.sincronizeaza_gamificare_sigur']);
    // Zero argumente => nu exista suprafata de forjare a identitatii.
    expect(clientCallable[0].argumente.trim()).toBe('');
  });

  it('nicio vizualizare (view) nu poate ocoli RLS — nu exista views', () => {
    expect(rezultat.views).toEqual([]);
  });

  it('privilegiile IMPLICITE sunt revocate, ca o migrare viitoare sa nu expuna accidental', () => {
    // Postgres acorda implicit EXECUTE pe functii noi catre PUBLIC, iar setarea
    // istorica Supabase „auto API access" poate acorda privilegii pe tabele noi.
    // Fara revocarea privilegiilor implicite, o migrare viitoare care uita un
    // REVOKE explicit expune tabela/functia direct prin Data API.
    expect(rezultat.privilegiiImplicite.tabeleRevocate).toBe(true);
    expect(rezultat.privilegiiImplicite.functiiRevocate).toBe(true);
  });

  it('fiecare tabela detinuta de utilizator referentiaza auth.users', () => {
    const utilizator = rezultat.tabele.filter((t) => t.clasificare === CLASIFICARE.UTILIZATOR);
    expect(utilizator.length).toBeGreaterThan(0);
    for (const t of utilizator) {
      expect(t.areColoanaUserId).toBe(true);
    }
  });

  it('toate tabelele create au intentie explicita de privilegii declarata (compatibil 30 octombrie)', () => {
    const faraPrivilegiiExplicite = rezultat.tabele.filter((t) => !t.areIntentiePrivilegiiExplicita).map((t) => t.nume);
    expect(faraPrivilegiiExplicite).toEqual([]);
  });

  it('nicio tabela nu acorda GRANT ALL rolurilor client (principiul privilegiilor minime)', () => {
    const cuGrantAll = rezultat.tabele.filter((t) => t.areGrantAllClient).map((t) => t.nume);
    expect(cuGrantAll).toEqual([]);
  });
});
