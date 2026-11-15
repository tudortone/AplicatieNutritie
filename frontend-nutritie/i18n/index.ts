import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ro from './locales/ro.json';
import en from './locales/en.json';
import fr from './locales/fr.json';
import de from './locales/de.json';

export const LANGUAGE_STORAGE_KEY = 'getflow_language';
export const SUPPORTED_LANGUAGES = ['ro', 'en', 'fr', 'de'] as const;
export type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number];

export const LANGUAGE_NAMES: Record<SupportedLanguage, { label: string; flag: string }> = {
  ro: { label: 'Română', flag: '🇷🇴' },
  en: { label: 'English', flag: '🇬🇧' },
  fr: { label: 'Français', flag: '🇫🇷' },
  de: { label: 'Deutsch', flag: '🇩🇪' },
};

const missingTranslationCopy: Record<SupportedLanguage, string> = {
  ro: ro.common.translationUnavailable,
  en: en.common.translationUnavailable,
  fr: fr.common.translationUnavailable,
  de: de.common.translationUnavailable,
};

if (initReactI18next) {
  i18n.use(initReactI18next);
}

i18n.init({
  compatibilityJSON: 'v4',
  resources: {
    ro: { translation: ro },
    en: { translation: en },
    fr: { translation: fr },
    de: { translation: de },
  },
  lng: 'en', // Limba inițială implicită: English pentru testare internațională
  fallbackLng: 'en',
  saveMissing: __DEV__,
  missingKeyHandler: (languages, namespace, key) => {
    if (__DEV__) {
      console.warn(`[i18n] Missing translation: ${languages.join(',')} ${namespace}.${key}`);
    }
  },
  parseMissingKeyHandler: (_key, _defaultValue, options) => {
    const requestedLanguage = String(options?.lng ?? i18n.resolvedLanguage ?? i18n.language ?? 'en')
      .split('-')[0] as SupportedLanguage;
    return missingTranslationCopy[requestedLanguage] ?? missingTranslationCopy.en;
  },
  interpolation: { escapeValue: false }
});

let explicitLanguageChanged = false;

const savedLanguageLookup =
  typeof AsyncStorage?.getItem === 'function'
    ? AsyncStorage.getItem(LANGUAGE_STORAGE_KEY)
    : Promise.resolve(null);

// Restaurare limbă salvată la pornire — expusă prin `i18nReady` pentru ca rutele și
// tutorialul interactiv să aștepte limba aleasă înainte de primul randament vizibil.
export const i18nReady: Promise<SupportedLanguage> = savedLanguageLookup
  .then(async (savedLang) => {
    if (
      !explicitLanguageChanged &&
      savedLang &&
      SUPPORTED_LANGUAGES.includes(savedLang as SupportedLanguage)
    ) {
      if (i18n.language !== savedLang) {
        await i18n.changeLanguage(savedLang);
      }
      return savedLang as SupportedLanguage;
    }
    const active = String(i18n.resolvedLanguage ?? i18n.language ?? 'en').split('-')[0];
    return SUPPORTED_LANGUAGES.includes(active as SupportedLanguage)
      ? (active as SupportedLanguage)
      : 'en';
  })
  .catch(() => 'en');

export async function changeLanguage(lang: SupportedLanguage): Promise<void> {
  explicitLanguageChanged = true;
  await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
  await i18n.changeLanguage(lang);
}

export default i18n;
