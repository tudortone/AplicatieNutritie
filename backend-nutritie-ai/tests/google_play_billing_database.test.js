'use strict';

const fs = require('fs');
const path = require('path');

describe('modelul persistent Google Play este exclusiv server-side', () => {
  const migrationPath = path.resolve(
    __dirname,
    '../../supabase/migrations/20260914091254_google_play_billing_authority.sql',
  );

  function sqlNormalizat() {
    return fs.readFileSync(migrationPath, 'utf8').toLowerCase().replace(/\s+/g, ' ');
  }

  test('pastreaza tokenul unic, ownership-ul, starea Google si lease-ul de acknowledgement', () => {
    const sql = sqlNormalizat();
    expect(sql).toContain('create table public.google_play_subscriptions');
    for (const fragment of [
      'purchase_token text primary key',
      'purchase_token_hash text not null unique',
      'user_id uuid not null',
      'product_id text not null',
      'subscription_state text not null',
      'expiry_time timestamptz',
      'acknowledgement_state text not null',
      'linked_purchase_token text',
      'replaced_by_purchase_token text',
      'is_entitled boolean not null',
      'verification_started_at timestamptz not null',
      'ack_retry_count integer not null',
      'ack_next_retry_at timestamptz',
      'ack_lease_until timestamptz',
    ]) {
      expect(sql).toContain(fragment);
    }
  });

  test('deduplica mesajele RTDN fara sa stocheze tokenul brut in tabela de evenimente', () => {
    const sql = sqlNormalizat();
    const start = sql.indexOf('create table public.google_play_rtdn_events');
    const end = sql.indexOf(';', start);
    const tableSql = sql.slice(start, end);
    expect(tableSql).toContain('message_id text primary key');
    expect(tableSql).toContain('purchase_token_hash text');
    expect(tableSql).not.toContain('purchase_token text');
    expect(tableSql).toContain('processing_status text not null');
    expect(tableSql).toContain('processing_attempts integer not null');
  });

  test('sterge in cascada materialul billing sensibil cand identitatea auth este eliminata', () => {
    expect(sqlNormalizat()).toContain(
      'user_id uuid not null references auth.users(id) on delete cascade',
    );
  });

  test('expune numai RPC-uri atomice cu protectie de ownership, ordine si lease', () => {
    const sql = sqlNormalizat();
    for (const functie of [
      'apply_google_play_subscription_verification',
      'claim_google_play_acknowledgements',
      'apply_google_play_acknowledgement_result',
      'claim_google_play_rtdn_event',
      'complete_google_play_rtdn_event',
    ]) {
      expect(sql).toContain(`function public.${functie}`);
    }
    expect(sql).toContain("raise exception 'google_play_token_owned_by_another_user'");
    expect(sql).toContain('for update');
    expect(sql).toContain('for update skip locked');
    expect(sql).toContain('verification_started_at <= excluded.verification_started_at');
    expect(sql).toContain("processing_status = 'retryable_error'");
    expect(sql).toContain("processing_started_at < now() - interval '5 minutes'");
    expect(sql).toContain('security definer');
    expect(sql).toContain("set search_path = ''");
  });

  test('blocheaza ambele tabele si toate RPC-urile pentru rolurile client', () => {
    const sql = sqlNormalizat();
    for (const table of ['google_play_subscriptions', 'google_play_rtdn_events']) {
      expect(sql).toContain(`alter table public.${table} enable row level security`);
      expect(sql).toContain(`revoke all on table public.${table} from public, anon, authenticated`);
      expect(sql).toContain(`grant select, insert, update, delete on table public.${table} to service_role`);
    }
    expect((sql.match(/revoke all on function public\./g) || []).length).toBeGreaterThanOrEqual(5);
    expect((sql.match(/grant execute on function public\./g) || []).length).toBeGreaterThanOrEqual(5);
    expect(sql).not.toContain('grant select on table public.google_play_subscriptions to authenticated');
  });
});
