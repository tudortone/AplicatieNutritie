import type { ExpoConfig } from 'expo/config';
import configStatic from '../app.json';

const original = { ...process.env };
const configure = (qa: boolean) => {
  process.env = { ...original };
  for (const key of Object.keys(process.env)) if (/^(EXPO_PUBLIC_|EAS_|APP_ENV$)/.test(key)) delete process.env[key];
  Object.assign(process.env, qa ? {
    EXPO_PUBLIC_APP_ENV: 'qa', EAS_BUILD_PROFILE: 'qa-isolated', EXPO_PUBLIC_API_URL: 'http://127.0.0.1:3000',
    EXPO_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321', EXPO_PUBLIC_SUPABASE_ANON_KEY: 'qa-synthetic-anon-key', EXPO_PUBLIC_ADS_MODE: 'disabled',
  } : { EXPO_PUBLIC_ADS_MODE: 'disabled' });
  jest.resetModules();
};
const config = () => jest.requireActual<(input: { config: ExpoConfig }) => ExpoConfig>('../app.config.js')({ config: configStatic.expo as ExpoConfig });
afterEach(() => { process.env = original; jest.resetModules(); jest.dontMock('../eas.json'); });

test('QA alone selects loopback-only native policy; normal configuration is unchanged', () => {
  configure(true);
  expect(config().plugins).toContain('./plugins/withQaLoopbackNetwork');
  expect(config().plugins?.some((p) => ['@sentry/react-native', '@sentry/react-native/expo'].includes((Array.isArray(p) ? p[0] : p) ?? ''))).toBe(false);
  configure(false);
  expect(config().plugins).not.toContain('./plugins/withQaLoopbackNetwork');
  expect(config().android?.package).toBe('com.totsrl.getflo');
});

test.each(['extends', 'environment'])('QA rejects Production in build profile %s', (field) => {
  configure(true);
  const eas = jest.requireActual<{ build: Record<string, object> }>('../eas.json');
  jest.doMock('../eas.json', () => ({ ...eas, build: { ...eas.build, 'qa-isolated': { ...eas.build['qa-isolated'], [field]: 'production' } } }));
  expect(config).toThrow(/QA/);
});

test('a QA marker cannot run under internal or Production-derived build profiles', () => {
  configure(true);
  process.env.EAS_BUILD_PROFILE = 'internal';
  expect(config).toThrow(/QA/);
});
