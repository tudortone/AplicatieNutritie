'use strict';

const fs = require('fs');
const path = require('path');

const migrationPath = path.join(
  __dirname,
  '..',
  '..',
  'supabase',
  'migrations',
  '20261020120000_play_integrity_token_bindings.sql',
);

describe('Play Integrity token binding migration', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8').toLowerCase().replace(/\s+/g, ' ');

  test('uses a unique token digest and binds account, request, content, and expiry atomically', () => {
    expect(sql).toContain('token_hash text primary key');
    expect(sql).toContain('insert into public.play_integrity_token_bindings');
    expect(sql).toContain('on conflict (token_hash) do nothing');
    expect(sql).toContain('v_existing.user_id = p_user_id');
    expect(sql).toContain('v_existing.request_hash = p_request_hash');
    expect(sql).toContain('v_existing.content_digest is not distinct from p_content_digest');
    expect(sql).toContain('v_existing.expires_at > now()');
  });

  test('keeps binding data private and grants the RPC only to the backend service role', () => {
    expect(sql).toContain('enable row level security');
    expect(sql).toContain('revoke all on table public.play_integrity_token_bindings from public, anon, authenticated, service_role');
    expect(sql).toContain('security definer');
    expect(sql).toContain('set search_path = pg_catalog, public');
    expect(sql).toContain('grant execute on function public.claim_play_integrity_token');
    expect(sql).toContain('to service_role');
  });
});
