import type { ExpoConfig } from 'expo/config';
import configStatic from '../app.json';

function loadConfig() {
  return jest.requireActual<(input: { config: ExpoConfig }) => ExpoConfig>('../app.config.js')({
    config: configStatic.expo as ExpoConfig,
  });
}

const loadRuntime = () => jest.requireActual<typeof import('../constants/config')>('../constants/config');

describe('isolated QA configuration', () => {
  const originalEnv = { ...process.env };
  const fixture = {
    EXPO_PUBLIC_APP_ENV: 'qa',
    EXPO_PUBLIC_API_URL: 'http://127.0.0.1:3000',
    EXPO_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
    EXPO_PUBLIC_SUPABASE_ANON_KEY: 'qa-synthetic-anon-key',
    EXPO_PUBLIC_ADS_MODE: 'disabled',
  };

  function configure(overrides: Record<string, string | undefined> = {}) {
    process.env = { ...originalEnv };
    for (const key of Object.keys(process.env)) {
      if (/^(EXPO_PUBLIC_|EAS_|APP_ENV$)/.test(key)) delete process.env[key];
    }
    Object.assign(process.env, fixture, overrides);
    jest.resetModules();
  }

  afterEach(() => { process.env = originalEnv; jest.resetModules(); });

  it('builds a separate fixture-only Android identity with OTA and ads disabled', () => {
    configure({ EAS_BUILD_PROFILE: 'qa-isolated' });
    const config = loadConfig();
    expect(config.android?.package).toBe('com.totsrl.getflo.qa');
    expect(config.updates?.enabled).toBe(false);
    expect(config.scheme).toBe('getflow-qa');
    expect(config.plugins?.some((p) =>
      Array.isArray(p) && p[0] === 'react-native-google-mobile-ads')).toBe(false);
    expect(loadRuntime().API_URL).toBe(fixture.EXPO_PUBLIC_API_URL);
  });

  const invalid: [string, Record<string, string | undefined>][] = [
    ['missing API', { EXPO_PUBLIC_API_URL: undefined }],
    ['Production API', { EXPO_PUBLIC_API_URL: 'https://nutritie-backend-ai.onrender.com' }],
    ['remote API', { EXPO_PUBLIC_API_URL: 'https://example.com' }],
    ['deceptive URL', { EXPO_PUBLIC_API_URL: 'http://127.0.0.1@nutritie-backend-ai.onrender.com' }],
    ['noncanonical loopback', { EXPO_PUBLIC_API_URL: 'http://127.1:3000' }],
    ['invalid port', { EXPO_PUBLIC_API_URL: 'http://127.0.0.1:65536' }],
    ['redirect path', { EXPO_PUBLIC_API_URL: 'http://127.0.0.1:3000/proxy' }],
    ['Production Supabase', { EXPO_PUBLIC_SUPABASE_URL: 'https://tfqcihbjgmscsseyzifs.supabase.co' }],
    ['non-synthetic key', { EXPO_PUBLIC_SUPABASE_ANON_KEY: 'not-a-fixture-key' }],
    ['real ads', { EXPO_PUBLIC_ADS_MODE: 'real' }],
    ['telemetry', { EXPO_PUBLIC_SENTRY_DSN: 'https://example.com/1' }],
    ['media credentials', { EXPO_PUBLIC_IMAGEKIT_PUBLIC_KEY: 'not-a-fixture-key' }],
  ];
  it.each(invalid)('rejects %s at build and runtime before API fallback', (_label, overrides) => {
    configure(overrides);
    expect(loadConfig).toThrow(/QA/);
    jest.resetModules();
    expect(loadRuntime).toThrow(/QA/);
  });

  it('rejects a QA build with a missing public QA marker', () => {
    configure({ EAS_BUILD_PROFILE: 'qa-isolated', EXPO_PUBLIC_APP_ENV: undefined });
    expect(loadConfig).toThrow(/QA/);
  });

  it('preserves the existing non-QA Production API fallback', () => {
    configure({ EXPO_PUBLIC_APP_ENV: 'production', EXPO_PUBLIC_API_URL: undefined });
    expect(loadRuntime().API_URL).toBe('https://nutritie-backend-ai.onrender.com');
  });

  it('keeps the QA profile independent of Production and requires explicit fixture endpoints', () => {
    const profile = jest.requireActual<typeof import('../eas.json')>('../eas.json').build['qa-isolated'];
    expect(profile).not.toHaveProperty('extends');
    expect(profile.environment).toBe('development');
    expect(profile.node).toBe('22.23.4');
    expect(profile.env.EXPO_PUBLIC_API_URL).toBe('http://127.0.0.1:3000');
    expect(profile.env.EXPO_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');
    configure({ ...profile.env, EAS_BUILD_PROFILE: 'qa-isolated', EXPO_PUBLIC_API_URL: undefined });
    expect(loadConfig).toThrow(/QA/);
  });
});
