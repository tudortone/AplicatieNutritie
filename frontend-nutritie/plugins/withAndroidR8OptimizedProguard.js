const { withAppBuildGradle } = require('@expo/config-plugins');
const { replaceDefaultProguardRules } = require('./androidR8ProguardTransform');

function withAndroidR8OptimizedProguard(config) {
  return withAppBuildGradle(config, (modConfig) => {
    if (modConfig.modResults.language !== 'groovy') {
      throw new Error('GetFlow R8 optimized ProGuard plugin expects app/build.gradle in Groovy format.');
    }

    modConfig.modResults.contents = replaceDefaultProguardRules(modConfig.modResults.contents);
    return modConfig;
  });
}

module.exports = withAndroidR8OptimizedProguard;
