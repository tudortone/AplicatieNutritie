const { replaceDefaultProguardRules } = require('../plugins/androidR8ProguardTransform');

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
});
