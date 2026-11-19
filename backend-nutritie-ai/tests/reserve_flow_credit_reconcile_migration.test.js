'use strict';

const fs = require('fs');
const path = require('path');

const migrationPath = path.join(
  __dirname, '..', '..', 'supabase', 'migrations',
  '20261113120000_fix_reserve_flow_photo_credit_reconcile.sql'
);

describe('Flow Credits reserve_flow_photo_credit Reconciliation Migration', () => {
  test('restores reconcile_flow_photo_result loop and outcome_unknown_at guard while preserving starter quota', () => {
    const sql = fs.readFileSync(migrationPath, 'utf8').toLowerCase();

    expect(sql).toContain('function public.reserve_flow_photo_credit(');
    expect(sql).toContain('reconcile_flow_photo_result');
    expect(sql).toContain('and outcome_unknown_at is null');
    expect(sql).toContain('if v_row.daily_day is null then');
    expect(sql).toContain('coalesce(v_row.daily_used, 0) < p_daily_limit');
    expect(sql).not.toContain('daily_used := 0');
  });

  test('20261119090000 removes redundant v2 pre-check, restores advisory lock order, and reconciles on balance read + batch', () => {
    const fixPath = path.join(
      __dirname, '..', '..', 'supabase', 'migrations',
      '20261119090000_photo_reconciliation_and_lock_order_fix.sql',
    );
    const sql = fs.readFileSync(fixPath, 'utf8').toLowerCase();

    // P1-05: advisory lock before FOR UPDATE in settle_flow_photo_credit_v2
    const settleStart = sql.indexOf('function public.settle_flow_photo_credit_v2(');
    const settleEnd = sql.indexOf('function public.reserve_flow_photo_credit_v2(');
    const settleBody = sql.slice(settleStart, settleEnd);
    expect(settleBody).toContain('set search_path = pg_catalog, public');
    const lockPos = settleBody.indexOf('perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 84107))');
    const forUpdatePos = settleBody.indexOf('for update;');
    expect(lockPos).toBeGreaterThan(-1);
    expect(forUpdatePos).toBeGreaterThan(lockPos);

    // P0-04: reserve_flow_photo_credit_v2 delegates directly to reserve_flow_photo_credit without pre-check
    const reserveEnd = sql.indexOf('function public.flow_credits_balance(');
    const reserveBody = sql.slice(settleEnd, reserveEnd);
    expect(reserveBody).toContain('perform public.reconcile_stale_flow_photo_reservations(p_user_id, p_now);');
    expect(reserveBody).not.toContain("'code', 'photo_in_progress'");

    // P0-05: flow_credits_balance + batch worker RPC restricted to service_role
    const balanceEnd = sql.indexOf('function public.reconcile_all_stale_flow_photo_reservations(');
    const balanceBody = sql.slice(reserveEnd, balanceEnd);
    expect(balanceBody).toContain('perform public.reconcile_stale_flow_photo_reservations(p_user_id, p_now);');
    expect(sql).toContain('function public.reconcile_all_stale_flow_photo_reservations(');
    expect(sql).toContain('revoke all on function public.reconcile_all_stale_flow_photo_reservations(integer, timestamptz)');
    expect(sql).toContain('grant execute on function public.reconcile_all_stale_flow_photo_reservations(integer, timestamptz)');
  });
});

