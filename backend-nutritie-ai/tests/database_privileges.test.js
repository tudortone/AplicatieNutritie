'use strict';

const fs = require('fs');
const path = require('path');

describe('privilegii explicite pentru Supabase Data API', () => {
  const migrationPath = path.resolve(
    __dirname,
    '../../supabase/migrations/20260818000001_explicit_data_api_grants.sql',
  );

  it('nu depinde de granturile implicite pentru tabelele folosite de aplicatie', () => {
    const sql = fs.readFileSync(migrationPath, 'utf8').toLowerCase().replace(/\s+/g, ' ');
    for (const tabel of ['mese', 'profil', 'antrenamente', 'produse_camara', 'workout_logs']) {
      expect(sql).toContain(`grant select, insert, update, delete on table public.${tabel} to authenticated`);
    }
    expect(sql).toContain('grant select on table public.exercitii to authenticated');
    expect(sql).toContain('grant select on table public.ai_jobs to authenticated');
    expect(sql).toContain('grant select on table public.credite_ai to authenticated');
  });

  it('mentine tabelele exclusiv backend inaccesibile rolurilor client', () => {
    const sql = fs.readFileSync(migrationPath, 'utf8').toLowerCase().replace(/\s+/g, ' ');
    for (const tabel of ['clerk_user_map', 'barcode_cache', 'gdpr_deletions', 'credite_esuate', 'clerk_webhook_esuate']) {
      expect(sql).toContain(`revoke all on table public.${tabel} from anon, authenticated`);
    }
  });
});
