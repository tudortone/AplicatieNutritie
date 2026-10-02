'use strict';

const path = require('path');
const { spawnSync } = require('child_process');

const configPath = path.resolve(__dirname, '../config/env.js');
const workspaceRoot = path.resolve(__dirname, '../..');

const COMPLETE_PRODUCTION_ENV = Object.freeze({
  NODE_ENV: 'production',
  SUPABASE_URL: 'https://nutriai.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_live_value',
  SUPABASE_SERVICE_ROLE_KEY: 'service_role_live_value',
  CORS_ORIGINS: 'https://app.nutriai.ro',
  GEMINI_API_KEY: 'gemini_live_value',
  REDIS_URL: 'rediss://default:password@redis.nutriai.ro:6379',
  GOOGLE_PLAY_PACKAGE_NAME: 'com.totsrl.getflo',
  GOOGLE_PLAY_SUBSCRIPTION_PRODUCT_IDS: 'premium_monthly,premium_annual',
  GOOGLE_PLAY_CREDIT_PRODUCT_IDS: 'getflow_credits_10,getflow_credits_30',
  GOOGLE_APPLICATION_CREDENTIALS: 'C:\\secure\\google-play-service-account.json',
  GOOGLE_PLAY_PUBSUB_AUDIENCE: 'https://api.nutriai.ro/api/v1/webhooks/google-play',
  GOOGLE_PLAY_PUBSUB_SERVICE_ACCOUNT_EMAIL: 'play-rtdn@nutriai.iam.gserviceaccount.com',
  ADMOB_REWARDED_AD_UNIT_ID: '3566028223',
  ADMOB_REWARDED_REWARD_AMOUNT: '1',
  ADMOB_REWARDED_REWARD_ITEM: 'Flow Credit',
  CLERK_SECRET_KEY: 'sk_live_value',
  CLERK_WEBHOOK_SIGNING_SECRET: 'whsec_live_value',
  IMAGEKIT_PUBLIC_KEY: 'public_live_value',
  IMAGEKIT_PRIVATE_KEY: 'private_live_value',
  IMAGEKIT_URL_ENDPOINT: 'https://ik.imagekit.io/nutriai',
  SENTRY_DSN: 'https://public@sentry.io/123',
  SENTRY_PII_SALT: '0123456789abcdef0123456789abcdef',
  TRIGGER_SECRET_KEY: 'tr_prod_live_value',
  GDPR_WORKER_ACTIV: '1',
});

function pornesteConfig(overrides = {}) {
  const env = { ...COMPLETE_PRODUCTION_ENV, ...overrides };
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete env[key];
  }
  return spawnSync(
    process.execPath,
    ['-e', `require(${JSON.stringify(configPath)}).incarcaConfig()`],
    { cwd: workspaceRoot, env, encoding: 'utf8' },
  );
}

describe('configuratia backend de productie', () => {
  test('porneste numai cu toate integrarile critice configurate', () => {
    expect(pornesteConfig().status).toBe(0);
  });

  test.each([
    'GOOGLE_PLAY_SUBSCRIPTION_PRODUCT_IDS',
    'GOOGLE_PLAY_CREDIT_PRODUCT_IDS',
    'GOOGLE_APPLICATION_CREDENTIALS',
    'GOOGLE_PLAY_PUBSUB_AUDIENCE',
    'GOOGLE_PLAY_PUBSUB_SERVICE_ACCOUNT_EMAIL',
    'ADMOB_REWARDED_AD_UNIT_ID',
    'ADMOB_REWARDED_REWARD_AMOUNT',
    'ADMOB_REWARDED_REWARD_ITEM',
    'SENTRY_DSN',
    'SENTRY_PII_SALT',
    'TRIGGER_SECRET_KEY',
  ])('refuza pornirea cand lipseste %s', (nume) => {
    const rezultat = pornesteConfig({ [nume]: undefined });
    expect(rezultat.status).not.toBe(0);
    expect(rezultat.stderr).toContain(nume);
  });

  test('refuza orice package name diferit de aplicatia Play autoritativa', () => {
    const rezultat = pornesteConfig({ GOOGLE_PLAY_PACKAGE_NAME: 'com.attacker.copy' });
    expect(rezultat.status).not.toBe(0);
    expect(rezultat.stderr).toContain('com.totsrl.getflo');
  });

  test('refuza allowlist gol, duplicat sau cu identificatori invalizi', () => {
    for (const productIds of ['', 'premium_monthly,premium_monthly', 'premium monthly']) {
      expect(pornesteConfig({ GOOGLE_PLAY_SUBSCRIPTION_PRODUCT_IDS: productIds }).status).not.toBe(0);
    }
  });

  test('expune numai configuratia comerciala Google Play inghetata', () => {
    const marker = '__GETFLOW_CONFIG__';
    const script = [
      `const c=require(${JSON.stringify(configPath)}).incarcaConfig();`,
      `process.stdout.write(${JSON.stringify(marker)}+JSON.stringify({googlePlay:c.googlePlay,admob:c.admob}))`,
    ].join('');
    const rezultat = spawnSync(process.execPath, ['-e', script], {
      cwd: workspaceRoot,
      env: { ...COMPLETE_PRODUCTION_ENV },
      encoding: 'utf8',
    });
    expect(rezultat.status).toBe(0);
    const markerIndex = rezultat.stdout.indexOf(marker);
    expect(markerIndex).toBeGreaterThanOrEqual(0);
    const payload = JSON.parse(rezultat.stdout.slice(markerIndex + marker.length));
    expect(payload.googlePlay).toMatchObject({
      packageName: 'com.totsrl.getflo',
      productIds: ['premium_monthly', 'premium_annual'],
      creditProductIds: ['getflow_credits_10', 'getflow_credits_30'],
      pubsubAudience: 'https://api.nutriai.ro/api/v1/webhooks/google-play',
      pubsubServiceAccountEmail: 'play-rtdn@nutriai.iam.gserviceaccount.com',
    });
    expect(payload.admob).toEqual({
      rewardedAdUnitId: '3566028223',
      rewardedAmount: '1',
      rewardedItem: 'Flow Credit',
    });
  });

  test('refuza un contract Rewarded diferit de unitatea si recompensa aprobate', () => {
    expect(pornesteConfig({ ADMOB_REWARDED_AD_UNIT_ID: '1542500110' }).status).not.toBe(0);
    expect(pornesteConfig({ ADMOB_REWARDED_REWARD_AMOUNT: '2' }).status).not.toBe(0);
    expect(pornesteConfig({ ADMOB_REWARDED_REWARD_ITEM: 'Coins' }).status).not.toBe(0);
  });

  test('refuza cheile Clerk si Trigger de test in productie', () => {
    expect(pornesteConfig({ CLERK_SECRET_KEY: 'sk_test_value' }).status).not.toBe(0);
    expect(pornesteConfig({ TRIGGER_SECRET_KEY: 'tr_dev_value' }).status).not.toBe(0);
  });

  test('refuza transportul Redis necriptat si un worker GDPR oprit', () => {
    expect(pornesteConfig({ REDIS_URL: 'redis://redis.nutriai.ro:6379' }).status).not.toBe(0);
    expect(pornesteConfig({ GDPR_WORKER_ACTIV: '0' }).status).not.toBe(0);
  });
});
