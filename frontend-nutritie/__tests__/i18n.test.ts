import ro from '../i18n/locales/ro.json';
import en from '../i18n/locales/en.json';

function getAllKeys(obj: any, prefix = ''): string[] {
  let keys: string[] = [];
  for (const k in obj) {
    if (typeof obj[k] === 'object' && obj[k] !== null) {
      keys = keys.concat(getAllKeys(obj[k], prefix ? `${prefix}.${k}` : k));
    } else {
      keys.push(prefix ? `${prefix}.${k}` : k);
    }
  }
  return keys;
}

describe('U-08 — Integritatea fișierelor de traducere i18n', () => {
  test('1. Fișierele ro.json și en.json conțin exact aceleași chei de traducere', () => {
    const keysRo = getAllKeys(ro).sort();
    const keysEn = getAllKeys(en).sort();

    expect(keysRo).toEqual(keysEn);
  });

  test('2. Cheile noi adăugate (offline, notifications, camera.steps) sunt prezente în ambele limbi', () => {
    expect(ro.offline.salvatOffline).toBeDefined();
    expect(en.offline.salvatOffline).toBeDefined();

    expect(ro.notifications.breakfastTitle).toBeDefined();
    expect(en.notifications.breakfastTitle).toBeDefined();

    expect(ro.camera.steps.optimizing).toBeDefined();
    expect(en.camera.steps.optimizing).toBeDefined();
  });
});
