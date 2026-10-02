import React from 'react';
import { render, act, fireEvent } from '@testing-library/react-native';
import { Keyboard, Platform, StyleSheet } from 'react-native';

import ChatScreen from '../app/(tabs)/chat';

const UTILIZATOR = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' };

let mockScreenWidth = 390;
let mockScreenHeight = 844;
let mockFontScale = 1;
let mockChatLocale = 'en';
let mockResolveChatTranslations = true;

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
}));

jest.mock('../lib/offlineQueue', () => ({
  pushOfflineMeal: jest.fn(async () => 1),
  pushOfflineMealVerificat: jest.fn(async () => ({ persistat: true, lungime: 1, duplicat: false })),
}));

jest.mock('../supabase', () => ({
  supabase: {
    from: () => ({
      insert: async () => ({ error: null }),
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
    }),
  },
}));

jest.mock('../lib/parseMealProposal', () => ({
  parseMealProposal: () => null,
  extractTextWithoutMealProposal: (t: string) => t,
}));

jest.mock('../context/AuthContext', () => ({
  useAuth: () => ({ session: { user: UTILIZATOR, access_token: 'valid-tok' }, user: UTILIZATOR }),
}));

jest.mock('../context/ThemeContext', () => ({
  useTheme: () => ({
    colors: {
      background: '#090C0E',
      surface: '#12161A',
      surfaceElevated: '#181D22',
      surfaceBg: '#12161A',
      accent: '#CCFF00',
      accentSecondary: '#00F0FF',
      accentTertiary: '#A855F7',
      accentGradient: ['#CCFF00', '#10B981'] as [string, string],
      accentSecondaryGradient: ['#00F0FF', '#0284C7'] as [string, string],
      cardBorder: 'rgba(255,255,255,0.08)',
      cardBg: '#12161A',
      border: 'rgba(255,255,255,0.08)',
      textPrimary: '#FFFFFF',
      textSecondary: '#94A3B8',
      textTertiary: '#64748B',
      textOnAccent: '#000000',
      textOnAccentSecondary: '#000000',
    },
    theme: 'dark',
  }),
}));

const mockAds = { recordChatUserMessage: jest.fn(), maybeShowInterstitial: jest.fn() };
jest.mock('../context/AdsContext', () => ({ useAds: () => mockAds }));

let mockTotalCalorii = 3188;
let mockCaloriiTinta = 3500;
let mockTotalProteine = 130;
let mockProteineTinta = 180;

jest.mock('../hooks/useMeseAzi', () => ({
  useMeseAzi: () => ({
    mese: [],
    totalCalorii: mockTotalCalorii,
    caloriiTinta: mockCaloriiTinta,
    totalProteine: mockTotalProteine,
    proteineTinta: mockProteineTinta,
    totalGrasimi: 65,
    totalCarbohidrati: 320,
    totalFibre: 28,
    refresh: jest.fn(),
    loading: false,
    numarMese: 3,
    meseGrupate: {},
    categoriiMeseList: [],
  }),
}));

jest.mock('../hooks/useCurrentDayKey', () => ({ useCurrentDayKey: () => '2026-09-25' }));
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

const mockResources: Record<string, any> = {
  ro: require('../i18n/locales/ro.json'),
  en: require('../i18n/locales/en.json'),
  fr: require('../i18n/locales/fr.json'),
  de: require('../i18n/locales/de.json'),
};

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, any>) => {
      if (!mockResolveChatTranslations) return key;
      const dict = mockResources[mockChatLocale];
      let val = key.split('.').reduce((acc: any, part: string) => acc?.[part], dict);
      if (typeof val === 'string' && options) {
        Object.entries(options).forEach(([k, v]) => {
          val = (val as string).replace(new RegExp(`{{${k}}}`, 'g'), String(v));
        });
      }
      return val ?? key;
    },
    i18n: { language: mockChatLocale },
  }),
}));

jest.mock('../i18n', () => ({ __esModule: true, default: { language: 'en', t: (k: string) => k } }));

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({}),
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

jest.mock('@/components/ui/KeyboardAwareScreen', () => {
  const { View } = require('react-native');
  const R = require('react');
  return {
    __esModule: true,
    default: ({ children }: any) => R.createElement(View, null, children),
    useContentBottomPadding: () => 0,
  };
});

jest.mock('../components/RecipeGeneratorModal', () => {
  const { View, Text } = require('react-native');
  const R = require('react');
  return {
    RecipeGeneratorModal: ({ visible }: { visible: boolean }) =>
      (visible ? R.createElement(View, null, R.createElement(Text, null, 'RECIPE_MODAL_ACTIVE')) : null),
  };
});

