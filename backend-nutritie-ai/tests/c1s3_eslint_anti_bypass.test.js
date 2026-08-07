'use strict';

/**
 * C1-S3: test pentru regula ESLint `no-restricted-syntax` din eslint.config.js.
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

const blocCuRegula = configs.find(
  (c) => c && c.rules && Array.isArray(c.rules['no-restricted-syntax']),
);
if (!blocCuRegula) {
  throw new Error('Regula C1-S3 (no-restricted-syntax) lipsa din eslint.config.js.');
}
const regulaC1S3 = blocCuRegula.rules['no-restricted-syntax'];

const linter = new Linter({ configType: 'flat' });

function numarErori(cod) {
  const mesaje = linter.verify(
    cod,
    [{ rules: { 'no-restricted-syntax': regulaC1S3 } }],
    { filename: 'routes/proba.test.js' },
  );
  return mesaje.filter((m) => m.severity === 2).length;
}

describe('C1-S3 — regula ESLint anti by-pass RLS', () => {
  test('interzice supabaseAdmin.from(<tabela-RLS>) direct', () => {
    expect(numarErori("supabaseAdmin.from('mese');")).toBe(1);
  });

  test('prinde aliasurile clientului service_role (ctx.admin, req.supabaseAdmin, clientAdmin)', () => {
    expect(numarErori("ctx.admin.from('profil');")).toBe(1);
    expect(numarErori("req.supabaseAdmin.from('ai_jobs');")).toBe(1);
    expect(numarErori("clientAdmin.from('credite_ai');")).toBe(1);
  });

  test('acopera TOT tabelul din TABELE_CU_RLS_UTILIZATOR (fara drift)', () => {
    expect(TABELE_CU_RLS_UTILIZATOR.length).toBeGreaterThan(0);
    for (const tabela of TABELE_CU_RLS_UTILIZATOR) {
      expect(numarErori(`supabaseAdmin.from('${tabela}');`)).toBe(1);
    }
  });

  test('nu blocheaza clientul per-cerere (ctx.db) sau tabelUtilizator', () => {
    expect(numarErori("ctx.db.from('mese');")).toBe(0);
    expect(numarErori("tabelUtilizator(ctx, 'mese').select('*');")).toBe(0);
  });

  test('nu blocheaza tabelele backend-only (barcode_cache) sau numele dinamice de tabela', () => {
    expect(numarErori("supabaseAdmin.from('barcode_cache');")).toBe(0);
    expect(numarErori('supabaseAdmin.from(tabelaDinamic);')).toBe(0);
  });
});
