import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

let mockWidth = 320;
let mockHeight = 568;
let mockFontScale = 1.4;
let mockFlashListProps: Record<string, unknown> = {};
let mockI18nLocale = 'en';
let mockResolveTranslations = false;
let mockHomeWeight: number | null = 70;
let mockWaterGlasses = 0;
let mockWaterAdd = jest.fn();
let mockWaterRemove = jest.fn();
let mockModalCurrentWeight: number | null = null;
let mockAddMealOpen = jest.fn();

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: mockWidth, height: mockHeight, scale: 1, fontScale: mockFontScale }),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 24, right: 7, bottom: 14, left: 5 }),
}));
jest.mock('@shopify/flash-list', () => {
  const ReactMock = require('react');
  const { View } = require('react-native');
  return {
    FlashList: (props: Record<string, unknown>) => {
      mockFlashListProps = props;
      return ReactMock.createElement(View, { testID: 'journal-primary-list' }, props.ListHeaderComponent, props.ListEmptyComponent);
    },
  };
});
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      if (!mockResolveTranslations) return key;
      const resources: Record<string, Record<string, unknown>> = {
        ro: require('../i18n/locales/ro.json'),
        en: require('../i18n/locales/en.json'),
        fr: require('../i18n/locales/fr.json'),
        de: require('../i18n/locales/de.json'),
      };
      return key.split('.').reduce((value: any, part) => value?.[part], resources[mockI18nLocale]) ?? 'Text unavailable';
    },
    i18n: { language: mockI18nLocale },
  }),
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }), useFocusEffect: jest.fn() }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined), removeItem: jest.fn(async () => undefined) },
}));
jest.mock('expo-blur', () => ({ BlurView: ({ children }: any) => children }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: ({ children }: any) => children }));
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(), ImpactFeedbackStyle: { Light: 'Light', Medium: 'Medium' } }));
jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));
jest.mock('../hooks/useReducedMotion', () => ({ useReducedMotion: () => true }));
jest.mock('../context/ThemeContext', () => ({ useTheme: () => ({ colors: new Proxy({}, { get: () => '#111' }) }) }));
jest.mock('../hooks/useFocusRefresh', () => ({ useFocusRefresh: jest.fn() }));
jest.mock('../hooks/useCurrentDayKey', () => ({ useCurrentDayKey: () => '2026-09-21' }));
jest.mock('../hooks/useZileCuMese', () => ({ useZileCuMese: () => ({ zileCuMese: [], refreshZileCuMese: jest.fn() }) }));
jest.mock('../hooks/useMeseAzi', () => ({
  useMeseAzi: () => ({
    mese: [], categoriiMeseList: [], totalCalorii: 0, totalProteine: 0,
    totalGrasimi: 0, totalCarbohidrati: 0, caloriiTinta: 2000,
    proteineTinta: 150, carbiTinta: 200, grasimiTinta: 70, greutate: 70,
    greutateIntrodusaKg: mockHomeWeight,
    user: { email: 'tester@getflow.app' }, loading: false, eroareFetch: null,
    refresh: jest.fn(), optimisticDeleteMeal: jest.fn(), optimisticAddMeal: jest.fn(),
  }),
}));
jest.mock('../components/AddMealBottomSheet', () => {
  const ReactMock = jest.requireActual<typeof React>('react');
  return {
    AddMealBottomSheet: ReactMock.forwardRef((_props: unknown, ref: React.Ref<unknown>) => {
      ReactMock.useImperativeHandle(ref, () => ({ open: mockAddMealOpen, close: jest.fn() }));
      return null;
    }),
  };
});
jest.mock('../components/MonthCalendar', () => ({ MonthCalendar: () => null }));
jest.mock('../components/MealDetailsModal', () => ({ MealDetailsSheet: () => null }));
jest.mock('../components/jurnal/CategorieDetailSheet', () => ({ CategorieDetailSheet: () => null }));
jest.mock('../components/MasaCard', () => ({ MasaCard: () => null }));
jest.mock('../components/MacroRing', () => ({ MacroRing: () => null }));
jest.mock('../components/ui/EmptyState', () => ({ EmptyState: () => null }));
jest.mock('../components/ui/KeyboardAwareScreen', () => ({ __esModule: true, default: ({ children }: any) => children }));
jest.mock('../lib/mealUtils', () => ({ actualizeazaMasaCuPoza: jest.fn(), CATEGORIE_ICONA: {}, getMealCategoryLabel: () => 'Meal' }));
jest.mock('../supabase', () => ({ supabase: { from: jest.fn() } }));

