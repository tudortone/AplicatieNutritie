'use strict';

const fs = require('fs');
const path = require('path');

const migrationPath = path.join(
  __dirname, '..', '..', 'supabase', 'migrations',
  '20261111100000_flow_credits_starter_quota_no_daily_wipe.sql'
);
const sql = fs.readFileSync(migrationPath, 'utf8').toLowerCase();

describe('Flow Credits Starter Quota (No Daily Wipe) Migration', () => {
  test('migration file exists and defines all required functions', () => {
    expect(sql).toContain('function public.flow_credits_balance');
    expect(sql).toContain('function public.reserve_flow_photo_credit');
    expect(sql).toContain('function public.settle_flow_photo_credit(');
    expect(sql).toContain('function public.settle_flow_photo_credit_v2(');
  });

  test('does not reset daily_used to zero on day rollover in flow_credits_balance', () => {
    expect(sql).not.toContain('daily_used = 0');
    expect(sql).not.toContain('daily_used := 0');
  });

  test('resets rewarded grants today on reward day change', () => {
    expect(sql).toContain('rewarded_grants_today = 0');
    expect(sql).toContain('reward_day = v_day');
  });

  test('computes daily remaining credits from cumulative starter usage', () => {
    expect(sql).toContain('greatest(0, p_daily_limit - coalesce(v_row.daily_used, 0))');
  });

  test('settle_flow_photo_credit_v2 propagates custom error code or NOT_FOOD rather than blindly overwriting with PHOTO_ANALYSIS_FAILED', () => {
    expect(sql).toContain("v_error_code := p_reason;");
    expect(sql).toContain("v_error_code := v_res.result->>'errorcode';");
    expect(sql).toContain("error_code = v_error_code");
  });
});

