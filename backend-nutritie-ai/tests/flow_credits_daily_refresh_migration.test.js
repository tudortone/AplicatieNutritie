'use strict';

const fs = require('fs');
const path = require('path');
const { incarcaConfig } = require('../config/env');
const { createFlowCreditsRepo } = require('../repositories/flowCreditsRepo');

const migrationPath = path.join(
  __dirname, '..', '..', 'supabase', 'migrations',
  '20261120090000_flow_credits_daily_refresh_two_per_day.sql'
);
const sql = fs.readFileSync(migrationPath, 'utf8');
const sqlLower = sql.toLowerCase();

describe('Flow Credits Daily Refresh (2 Free Credits/Day + Timezone) Migration', () => {
  test('drops legacy overloads before defining timezone-aware 2-credit functions', () => {
    expect(sqlLower).toContain('drop function if exists public.flow_credits_balance(uuid, timestamptz, integer, integer);');
    expect(sqlLower).toContain('drop function if exists public.reserve_flow_photo_credit(uuid, text, text, timestamptz, integer, integer);');
    expect(sqlLower).toContain('drop function if exists public.reserve_flow_photo_credit_v2(uuid, text, text, text, timestamptz, integer, integer);');
  });

  test('sets default daily limit to 2 across balance and reservation RPCs', () => {
    const defaults = sqlLower.match(/p_daily_limit integer default 2/g) || [];
    expect(defaults.length).toBe(3);
  });

  test('adds credite_ai.timezone and validates IANA timezones in O(1) without pg_timezone_names', () => {
    expect(sqlLower).toContain('add column if not exists timezone text');
    expect(sqlLower).toContain('exception when invalid_parameter_value');
    expect(sqlLower).not.toContain('pg_timezone_names');
  });

  test('resets daily_used monotonically forward without wiping rewarded or purchased credits', () => {
    expect(sqlLower).toContain('v_row.daily_day is null or v_day > v_row.daily_day');
    expect(sqlLower).toContain('v_row.daily_used := 0');
    expect(sqlLower).not.toContain('rewarded_balance = 0');
    expect(sqlLower).not.toContain('rewarded_balance := 0');
    expect(sqlLower).not.toContain('purchased_balance = 0');
    expect(sqlLower).not.toContain('purchased_balance := 0');
  });

  test('preserves reconciliation invariants, daily_day settlement guard, and service_role isolation', () => {
    expect(sqlLower).toContain('reconcile_flow_photo_result');
    expect(sqlLower).toContain('and outcome_unknown_at is null');
    expect(sqlLower).toContain('reconcile_stale_flow_photo_reservations');
    expect(sqlLower).toContain("v_res.source = 'daily' and daily_day = v_res.server_day");
    expect(sqlLower).not.toContain('concurrently');
    expect(sqlLower).toContain('grant execute on function public.flow_credits_balance(uuid, timestamptz, integer, integer, text)');
    expect(sqlLower).toContain('to service_role');
  });

  test('config and repository default dailyLimit to 2 and pass p_timezone', async () => {
    const original = process.env.FLOW_CREDITS_DAILY_LIMIT;
    delete process.env.FLOW_CREDITS_DAILY_LIMIT;
    try {
      const cfg = incarcaConfig({ strict: false });
      expect(cfg.flowCredits.dailyLimit).toBe(2);
    } finally {
      if (original !== undefined) process.env.FLOW_CREDITS_DAILY_LIMIT = original;
    }

    const rpc = jest.fn(async () => ({ data: { ok: true }, error: null }));
    const repo = createFlowCreditsRepo({ supabaseAdmin: { rpc } });
    await repo.getBalance({ userId: 'u1', now: '2026-11-20T10:00:00.000Z', timezone: 'Europe/Bucharest' });
    expect(rpc).toHaveBeenCalledWith('flow_credits_balance', expect.objectContaining({
      p_daily_limit: 2,
      p_timezone: 'Europe/Bucharest',
    }));
  });
});
