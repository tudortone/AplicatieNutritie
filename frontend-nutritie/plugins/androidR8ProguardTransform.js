const DEFAULT_RULES = 'getDefaultProguardFile("proguard-android.txt")';
const OPTIMIZED_RULES = 'getDefaultProguardFile("proguard-android-optimize.txt")';
const REQUIRED_R8_GRADLE_PROPERTIES = [
  { key: 'android.enableR8.fullMode', value: 'true' },
  { key: 'android.enableMinifyInReleaseBuilds', value: 'true' },
  { key: 'android.enableShrinkResourcesInReleaseBuilds', value: 'true' },
  { key: 'android.r8.optimizedResourceShrinking', value: 'true' },
];

function replaceDefaultProguardRules(contents) {
  return contents.includes(OPTIMIZED_RULES)
    ? contents
    : contents.replace(DEFAULT_RULES, OPTIMIZED_RULES);
}

function upsertR8FullModeProperties(properties = []) {
  const result = Array.isArray(properties)
    ? properties.map((item) => (item && typeof item === 'object' ? { ...item } : item))
    : [];

  for (const { key, value } of REQUIRED_R8_GRADLE_PROPERTIES) {
    const existing = result.find((item) => item?.type === 'property' && item?.key === key);
    if (existing) {
      existing.value = value;
    } else {
      result.push({ type: 'property', key, value });
    }
  }

  return result;
}

module.exports = {
  replaceDefaultProguardRules,
  upsertR8FullModeProperties,
  REQUIRED_R8_GRADLE_PROPERTIES,
};
