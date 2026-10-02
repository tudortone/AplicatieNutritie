import fs from 'fs';
import path from 'path';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('expo-notifications', () => ({
  scheduleNotificationAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
  getAllScheduledNotificationsAsync: jest.fn().mockResolvedValue([]),
  setNotificationChannelAsync: jest.fn(),
  getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  setNotificationHandler: jest.fn(),
  SchedulableTriggerInputTypes: { DAILY: 'daily' },
  AndroidImportance: { HIGH: 4 },
}));

import { CONFIGURED_BASE_PLANS } from '../lib/billing/paywallOfferResolver';
import { INSIGNE_LIST } from '../constants/insigne';
import { DEFAULT_MEAL_REMINDERS } from '../lib/notifications';
import { computeWorkoutMetrics } from '../lib/fitnessEngine';

describe('P1-10 — GetFlow Mixed Branding Regression', () => {
  const rootDir = path.resolve(__dirname, '..');
  const appJsonPath = path.join(rootDir, 'app.json');
  const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));

  test('1. Public Expo display name is exactly "GetFlow"', () => {
    expect(appJson.expo.name).toBe('GetFlow');
  });

  test('2. Android package is preserved as "com.totsrl.getflo"', () => {
    expect(appJson.expo.android.package).toBe('com.totsrl.getflo');
  });

  test('3. Badges and gamification use GetFlow instead of NutriAI', () => {
    const firstWorkoutBadge = INSIGNE_LIST.find((b) => b.id === 'prima_transpiratie');
    expect(firstWorkoutBadge?.descriere).toContain('GetFlow');
    expect(firstWorkoutBadge?.descriere).not.toContain('NutriAI');

    const level5Badge = INSIGNE_LIST.find((b) => b.id === 'nivel_5');
    expect(level5Badge?.nume).toBe('Atlet GetFlow');
    expect(level5Badge?.nume).not.toContain('NutriAI');

    for (const badge of INSIGNE_LIST) {
      expect(badge.nume).not.toMatch(/Nutri\s*AI/i);
      expect(badge.descriere).not.toMatch(/Nutri\s*AI/i);
      expect(badge.conditie).not.toMatch(/Nutri\s*AI/i);
    }
  });

  test('4. Fitness engine rank uses Elite GetFlow', () => {
    // High session score to trigger ELITE rank
    const sets = Array.from({ length: 20 }, (_, i) => ({ serie: i + 1, repetari: 20, greutate: 200, rpe: 10 }));
    const result = computeWorkoutMetrics([
      { exercitiuId: 'genuflexiuni', nume: 'Genuflexiuni', seturi: sets, kcal: 50 },
      { exercitiuId: 'impins', nume: 'Împins la piept', seturi: sets, kcal: 50 },
    ]);
    expect(result.rank.key).toBe('ELITE');
    expect(result.rank.label).toBe('Elite GetFlow');
    expect(result.rank.label).not.toContain('NutriAI');
  });

  test('5. Meal and pantry notifications use GetFlow branding', () => {
    const breakfast = DEFAULT_MEAL_REMINDERS.find((r) => r.id === 'reminder_mic_dejun');
    expect(breakfast?.body).toContain('GetFlow');
    expect(breakfast?.body).not.toContain('NutriAI');

    const pantryNotifSource = fs.readFileSync(path.join(rootDir, 'lib/pantryNotifications.ts'), 'utf8');
    expect(pantryNotifSource).toContain('Cămara GetFlow');
    expect(pantryNotifSource).not.toContain('Cămara NutriAI');

    const useNotifSource = fs.readFileSync(path.join(rootDir, 'hooks/useNotifications.ts'), 'utf8');
    expect(useNotifSource).toContain("name: 'Remindere Mese GetFlow'");
    expect(useNotifSource).not.toContain("name: 'Remindere Mese NutriAI'");

    const bannerContextSource = fs.readFileSync(path.join(rootDir, 'context/NotificationBannerContext.tsx'), 'utf8');
    expect(bannerContextSource).toContain("'GetFlow Reminder'");
    expect(bannerContextSource).not.toContain("'NutriAI Reminder'");
  });

  test('6. Biometrics prompt uses GetFlow', () => {
    const biometricsSource = fs.readFileSync(path.join(rootDir, 'hooks/useBiometrics.ts'), 'utf8');
    expect(biometricsSource).toContain('Deblochează GetFlow cu ${biometricType}');
    expect(biometricsSource).not.toContain('Deblochează NutriAI');
  });

  test('7. App config ATT description uses GetFlow', () => {
    const appConfigSource = fs.readFileSync(path.join(rootDir, 'app.config.js'), 'utf8');
    expect(appConfigSource).toContain('cont gratuit GetFlow');
    expect(appConfigSource).not.toContain('cont gratuit NutriAI');
  });

  test('8. Critical UI screens and components have 0 user-visible legacy brand names', () => {
    const legacyBrandPattern = /\b(NutriAI|Nutri\s+AI|Nutrition\s*AI|GetFlo)\b/i;

    const criticalFiles = [
      'app/(tabs)/profil.tsx',
      'app/(tabs)/chat.tsx',
      'app/(tabs)/statistici.tsx',
      'app/paywall.tsx',
      'components/LockScreen.tsx',
      'components/ui/FeedbackModal.tsx',
      'components/gamification/StreakBottomSheet.tsx',
    ];

    for (const file of criticalFiles) {
      const content = fs.readFileSync(path.join(rootDir, file), 'utf8');
      // Strip comments and internal technical identifiers (like AsyncStorage keys)
      const sanitizedLines = content
        .split('\n')
        .filter((line) => {
          const trimmed = line.trim();
          if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) return false;
          if (trimmed.includes('nutriai_') || trimmed.includes('@nutriai:') || trimmed.includes('nutriai:')) return false;
          if (trimmed.includes('suport@nutriai.app') || trimmed.includes('admin@nutriai.app')) return false;
          return true;
        })
        .join('\n');

      expect(sanitizedLines).not.toMatch(legacyBrandPattern);
    }
  });

  test('9. All 4 i18n locales (RO, EN, FR, DE) consistently use GetFlow and have 0 legacy brand occurrences', () => {
    const locales = ['ro', 'en', 'fr', 'de'];

    for (const lang of locales) {
      const localePath = path.join(rootDir, `i18n/locales/${lang}.json`);
      const raw = fs.readFileSync(localePath, 'utf8');
      const parsed = JSON.parse(raw);

      // Verify no NutriAI or Nutri AI
      expect(raw).not.toMatch(/Nutri\s*AI/i);
      expect(raw).not.toMatch(/Nutrition\s*AI/i);
      // Verify no GetFlo without w
      expect(raw).not.toMatch(/\bGetFlo\b/);

      // Verify canonical brand keys
      expect(parsed.paywall?.badge).toBe('GETFLOW PREMIUM');
      expect(parsed.profile?.premiumTitle).toBe('GetFlow Premium');
      expect(parsed.profile?.premiumA11y).toContain('GetFlow Premium');
      expect(parsed.chat?.coachLabel).toBe('GetFlow Coach');
    }
  });

  test('10. Billing base plans and product configuration are preserved', () => {
    expect(CONFIGURED_BASE_PLANS).toEqual({
      premium_monthly: 'monthly-base',
      premium_annual: 'annual-base',
    });
  });

  test('11. P1-05 default language is preserved as English', () => {
    const i18nModule = require('../i18n');
    const i18n = i18nModule.default;
    expect(i18n.language).toBe('en');
    expect(i18nModule.LANGUAGE_STORAGE_KEY).toBe('getflow_language');
    expect(i18nModule.SUPPORTED_LANGUAGES).toEqual(['ro', 'en', 'fr', 'de']);
  });
});
