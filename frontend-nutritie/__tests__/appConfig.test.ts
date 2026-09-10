describe('configuratia Expo pentru release', () => {
  const envInitial = process.env;
  const configStatic = require('../app.json').expo;

  afterEach(() => {
    process.env = envInitial;
    jest.resetModules();
  });

  it('opreste configurarea profilului EAS production cand mediul este incomplet', () => {
    process.env = { ...envInitial, EAS_BUILD_PROFILE: 'production', EAS_BUILD_PLATFORM: 'android' };

    expect(() => require('../app.config.js')({ config: configStatic })).toThrow(
      /Configuratia build-ului de productie este invalida/,
    );
  });

  it('nu blocheaza configuratia locala care nu este un build production', () => {
    process.env = { ...envInitial, EAS_BUILD_PROFILE: 'development' };

    expect(require('../app.config.js')({ config: configStatic }).android.package).toBe('com.totsrl.getflo');
  });

  it('nu cere microfon pe Android pentru fluxurile exclusiv foto/barcode', () => {
    const cameraPlugin = configStatic.plugins.find(
      (plugin: string | [string, Record<string, unknown>]) =>
        Array.isArray(plugin) && plugin[0] === 'expo-camera',
    ) as [string, { recordAudioAndroid?: boolean }] | undefined;

    expect(cameraPlugin?.[1].recordAudioAndroid).toBe(false);
    expect(configStatic.android.permissions).not.toContain('android.permission.RECORD_AUDIO');
    expect(configStatic.android.blockedPermissions).toContain('android.permission.RECORD_AUDIO');
  });

  it('blocheaza permisiunile Android speciale si legacy care nu sunt folosite de produs', () => {
    expect(configStatic.android.blockedPermissions).toEqual(
      expect.arrayContaining([
        'android.permission.SYSTEM_ALERT_WINDOW',
        'android.permission.WRITE_EXTERNAL_STORAGE',
      ]),
    );
  });
});
