import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ro from './locales/ro.json';
import en from './locales/en.json';

i18n.use(initReactI18next).init({
  compatibilityJSON: 'v4',
  resources: {
    ro: { translation: ro },
    en: { translation: en }
  },
  lng: 'ro', // Default language
  fallbackLng: 'en',
  interpolation: { escapeValue: false }
});

export default i18n;
