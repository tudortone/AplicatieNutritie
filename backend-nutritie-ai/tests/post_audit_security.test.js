'use strict';

const fs = require('fs');
const path = require('path');
const createStatusRouter = require('../routes/status');

describe('Remedieri post-audit', () => {
  test('statusul AI public nu expune metrici sau mesaje interne', () => {
    const publicat = createStatusRouter.statusPublic({
      status: 'cooldown',
      secundeRamase: 73.2,
      mesaj: 'detaliu intern',
      model: 'model-secret',
      cost: 12.5,
    });

    expect(publicat).toEqual({ status: 'cooldown', secundeRamase: 74 });
    expect(publicat).not.toHaveProperty('mesaj');
    expect(publicat).not.toHaveProperty('model');
    expect(publicat).not.toHaveProperty('cost');
  });

  test('migrarea gamificarii elimina scrierile directe si nu accepta XP de la client', () => {
    const migrationPath = path.join(
      __dirname,
      '../../supabase/migrations/20260805000003_gamificare_authoritative.sql',
    );
    const sql = fs.readFileSync(migrationPath, 'utf8');

    expect(sql).toContain('sincronizeaza_gamificare_sigur()');
    expect(sql).toContain('REVOKE INSERT, UPDATE, DELETE ON public.gamificare FROM authenticated, anon');
    expect(sql).toContain("v_user_id UUID := auth.uid()");
    expect(sql).toContain("event_key = 'bonus_zilnic'");
    expect(sql).not.toMatch(/p_xp|xp_total\s*:=\s*p_/i);
  });
});
