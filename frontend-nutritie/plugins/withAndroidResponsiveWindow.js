const { withAndroidManifest, withAndroidStyles } = require('expo/config-plugins');

const CUTOUT_API_LEVEL = '27';

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
