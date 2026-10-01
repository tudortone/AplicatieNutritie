describe('configuratia Expo pentru release', () => {
  const envInitial = { ...process.env };
  const configStatic = require('../app.json').expo;

  function setTestEnv(fixture: Record<string, string | undefined>) {
    // Clear all ambient app, EAS, Sentry, and AdMob environment variables
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
    for (const [k, v] of Object.entries(fixture)) {
      if (v !== undefined) {
        process.env[k] = v;
      }
    }
    jest.resetModules();
  }

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

  it('opreste configurarea profilului EAS production cand mediul este incomplet', () => {
    setTestEnv({ EAS_BUILD_PROFILE: 'production', EAS_BUILD_PLATFORM: 'android' });

    expect(() => require('../app.config.js')({ config: configStatic })).toThrow(
      /Configuratia build-ului de productie este invalida/,
    );
  });

  it('nu blocheaza configuratia locala care nu este un build production', () => {
    setTestEnv({ EAS_BUILD_PROFILE: 'development' });

    expect(require('../app.config.js')({ config: configStatic }).android.package).toBe('com.totsrl.getflo');
  });

  it('activeaza plugin-ul nativ direct Google Play al expo-iap', () => {
    expect(configStatic.plugins).toContain('expo-iap');
  });

  it('nu cere microfon pe Android pentru fluxurile exclusiv foto/barcode', () => {
    const cameraPlugin = configStatic.plugins.find(
      (plugin: string | [string, Record<string, unknown>]) =>
        Array.isArray(plugin) && plugin[0] === 'expo-camera',
    ) as [string, { recordAudioAndroid?: boolean }] | undefined;

    const imagePickerPlugin = configStatic.plugins.find(
      (plugin: string | [string, Record<string, unknown>]) =>
        Array.isArray(plugin) && plugin[0] === 'expo-image-picker',
    ) as [string, { microphonePermission?: boolean }] | undefined;

    expect(cameraPlugin?.[1].recordAudioAndroid).toBe(false);
    expect(imagePickerPlugin?.[1].microphonePermission).toBe(false);
    expect(configStatic.android.permissions).not.toContain('android.permission.RECORD_AUDIO');
    expect(configStatic.android.blockedPermissions).toContain('android.permission.RECORD_AUDIO');
  });

  it('blocheaza permisiunile Android speciale si legacy care nu sunt folosite de produs', () => {
    expect(configStatic.android.blockedPermissions).toEqual(
      expect.arrayContaining([
        'android.permission.SYSTEM_ALERT_WINDOW',
        'android.permission.WRITE_EXTERNAL_STORAGE',
        'android.permission.READ_EXTERNAL_STORAGE',
        'android.permission.READ_MEDIA_IMAGES',
        'android.permission.READ_MEDIA_VIDEO',
      ]),
    );
    expect(configStatic.android.permissions).not.toContain('android.permission.READ_MEDIA_IMAGES');
    expect(configStatic.android.permissions).not.toContain('android.permission.READ_EXTERNAL_STORAGE');
    expect(configStatic.android.permissions).not.toContain('android.permission.WRITE_EXTERNAL_STORAGE');
  });

  describe('P0-05: AdMob plugin and manifest configuration', () => {
    const REAL_APP_ID = 'ca-app-pub-1234567890123456~1234567890';
    const REAL_UNIT_ID = 'ca-app-pub-1234567890123456/1234567890';
    const TEST_APP_ID = 'ca-app-pub-3940256099942544~3347511713';

    const validProductionBase: Record<string, string> = {
      EAS_BUILD_PROFILE: 'production',
      EXPO_PUBLIC_APP_ENV: 'production',
      EXPO_PUBLIC_API_URL: 'https://api.nutriai.ro',
      EXPO_PUBLIC_SUPABASE_URL: 'https://nutriai.supabase.co',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_live_key',
      EXPO_PUBLIC_IMAGEKIT_PUBLIC_KEY: 'public_live_key',
      EXPO_PUBLIC_SENTRY_DSN: 'https://public@sentry.io/123',
      EXPO_PUBLIC_PRIVACY_POLICY_URL: 'https://legal.nutriai.ro/confidentialitate',
      EXPO_PUBLIC_TERMS_OF_SERVICE_URL: 'https://legal.nutriai.ro/termeni',
      EXPO_PUBLIC_ADMOB_REWARDED_ANDROID_ID: 'ca-app-pub-1234567890123456/2345678901',
    };

    it('omite plugin-ul react-native-google-mobile-ads cand ADS_MODE=disabled', () => {
      setTestEnv({ EXPO_PUBLIC_ADS_MODE: 'disabled' });
      const rezConfig = require('../app.config.js')({ config: configStatic });

      const adsPlugin = rezConfig.plugins.find(
        (p: string | [string, Record<string, unknown>]) =>
          Array.isArray(p) && p[0] === 'react-native-google-mobile-ads',
      );
      expect(adsPlugin).toBeUndefined();
    });

    it('include plugin-ul cu test App ID cand ADS_MODE=test in dezvoltare', () => {
      setTestEnv({ EXPO_PUBLIC_ADS_MODE: 'test' });
      const rezConfig = require('../app.config.js')({ config: configStatic });

      const adsPlugin = rezConfig.plugins.find(
        (p: string | [string, Record<string, unknown>]) =>
          Array.isArray(p) && p[0] === 'react-native-google-mobile-ads',
      ) as [string, { androidAppId?: string }] | undefined;

      expect(adsPlugin).toBeDefined();
      expect(adsPlugin?.[1].androidAppId).toBe(TEST_APP_ID);
    });

    it('include plugin-ul cu App ID real cand ADS_MODE=real si variabilele sunt valide', () => {
      setTestEnv({
        EXPO_PUBLIC_ADS_MODE: 'real',
        EXPO_PUBLIC_ADMOB_ANDROID_APP_ID: REAL_APP_ID,
        EXPO_PUBLIC_ADMOB_INTERSTITIAL_ANDROID_ID: REAL_UNIT_ID,
      });
      const rezConfig = require('../app.config.js')({ config: configStatic });

      const adsPlugin = rezConfig.plugins.find(
        (p: string | [string, Record<string, unknown>]) =>
          Array.isArray(p) && p[0] === 'react-native-google-mobile-ads',
      ) as [string, { androidAppId?: string }] | undefined;

      expect(adsPlugin).toBeDefined();
      expect(adsPlugin?.[1].androidAppId).toBe(REAL_APP_ID);
    });

    it('blocheaza build-ul la runtime cand ADS_MODE=real foloseste test App ID', () => {
      setTestEnv({
        EXPO_PUBLIC_ADS_MODE: 'real',
        EXPO_PUBLIC_ADMOB_ANDROID_APP_ID: TEST_APP_ID,
        EXPO_PUBLIC_ADMOB_INTERSTITIAL_ANDROID_ID: REAL_UNIT_ID,
      });

      expect(() => require('../app.config.js')({ config: configStatic })).toThrow(
        /Configuratia AdMob este invalida/,
      );
    });

    it('blocheaza build-ul cand ADS_MODE este necunoscut', () => {
      setTestEnv({
        EXPO_PUBLIC_ADS_MODE: 'invalid_mode',
      });

      expect(() => require('../app.config.js')({ config: configStatic })).toThrow(
        /Configuratia AdMob este invalida/,
      );
    });

    // Structural tests: Production Context
    it('production + disabled -> throws', () => {
      setTestEnv({
        EAS_BUILD_PROFILE: 'production',
        EXPO_PUBLIC_ADS_MODE: 'disabled',
      });

      expect(() => require('../app.config.js')({ config: configStatic })).toThrow(
        /Configuratia build-ului de productie este invalida|Configuratia AdMob este invalida/,
      );
    });

    it('production + test -> throws', () => {
      setTestEnv({
        EAS_BUILD_PROFILE: 'production',
        EXPO_PUBLIC_ADS_MODE: 'test',
      });

      expect(() => require('../app.config.js')({ config: configStatic })).toThrow(
        /Configuratia build-ului de productie este invalida|Configuratia AdMob este invalida/,
      );
    });

    it('production + missing mode -> throws', () => {
      setTestEnv({
        ...validProductionBase,
        EXPO_PUBLIC_ADMOB_ANDROID_APP_ID: REAL_APP_ID,
        EXPO_PUBLIC_ADMOB_INTERSTITIAL_ANDROID_ID: REAL_UNIT_ID,
      });

      expect(() => require('../app.config.js')({ config: configStatic })).toThrow(
        /Configuratia build-ului de productie este invalida|Configuratia AdMob este invalida/,
      );
    });

    it('production + real -> plugin contains supplied valid real fixture App ID', () => {
      setTestEnv({
        ...validProductionBase,
        EXPO_PUBLIC_ADS_MODE: 'real',
        EXPO_PUBLIC_ADMOB_ANDROID_APP_ID: REAL_APP_ID,
        EXPO_PUBLIC_ADMOB_INTERSTITIAL_ANDROID_ID: REAL_UNIT_ID,
      });

      const rezConfig = require('../app.config.js')({ config: configStatic });
      const adsPlugin = rezConfig.plugins.find(
        (p: string | [string, Record<string, unknown>]) =>
          Array.isArray(p) && p[0] === 'react-native-google-mobile-ads',
      ) as [string, { androidAppId?: string }] | undefined;

      expect(adsPlugin).toBeDefined();
      expect(adsPlugin?.[1].androidAppId).toBe(REAL_APP_ID);
    });

    it('production + real + test ID -> throws', () => {
      setTestEnv({
        ...validProductionBase,
        EXPO_PUBLIC_ADS_MODE: 'real',
        EXPO_PUBLIC_ADMOB_ANDROID_APP_ID: TEST_APP_ID,
        EXPO_PUBLIC_ADMOB_INTERSTITIAL_ANDROID_ID: REAL_UNIT_ID,
      });

      expect(() => require('../app.config.js')({ config: configStatic })).toThrow(
        /Configuratia build-ului de productie este invalida|Configuratia AdMob este invalida/,
      );
    });
  });
});
