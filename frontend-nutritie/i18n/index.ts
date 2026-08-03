import AsyncStorage from '@react-native-async-storage/async-storage';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ro from './locales/ro.json';
import en from './locales/en.json';

const LIMBI_SUPORTATE = ['ro', 'en'];

i18n.use(initReactI18next).init({
  compatibilityJSON: 'v4',
  resources: {
    ro: { translation: ro },
    en: { translation: en }
  },
  lng: 'ro', // Limba initiala; cea salvata se aplica imediat dupa, asincron.
  fallbackLng: 'en',
  interpolation: { escapeValue: false }
});

// AsyncStorage este asincron, deci nu putem sti limba salvata inainte de init.
// Pornim pe 'ro' si comutam imediat ce citirea se termina, altfel alegerea
// utilizatorului se pierdea la fiecare repornire a aplicatiei.
AsyncStorage.getItem('nutriai-limba')
  .then((salvata) => {
    if (salvata && LIMBI_SUPORTATE.includes(salvata) && salvata !== i18n.language) {
      return i18n.changeLanguage(salvata);
    }
  })
  .catch(() => {
    // Fara limba salvata ramanem pe cea implicita.
  });

export default i18n;
