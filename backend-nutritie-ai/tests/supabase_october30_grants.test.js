'use strict';

/**
 * Test de regresie si asigurare statica: Compatibilitate Supabase 30 Octombrie.
 *
 * Incepand cu 30 octombrie, Supabase nu mai acorda automat acces Data API (anon/authenticated)
 * tabelelor nou create in schema public.
 *
 * Acest test garanteaza:
 * 1. Toate tabelele existente au intentie explicita de privilegii declarata.
 * 2. Fiecare tabela este clasificata riguros (CLIENT DATA API ACCESS REQUIRED vs SERVER ONLY / NO DATA API ACCESS).
 * 3. Tabelele server-only (facturare, RTDN, GDPR, cozi dead-letter, mapari de identitate) nu au NICIUN privilegiu acordat rolurilor client.
 * 4. Tabelele client au exclusiv granturile minimale necesare si RLS activ cu izolare stricta pe auth.uid().
 * 5. Nicio tabela nu are GRANT ALL catre client.
 * 6. Orice migrare viitoare care creeaza o tabela fara sa declare explicit intentia de privilegii este respinsa automat.
 */

const path = require('path');
const { analizeazaSchema, CLASIFICARE } = require('../utils/rlsSchemaAudit');

const DIR_MIGRARI = path.resolve(__dirname, '..', '..', 'supabase', 'migrations');

const TABELE_CLIENT_DATA_API = Object.freeze([
  'mese',
  'profil',
  'audit_log',
  'antrenamente',
  'barcode_estimari_utilizator',
  'produse_camara',
  'workout_logs',
  'exercises',
  'exercitii',
  'gamificare',
  'gamificare_evenimente',
  'ai_jobs',
  'credite_ai',
  'credite_tranzactii',
  'flow_credit_reservations',
  'flow_reward_intents',
  'workout_templates',
]);

const TABELE_SERVER_ONLY = Object.freeze([
  'clerk_user_map',
  'barcode_cache',
  'gdpr_deletions',
  'credite_esuate',
  'clerk_webhook_esuate',
  'google_play_subscriptions',
  'google_play_rtdn_events',
]);

