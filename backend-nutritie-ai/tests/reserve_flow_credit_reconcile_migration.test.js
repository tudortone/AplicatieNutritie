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
});

