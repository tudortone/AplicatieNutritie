let mockStore: Record<string, string> = {};

jest.mock('@react-native-async-storage/async-storage', () => ({
  __store: () => mockStore,
  getItem: jest.fn(async (k: string) => mockStore[k] ?? null),
  setItem: jest.fn(async (k: string, v: string) => { mockStore[k] = v; }),
  removeItem: jest.fn(async (k: string) => { delete mockStore[k]; }),
  clear: jest.fn(async () => { mockStore = {}; }),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import i18n, { changeLanguage } from '../i18n';
import ro from '../i18n/locales/ro.json';
import en from '../i18n/locales/en.json';
import fr from '../i18n/locales/fr.json';
import de from '../i18n/locales/de.json';

function flattenKeys(obj: Record<string, any>, prefix = ''): string[] {
  let keys: string[] = [];
  for (const k of Object.keys(obj)) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (obj[k] && typeof obj[k] === 'object' && !Array.isArray(obj[k])) {
      keys = keys.concat(flattenKeys(obj[k], fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys.sort();
}

describe('Centralized Internationalization (i18n) — RO, EN, FR, DE', () => {
  const roKeys = flattenKeys(ro);
  const enKeys = flattenKeys(en);
  const frKeys = flattenKeys(fr);
  const deKeys = flattenKeys(de);

  it('loads all 4 supported locales with substantial key coverage', () => {
    expect(roKeys.length).toBeGreaterThan(300);
    expect(enKeys.length).toBeGreaterThan(300);
    expect(frKeys.length).toBeGreaterThan(300);
    expect(deKeys.length).toBeGreaterThan(300);
  });

  it('guarantees 100% mutual key parity between RO, EN, FR, and DE without missing keys', () => {
    expect(enKeys).toEqual(roKeys);
    expect(frKeys).toEqual(roKeys);
    expect(deKeys).toEqual(roKeys);
  });

  it('ensures no empty translation strings exist across all 4 locales', () => {
    const checkNoEmpty = (obj: Record<string, any>, prefix = '', localeName: string) => {
      for (const k of Object.keys(obj)) {
        const fullKey = prefix ? `${prefix}.${k}` : k;
        if (obj[k] && typeof obj[k] === 'object' && !Array.isArray(obj[k])) {
          checkNoEmpty(obj[k], fullKey, localeName);
        } else {
          expect(typeof obj[k]).toBe('string');
          expect(obj[k].trim().length).toBeGreaterThan(0);
        }
      }
    };

    checkNoEmpty(ro, '', 'RO');
    checkNoEmpty(en, '', 'EN');
    checkNoEmpty(fr, '', 'FR');
    checkNoEmpty(de, '', 'DE');
  });

  it('supports runtime language switching and persists choice to AsyncStorage', async () => {
    await changeLanguage('fr');
    expect(i18n.language).toBe('fr');
    expect(await AsyncStorage.getItem('getflow_language')).toBe('fr');

    await changeLanguage('de');
    expect(i18n.language).toBe('de');
    expect(await AsyncStorage.getItem('getflow_language')).toBe('de');

    await changeLanguage('ro');
    expect(i18n.language).toBe('ro');
    expect(await AsyncStorage.getItem('getflow_language')).toBe('ro');
  });

  it('translates UI keys accurately according to active locale', async () => {
    await changeLanguage('en');
    expect(i18n.t('alerts.titluri.eroare')).toBe('Error');
    expect(i18n.t('profile.save')).toBe('SAVE PROFILE');

    await changeLanguage('ro');
    expect(i18n.t('alerts.titluri.eroare')).toBe('Eroare');
    expect(i18n.t('profile.save')).toBe('SALVEAZĂ PROFIL');

    await changeLanguage('fr');
    expect(i18n.t('alerts.titluri.eroare')).toBe('Erreur');
    expect(i18n.t('profile.save')).toBe('ENREGISTRER LE PROFIL');

    await changeLanguage('de');
    expect(i18n.t('alerts.titluri.eroare')).toBe('Fehler');
    expect(i18n.t('profile.save')).toBe('PROFIL SPEICHERN');
  });
});
