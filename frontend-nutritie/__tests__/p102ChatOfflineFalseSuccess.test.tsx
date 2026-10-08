import React from 'react';
import { render, act, fireEvent, waitFor } from '@testing-library/react-native';
import { Keyboard, Platform, StyleSheet } from 'react-native';

import ChatScreen from '../app/(tabs)/chat';

/**
 * P1-02 — chat: „Salvat offline" nu are voie să apară dacă masa NU a ajuns
 * durabil pe disc.
 *
 * ==========================================================================
 * DEFECTUL (găsit în Faza A, încă prezent în arbore)
 * ==========================================================================
 * Ramura offline din chat apela `pushOfflineMeal(...)` și **ignora rezultatul**,
 * apoi afișa necondiționat modalul de confirmare cu `isOffline: true` și mesajul
 * „masa a fost salvată offline".
 *
 * Dacă scrierea pe disc eșuează (AsyncStorage plin/eroare), masa există DOAR în
 * memorie și dispare la închiderea aplicației — dar utilizatorul a fost anunțat
 * că e salvată. Celelalte ecrane (cameră, salvare manuală) folosesc deja
 * `pushOfflineMealVerificat` și verifică `persistat`; chat-ul a fost omis.
 *
 * Testul montează ECRANUL REAL și trece prin fluxul de producție:
 * mesaj → propunere AI → „Adaugă în jurnal" → eșec de rețea → ramura offline.
 */

const UTILIZATOR = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' };

let mockPersistatOffline = true;
const mockEnqueue: unknown[] = [];
let mockScreenWidth = 390;
let mockScreenHeight = 844;
let mockFontScale = 1;
let mockChatLocale = 'en';
let mockResolveChatTranslations = false;

jest.mock('../lib/offlineQueue', () => ({
  pushOfflineMeal: jest.fn(async (p: unknown) => { mockEnqueue.push(p); return 1; }),
  pushOfflineMealVerificat: jest.fn(async (p: unknown) => {
    mockEnqueue.push(p);
    return { persistat: mockPersistatOffline, lungime: mockEnqueue.length, duplicat: false };
  }),
}));

// Insertul online eșuează ca eroare de TRANSPORT → ramura offline.
jest.mock('../supabase', () => ({
  supabase: {
    from: () => ({
      insert: async () => { throw new Error('Network request failed'); },
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
    }),
  },
}));

// Propunerea AI este controlabilă: fluxul de jurnal are nevoie de una, iar
// testele de „răspuns malformat" au nevoie de absența ei.
let mockAreoPropunere = true;
jest.mock('../lib/parseMealProposal', () => ({
  parseMealProposal: () => (mockAreoPropunere ? {
    type: 'MEAL_PROPOSAL',
    nume: 'Iaurt grecesc',
    meal_type: 'gustare',
    items: [{ name: 'Iaurt grecesc', qty: 200, unit: 'g', protein_g: 15, carbs_g: 6, fat_g: 7, fiber_g: 0, kcal: 150 }],
  } : null),
  extractTextWithoutMealProposal: (t: string) => t,
  containsStructuredMealProtocol: () => false,
  formatMealProposalForChat: () => 'REȚETĂ FORMATATĂ',
}));

