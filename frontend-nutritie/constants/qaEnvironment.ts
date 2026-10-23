import { assertQaEnvironment } from '../lib/qaEnvironment';

// Static accesses are required for Metro's EXPO_PUBLIC_* inlining in release bundles.
assertQaEnvironment({
  EXPO_PUBLIC_APP_ENV: process.env.EXPO_PUBLIC_APP_ENV,
  EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
  EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
  EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  EXPO_PUBLIC_ADS_MODE: process.env.EXPO_PUBLIC_ADS_MODE,
  EXPO_PUBLIC_SENTRY_DSN: process.env.EXPO_PUBLIC_SENTRY_DSN,
  EXPO_PUBLIC_IMAGEKIT_PUBLIC_KEY: process.env.EXPO_PUBLIC_IMAGEKIT_PUBLIC_KEY,
});
