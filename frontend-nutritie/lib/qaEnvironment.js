'use strict';

// shortcut: fixture-only loopback QA; approve a separate contract before using hosted staging.
function assertQaEnvironment(env) {
  if (env.EAS_BUILD_PROFILE !== 'qa-isolated' && env.EXPO_PUBLIC_APP_ENV !== 'qa') return;
  if (env.EXPO_PUBLIC_APP_ENV !== 'qa' || (env.EAS_BUILD_PROFILE && env.EAS_BUILD_PROFILE !== 'qa-isolated') || env.APP_ENV === 'production') {
    throw new Error('QA requires an explicit qa environment, separate from Production.');
  }
  for (const key of ['EXPO_PUBLIC_API_URL', 'EXPO_PUBLIC_SUPABASE_URL']) {
    const match = /^http:\/\/127\.0\.0\.1:([1-9]\d{0,4})\/?$/.exec(env[key] || '');
    if (!match || Number(match[1]) > 65535) {
      throw new Error(`QA requires an explicit loopback fixture URL for ${key}; remote backends are forbidden.`);
    }
  }
  if (env.EXPO_PUBLIC_SUPABASE_ANON_KEY !== 'qa-synthetic-anon-key') {
    throw new Error('QA requires the synthetic fixture key, never a hosted credential.');
  }
  if (env.EXPO_PUBLIC_ADS_MODE !== 'disabled') throw new Error('QA requires disabled ads.');
  if (env.EXPO_PUBLIC_SENTRY_DSN || env.EXPO_PUBLIC_IMAGEKIT_PUBLIC_KEY) {
    throw new Error('QA forbids hosted telemetry and ImageKit credentials.');
  }
}

module.exports = { assertQaEnvironment };
