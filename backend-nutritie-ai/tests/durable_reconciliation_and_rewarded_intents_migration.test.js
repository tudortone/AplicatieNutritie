'use strict';

const fs = require('fs');
const path = require('path');

const migration = fs.readFileSync(path.join(__dirname, '..', '..', 'supabase', 'migrations',
  '20261020130000_durable_reconciliation_and_rewarded_intents.sql'), 'utf8').toLowerCase().replace(/\s+/g, ' ');
const recoveryMigration = fs.readFileSync(path.join(__dirname, '..', '..', 'supabase', 'migrations',
  '20261021100000_photo_outcome_ops_recovery.sql'), 'utf8').toLowerCase().replace(/\s+/g, ' ');

describe('Photo unknown-outcome operational recovery migration', () => {
  test('releases stale reservations only before inference was claimed and marks claimed operations unknown', () => {
    expect(recoveryMigration).toContain('public.reconcile_stale_flow_photo_reservations');
    expect(recoveryMigration).toContain('inference_claimed_at is null');
    expect(recoveryMigration).toContain('inference_claimed_at is not null');
    expect(recoveryMigration).toContain("'photo_abandoned_before_inference'");
    expect(recoveryMigration).toContain("'photo_outcome_unknown'");
    expect(recoveryMigration).toContain("inference_claimed_at >= p_now - interval '10 minutes'");
    expect(recoveryMigration).toContain("'code', 'photo_in_progress'");
    expect(recoveryMigration).toContain('for update skip locked');
    expect(recoveryMigration).toContain('pg_advisory_xact_lock(hashtextextended(p_user_id::text, 84107))');
  });

  test('exposes a bounded operator queue without image URLs and restricts recovery RPCs to service role', () => {
    expect(recoveryMigration).toContain('public.list_flow_photo_outcome_reconciliation_queue');
    expect(recoveryMigration).toContain('limit p_limit');
    expect(recoveryMigration).toContain("operator.raw_app_meta_data->>'rol' = 'admin'");
    expect(recoveryMigration).toContain('resolved_by uuid references auth.users(id) on delete set null');
    expect(recoveryMigration).toContain("v_reservation.status = 'released' and exists");
    expect(recoveryMigration).toContain('grant execute on function public.list_flow_photo_outcome_reconciliation_queue');
    expect(recoveryMigration).toContain('to service_role');
    expect(recoveryMigration).not.toContain('image_url');
  });
});

describe('durable Photo outcome reconciliation migration', () => {
  test('keeps unknown reservations durable but excludes them from the active-operation gate', () => {
    expect(migration).toContain('add column if not exists outcome_unknown_at timestamptz');
    expect(migration).toContain("where status = 'reserved' and outcome_unknown_at is null");
    expect(migration).toContain("where user_id = p_user_id and status = 'reserved' and outcome_unknown_at is null");
    expect(migration).toContain('set outcome_unknown_at = coalesce(outcome_unknown_at, p_now)');
  });

  test('reconciles only stored valid results automatically and requires restricted evidence to release an unknown', () => {
    expect(migration).toContain("v_action := case when v_res.result->>'success' = 'true' then 'commit' else 'release' end");
    expect(migration).toContain('if v_res.result is null then');
    expect(migration).toContain('confirmed_failure_evidence_required');
    expect(migration).toContain("'confirmed_provider_failure'");
    expect(migration).toContain('public.photo_outcome_resolutions');
    expect(migration).toContain('to service_role');
  });
});

describe('rewarded intent idempotency migration', () => {
  test('atomically returns the original intent only for the same token, user, and request binding', () => {
    expect(migration).toContain('play_integrity_token_hash text not null unique');
    expect(migration).toContain('v_existing.user_id <> p_user_id or v_existing.request_hash <> p_request_hash');
    expect(migration).toContain("'code', 'rewarded_token_replay'");
    expect(migration).toContain("'replay', true");
    expect(migration).not.toContain('set expires_at =');
  });

  test('does not grant clients SELECT access to the persisted AdMob custom data', () => {
    expect(migration).toContain('create table if not exists public.flow_reward_intent_secrets');
    expect(migration).toContain('revoke all on table public.flow_reward_intent_secrets from public, anon, authenticated, service_role');
    expect(migration).toContain('grant execute on function public.get_flow_reward_intent_by_integrity_token');
    expect(migration).toContain('custom_data text');
  });
});
