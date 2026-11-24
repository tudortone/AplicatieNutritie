const { withAndroidManifest, withAndroidStyles } = require('expo/config-plugins');

const OPTIONAL_HARDWARE_FEATURES = [
  'android.hardware.camera',
  'android.hardware.camera.autofocus',
  'android.hardware.camera.front',
  'android.hardware.faketouch',
  'android.hardware.screen.portrait',
  'android.hardware.wifi',
];

function ensureOptionalHardwareFeatures(manifest) {
  manifest.$ = manifest.$ || {};
  manifest.$['xmlns:tools'] = manifest.$['xmlns:tools'] || 'http://schemas.android.com/tools';

  const features = Array.isArray(manifest['uses-feature']) ? manifest['uses-feature'] : [];

  for (const entry of features) {
    if (entry?.$?.['android:name']) {
      entry.$['android:required'] = 'false';
      entry.$['tools:replace'] = 'android:required';
    }
  }

  for (const featureName of OPTIONAL_HARDWARE_FEATURES) {
    const existing = features.find((entry) => entry?.$?.['android:name'] === featureName);
    if (existing) {
      existing.$ = {
        ...existing.$,
        'android:required': 'false',
        'tools:replace': 'android:required',
      };
    } else {
      features.push({
        $: {
          'android:name': featureName,
          'android:required': 'false',
          'tools:replace': 'android:required',
        },
      });
    }
  }

  manifest['uses-feature'] = features;
}

function withResizableAndroidManifest(config) {
  return withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest;
    const activity = manifest.application?.[0]?.activity?.find(({ $ }) =>
      String($?.['android:name'] || '').endsWith('MainActivity'));
    if (!activity) throw new Error('GetFlow MainActivity was not found in the Android manifest.');
    activity.$['android:resizeableActivity'] = 'true';
    const screens = manifest['supports-screens']?.[0] || { $: {} };
    screens.$ = { ...screens.$, 'android:resizeable': 'true' };
    manifest['supports-screens'] = [screens];
    ensureOptionalHardwareFeatures(manifest);
    return mod;
  });
}

const DEPRECATED_EDGE_TO_EDGE_STYLE_ITEMS = new Set([
  'android:statusBarColor',
  'android:navigationBarColor',
  'android:windowLayoutInDisplayCutoutMode',
]);

function withCleanEdgeToEdgeStyles(config) {
  return withAndroidStyles(config, (mod) => {
    const styles = mod.modResults.resources.style;
    const appTheme = styles?.find(({ $ }) => $?.name === 'AppTheme');
    if (!appTheme) throw new Error('GetFlow AppTheme was not found in Android styles.');
    for (const style of styles) {
      if (Array.isArray(style.item)) {
        style.item = style.item.filter(
          (item) => !DEPRECATED_EDGE_TO_EDGE_STYLE_ITEMS.has(item?.$?.name),
        );
      }
    }
    return mod;
  });
}

module.exports = (config) => withCleanEdgeToEdgeStyles(withResizableAndroidManifest(config));
