'use strict';

/**
 * C1-S3: test pentru regula semantică anti-bypass din eslint.config.js.
 *
 * Verifica prin API-ul `Linter` (aceeasi regula pe care o ruleaza `npm run lint`)
 * ca accesul la tabelele cu RLS prin clientul service_role e interzis, indiferent
 * de numele/aliasul variabilei care tine clientul, si ca formele legitime (clientul
 * per-cerere / `tabelUtilizator`) raman neafectate. Folosim configuratia REALA din
 * eslint.config.js, ca testul sa nu devina un fragment de adevar care se deconecteaza
 * de regula din productie.
 */

const { Linter } = require('eslint');
const configs = require('../eslint.config.js');
const { TABELE_CU_RLS_UTILIZATOR } = require('../utils/clientUtilizator');

const linter = new Linter({ configType: 'flat' });

function eroriConfiguratieCompleta(cod, filename) {
  const mesaje = linter.verify(cod, configs, { filename });
  return mesaje.filter(
    (m) => m.severity === 2 && m.ruleId === 'task001/no-service-role-bypass',
  );
}

describe('C1-S3 — regula ESLint anti by-pass RLS', () => {
  test('TASK-001 review: urmareste semantic serviceRole si aliasurile in server/repositories', () => {
    const cod = `
      const initial = createClient(url, config.supabase.serviceRoleKey);
      const serviceRole = initial;
      function contextDate() { return { ['db']: serviceRole }; }
      serviceRole.from('mese');
    `;
    expect(eroriConfiguratieCompleta(cod, 'server.js')).toHaveLength(2);
  });

  test('TASK-001 review: prinde atribuirea computed ctx[db] in repositories', () => {
    const cod = `
      function publicaContext(clientInjectat) {
        const serviceRole = clientInjectat;
        const ctx = {};
        ctx['db'] = serviceRole;
        return ctx;
      }
    `;
    expect(eroriConfiguratieCompleta(cod, 'repositories/proba.js')).toHaveLength(1);
  });

  test('TASK-001 review: nu foloseste numele admin ca proxy pentru privilegiu', () => {
    const cod = `
      const adminTheme = creeazaClientUtilizator(optiuni);
      function contextDate() { return { db: adminTheme }; }
      adminTheme.from('mese');
    `;
    expect(eroriConfiguratieCompleta(cod, 'repositories/proba.js')).toHaveLength(0);
  });

  test.each([
    'routes/webhooks.js',
    'routes/gdpr.js',
    'routes/ai.js',
    'utils/gdprWorker.js',
    'utils/gdprServices.js',
    'src/trigger/user-sync.js',
  ])('TASK-001 review: modulul service explicit %s ramane lintabil', (filename) => {
    const cod = `
      const serviciu = createClient(url, config.supabase.serviceRoleKey);
      serviciu.from('profil');
    `;
    expect(eroriConfiguratieCompleta(cod, filename)).toHaveLength(0);
  });

  test('TASK-001: interzice expunerea clientului service-role ca db al contextului de cerere', () => {
    const cod = `
      const supabaseAdmin = createClient(url, config.supabase.serviceRoleKey);
      function contextDate() { return { db: supabaseAdmin }; }
    `;
    expect(eroriConfiguratieCompleta(cod, 'utils/proba.js')).toHaveLength(1);
  });

  test('interzice supabaseAdmin.from(<tabela-RLS>) direct', () => {
    const cod = `
      const supabaseAdmin = createClient(url, config.supabase.serviceRoleKey);
      supabaseAdmin.from('mese');
    `;
    expect(eroriConfiguratieCompleta(cod, 'routes/proba.js')).toHaveLength(1);
  });

  test('prinde aliasurile clientului service_role fără să depindă de nume', () => {
    const cod = `
      const sursa = createClient(url, config.supabase.serviceRoleKey);
      const clientOricare = sursa;
      clientOricare.from('profil');
    `;
    expect(eroriConfiguratieCompleta(cod, 'repositories/proba.js')).toHaveLength(1);
  });

  test('acopera TOT tabelul din TABELE_CU_RLS_UTILIZATOR (fara drift)', () => {
    expect(TABELE_CU_RLS_UTILIZATOR.length).toBeGreaterThan(0);
    for (const tabela of TABELE_CU_RLS_UTILIZATOR) {
      const cod = `
        const privilegiat = createClient(url, config.supabase.serviceRoleKey);
        privilegiat.from('${tabela}');
      `;
      expect(eroriConfiguratieCompleta(cod, 'utils/proba.js')).toHaveLength(1);
    }
  });

  test('nu blocheaza clientul per-cerere (ctx.db) sau tabelUtilizator', () => {
    const cod = `
      const db = creeazaClientUtilizator(optiuni);
      const ctx = { db };
      ctx.db.from('mese');
      tabelUtilizator(ctx, 'mese').select('*');
    `;
    expect(eroriConfiguratieCompleta(cod, 'repositories/proba.js')).toHaveLength(0);
  });

  test('nu blocheaza tabelele backend-only (barcode_cache) sau numele dinamice de tabela', () => {
    const cod = `
      const serviciu = createClient(url, config.supabase.serviceRoleKey);
      serviciu.from('barcode_cache');
      serviciu.from(tabelaDinamic);
    `;
    expect(eroriConfiguratieCompleta(cod, 'repositories/proba.js')).toHaveLength(0);
  });
});