describe('Supabase 30 Octombrie Data API Grants Hardening — Schema Assurance', () => {
  let schema;

  beforeAll(() => {
    schema = analizeazaSchema({ dir: DIR_MIGRARI });
  });

  describe('1. Inventar si intentie explicita pe toate tabelele', () => {
    it('toate cele 24 de tabele din migratii sunt detectate', () => {
      const numeTabele = schema.tabele.map((t) => t.nume).sort();
      const toateAsteptate = [...TABELE_CLIENT_DATA_API, ...TABELE_SERVER_ONLY].sort();
      expect(numeTabele).toEqual(toateAsteptate);
    });

    it('fiecare tabela are intentie explicita de privilegii (areIntentiePrivilegiiExplicita === true)', () => {
      for (const t of schema.tabele) {
        expect(t.areIntentiePrivilegiiExplicita).toBe(true);
      }
    });

    it('nicio problema de tip PRIVILEGII_NEEXPLICITE in schema reala', () => {
      const neexplicite = schema.probleme.filter((p) => p.tip === 'PRIVILEGII_NEEXPLICITE');
      expect(neexplicite).toEqual([]);
    });
  });

  describe('2. Clasificare si izolare SERVER-ONLY (NO DATA API ACCESS)', () => {
    it('toate tabelele de facturare, securitate si infrastructura interna au zero privilegii client', () => {
      for (const nume of TABELE_SERVER_ONLY) {
        const t = schema.tabele.find((x) => x.nume === nume);
        expect(t).toBeDefined();
        expect(t.privilegiiClient).toEqual([]);
      }
    });

    it('tabelele server-only au RLS activat', () => {
      for (const nume of TABELE_SERVER_ONLY) {
        const t = schema.tabele.find((x) => x.nume === nume);
        expect(t.rls).toBe(true);
      }
    });

    it('tabelele de facturare nu au politici RLS permisive (deny-all complet pe client)', () => {
      const facturare = schema.tabele.filter((t) => t.clasificare === CLASIFICARE.FACTURARE);
      expect(facturare.length).toBe(2);
      for (const t of facturare) {
        expect(t.politici).toEqual([]);
      }
    });
  });

  describe('3. Tabele cu acces CLIENT DATA API', () => {
    it('tabelele client au RLS activat', () => {
      for (const nume of TABELE_CLIENT_DATA_API) {
        const t = schema.tabele.find((x) => x.nume === nume);
        expect(t).toBeDefined();
        expect(t.rls).toBe(true);
      }
    });

    it('tabelele cu scriere din client impun auth.uid() pe randuri', () => {
      const tabeleCuScriere = schema.tabele.filter(
        (t) => TABELE_CLIENT_DATA_API.includes(t.nume) &&
               t.privilegiiClient.some((p) => ['insert', 'update', 'delete'].includes(p))
      );

      for (const t of tabeleCuScriere) {
        const politiciScriere = t.politici.filter((p) => ['ALL', 'INSERT', 'UPDATE'].includes(p.comanda));
        expect(politiciScriere.length).toBeGreaterThan(0);
        for (const p of politiciScriere) {
          expect(p.using || p.withCheck).toMatch(/auth\.uid\(\)/);
        }
      }
    });

    it('tabelele financiare / ledger read-only din client au revocata scrierea (INSERT, UPDATE, DELETE)', () => {
      const ledgerReadOnly = [
        'gamificare',
        'gamificare_evenimente',
        'ai_jobs',
        'credite_ai',
        'credite_tranzactii',
        'flow_credit_reservations',
        'flow_reward_intents',
      ];

      for (const nume of ledgerReadOnly) {
        const t = schema.tabele.find((x) => x.nume === nume);
        expect(t.privilegiiClient).toEqual(['select']);
      }
    });

    it('nicio tabela nu primeste GRANT ALL pe roluri client', () => {
      for (const t of schema.tabele) {
        expect(t.areGrantAllClient).toBe(false);
      }
    });
  });

  describe('4. Hardening privilegii implicite pentru migratii viitoare', () => {
    it('ALTER DEFAULT PRIVILEGES a revocat tabelele si functiile implicite din public', () => {
      expect(schema.privilegiiImplicite.tabeleRevocate).toBe(true);
      expect(schema.privilegiiImplicite.functiiRevocate).toBe(true);
    });
  });

  describe('5. Fixture negative — detectare omisiuni in migratii viitoare', () => {
    it('respinge o migrare viitoare care creeaza o tabela fara nicio declaratie de privilegii', () => {
      const testSql = `
        CREATE TABLE public.tabela_viitoare_uitata (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES auth.users(id),
          continut TEXT
        );
        ALTER TABLE public.tabela_viitoare_uitata ENABLE ROW LEVEL SECURITY;
        CREATE POLICY p ON public.tabela_viitoare_uitata FOR ALL TO authenticated
          USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
      `;
      const rez = analizeazaSchema({ fisiere: [{ nume: '20261101000001_viitoare.sql', continut: testSql }] });
      const erori = rez.probleme.filter((p) => p.tip === 'PRIVILEGII_NEEXPLICITE');
      expect(erori.length).toBe(1);
      expect(erori[0].tinta).toBe('tabela_viitoare_uitata');
    });

    it('respinge o migrare viitoare care acorda GRANT ALL clientului in loc de privilegii minimale', () => {
      const testSql = `
        CREATE TABLE public.tabela_excesiva (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES auth.users(id)
        );
        ALTER TABLE public.tabela_excesiva ENABLE ROW LEVEL SECURITY;
        CREATE POLICY p ON public.tabela_excesiva FOR ALL TO authenticated
          USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
        GRANT ALL ON TABLE public.tabela_excesiva TO authenticated;
      `;
      const rez = analizeazaSchema({ fisiere: [{ nume: '20261101000002_viitoare.sql', continut: testSql }] });
      const erori = rez.probleme.filter((p) => p.tip === 'PRIVILEGII_EXCESIVE_CLIENT');
      expect(erori.length).toBe(1);
      expect(erori[0].tinta).toBe('tabela_excesiva');
    });

    it('accepta o migrare viitoare care defineste explicit GRANT minimal pentru client', () => {
      const testSql = `
        CREATE TABLE public.tabela_corecta_client (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES auth.users(id)
        );
        ALTER TABLE public.tabela_corecta_client ENABLE ROW LEVEL SECURITY;
        CREATE POLICY p ON public.tabela_corecta_client FOR ALL TO authenticated
          USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
        GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tabela_corecta_client TO authenticated;
      `;
      const rez = analizeazaSchema({ fisiere: [{ nume: '20261101000003_viitoare.sql', continut: testSql }] });
      expect(rez.probleme).toEqual([]);
    });

    it('accepta o migrare viitoare care defineste explicit izolare server-only', () => {
      const testSql = `
        CREATE TABLE public.tabela_corecta_server (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          secret_key TEXT NOT NULL
        );
        ALTER TABLE public.tabela_corecta_server ENABLE ROW LEVEL SECURITY;
        REVOKE ALL ON TABLE public.tabela_corecta_server FROM anon, authenticated;
        GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tabela_corecta_server TO service_role;
      `;
      const rez = analizeazaSchema({ fisiere: [{ nume: '20261101000004_viitoare.sql', continut: testSql }] });
      // Nu este catalog public si nu are client grants, RLS activ, areIntentiePrivilegiiExplicita true => probleme goale
      expect(rez.probleme.filter((p) => p.tip === 'PRIVILEGII_NEEXPLICITE')).toEqual([]);
    });
  });
});