jest.mock('../components/ui/ConfirmSheet', () => ({
  ConfirmSheet: () => null,
}));

jest.mock('../components/ui/MealSaveSuccessModal', () => ({
  MealSaveSuccessModal: () => null,
}));

jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));

describe('GetFlow Coach Premium Minimal Redesign Suite', () => {
  beforeEach(() => {
    mockScreenWidth = 390;
    mockScreenHeight = 844;
    mockFontScale = 1;
    mockChatLocale = 'en';
    mockResolveChatTranslations = true;
    mockTotalCalorii = 3188;
    mockCaloriiTinta = 3500;
    mockTotalProteine = 130;
    mockProteineTinta = 180;
    mockAds.recordChatUserMessage.mockClear();
    mockAds.maybeShowInterstitial.mockClear();
  });

  describe('1. Header Presentation', () => {
    test('renders compact GetFlow Coach identity with online indicator and new chat action', async () => {
      const view = await render(<ChatScreen />);

      const header = view.getByTestId('coach-compact-header');
      expect(header).toBeTruthy();
      expect(StyleSheet.flatten(header.props.style)).toEqual(expect.objectContaining({ paddingBottom: 8 }));

      // Identity & Status
      expect(view.getByText('GetFlow Coach')).toBeTruthy();
      expect(view.getByText(mockResources.en.chat.onlineNow)).toBeTruthy();

      // New Chat button
      const newChatBtn = view.getByLabelText(mockResources.en.chat.newChatA11y);
      expect(newChatBtn).toBeTruthy();
      expect(view.getByText(mockResources.en.chat.newChat)).toBeTruthy();
    });

    test('renders compact horizontal nutrition context pills without large dashboard', async () => {
      const view = await render(<ChatScreen />);

      // Calories pill: "3188 / 3500 kcal"
      expect(view.getByText('3188 / 3500 kcal')).toBeTruthy();

      // Protein pill: "130 / 180 g proteine"
      expect(view.getByText('130 / 180 g proteine')).toBeTruthy();
    });
  });

  describe('2. Introductory Surface & Chat History Priority', () => {
    test('renders small elegant introductory surface on fresh chat without giant card', async () => {
      const view = await render(<ChatScreen />);

      // Intro title and subtitle are present
      expect(view.getByText(mockResources.en.chat.emptyTitle)).toBeTruthy();
      expect(view.getByText(mockResources.en.chat.emptySubtitle)).toBeTruthy();

      // History surface has flex: 1 taking most of the vertical viewport
      const history = view.getByTestId('coach-history-surface');
      expect(StyleSheet.flatten(history.props.style)).toEqual(expect.objectContaining({ flex: 1 }));
    });
  });

  describe('3. Quick Actions — Single Compact Horizontal Row', () => {
    test('renders compact horizontally scrollable chips for all 4 primary actions', async () => {
      const view = await render(<ChatScreen />);

      const quickActions = view.getByTestId('coach-quick-actions');
      expect(quickActions.props.horizontal).toBe(true);
      expect(quickActions.props.showsHorizontalScrollIndicator).toBe(false);

      // 1. Day analysis
      expect(view.getByText(mockResources.en.chat.quickAnalyzeTitle)).toBeTruthy();
      expect(view.getByLabelText(mockResources.en.chat.quickAnalyzeA11y)).toBeTruthy();

      // 2. High-protein meal
      expect(view.getByText(mockResources.en.chat.quickProteinTitle)).toBeTruthy();
      expect(view.getByLabelText(mockResources.en.chat.quickProteinA11y)).toBeTruthy();

      // 3. Recipe
      const recipeBtn = view.getByLabelText(mockResources.en.chat.quickRecipeA11y);
      expect(recipeBtn).toBeTruthy();
      expect(view.getByText(mockResources.en.chat.quickRecipeTitle)).toBeTruthy();
      expect(StyleSheet.flatten(recipeBtn.props.style)).toEqual(expect.objectContaining({ minHeight: 44 }));

      // 4. Plan my next meal
      expect(view.getByText(mockResources.en.chat.planNextMealTitle)).toBeTruthy();
      expect(view.getByLabelText(mockResources.en.chat.planNextMealA11y)).toBeTruthy();
    });

    test('tapping Recipe chip opens the recipe modal', async () => {
      const view = await render(<ChatScreen />);

      expect(view.queryByText('RECIPE_MODAL_ACTIVE')).toBeNull();
      const recipeChip = view.getByLabelText(mockResources.en.chat.quickRecipeA11y);
      await act(async () => {
        fireEvent.press(recipeChip);
      });

      expect(view.getByText('RECIPE_MODAL_ACTIVE')).toBeTruthy();
    });

    test('collapses quick actions when keyboard appears, leaving space to conversation & composer', async () => {
      const origPlatform = Platform.OS;
      Platform.OS = 'android';
      let showKeyboard: ((event: { endCoordinates: { height: number } }) => void) | undefined;
      const keyboardSpy = jest.spyOn(Keyboard, 'addListener').mockImplementation(((event: string, cb: any) => {
        if (event === 'keyboardDidShow') showKeyboard = cb;
        return { remove: jest.fn() } as any;
      }) as typeof Keyboard.addListener);

      try {
        const view = await render(<ChatScreen />);
        expect(view.getByTestId('coach-quick-actions')).toBeTruthy();

        // Keyboard opens
        await act(async () => {
          showKeyboard?.({ endCoordinates: { height: 300 } });
        });

        // Quick actions row disappears
        expect(view.queryByTestId('coach-quick-actions')).toBeNull();

        // Conversation history and composer remain visible and accessible
        expect(view.getByTestId('coach-history-surface')).toBeTruthy();
        expect(view.getByTestId('coach-composer')).toBeTruthy();
      } finally {
        Platform.OS = origPlatform;
        keyboardSpy.mockRestore();
      }
    });
  });

  describe('4. Persistent Composer & Keyboard Safety', () => {
    test('renders persistent composer above tab bar with 42x42 send button', async () => {
      const view = await render(<ChatScreen />);

      const composer = view.getByTestId('coach-composer');
      expect(composer).toBeTruthy();
      expect(StyleSheet.flatten(composer.props.style)).toEqual(expect.objectContaining({ paddingTop: 4 }));

      const sendBtn = view.getByTestId('send-button');
      expect(sendBtn).toBeTruthy();
      expect(StyleSheet.flatten(sendBtn.props.style)).toEqual(expect.objectContaining({ width: 42, height: 42 }));

      const input = view.getByTestId('chat-input');
      expect(input.props.placeholder).toBe(mockResources.en.chat.inputPlaceholder);
    });
  });

  describe('5. Responsive Viewport & Accessibility Matrix', () => {
    const VIEWPORT_MATRIX: [number, number, number][] = [
      [320, 568, 1.0], // iPhone SE 1st gen
      [320, 568, 1.2],
      [320, 568, 1.4],
      [360, 640, 1.0], // Android compact
      [360, 640, 1.2],
      [360, 640, 1.4],
      [360, 800, 1.0], // Android standard
      [360, 800, 1.2],
      [360, 800, 1.4],
      [390, 844, 1.0], // iPhone standard
      [390, 844, 1.2],
      [390, 844, 1.4],
      [412, 915, 1.0], // Android large
      [412, 915, 1.2],
      [412, 915, 1.4],
    ];

    test.each(VIEWPORT_MATRIX)(
      'renders cleanly without crash or layout break at %ix%i fontScale %s',
      async (width, height, fontScale) => {
        mockScreenWidth = width;
        mockScreenHeight = height;
        mockFontScale = fontScale;

        const view = await render(<ChatScreen />);

        expect(view.getByTestId('coach-compact-header')).toBeTruthy();
        expect(view.getByTestId('coach-history-surface')).toBeTruthy();
        expect(view.getByTestId('coach-quick-actions')).toBeTruthy();
        expect(view.getByTestId('coach-composer')).toBeTruthy();
        expect(view.getByTestId('send-button')).toBeTruthy();
      }
    );
  });

  describe('6. Multi-language Invariance (RO, EN, FR, DE)', () => {
    const LOCALES = ['ro', 'en', 'fr', 'de'] as const;

    test.each(LOCALES)('renders zero raw translation placeholders in %s', async (loc) => {
      mockChatLocale = loc;
      const view = await render(<ChatScreen />);

      // Verify localized coach label & placeholder
      expect(view.getByText(mockResources[loc].chat.coachLabel)).toBeTruthy();
      expect(view.getByPlaceholderText(mockResources[loc].chat.inputPlaceholder)).toBeTruthy();

      // Verify quick action titles in current locale
      expect(view.getByText(mockResources[loc].chat.quickAnalyzeTitle)).toBeTruthy();
      expect(view.getByText(mockResources[loc].chat.quickProteinTitle)).toBeTruthy();
      expect(view.getByText(mockResources[loc].chat.quickRecipeTitle)).toBeTruthy();
      expect(view.getByText(mockResources[loc].chat.planNextMealTitle)).toBeTruthy();

      // Zero raw interpolation or key leak
      expect(view.queryByText(/\{\{[a-zA-Z0-9_]+\}\}/)).toBeNull();
      expect(view.queryByText(/^(?:chat|jurnal|common|nutrition)\.[a-zA-Z0-9_.-]+/)).toBeNull();
    });
  });
});
