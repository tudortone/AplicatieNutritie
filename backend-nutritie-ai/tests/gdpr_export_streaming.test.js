'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');
const request = require('supertest');
const createGdprRouter = require('../routes/gdpr');
const { creeazaLimitatoare } = require('../utils/rateLimit');
const { DIMENSIUNE_PAGINA_KEYSET } = require('../utils/gdprServices');

const USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function buildKeysetClient(rowsByTable, metrics) {
  return {
    from: (tabela) => {
      const state = {
        tabela,
        orderCol: 'id',
        gtVal: undefined,
        limitVal: undefined,
      };
      const q = {
        select: () => q,
        eq: () => q,
        order: (col) => {
          state.orderCol = col;
          return q;
        },
        gt: (col, val) => {
          metrics.gtCalls.push({ tabela, col, val });
          state.gtVal = val;
          return q;
        },
        limit: (n) => {
          metrics.limitCalls.push({ tabela, n });
          state.limitVal = n;
          return q;
        },
        range: () => {
          metrics.rangeCalls += 1;
          return q;
        },
        then: async (resolve) => {
          metrics.active += 1;
          if (metrics.active > metrics.maxConcurrent) {
            metrics.maxConcurrent = metrics.active;
          }
          await new Promise((r) => setTimeout(r, 2));
          try {
            const all = rowsByTable[tabela] || [];
            const filtered = state.gtVal === undefined
              ? all
              : all.filter((row) => row[state.orderCol] > state.gtVal);
            const slice = state.limitVal === undefined ? filtered : filtered.slice(0, state.limitVal);
            resolve({ data: slice, error: null });
          } finally {
            metrics.active -= 1;
          }
        },
      };
      return q;
    },
  };
}

describe('Lotul 2 — GDPR Export Streaming (keyset + secvențial + 2 req/h/user)', () => {
  test('exportă secvențial (max concurrency 1) cu keyset gt/limit=500 și fără range()', async () => {
    const metrics = {
      active: 0,
      maxConcurrent: 0,
      gtCalls: [],
      limitCalls: [],
      rangeCalls: 0,
    };
    const meseRows = Array.from({ length: 1250 }, (_, i) => ({
      id: i + 1,
      user_id: USER_ID,
      nume: `Masa ${i + 1}`,
    }));
    const db = buildKeysetClient({
      mese: meseRows,
      antrenamente: [{ id: 10, user_id: USER_ID }],
    }, metrics);
    const supabaseAdmin = buildKeysetClient({
      google_play_subscriptions: [{ purchase_token_hash: 'h'.repeat(64), product_id: 'pro' }],
      user_feedback: [{ id: 'fb-1', message: 'ok' }],
    }, metrics);

    const app = express();
    app.use('/api/v1/user', createGdprRouter({
      requireAuth: (req, _res, next) => {
        req.user = { id: USER_ID, provider: 'supabase' };
        next();
      },
      generalLimiter: (_req, _res, next) => next(),
      gdprExportLimiter: (_req, _res, next) => next(),
      supabaseAdmin,
      contextDate: () => ({ db, userId: USER_ID }),
      profilRepo: { getProfil: async () => ({ user_id: USER_ID }) },
    }));

    const res = await request(app).get('/api/v1/user/export-data').expect(200);

    expect(res.body.mese).toHaveLength(1250);
    expect(res.body.mese[0].id).toBe(1);
    expect(res.body.mese[1249].id).toBe(1250);
    expect(res.body.antrenamente).toEqual([{ id: 10, user_id: USER_ID }]);
    expect(res.body.abonamente_google_play).toHaveLength(1);
    expect(res.body.user_feedback).toHaveLength(1);

    // Secvențial strict: 1 singură interogare activă în orice moment.
    expect(metrics.maxConcurrent).toBe(1);
    // Keyset strict: 0 apeluri OFFSET/.range(), toate paginile cer LIMIT 500.
    expect(metrics.rangeCalls).toBe(0);
    expect(metrics.limitCalls.every((c) => c.n === DIMENSIUNE_PAGINA_KEYSET && c.n === 500)).toBe(true);
    expect(metrics.gtCalls.filter((c) => c.tabela === 'mese')).toEqual([
      { tabela: 'mese', col: 'id', val: 500 },
      { tabela: 'mese', col: 'id', val: 1000 },
    ]);
  });

  test('gdprExportLimiter impune 2 req/oră/user (a 3-a cerere returnează 429)', async () => {
    const { gdprExportLimiter } = creeazaLimitatoare();
    const metrics = { active: 0, maxConcurrent: 0, gtCalls: [], limitCalls: [], rangeCalls: 0 };
    const db = buildKeysetClient({}, metrics);
    const supabaseAdmin = buildKeysetClient({}, metrics);

    const app = express();
    app.use('/api/v1/user', createGdprRouter({
      requireAuth: (req, _res, next) => {
        req.user = { id: USER_ID, provider: 'supabase' };
        next();
      },
      generalLimiter: (_req, _res, next) => next(),
      gdprExportLimiter,
      supabaseAdmin,
      contextDate: () => ({ db, userId: USER_ID }),
      profilRepo: { getProfil: async () => ({ user_id: USER_ID }) },
    }));

    await request(app).get('/api/v1/user/export-data').expect(200);
    await request(app).get('/api/v1/user/export-data').expect(200);
    const res3 = await request(app).get('/api/v1/user/export-data').expect(429);
    expect(res3.body.eroare).toMatch(/2 ori pe or/i);
  });
});

describe('Lotul 2 — Contract migrație SQL scalabilitate', () => {
  const migrationPath = path.join(
    __dirname,
    '..',
    '..',
    'supabase',
    'migrations',
    '20261119120000_scalability_indexes_reconcile_and_gamification.sql',
  );
  const sql = fs.readFileSync(migrationPath, 'utf8');

  test('definește indexurile parțiale, fereastra de 7 zile și outcome_unknown_at IS NULL', () => {
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS idx_flow_credit_reservations_reserved_user_created/i);
    expect(sql).toMatch(/ON public\.flow_credit_reservations\s*\(user_id,\s*created_at\)\s*WHERE status = 'RESERVED'/i);
    expect(sql).toMatch(/r\.inference_claimed_at IS NULL AND r\.outcome_unknown_at IS NULL/i);
    expect(sql).toMatch(/AND c\.creat_la >= NOW\(\) - INTERVAL '7 days'/i);
    expect(sql).toMatch(/ON public\.credite_tranzactii\s*\(creat_la\)\s*WHERE event_type = 'CONSUM_AI'/i);
  });

  test('optimizează sincronizeaza_gamificare_sigur fără pg_timezone_names, cu SARGable și CTE streak', () => {
    const fnStart = sql.indexOf('CREATE OR REPLACE FUNCTION public.sincronizeaza_gamificare_sigur');
    expect(fnStart).toBeGreaterThan(-1);
    const fnSql = sql.slice(fnStart);

    expect(fnSql).not.toMatch(/FROM\s+pg_timezone_names/i);
    expect(fnSql).toMatch(/PERFORM NOW\(\) AT TIME ZONE/i);
    expect(fnSql).toMatch(/EXCEPTION WHEN invalid_parameter_value/i);
    expect(fnSql).toMatch(/AND data BETWEEN v_zi - 1 AND v_zi/i);
    expect(fnSql).toMatch(/AND created_at >= v_window_start/i);
    expect(fnSql).not.toMatch(/\(created_at AT TIME ZONE/i);
    expect(fnSql).toMatch(/ROW_NUMBER\(\) OVER \(ORDER BY b\.event_date DESC\)/i);
  });
});
