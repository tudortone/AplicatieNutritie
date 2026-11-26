const fs = require('fs');
const path = require('path');
const {
  replaceDefaultProguardRules,
  upsertR8FullModeProperties,
} = require('../plugins/androidR8ProguardTransform');

describe('withAndroidR8OptimizedProguard', () => {
  it('uses Android optimized default rules for the release build', () => {
    const gradle = 'release {\n            proguardFiles getDefaultProguardFile("proguard-android.txt"), "proguard-rules.pro"\n        }';

    expect(replaceDefaultProguardRules(gradle)).toContain(
      'getDefaultProguardFile("proguard-android-optimize.txt")',
    );
    expect(replaceDefaultProguardRules(gradle)).not.toContain('getDefaultProguardFile("proguard-android.txt")');
  });

  it('is idempotent and leaves unrelated Gradle content unchanged', () => {
    const gradle = 'debug {\n            proguardFiles getDefaultProguardFile("proguard-android-optimize.txt"), "debug-rules.pro"\n        }';

    expect(replaceDefaultProguardRules(gradle)).toBe(gradle);
  });

  it('inserts and enforces R8 full mode, minify, and shrinkResources in gradle.properties', () => {
    const inserted = upsertR8FullModeProperties([
      { type: 'property', key: 'org.gradle.jvmargs', value: '-Xmx2048m' },
    ]);

    expect(inserted).toEqual(
      expect.arrayContaining([
        { type: 'property', key: 'org.gradle.jvmargs', value: '-Xmx2048m' },
        { type: 'property', key: 'android.enableR8.fullMode', value: 'true' },
        { type: 'property', key: 'android.enableMinifyInReleaseBuilds', value: 'true' },
        { type: 'property', key: 'android.enableShrinkResourcesInReleaseBuilds', value: 'true' },
        { type: 'property', key: 'android.r8.optimizedResourceShrinking', value: 'true' },
      ]),
    );

    const updated = upsertR8FullModeProperties([
      { type: 'property', key: 'android.enableR8.fullMode', value: 'false' },
      { type: 'property', key: 'android.enableMinifyInReleaseBuilds', value: 'false' },
      { type: 'property', key: 'android.enableShrinkResourcesInReleaseBuilds', value: 'false' },
      { type: 'property', key: 'android.r8.optimizedResourceShrinking', value: 'false' },
    ]);

    expect(updated).toEqual([
      { type: 'property', key: 'android.enableR8.fullMode', value: 'true' },
      { type: 'property', key: 'android.enableMinifyInReleaseBuilds', value: 'true' },
      { type: 'property', key: 'android.enableShrinkResourcesInReleaseBuilds', value: 'true' },
      { type: 'property', key: 'android.r8.optimizedResourceShrinking', value: 'true' },
    ]);
  });

  it('removes overly broad wildcard keep rules from app.json while preserving required SDK keeps', () => {
    const appJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../app.json'), 'utf8'));
    const buildProps = appJson.expo.plugins.find(
      (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-build-properties',
    );
    const rules = buildProps[1].android.extraProguardRules;

    expect(rules).not.toContain('-keep class expo.modules.** { *; }');
    expect(rules).not.toContain('-keep class kotlin.reflect.** { *; }');
    expect(rules).not.toContain('-keep class com.google.android.gms.ads.** { *; }');
    expect(rules).not.toContain('-keep class com.android.billingclient.api.** { *; }');

    expect(rules).toContain('-keep class * extends expo.modules.kotlin.modules.Module');
    expect(rules).toContain('-keep class * implements expo.modules.kotlin.records.Record');
    expect(rules).toContain('-keep class io.invertase.googlemobileads.** { *; }');
    expect(rules).toContain('-keep class com.google.android.play.core.integrity.IntegrityManager**');
    expect(rules).toContain('-keep class com.android.billingclient.api.BillingClient**');
  });
});
