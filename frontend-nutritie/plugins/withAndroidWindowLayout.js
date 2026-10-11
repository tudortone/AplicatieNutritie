const { AndroidConfig, withAndroidManifest, withAndroidStyles } = require('@expo/config-plugins');

function withAndroidWindowLayout(config) {
  config = withAndroidManifest(config, (modConfig) => {
    const manifest = modConfig.modResults.manifest;
    const mainActivity = AndroidConfig.Manifest.getMainActivityOrThrow(modConfig.modResults);
    mainActivity.$['android:resizeableActivity'] = 'true';

    const supportsScreens = manifest['supports-screens'] || [{ $: {} }];
    supportsScreens[0].$ = {
      ...supportsScreens[0].$,
      'android:resizeable': 'true',
    };
    manifest['supports-screens'] = supportsScreens;
    return modConfig;
  });

  return withAndroidStyles(config, (modConfig) => {
    const parent = AndroidConfig.Styles.getAppThemeGroup();
    for (const [name, value, targetApi] of [
      ['android:statusBarColor', '@android:color/transparent'],
      ['android:navigationBarColor', '@android:color/transparent'],
      ['android:windowLayoutInDisplayCutoutMode', 'shortEdges', '27'],
    ]) {
      modConfig.modResults = AndroidConfig.Styles.assignStylesValue(modConfig.modResults, {
        parent,
        name,
        value,
        targetApi,
        add: true,
      });
    }
    return modConfig;
  });
}

module.exports = withAndroidWindowLayout;