jest.mock('../context/NotificationBannerContext', () => ({
  useNotificationBanner: () => ({ showBanner: jest.fn() }),
  useNotificationBannerData: () => ({ unreadCount: 0 }),
}));
jest.mock('../context/GamificareContext', () => ({ useGamificareData: () => ({ streak: 1 }) }));
jest.mock('../hooks/useApa', () => ({ useApa: () => ({ consumedMl: mockWaterGlasses * 250, pahare: mockWaterGlasses, tinta: 8, loading: false, adaugaPahar: mockWaterAdd, scadePahar: mockWaterRemove, setConsumedMl: jest.fn() }) }));
jest.mock('../hooks/useHealthSync', () => ({ useHealthSync: () => ({ steps: 0, activeCalories: 0, stepGoal: 10000, isEnabled: false, isAvailable: false, setNewStepGoal: jest.fn(), toggleSync: jest.fn(), refreshSteps: jest.fn(), addManualSteps: jest.fn(), setCompletedSteps: jest.fn() }) }));
jest.mock('../hooks/useAntrenamente', () => ({ useAntrenamente: () => ({ totalCaloriiArse: 0, antrenamente: [], refresh: jest.fn() }) }));
jest.mock('../hooks/useExercitii', () => ({ useExercitii: () => ({ exercitii: [] }) }));
jest.mock('../components/FlowCreditsPill', () => ({ FlowCreditsPill: () => null }));
jest.mock('../components/gamification/StreakBottomSheet', () => ({ StreakBottomSheet: () => null }));
jest.mock('../components/ui/PressableScale', () => ({ PressableScale: ({ children }: any) => children }));
jest.mock('../components/AddWeightModal', () => ({
  AddWeightModal: (props: { visible: boolean; greutateCurenta: number | null }) => {
    mockModalCurrentWeight = props.greutateCurenta;
    return props.visible
      ? require('react').createElement(require('react-native').View, { testID: 'weight-modal-visible' })
      : null;
  },
}));
jest.mock('../components/fitness/BodyMap', () => ({ BodyMap: () => null }));
jest.mock('react-native-svg', () => ({ __esModule: true, default: ({ children }: any) => children, Circle: () => null }));
jest.mock('../lib/calorieState', () => ({
  getCalorieState: () => ({ ringColor: '#0f0', iconName: 'check', mesaj: '' }),
}));

import HistoryScreen from '../app/(tabs)/istoric';
import HomeScreen from '../app/(tabs)/index';

