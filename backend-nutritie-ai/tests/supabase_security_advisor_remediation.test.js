const fs = require('fs');
const path = require('path');

const migrationPath = path.join(
  __dirname,
  '..',
  '..',
  'supabase',
  'migrations',
  '20260927090000_security_advisor_remediation.sql',
);

const sql = fs.readFileSync(migrationPath, 'utf8');
const normalized = sql.replace(/\s+/g, ' ').toLowerCase();

describe('Supabase Security Advisor remediation', () => {
  test.each([
    'public.mese_set_local_day()',
    'public.alimente_valid_shape(jsonb)',
    'public.set_updated_at()',
    'public.sincronizeaza_gamificare_sigur()',
  ])('%s has an empty search_path', (signature) => {
    expect(normalized).toContain(`alter function ${signature} set search_path = ''`);
  });

  test.each([
    ['public.aplica_tranzactie_credite', 'public.credite_tranzactii'],
    ['public.aplica_tranzactie_credite', 'public.credite_ai'],
    ['public.get_auth_user_by_email', 'auth.users'],
    ['public.initiate_gdpr_deletion', 'public.gdpr_deletions'],
  ])('%s uses qualified relation %s', (fn, relation) => {
    expect(normalized).toContain(`create or replace function ${fn}`);
    expect(normalized).toContain(relation);
  });

  test.each([
    'public.aplica_tranzactie_credite(uuid, text, text, integer, text, jsonb)',
    'public.get_auth_user_by_email(text)',
    'public.initiate_gdpr_deletion(uuid, text)',
  ])('%s is backend-only', (signature) => {
    const escaped = signature.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    expect(normalized).toMatch(new RegExp(
      `revoke all on function ${escaped} from public, anon, authenticated`,
    ));
    expect(normalized).toMatch(new RegExp(
      `grant execute on function ${escaped} to service_role`,
    ));
  });

  test('gamification retains only intentional client execution', () => {
    expect(normalized).toContain(
      'revoke all on function public.sincronizeaza_gamificare_sigur() from public, anon',
    );
    expect(normalized).toContain(
      'grant execute on function public.sincronizeaza_gamificare_sigur() to authenticated, service_role',
    );
  });

  test('future functions remain fail-closed by default', () => {
    expect(normalized).toContain(
      'alter default privileges for role postgres in schema public revoke execute on functions from public',
    );
    expect(normalized).toContain(
      'alter default privileges for role postgres in schema public revoke execute on functions from anon, authenticated',
    );
  });
});