jest.mock('../context/AuthContext', () => ({
  useAuth: () => ({ session: { user: UTILIZATOR, access_token: 'tok' }, user: UTILIZATOR }),
}));
jest.mock('../context/ThemeContext', () => ({
  useTheme: () => ({ colors: new Proxy({}, { get: () => '#fff' }), theme: 'dark' }),
}));
// P1-02/G: reținem apelurile ca să putem verifica separat că un tur AI eșuat
// nu avansează cadența reclamelor.
const mockAds = { recordChatUserMessage: jest.fn(), maybeShowInterstitial: jest.fn() };
jest.mock('../context/AdsContext', () => ({ useAds: () => mockAds }));
jest.mock('../hooks/useMeseAzi', () => ({
  useMeseAzi: () => ({
    mese: [], totalCalorii: 0, totalProteine: 0, totalGrasimi: 0, totalCarbohidrati: 0,
    totalFibre: 0, caloriiTinta: 2000, proteineTinta: 150, refresh: jest.fn(),
    loading: false, numarMese: 0, meseGrupate: {}, categoriiMeseList: [],
  }),
}));
jest.mock('../hooks/useCurrentDayKey', () => ({ useCurrentDayKey: () => '2026-09-16' }));
jest.mock('../hooks/useFocusRefresh', () => ({ useFocusRefresh: jest.fn() }));
jest.mock('../hooks/useReducedMotion', () => ({ useReducedMotion: () => true }));
jest.mock('../hooks/useResponsiveLayout', () => ({
  useResponsiveLayout: () => ({
    isTablet: false,
    screenWidth: mockScreenWidth,
    screenHeight: mockScreenHeight,
    fontScale: mockFontScale,
    tabBarHeight: 68,
  }),
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      if (!mockResolveChatTranslations) return key;
      const resources: Record<string, Record<string, unknown>> = {
        ro: require('../i18n/locales/ro.json'), en: require('../i18n/locales/en.json'),
        fr: require('../i18n/locales/fr.json'), de: require('../i18n/locales/de.json'),
      };
      return key.split('.').reduce((value: any, part) => value?.[part], resources[mockChatLocale]) ?? 'Text unavailable';
    },
    i18n: { language: mockChatLocale },
  }),
}));
jest.mock('../i18n', () => ({ __esModule: true, default: { language: 'ro', t: (k: string) => k } }));
jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(), impactAsync: jest.fn(), selectionAsync: jest.fn(),
  NotificationFeedbackType: { Success: 's', Error: 'e' }, ImpactFeedbackStyle: { Light: 'l', Medium: 'm' },
}));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: ({ children }: any) => children }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn(), back: jest.fn() }),
  useFocusEffect: jest.fn(),
  useLocalSearchParams: () => ({}),
  useNavigation: () => ({ addListener: jest.fn(() => jest.fn()), setOptions: jest.fn() }),
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null), setItem: jest.fn(async () => {}), removeItem: jest.fn(async () => {}),
}));
jest.mock('../components/BouncingDot', () => ({ __esModule: true, default: () => null }));
jest.mock('../components/RecipeGeneratorModal', () => ({ __esModule: true, default: () => null, RecipeGeneratorModal: () => null }));
// Randăm `extra` (cardul + picker-ul de categorie) și un buton real de confirmare,
// ca fluxul de producție „alege categoria → Adaugă în jurnal" să fie executabil.
jest.mock('../components/ui/ConfirmSheet', () => {
  const { View, Text, TouchableOpacity } = require('react-native');
  const R = require('react');
  const Sheet = ({ visible, extra, confirmLabel, confirmDisabled, onConfirm }: any) => (visible
    ? R.createElement(View, null,
        extra,
        R.createElement(TouchableOpacity, {
          accessibilityRole: 'button',
          accessibilityLabel: 'CONFIRMA_PROPUNERE',
          disabled: !!confirmDisabled,
          onPress: () => { if (!confirmDisabled) onConfirm(); },
        }, R.createElement(Text, null, String(confirmLabel ?? ''))))
    : null);
  return { __esModule: true, default: Sheet, ConfirmSheet: Sheet };
});
jest.mock('@/components/ui/KeyboardAwareScreen', () => {
  const { View } = require('react-native');
  const R = require('react');
  return {
    __esModule: true,
    default: ({ children }: any) => R.createElement(View, null, children),
    useContentBottomPadding: () => 0,
  };
});
jest.mock('../components/ui/MealSaveSuccessModal', () => {
  const { Text } = require('react-native');
  const R = require('react');
  return {
    MealSaveSuccessModal: ({ visible, data }: { visible?: boolean; data?: { isOffline?: boolean } }) =>
      (visible ? R.createElement(Text, null, data?.isOffline ? 'CONFIRMARE_OFFLINE' : 'CONFIRMARE_SUCCES') : null),
  };
});
jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));

const raspunsChatOk = {
  ok: true,
  status: 200,
  json: async () => ({ raspuns: 'MEAL_PROPOSAL' }),
};

async function trimiteMesajSiSalveaza() {
  global.fetch = jest.fn(async () => raspunsChatOk) as never;
  const utile = await render(<ChatScreen />);

  const input = utile.getByLabelText('chat.inputA11y');
  await act(async () => { fireEvent.changeText(input, 'am mancat un iaurt'); });
  await act(async () => { fireEvent.press(utile.getByLabelText('chat.sendA11y')); });

  // Propunerea apare într-un ConfirmSheet; confirmarea cere o categorie aleasă.
  await act(async () => { fireEvent.press(utile.getByLabelText('chat.mealCategory.gustare')); });
  await act(async () => { fireEvent.press(utile.getByLabelText('CONFIRMA_PROPUNERE')); });
  return utile;
}

