const { withAndroidManifest, withAndroidStyles } = require('expo/config-plugins');

const CUTOUT_API_LEVEL = '27';
const OPTIONAL_HARDWARE_FEATURES = [
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

function setStyleItem(style, name, value, extraAttributes = {}) {
  const items = style.item || [];
  const existing = items.find((item) => item.$?.name === name);
  const replacement = { $: { name, ...extraAttributes }, _: value };
  if (existing) Object.assign(existing, replacement);
  else items.push(replacement);
  style.item = items;
}

function withEdgeToEdgeStyles(config) {
  return withAndroidStyles(config, (mod) => {
    const appTheme = mod.modResults.resources.style?.find(({ $ }) => $?.name === 'AppTheme');
    if (!appTheme) throw new Error('GetFlow AppTheme was not found in Android styles.');
    setStyleItem(appTheme, 'android:statusBarColor', '@android:color/transparent');
    setStyleItem(appTheme, 'android:navigationBarColor', '@android:color/transparent');
    setStyleItem(appTheme, 'android:windowLayoutInDisplayCutoutMode', 'shortEdges', {
      'tools:targetApi': CUTOUT_API_LEVEL,
    });
    return mod;
  });
}

module.exports = (config) => withEdgeToEdgeStyles(withResizableAndroidManifest(config));
