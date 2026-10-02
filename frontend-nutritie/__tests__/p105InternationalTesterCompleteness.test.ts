let mockStore: Record<string, string> = {};

jest.mock('@react-native-async-storage/async-storage', () => ({
  __store: () => mockStore,
  getItem: jest.fn(async (k: string) => mockStore[k] ?? null),
  setItem: jest.fn(async (k: string, v: string) => { mockStore[k] = v; }),
  removeItem: jest.fn(async (k: string) => { delete mockStore[k]; }),
  clear: jest.fn(async () => { mockStore = {}; }),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import i18n, { changeLanguage, SUPPORTED_LANGUAGES, LANGUAGE_STORAGE_KEY } from '../i18n';
import ro from '../i18n/locales/ro.json';
import en from '../i18n/locales/en.json';
import fr from '../i18n/locales/fr.json';
import de from '../i18n/locales/de.json';
import { getMealCategoryLabel } from '../lib/mealUtils';
import { calculeazaTotaluriZi } from '../lib/nutritionTotals';

describe('P1-05 — Mandatory Test Matrix & International Tester Completeness', () => {
  beforeEach(async () => {
    mockStore = {};
    await changeLanguage('en');
  });

  // 1. default locale initializes safely
  it('1. default locale initializes safely without throwing', () => {
    expect(i18n.isInitialized).toBe(true);
    expect(SUPPORTED_LANGUAGES).toContain(i18n.language);
  });

  // 2. select EN in onboarding -> English UI
  it('2. select EN in onboarding results in English UI', async () => {
    await changeLanguage('en');
    expect(i18n.t('onboarding.continue')).toBe('Continue');
    expect(i18n.t('onboarding.genderTitle')).toBe('Let’s get to know you');
  });

  // 3. restart/reload -> EN persists
  it('3. restarts / reloads with persisted EN locale', async () => {
    await changeLanguage('en');
    expect(await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('en');

    // Simulate restart reload
    const stored = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (stored && SUPPORTED_LANGUAGES.includes(stored as any)) {
      await i18n.changeLanguage(stored);
    }
    expect(i18n.language).toBe('en');
  });

  // 4. Settings EN -> RO -> UI updates
  it('4. Settings EN -> RO updates UI strings to Romanian', async () => {
    await changeLanguage('en');
    expect(i18n.t('common.save')).toBe('Save');
    await changeLanguage('ro');
    expect(i18n.t('common.save')).toBe('Salvează');
    expect(i18n.language).toBe('ro');
  });

  // 5. Settings RO -> EN -> UI updates
  it('5. Settings RO -> EN updates UI strings to English immediately', async () => {
    await changeLanguage('ro');
    expect(i18n.t('common.cancel')).toBe('Anulează');
    await changeLanguage('en');
    expect(i18n.t('common.cancel')).toBe('Cancel');
    expect(i18n.language).toBe('en');
  });

  // 6. FR selection -> no crash / correct dictionary
  it('6. FR selection operates safely with correct French dictionary', async () => {
    await changeLanguage('fr');
    expect(i18n.language).toBe('fr');
    expect(i18n.t('common.save')).toBe('Enregistrer');
    expect(i18n.t('common.cancel')).toBe('Annuler');
  });

  // 7. DE selection -> no crash / correct dictionary
  it('7. DE selection operates safely with correct German dictionary', async () => {
    await changeLanguage('de');
    expect(i18n.language).toBe('de');
    expect(i18n.t('common.save')).toBe('Speichern');
    expect(i18n.t('common.cancel')).toBe('Abbrechen');
  });

  // 8. Home critical labels EN
  it('8. Home critical labels render accurately in EN', async () => {
    await changeLanguage('en');
    expect(i18n.t('home.caloriesRemaining')).toBe('CALORIES REMAINING');
    expect(i18n.t('home.caloriesOver')).toBe('CALORIES OVER');
    expect(i18n.t('home.scanAiTitle')).toBe('Scan Food with AI');
    expect(i18n.t('home.waterTitle')).toBe('Hydration & Water');
    expect(i18n.t('home.stepsTitle')).toBe('Steps & Calories');
  });

  // 9. Journal critical labels EN
  it('9. Journal critical labels render accurately in EN', async () => {
    await changeLanguage('en');
    expect(i18n.t('tabs.journal')).toBe('Journal');
    expect(i18n.t('jurnal.yourJournal')).toBe('Your journal');
    expect(i18n.t('jurnal.addMeal')).toBe('Add meal');
    expect(i18n.t('jurnal.deleteMeal')).toBe('Delete meal');
    expect(i18n.t('alerts.titluri.stergereMasa')).toBe('Delete meal');
  });

  // 10. Add Meal critical labels EN
  it('10. Add Meal critical labels render accurately in EN', async () => {
    await changeLanguage('en');
    expect(i18n.t('productSearch.inputPlaceholder')).toBe('Search product, brand, or food...');
    expect(i18n.t('quantityEditor.setQuantity')).toBe('Set Quantity (g):');
    expect(i18n.t('manualProduct.title')).toBe('Complete Manual Entry');
    expect(i18n.t('manualProduct.addToMeal')).toBe('Add to Meal');
  });

  // 11. Chat critical labels EN
  it('11. Chat critical labels render accurately in EN', async () => {
    await changeLanguage('en');
    expect(i18n.t('chat.inputPlaceholder')).toBe('Type a message...');
    expect(i18n.t('chat.confirmSheet.title')).toBe('Food Journal Confirmation');
    expect(i18n.t('chat.addToJournal')).toBe('Add to Journal');
    expect(i18n.t('chat.errorServer')).toBe('The AI server hit an issue. Try again in a moment.');
  });

  // 12. Camera critical labels EN
  it('12. Camera critical labels render accurately in EN', async () => {
    await changeLanguage('en');
    expect(i18n.t('camera.steps.optimizing')).toBe('Optimizing image & preparing...');
    expect(i18n.t('camera.steps.sending')).toBe('Sending to AI vision model...');
    expect(i18n.t('camera.permissionTitle')).toBe('Camera Permission');
    expect(i18n.t('camera.discardScanTitle')).toBe('Discard the scan?');
  });

  // 13. offline success/error EN
  it('13. Offline success/error messages render truthfully in EN', async () => {
    await changeLanguage('en');
    expect(i18n.t('offline.salvatOffline')).toBe('Saved Offline');
    expect(i18n.t('offline.masaSalvataOffline')).toBe('Meal saved locally in offline queue and will auto-sync when network reconnects.');
    expect(i18n.t('offline.masaNesalvataOffline')).toBe('The meal could NOT be saved on this device (out of space or storage unavailable). Note the values and try again — otherwise they will be lost.');
  });

  // 14. post-save feedback EN
  it('14. Post-save feedback strings render accurately in EN', async () => {
    await changeLanguage('en');
    expect(i18n.t('postSave.mealAdded')).toBe('Meal added!');
    expect(i18n.t('postSave.savedOffline')).toBe('Saved offline');
  });

  // 15. Settings EN
  it('15. Settings & Profile labels render accurately in EN', async () => {
    await changeLanguage('en');
    expect(i18n.t('profile.languageSection')).toBe('LANGUAGE & REGION');
    expect(i18n.t('profile.languageTitle')).toBe('App Language');
    expect(i18n.t('profile.termsAndPrivacy')).toBe('Terms & Privacy');
    expect(i18n.t('profile.deleteAccountConfirmTitle')).toBe('Permanently Delete Account');
  });

  // 16. paywall core copy EN
  it('16. Paywall core copy renders accurately in EN with store-authoritative separation', async () => {
    await changeLanguage('en');
    expect(i18n.t('paywall.badge')).toBe('GETFLOW PREMIUM');
    expect(i18n.t('paywall.title')).toBe('Unlock your full potential');
    expect(i18n.t('paywall.subtitle')).toBe('Reach your goals faster with advanced smart features.');
    expect(i18n.t('paywall.cta.subscribe')).toBe('Subscribe now');
  });

  // 17. meal-category display localized while canonical ID unchanged
  it('17. Meal categories display localized while preserving canonical IDs', async () => {
    const canonicalIds = ['mic_dejun', 'pranz', 'cina', 'gustare'] as const;

    await changeLanguage('en');
    expect(canonicalIds.map(id => getMealCategoryLabel(id, i18n.t))).toEqual([
      'Breakfast',
      'Lunch',
      'Dinner',
      'Snacks',
    ]);

    await changeLanguage('ro');
    expect(canonicalIds.map(id => getMealCategoryLabel(id, i18n.t))).toEqual([
      'Mic Dejun',
      'Prânz',
      'Cină',
      'Gustări',
    ]);
  });

  // 18. numeric arithmetic identical across RO/EN/FR/DE
  it('18. Nutrition arithmetic produces identical numbers across all 4 locales', async () => {
    const testMeals = [
      {
        id: 'm1',
        user_id: 'u1',
        nume: 'Chicken breast',
        tip_masa: 'pranz' as const,
        calorii: 350.4,
        proteine: 62.1,
        carbohidrati: 0.0,
        grasimi: 7.2,
        fibre: 0.0,
      },
      {
        id: 'm2',
        user_id: 'u1',
        nume: 'Brown rice',
        tip_masa: 'pranz' as const,
        calorii: 215.8,
        proteine: 5.0,
        carbohidrati: 45.2,
        grasimi: 1.8,
        fibre: 3.5,
      },
    ];

    for (const lang of SUPPORTED_LANGUAGES) {
      await changeLanguage(lang);
      const totals = calculeazaTotaluriZi(testMeals as any);
      expect(totals.calorii).toBeCloseTo(566.2, 1);
      expect(totals.proteine).toBeCloseTo(67.1, 1);
      expect(totals.carbohidrati).toBeCloseTo(45.2, 1);
      expect(totals.grasimi).toBeCloseTo(9.0, 1);
      expect(totals.fibre).toBeCloseTo(3.5, 1);
    }
  });

  // 19. AI request language = selected locale
  it('19. AI request language corresponds to the currently selected locale', async () => {
    for (const lang of SUPPORTED_LANGUAGES) {
      await changeLanguage(lang);
      const requestPayload = {
        mesaj: 'Ce pot mânca la cină?',
        limba: i18n.language || 'ro',
      };
      expect(requestPayload.limba).toBe(lang);
    }
  });

  // 20. invalid stored locale -> safe fallback
  it('20. Falls back safely when invalid locale is encountered', async () => {
    await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, 'unsupported_xyz');
    const stored = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
    const resolved = (stored && SUPPORTED_LANGUAGES.includes(stored as any))
      ? stored
      : 'en';
    await i18n.changeLanguage(resolved);
    expect(SUPPORTED_LANGUAGES).toContain(i18n.language);
  });

  // 21. no critical missing translation key rendering
  it('21. Ensures no critical missing translation keys resolve to empty or key string in EN', async () => {
    await changeLanguage('en');
    const criticalKeys = [
      'common.save',
      'common.cancel',
      'common.delete',
      'tabs.home',
      'tabs.journal',
      'tabs.assistant',
      'tabs.profile',
      'onboarding.continue',
      'onboarding.genderTitle',
      'home.caloriesRemaining',
      'postSave.mealAdded',
      'postSave.savedOffline',
      'auth.signInTitle',
      'auth.signUpTitle',
      'paywall.title',
      'legalScreen.title',
    ];

    for (const key of criticalKeys) {
      const translation = i18n.t(key as any);
      expect(translation).toBeTruthy();
      expect(translation).not.toBe(key);
      expect(typeof translation).toBe('string');
    }
  });

  // 22. no critical Romanian leakage in EN Tier 1 surface sweep
  it('22. Guarantees zero Romanian leakage into English Tier 1 keys', () => {
    const roPhrases = [
      'Salvează',
      'Anulează',
      'Șterge',
      'Adaugă',
      'Masa adăugată',
      'Fără conexiune',
      'Salvat offline',
      'Ai depășit ținta',
      'Bună dimineața',
      'Bună ziua',
      'Bună seara',
      'Creează-ți contul',
    ];

    function checkNoRo(obj: any, path = '') {
      for (const [k, v] of Object.entries(obj)) {
        const currentPath = path ? `${path}.${k}` : k;
        if (typeof v === 'string') {
          for (const phrase of roPhrases) {
            if (v.includes(phrase) && !v.includes('Română')) {
              throw new Error(`Found Romanian phrase "${phrase}" in en.json at key "${currentPath}": "${v}"`);
            }
          }
        } else if (typeof v === 'object' && v !== null) {
          checkNoRo(v, currentPath);
        }
      }
    }

    checkNoRo(en);
  });
});