beforeEach(() => {
  mockEnqueue.length = 0;
  mockPersistatOffline = true;
  mockAreoPropunere = true;
  mockAds.recordChatUserMessage.mockClear();
  mockAds.maybeShowInterstitial.mockClear();
  mockScreenWidth = 390;
  mockScreenHeight = 844;
  mockFontScale = 1;
  mockChatLocale = 'en';
  mockResolveChatTranslations = false;
});

describe('P1-02 — chat: confirmarea offline trebuie să fie adevărată', () => {
  test('1. persistarea pe disc EȘUEAZĂ → NICIO confirmare de salvare', async () => {
    mockPersistatOffline = false;

    const { queryByText } = await trimiteMesajSiSalveaza();

    // Enqueue-ul chiar a fost încercat (altfel testul ar trece vacuu).
    expect(mockEnqueue.length).toBeGreaterThan(0);
    // Dar masa NU este pe disc, deci utilizatorul nu are voie să vadă confirmare.
    expect(queryByText('CONFIRMARE_OFFLINE')).toBeNull();
    expect(queryByText('CONFIRMARE_SUCCES')).toBeNull();
  });

  test('2. persistarea pe disc REUȘEȘTE → confirmare offline adevărată', async () => {
    mockPersistatOffline = true;

    const { queryByText } = await trimiteMesajSiSalveaza();

    expect(mockEnqueue.length).toBeGreaterThan(0);
    for (const payload of mockEnqueue as Record<string, unknown>[]) {
      expect(payload.ora).toEqual(expect.stringMatching(/^\d{2}:\d{2}:\d{2}$/));
      expect(payload.created_at).toEqual(expect.any(String));
    }
    expect(queryByText('CONFIRMARE_OFFLINE')).not.toBeNull();
  });
});

describe('GetFlow Coach compact responsive layout', () => {
  test.each(['ro', 'en', 'fr', 'de'])('mounts the production Coach copy without raw keys in %s', async (locale) => {
    mockChatLocale = locale;
    mockResolveChatTranslations = true;
    const resources: Record<string, any> = {
      ro: require('../i18n/locales/ro.json'), en: require('../i18n/locales/en.json'),
      fr: require('../i18n/locales/fr.json'), de: require('../i18n/locales/de.json'),
    };
    const view = await render(<ChatScreen />);
    expect(view.getByText(resources[locale].chat.coachLabel)).toBeTruthy();
    expect(view.getByPlaceholderText(resources[locale].chat.inputPlaceholder)).toBeTruthy();
    expect(view.queryByText(/(?:profile|PROFILE|nutrition|tabs|camera|common)\.[A-Za-z0-9_.-]+/)).toBeNull();
  });

  test.each([
    [360, 640, 1], [360, 640, 1.3],
    [360, 800, 1], [360, 800, 1.3],
    [390, 844, 1], [390, 844, 1.3],
    [412, 915, 1], [412, 915, 1.3],
  ])('keeps the compact production layout reachable at %ix%i / fontScale %s', async (width, height, fontScale) => {
    mockScreenWidth = width;
    mockScreenHeight = height;
    mockFontScale = fontScale;
    const view = await render(<ChatScreen />);

    expect(view.getByTestId('coach-compact-header')).toBeTruthy();
    expect(view.getByTestId('coach-history-surface')).toBeTruthy();
    expect(view.getByTestId('coach-quick-actions').props.horizontal).toBe(true);
    expect(view.getByTestId('coach-composer')).toBeTruthy();
    expect(view.getByTestId('send-button')).toBeTruthy();
  });

  test('real Coach screen gives most height to history and keeps a bounded compact header', async () => {
    const view = await render(<ChatScreen />);
    const header = view.getByTestId('coach-compact-header');
    const history = view.getByTestId('coach-history-surface');

    expect(StyleSheet.flatten(header.props.style)).toEqual(expect.objectContaining({ paddingBottom: 8 }));
    expect(StyleSheet.flatten(history.props.style)).toEqual(expect.objectContaining({ flex: 1 }));
    expect(view.getByLabelText('chat.newChatA11y')).toBeTruthy();
    expect(view.getByText('0 / 2000 kcal')).toBeTruthy();
    expect(view.getByText('0 / 150 g proteine')).toBeTruthy();
  });

  test('empty-state actions are horizontal compact chips and composer touch targets stay accessible', async () => {
    const view = await render(<ChatScreen />);
    const quickActions = view.getByTestId('coach-quick-actions');
    const recipe = view.getByLabelText('chat.quickRecipeA11y');
    const composer = view.getByTestId('coach-composer');
    const send = view.getByTestId('send-button');

    expect(quickActions.props.horizontal).toBe(true);
    expect(quickActions.props.showsHorizontalScrollIndicator).toBe(false);
    expect(StyleSheet.flatten(recipe.props.style)).toEqual(expect.objectContaining({ minHeight: 44 }));
    expect(StyleSheet.flatten(composer.props.style)).toEqual(expect.objectContaining({ paddingTop: 4 }));
    expect(StyleSheet.flatten(send.props.style)).toEqual(expect.objectContaining({ width: 42, height: 42 }));
  });

  test('Android keyboard opening hides quick actions while preserving history and composer', async () => {
    const originalPlatform = Platform.OS;
    Platform.OS = 'android';
    let showKeyboard: ((event: { endCoordinates: { height: number } }) => void) | undefined;
    const keyboardListenerSpy = jest.spyOn(Keyboard, 'addListener').mockImplementation(((eventName: string, callback: any) => {
      if (eventName === 'keyboardDidShow') showKeyboard = callback;
      return { remove: jest.fn() } as any;
    }) as typeof Keyboard.addListener);

    try {
      const view = await render(<ChatScreen />);
      expect(view.getByTestId('coach-quick-actions')).toBeTruthy();
      await act(async () => showKeyboard?.({ endCoordinates: { height: 280 } }));
      expect(view.queryByTestId('coach-quick-actions')).toBeNull();
      expect(view.getByTestId('coach-history-surface')).toBeTruthy();
      expect(view.getByTestId('coach-composer')).toBeTruthy();
    } finally {
      Platform.OS = originalPlatform;
      keyboardListenerSpy.mockRestore();
    }
  });
});

