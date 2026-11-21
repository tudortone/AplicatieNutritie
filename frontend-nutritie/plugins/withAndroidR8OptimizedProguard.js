const { withAppBuildGradle, withGradleProperties } = require('@expo/config-plugins');
const {
  replaceDefaultProguardRules,
  upsertR8FullModeProperties,
} = require('./androidR8ProguardTransform');

function withAndroidR8OptimizedProguard(config) {
  const withProperties = withGradleProperties(config, (modConfig) => {
    modConfig.modResults = upsertR8FullModeProperties(modConfig.modResults);
    return modConfig;
  });

  return withAppBuildGradle(withProperties, (modConfig) => {
    if (modConfig.modResults.language !== 'groovy') {
      throw new Error('GetFlow R8 optimized ProGuard plugin expects app/build.gradle in Groovy format.');
    }

    modConfig.modResults.contents = replaceDefaultProguardRules(modConfig.modResults.contents);
    return modConfig;
  });
}

module.exports = withAndroidR8OptimizedProguard;