describe('GetFlow responsive Home and Journal production surfaces', () => {
  beforeEach(() => {
    mockWidth = 320;
    mockHeight = 568;
    mockFontScale = 1.4;
    mockI18nLocale = 'en';
    mockResolveTranslations = false;
    mockFlashListProps = {};
    mockHomeWeight = 70;
    mockWaterGlasses = 0;
    mockWaterAdd = jest.fn();
    mockWaterRemove = jest.fn();
    mockModalCurrentWeight = null;
    mockAddMealOpen = jest.fn();
  });

  test.each([
    [320, 568], [360, 640], [360, 800], [375, 812], [390, 844], [412, 915],
  ])('Journal keeps a safe header with one visibility action and one central Add meal CTA at %ix%i', async (width, height) => {
    mockWidth = width;
    mockHeight = height;
    const view = await render(<HistoryScreen />);
    expect(view.queryByLabelText('jurnal.addMealHeaderA11y')).toBeNull();
    const hide = view.getByLabelText('jurnal.hidePhotos');
    expect(view.getAllByLabelText('jurnal.addMeal')).toHaveLength(1);
    const safeContent = view.getByTestId('journal-content-safe-area');
    const safeStyle = StyleSheet.flatten(safeContent.props.style);
    expect(safeStyle.paddingLeft).toBeGreaterThan(16);
    expect(safeStyle.paddingRight).toBeGreaterThan(16);
    expect(hide).toBeTruthy();
  });

  test('Journal primary list remains scrollable without a visible vertical indicator', async () => {
    await render(<HistoryScreen />);
    expect(mockFlashListProps.showsVerticalScrollIndicator).toBe(false);
    expect(mockFlashListProps.scrollEnabled).not.toBe(false);
  });

  test.each(['ro', 'en', 'fr', 'de'])('mounts actual Home and Journal surfaces with localized copy in %s', async (locale) => {
    mockI18nLocale = locale;
    mockResolveTranslations = true;
    const resources: Record<string, any> = {
      ro: require('../i18n/locales/ro.json'),
      en: require('../i18n/locales/en.json'),
      fr: require('../i18n/locales/fr.json'),
      de: require('../i18n/locales/de.json'),
    };

    const home = await render(<HomeScreen />);
    expect(home.getByText(resources[locale].nutrition.protein)).toBeTruthy();
    expect(home.getByText(resources[locale].home.carbsShort)).toBeTruthy();
    expect(home.getByText(resources[locale].nutrition.fats)).toBeTruthy();
    expect(home.getByText(resources[locale].home.waterTargetMl)).toBeTruthy();
    expect(home.getByText(resources[locale].home.waterTargetValue)).toBeTruthy();

    const journal = await render(<HistoryScreen />);
    expect(journal.getByText(resources[locale].jurnal.yourJournal)).toBeTruthy();
  });

  test.each([[320, 568], [360, 640]])('Home uses a compact action rail without truncated greeting copy at %ix%i', async (width, height) => {
    mockWidth = width;
    mockHeight = height;
    const view = await render(<HomeScreen />);

    expect(view.queryByText('home.greetingMorning')).toBeNull();
    expect(view.queryByText('home.greetingSubtitle')).toBeNull();
    expect(StyleSheet.flatten(view.getByTestId('home-header-actions').props.style)).toEqual(
      expect.objectContaining({ minWidth: 0, maxWidth: '100%', flexShrink: 1 }),
    );
    const carbs = view.getByText('home.carbsShort');
    expect(carbs.props.numberOfLines).toBe(1);
    expect(carbs.props.adjustsFontSizeToFit).toBe(true);
  });

  test('Home opens Add meal on the first press after its lazy mount', async () => {
    const view = await render(<HomeScreen />);
    await act(async () => {
      fireEvent.press(view.getByLabelText('home.addManualA11y'));
    });
    expect(mockAddMealOpen).toHaveBeenCalledTimes(1);
  });

  test.each([1, 1.2, 1.4])('Home calorie headline stays on one line at 320px and fontScale %s', async (fontScale) => {
    mockFontScale = fontScale;
    const view = await render(<HomeScreen />);
    const value = view.getByText('2000');
    expect(value.props.numberOfLines).toBe(1);
    expect(value.props.adjustsFontSizeToFit).toBe(true);
    expect(value.props.minimumFontScale).toBeGreaterThanOrEqual(0.72);
  });

  test('Home derives the water target from the actual 70 kg profile weight', async () => {
    mockHomeWeight = 70;
    mockWaterGlasses = 3;
    const view = await render(<HomeScreen />);
    expect(view.getByTestId('water-progress').props.accessibilityValue).toEqual({ min: 0, max: 2450, now: 750 });
    expect(view.queryByTestId('water-add-weight')).toBeNull();
    expect(view.getByTestId('water-consumed-ml').props.accessibilityLabel).toBe('home.waterConsumedMl');
  });

  test('Home leaves the target unset and opens the current-weight flow when weight is missing', async () => {
    mockHomeWeight = null;
    mockWaterGlasses = 2;
    const view = await render(<HomeScreen />);
    expect(view.queryByTestId('water-progress')).toBeNull();
    expect(view.queryByTestId('water-target-ml')).toBeNull();
    expect(view.getByTestId('water-consumed-ml')).toBeTruthy();
    await fireEvent.press(view.getByTestId('water-add-glass'));
    await fireEvent.press(view.getByTestId('water-remove-glass'));
    expect(mockWaterAdd).toHaveBeenCalledTimes(1);
    expect(mockWaterRemove).toHaveBeenCalledTimes(1);
    await fireEvent.press(view.getByTestId('water-add-weight'));
    expect(view.getByTestId('weight-modal-visible')).toBeTruthy();
    expect(mockModalCurrentWeight).toBeNull();
  });

  test.each(['ro', 'en', 'fr', 'de'])('water missing-weight CTA is localized in %s', async (locale) => {
    mockI18nLocale = locale;
    mockResolveTranslations = true;
    mockHomeWeight = null;
    const resources: Record<string, any> = {
      ro: require('../i18n/locales/ro.json'),
      en: require('../i18n/locales/en.json'),
      fr: require('../i18n/locales/fr.json'),
      de: require('../i18n/locales/de.json'),
    };
    const home = await render(<HomeScreen />);
    expect(home.getByText(resources[locale].home.waterMissingWeight)).toBeTruthy();
    expect(home.getByText(resources[locale].home.waterAddWeight)).toBeTruthy();
  });
});