describe('P1-02 — turul AI: eșecurile nu devin răspunsuri complete', () => {
  /** Trimite un mesaj care NU e meal-intent, ca să meargă pe ruta /chat generală. */
  async function trimiteIntrebare(raspunsFetch: unknown) {
    global.fetch = jest.fn(async () => raspunsFetch) as never;
    const utile = await render(<ChatScreen />);
    await act(async () => {
      fireEvent.changeText(utile.getByLabelText('chat.inputA11y'), 'ce parere ai despre somon');
    });
    await act(async () => { fireEvent.press(utile.getByLabelText('chat.sendA11y')); });
    return utile;
  }

  test('3. răspuns 200 dar MALFORMAT (fără câmpul `raspuns`) → nu e tratat ca tur reușit', async () => {
    mockAreoPropunere = false; // corp fără text ȘI fără propunere interpretabilă
    await trimiteIntrebare({ ok: true, status: 200, json: async () => ({ ceva: 'aiurea' }) });

    // Un tur AI care nu a produs un răspuns utilizabil nu are voie să avanseze
    // evaluarea reclamei (cadența e legată de tururi finalizate).
    expect(mockAds.maybeShowInterstitial).not.toHaveBeenCalled();
  });

  test('4. eroare de server (500) → niciun tur complet, nicio reclamă', async () => {
    await trimiteIntrebare({ ok: false, status: 500, json: async () => ({ eroare: 'boom' }) });

    expect(mockAds.maybeShowInterstitial).not.toHaveBeenCalled();
  });

  test('5. eșec de rețea (fetch aruncă) → niciun tur complet, nicio reclamă', async () => {
    global.fetch = jest.fn(async () => { throw new Error('Network request failed'); }) as never;
    const utile = await render(<ChatScreen />);
    await act(async () => {
      fireEvent.changeText(utile.getByLabelText('chat.inputA11y'), 'ce parere ai despre somon');
    });
    await act(async () => { fireEvent.press(utile.getByLabelText('chat.sendA11y')); });

    expect(mockAds.maybeShowInterstitial).not.toHaveBeenCalled();
  });

  test('6. răspuns valid → turul se finalizează și reclama poate fi evaluată', async () => {
    mockAreoPropunere = false; // răspuns text simplu, fără propunere de masă
    await trimiteIntrebare({ ok: true, status: 200, json: async () => ({ raspuns: 'Somonul e bogat in omega-3.' }) });

    await waitFor(() => expect(mockAds.maybeShowInterstitial).toHaveBeenCalled());
  });
});
