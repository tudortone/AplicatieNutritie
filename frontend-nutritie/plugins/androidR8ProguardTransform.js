const DEFAULT_RULES = 'getDefaultProguardFile("proguard-android.txt")';
const OPTIMIZED_RULES = 'getDefaultProguardFile("proguard-android-optimize.txt")';

function replaceDefaultProguardRules(contents) {
  return contents.includes(OPTIMIZED_RULES)
    ? contents
    : contents.replace(DEFAULT_RULES, OPTIMIZED_RULES);
}

module.exports = { replaceDefaultProguardRules };
