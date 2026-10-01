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

i18n.use(initReactI18next).init({
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

// Restaurare limbă salvată la pornire
AsyncStorage.getItem(LANGUAGE_STORAGE_KEY)
  .then((savedLang) => {
    if (savedLang && SUPPORTED_LANGUAGES.includes(savedLang as SupportedLanguage)) {
      i18n.changeLanguage(savedLang);
    }
  })
  .catch(() => {});

export async function changeLanguage(lang: SupportedLanguage): Promise<void> {
  await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
  await i18n.changeLanguage(lang);
}

export default i18n;
