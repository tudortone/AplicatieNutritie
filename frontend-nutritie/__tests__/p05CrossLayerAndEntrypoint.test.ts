'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const {
  resolveAdsMode: canonicalResolveAdsMode,
  validateAdsConfiguration: canonicalValidateAdsConfig,
  GOOGLE_TEST_APP_ID_ANDROID,
  GOOGLE_TEST_INTERSTITIAL_ANDROID,
} = require('../lib/ads/admobCore');

const {
  rezolvaModReclame: preSubResolveAdsMode,
  valideazaConfigurareAdMob: preSubValidateAdsConfig,
  valideazaMediuProductie,
} = require('../scripts/preSubmissionConfig');

const {
  executaVerificareMediu,
  executaVerificari,
} = require('../scripts/preSubmissionCheck');

const {
  resolveAdsMode: runtimeResolveAdsMode,
  getAdsRuntimeConfig,
  validateAdsConfiguration: runtimeValidateAdsConfig,
} = require('../lib/ads/adsConfig');

describe('P0-05: Cross-Layer Parity & Real Pre-Submit Entrypoint', () => {
  const REAL_APP_ID = 'ca-app-pub-1234567890123456~1234567890';
  const REAL_UNIT_ID = 'ca-app-pub-1234567890123456/1234567890';
  const configStatic = require('../app.json').expo;
  const envInitial = process.env;

  afterEach(() => {
    jest.resetModules();
  });

  afterAll(() => {
    for (const k of Object.keys(process.env)) {
      if (!(k in envInitial)) {
        delete process.env[k];
      }
    }
    Object.assign(process.env, envInitial);
  });

  describe('Cross-Layer Parity across Core, Runtime, PreSubmission, and app.config', () => {
    function resolveAppConfigMode(envFixture: Record<string, string | undefined>): {
      mode: 'disabled' | 'test' | 'real' | 'throws';
      pluginAppId?: string;
    } {
      // Clear ambient app/release env from process.env to ensure hermeticity
      for (const k of Object.keys(process.env)) {
        const u = k.toUpperCase();
        if (
          u.startsWith('EXPO_PUBLIC_') ||
          u.startsWith('EAS_') ||
          u.startsWith('SENTRY_') ||
          u === 'APP_ENV' ||
          u === 'ADS_MODE'
        ) {
          delete process.env[k];
        }
      }
      for (const [k, v] of Object.entries(envFixture)) {
        if (v !== undefined) {
          process.env[k] = v;
        }
      }
      jest.resetModules();
      try {
        const appConfigFn = require('../app.config.js');
        const resolved = appConfigFn({ config: configStatic });
        const plugin = (resolved.plugins || []).find(
          (p: unknown) => Array.isArray(p) && p[0] === 'react-native-google-mobile-ads',
        );
        if (!plugin) {
          return { mode: 'disabled' };
        }
        const pluginConfig = plugin[1] || {};
        if (pluginConfig.androidAppId === GOOGLE_TEST_APP_ID_ANDROID) {
          return { mode: 'test', pluginAppId: pluginConfig.androidAppId };
        }
        return { mode: 'real', pluginAppId: pluginConfig.androidAppId };
      } catch {
        return { mode: 'throws' };
      }
    }

    // 1. Missing mode in dev
    it('Parity 1: Missing mode in development context', () => {
      const env = { EAS_BUILD_PROFILE: 'development' };
      delete (env as Record<string, string | undefined>).EXPO_PUBLIC_ADS_MODE;

      expect(canonicalResolveAdsMode(env)).toBe('disabled');
      expect(preSubResolveAdsMode(env)).toBe('disabled');
      expect(runtimeResolveAdsMode(env)).toBe('disabled');
      const appCfg = resolveAppConfigMode(env);
      expect(appCfg.mode).toBe('disabled');
    });

    // 2. Empty string in dev
    it('Parity 2: Empty string mode in development context', () => {
      const env = { EAS_BUILD_PROFILE: 'development', EXPO_PUBLIC_ADS_MODE: '' };

      expect(canonicalResolveAdsMode(env)).toBe('disabled');
      expect(preSubResolveAdsMode(env)).toBe('disabled');
      expect(runtimeResolveAdsMode(env)).toBe('disabled');
      const appCfg = resolveAppConfigMode(env);
      expect(appCfg.mode).toBe('disabled');
    });

    // 3. Whitespace string in dev
    it('Parity 3: Whitespace mode in development context', () => {
      const env = { EAS_BUILD_PROFILE: 'development', EXPO_PUBLIC_ADS_MODE: '   ' };

      expect(canonicalResolveAdsMode(env)).toBe('disabled');
      expect(preSubResolveAdsMode(env)).toBe('disabled');
      expect(runtimeResolveAdsMode(env)).toBe('disabled');
      const appCfg = resolveAppConfigMode(env);
      expect(appCfg.mode).toBe('disabled');
    });

    // 4. Disabled mode in dev
    it('Parity 4: Disabled mode in development context', () => {
      const env = { EAS_BUILD_PROFILE: 'development', EXPO_PUBLIC_ADS_MODE: 'disabled' };

      expect(canonicalResolveAdsMode(env)).toBe('disabled');
      expect(preSubResolveAdsMode(env)).toBe('disabled');
      expect(runtimeResolveAdsMode(env)).toBe('disabled');
      const appCfg = resolveAppConfigMode(env);
      expect(appCfg.mode).toBe('disabled');
    });

    // 5. Test mode in dev
    it('Parity 5: Test mode in development context', () => {
      const env = {
        EAS_BUILD_PROFILE: 'development',
        EXPO_PUBLIC_ADS_MODE: 'test',
        EXPO_PUBLIC_ADMOB_ANDROID_APP_ID: GOOGLE_TEST_APP_ID_ANDROID,
        EXPO_PUBLIC_ADMOB_INTERSTITIAL_ANDROID_ID: GOOGLE_TEST_INTERSTITIAL_ANDROID,
      };

      expect(canonicalResolveAdsMode(env)).toBe('test');
      expect(preSubResolveAdsMode(env)).toBe('test');
      expect(runtimeResolveAdsMode(env)).toBe('test');
      const appCfg = resolveAppConfigMode(env);
      expect(appCfg.mode).toBe('test');
      expect(appCfg.pluginAppId).toBe(GOOGLE_TEST_APP_ID_ANDROID);
    });

    // 6. Real mode with valid real IDs
    it('Parity 6: Real mode with valid real IDs', () => {
      const env = {
        EAS_BUILD_PROFILE: 'development',
        EXPO_PUBLIC_ADS_MODE: 'real',
        EXPO_PUBLIC_ADMOB_ANDROID_APP_ID: REAL_APP_ID,
        EXPO_PUBLIC_ADMOB_INTERSTITIAL_ANDROID_ID: REAL_UNIT_ID,
      };

      expect(canonicalResolveAdsMode(env)).toBe('real');
      expect(preSubResolveAdsMode(env)).toBe('real');
      expect(runtimeResolveAdsMode(env)).toBe('real');
      const appCfg = resolveAppConfigMode(env);
      expect(appCfg.mode).toBe('real');
      expect(appCfg.pluginAppId).toBe(REAL_APP_ID);
    });

    // 7. Unknown value
    it('Parity 7: Unknown value throws across all layers', () => {
      const env = { EAS_BUILD_PROFILE: 'development', EXPO_PUBLIC_ADS_MODE: 'unknown_mode' };

      expect(() => canonicalResolveAdsMode(env)).toThrow();
      expect(() => preSubResolveAdsMode(env)).toThrow();
      expect(() => runtimeResolveAdsMode(env)).toThrow();
      const appCfg = resolveAppConfigMode(env);
      expect(appCfg.mode).toBe('throws');
    });

    // 8. Legacy ADS_MODE only (must NOT affect resolution)
    it('Parity 8: Legacy ADS_MODE only is ignored by all layers', () => {
      const env = {
        EAS_BUILD_PROFILE: 'development',
        ADS_MODE: 'test',
      };
      delete (env as Record<string, string | undefined>).EXPO_PUBLIC_ADS_MODE;

      expect(canonicalResolveAdsMode(env)).toBe('disabled');
      expect(preSubResolveAdsMode(env)).toBe('disabled');
      expect(runtimeResolveAdsMode(env)).toBe('disabled');
      const appCfg = resolveAppConfigMode(env);
      expect(appCfg.mode).toBe('disabled');
    });

    // 9. Conflicting EXPO_PUBLIC_ADS_MODE=real + ADS_MODE=test
    it('Parity 9: EXPO_PUBLIC_ADS_MODE wins over legacy ADS_MODE', () => {
      const env = {
        EAS_BUILD_PROFILE: 'development',
        EXPO_PUBLIC_ADS_MODE: 'real',
        ADS_MODE: 'test',
        EXPO_PUBLIC_ADMOB_ANDROID_APP_ID: REAL_APP_ID,
        EXPO_PUBLIC_ADMOB_INTERSTITIAL_ANDROID_ID: REAL_UNIT_ID,
      };

      expect(canonicalResolveAdsMode(env)).toBe('real');
      expect(preSubResolveAdsMode(env)).toBe('real');
      expect(runtimeResolveAdsMode(env)).toBe('real');
      const appCfg = resolveAppConfigMode(env);
      expect(appCfg.mode).toBe('real');
      expect(appCfg.pluginAppId).toBe(REAL_APP_ID);
    });
  });

  describe('Real Pre-Submit Entrypoint Tests with Injected Environments', () => {
    const validProductionBase: Record<string, string> = {
      EXPO_PUBLIC_APP_ENV: 'production',
      EAS_BUILD_PROFILE: 'production',
      EXPO_PUBLIC_API_URL: 'https://api.nutriai.ro',
      EXPO_PUBLIC_SUPABASE_URL: 'https://nutriai.supabase.co',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_live_key',
      EXPO_PUBLIC_IMAGEKIT_PUBLIC_KEY: 'public_live_key',
      EXPO_PUBLIC_SENTRY_DSN: 'https://public@sentry.io/123',
      EXPO_PUBLIC_PRIVACY_POLICY_URL: 'https://legal.nutriai.ro/confidentialitate',
      EXPO_PUBLIC_TERMS_OF_SERVICE_URL: 'https://legal.nutriai.ro/termeni',
      EXPO_PUBLIC_ADMOB_REWARDED_ANDROID_ID: REAL_UNIT_ID,
    };

    it('Entrypoint 1: production + missing mode -> FAIL', () => {
      const env = { ...validProductionBase };
      delete env.EXPO_PUBLIC_ADS_MODE;

      const res = executaVerificareMediu(env, 'android');
      expect(res.ok).toBe(false);
      expect(res.esteProductie).toBe(true);
      expect(res.aFolositLocalEnv).toBe(false);
      expect(res.erori.some((e: string) => e.includes('EXPO_PUBLIC_ADS_MODE'))).toBe(true);
    });

    it('Entrypoint 2: production + disabled -> FAIL', () => {
      const env = {
        ...validProductionBase,
        EXPO_PUBLIC_ADS_MODE: 'disabled',
      };

      const res = executaVerificareMediu(env, 'android');
      expect(res.ok).toBe(false);
      expect(res.esteProductie).toBe(true);
      expect(res.aFolositLocalEnv).toBe(false);
      expect(res.erori.some((e: string) => e.includes('disabled') && e.includes('interzis'))).toBe(true);
    });

    it('Entrypoint 3: production + test -> FAIL', () => {
      const env = {
        ...validProductionBase,
        EXPO_PUBLIC_ADS_MODE: 'test',
        EXPO_PUBLIC_ADMOB_ANDROID_APP_ID: GOOGLE_TEST_APP_ID_ANDROID,
        EXPO_PUBLIC_ADMOB_INTERSTITIAL_ANDROID_ID: GOOGLE_TEST_INTERSTITIAL_ANDROID,
      };

      const res = executaVerificareMediu(env, 'android');
      expect(res.ok).toBe(false);
      expect(res.esteProductie).toBe(true);
      expect(res.aFolositLocalEnv).toBe(false);
      expect(res.erori.some((e: string) => e.includes('test') && e.includes('interzis'))).toBe(true);
    });

    it('Entrypoint 4: production + real + invalid IDs -> FAIL', () => {
      const env = {
        ...validProductionBase,
        EXPO_PUBLIC_ADS_MODE: 'real',
        EXPO_PUBLIC_ADMOB_ANDROID_APP_ID: 'invalid_app_id',
        EXPO_PUBLIC_ADMOB_INTERSTITIAL_ANDROID_ID: 'invalid_unit_id',
      };

      const res = executaVerificareMediu(env, 'android');
      expect(res.ok).toBe(false);
      expect(res.esteProductie).toBe(true);
      expect(res.aFolositLocalEnv).toBe(false);
      expect(res.erori.some((e: string) => e.includes('AdMob') && e.includes('format invalid'))).toBe(true);
    });

    it('Entrypoint 5: production + real + complete valid fixtures -> P0-05 validation PASS', () => {
      const env = {
        ...validProductionBase,
        EXPO_PUBLIC_ADS_MODE: 'real',
        EXPO_PUBLIC_ADMOB_ANDROID_APP_ID: REAL_APP_ID,
        EXPO_PUBLIC_ADMOB_INTERSTITIAL_ANDROID_ID: REAL_UNIT_ID,
      };

      const res = executaVerificareMediu(env, 'android');
      expect(res.ok).toBe(true);
      expect(res.erori).toHaveLength(0);
      expect(res.esteProductie).toBe(true);
      expect(res.aFolositLocalEnv).toBe(false);

      // Verify via full executaVerificari entrypoint (skipping code check commands to isolate config)
      const fullRes = executaVerificari({
        silent: true,
        env,
        skipCodeChecks: true,
        platforma: 'android',
      });
      expect(fullRes.ok).toBe(true);
      expect(fullRes.verificareMediu.ok).toBe(true);
    });

    (process.env.PRE_SUBMISSION_CHILD || process.env.CI ? it.skip : it)(
      'Real CLI: spawns scripts/preSubmissionCheck.js with production environment, proving config passes, code checks pass, and the audit gate is now clean (P0-04)',
      () => {
        const scriptPath = path.resolve(__dirname, '../scripts/preSubmissionCheck.js');
        const prodEnvFixture = {
          ...process.env,
          ...validProductionBase,
          EXPO_PUBLIC_ADS_MODE: 'real',
          EXPO_PUBLIC_ADMOB_ANDROID_APP_ID: REAL_APP_ID,
          EXPO_PUBLIC_ADMOB_INTERSTITIAL_ANDROID_ID: REAL_UNIT_ID,
        };

        const result = spawnSync(process.execPath, [scriptPath], {
          cwd: path.resolve(__dirname, '..'),
          env: prodEnvFixture,
          encoding: 'utf8',
          timeout: 360000,
        });

      const output = `${result.stdout || ''}\n${result.stderr || ''}`;

      // 1. Production configuration gate sees the production environment
      expect(output).toContain('Sursă rezoluție mediu: process.env');
      expect(output).not.toContain('EXPO_PUBLIC_ADS_MODE="disabled" este strict interzis');
      expect(output).not.toContain('este invalid sau lipsește');

      // 2. Typecheck passes
      expect(output).toContain('[+] Rulare Typecheck (tsc --noEmit)... ✅ OK');

      // 3. Lint passes
      expect(output).toContain('[+] Rulare Linter (expo lint)... ✅ OK');

      // 4. Jest passes (proves subprocess environment isolation prevents test contamination)
      expect(output).toContain('[+] Rulare Teste Unitare (jest)... ✅ OK');

      // 5. P0-05 configuration validation passes (all required production vars present)
      expect(output).toContain('✅ EXPO_PUBLIC_ADS_MODE este prezent');

      // 6. P0-04: the dependency audit gate is now CLEAN. Before P0-04 this
      // assertion was inverted (`❌ EȘUAT`) and encoded the release blocker as
      // expected behaviour; the advisories were remediated via patch-level
      // `overrides`, so the gate must now pass on its own merits.
      expect(output).toContain('[+] Rulare Audit Security Gate (auditGate.js)... ✅ OK');
      expect(output).not.toContain('vulnerabilitati NEPERMISE');

      // 7. The Node engine gate (P0-04) reports honestly for the runtime that
      // actually spawned the CLI. `process.execPath` here is whatever Node runs
      // Jest, which on a dev machine may legitimately be outside `>=22 <23`.
      const engineCerut = JSON.parse(
        fs.readFileSync(path.resolve(__dirname, '..', 'package.json'), 'utf8'),
      ).engines.node;
      const majorCurent = Number(process.versions.node.split('.')[0]);
      const nodeConform = majorCurent === 22;

      expect(output).toContain('[+] Rulare Verificare versiune Node...');
      if (nodeConform) {
        expect(output).toContain('[+] Rulare Verificare versiune Node... ✅ OK');
        // Pe Node 22, toate porțile trec => pre-submit complet verde.
        expect(result.status).toBe(0);
      } else {
        // Pe orice alt major, poarta trebuie să EȘUEZE explicit (fail-closed),
        // nu să treacă tăcut — altfel `engines` ar fi doar decorativ.
        expect(output).toContain('[+] Rulare Verificare versiune Node... ❌ EȘUAT');
        expect(output).toContain(engineCerut);
        expect(result.status).not.toBe(0);
      }
    }, 360000);
  });

  describe('EAS.json Production Environment Binding', () => {
    it('eas.json production profile explicitly binds environment to production', () => {
      const easJsonPath = path.resolve(__dirname, '..', 'eas.json');
      expect(fs.existsSync(easJsonPath)).toBe(true);

      const easJson = JSON.parse(fs.readFileSync(easJsonPath, 'utf8'));
      expect(easJson.build).toBeDefined();
      expect(easJson.build.production).toBeDefined();
      expect(easJson.build.production.environment).toBe('production');
    });
  });
});
