import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { View } from 'react-native';
import { MasaCard } from '../components/MasaCard';
import type { Masa } from '../types';

let mockMese: Masa[] = [];
let mockCategoriiMeseList: any[] = [];
let mockOpenAddMeal = jest.fn();
let mockFlashListProps: any = {};

const sampleMealDinner1: Masa = {
  id: 'dinner-1',
  user_id: 'user-123',
  nume: 'Piept de pui cu orez',
  calorii: 500,
  proteine: 45,
  carbohidrati: 50,
  grasimi: 10,
  tip_masa: 'cina',
  created_at: '2026-10-18T19:00:00.000Z',
  ora: '19:00',
  data: '2026-10-18',
};

const sampleMealDinner2: Masa = {
  id: 'dinner-2',
  user_id: 'user-123',
  nume: 'Salată verde cu ulei de măsline',
  calorii: 220,
  proteine: 3,
  carbohidrati: 10,
  grasimi: 18,
  tip_masa: 'cina',
  created_at: '2026-10-18T19:30:00.000Z',
  ora: '19:30',
  data: '2026-10-18',
};

const sampleMealBreakfast: Masa = {
  id: 'breakfast-1',
  user_id: 'user-123',
  nume: 'Omletă cu legume',
  calorii: 350,
  proteine: 24,
  carbohidrati: 8,
  grasimi: 22,
  tip_masa: 'mic_dejun',
  created_at: '2026-10-18T08:30:00.000Z',
  ora: '08:30',
  data: '2026-10-18',
};

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 412, height: 915, scale: 1, fontScale: 1.0 }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 24, right: 0, bottom: 20, left: 0 }),
}));



jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  const chain = {
    springify: () => chain,
    duration: () => chain,
    damping: () => chain,
  };
  return {
    __esModule: true,
    default: {
      View,
      createAnimatedComponent: (c: any) => c,
    },
    Layout: chain,
    FadeIn: chain,
    FadeInDown: chain,
    FadeOut: chain,
    SlideInDown: chain,
    SlideOutDown: chain,
    useSharedValue: (init: any) => ({ value: init }),
    useAnimatedStyle: () => ({}),
  };
});

jest.mock('@shopify/flash-list', () => {
  const ReactMock = require('react');
  const { View: RNView } = require('react-native');
  return {
    FlashList: (props: any) => {
      mockFlashListProps = props;
      return ReactMock.createElement(
        RNView,
        { testID: 'journal-flash-list' },
        props.ListHeaderComponent,
        props.data?.map((item: any, idx: number) =>
          ReactMock.createElement(
            RNView,
            { key: props.keyExtractor ? props.keyExtractor(item, idx) : idx },
            props.renderItem({ item, index: idx }),
          ),
        ),
        props.ListFooterComponent,
      );
    },
  };
});

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opt?: any) => {
      const ro: Record<string, string> = {
        'jurnal.yourJournal': 'Jurnalul tău',
        'jurnal.hidePhotos': 'Ascunde fotografiile',
        'jurnal.showPhotos': 'Afișează fotografiile',
        'jurnal.addMeal': 'Adaugă masă',
        'jurnal.addMealHeaderA11y': 'Adaugă masă',
        'jurnal.addMealMore': '+ Adaugă aliment',
        'jurnal.addCategory': '+ Adaugă {{categorie}}',
        'jurnal.addAnotherTo': 'Adaugă alt aliment la {{categorie}}',
        'jurnal.noMealsAdded': 'Niciun aliment înregistrat la această masă',
        'jurnal.emptyCategory': 'Niciun aliment înregistrat',
        'jurnal.emptyCategoryAdd': '+ Adaugă',
        'jurnal.mealLogged': '1 aliment',
        'jurnal.mealsLogged': '{{count}} alimente',
        'jurnal.foodCount_one': '{{count}} aliment',
        'jurnal.foodCount_few': '{{count}} alimente',
        'jurnal.foodCount_other': '{{count}} alimente',
        'jurnal.editMeal': 'Editează masa',
        'jurnal.deleteMeal': 'Șterge masa',
        'jurnal.today': 'Astăzi',
        'jurnal.yesterday': 'Ieri',
        'categories.mic_dejun': 'Mic dejun',
        'categories.pranz': 'Prânz',
        'categories.cina': 'Cină',
        'categories.gustare': 'Gustări',
        'categories.altele': 'Altele',
        'common.expanded': 'Extins',
        'common.collapsed': 'Restrâns',
      };
      if (opt?.count !== undefined && key === 'jurnal.mealsLogged') {
        return `${opt.count} alimente`;
      }
      if (opt?.categorie && key === 'jurnal.addCategory') {
        return `+ Adaugă ${opt.categorie}`;
      }
      return ro[key] || key;
    },
    i18n: { language: 'ro' },
  }),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useFocusEffect: jest.fn(),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => undefined),
    removeItem: jest.fn(async () => undefined),
  },
}));

jest.mock('expo-blur', () => ({ BlurView: ({ children }: any) => children }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: ({ children }: any) => children }));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  selectionAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'Light', Medium: 'Medium' },
}));

jest.mock('../hooks/useReducedMotion', () => ({ useReducedMotion: () => true }));
jest.mock('../context/ThemeContext', () => ({
  useTheme: () => ({
    colors: {
      accent: '#c8ff00',
      accentSecondary: '#00e5ff',
      accentTertiary: '#a855f7',
      cardBg: '#111827',
      cardBorder: '#263244',
      textPrimary: '#ffffff',
      textSecondary: '#94a3b8',
      textTertiary: '#64748b',
      textOnAccent: '#000000',
      surface: '#181D22',
      surfaceBg: '#1e293b',
      surfaceElevated: '#232A31',
      danger: '#ef4444',
      warning: '#f59e0b',
      success: '#10b981',
      background: '#090C0E',
      overlayStrong: 'rgba(255,255,255,0.2)',
    },
  }),
}));

jest.mock('../hooks/useFocusRefresh', () => ({ useFocusRefresh: jest.fn() }));
jest.mock('../hooks/useCurrentDayKey', () => ({ useCurrentDayKey: () => '2026-10-18' }));
jest.mock('../hooks/useZileCuMese', () => ({
  useZileCuMese: () => ({ zileCuMese: ['2026-10-18'], refreshZileCuMese: jest.fn() }),
}));

jest.mock('../hooks/useMeseAzi', () => ({
  useMeseAzi: () => ({
    mese: mockMese,
    categoriiMeseList: mockCategoriiMeseList,
    totalCalorii: mockMese.reduce((acc, m) => acc + (m.calorii || 0), 0),
    totalProteine: mockMese.reduce((acc, m) => acc + (m.proteine || 0), 0),
    totalGrasimi: mockMese.reduce((acc, m) => acc + (m.grasimi || 0), 0),
    totalCarbohidrati: mockMese.reduce((acc, m) => acc + (m.carbohidrati || 0), 0),
    caloriiTinta: 2000,
    proteineTinta: 150,
    carbiTinta: 200,
    grasimiTinta: 70,
    greutate: 75,
    greutateIntrodusaKg: 75,
    user: { email: 'owner@getflow.app' },
    loading: false,
    eroareFetch: null,
    refresh: jest.fn(),
    optimisticDeleteMeal: jest.fn(),
    optimisticAddMeal: jest.fn(),
  }),
}));

jest.mock('../components/AddMealBottomSheet', () => {
  const ReactMock = jest.requireActual<typeof React>('react');
  return {
    AddMealBottomSheet: ReactMock.forwardRef((_props: any, ref: any) => {
      ReactMock.useImperativeHandle(ref, () => ({
        open: mockOpenAddMeal,
        close: jest.fn(),
      }));
      return null;
    }),
  };
});

jest.mock('../components/MonthCalendar', () => ({ MonthCalendar: () => null }));
jest.mock('../components/MealDetailsModal', () => ({ MealDetailsSheet: () => null }));
jest.mock('../components/jurnal/CategorieDetailSheet', () => ({ CategorieDetailSheet: () => null }));
jest.mock('../components/MacroRing', () => ({ MacroRing: () => null }));
jest.mock('../components/ui/EmptyState', () => ({ EmptyState: () => null }));
jest.mock('../components/ui/KeyboardAwareScreen', () => ({
  __esModule: true,
  default: ({ children }: any) => children,
}));
jest.mock('../components/jurnal/NutrientFocusCard', () => ({
  NutrientFocusCard: () => null,
}));
jest.mock('../components/ui/ConfirmSheet', () => ({
  ConfirmSheet: () => null,
}));
jest.mock('../context/NotificationBannerContext', () => ({
  useNotificationBanner: () => ({ showBanner: jest.fn() }),
  useNotificationBannerData: () => ({ unreadCount: 0 }),
}));
jest.mock('../supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      delete: jest.fn(() => ({
        eq: jest.fn(() => ({
          eq: jest.fn(() => Promise.resolve({ error: null })),
        })),
      })),
    })),
  },
}));

import HistoryScreen from '../app/(tabs)/istoric';

describe('Journal Collapsible Accordion & Reliable Touch Interaction', () => {
  beforeEach(() => {
    mockOpenAddMeal = jest.fn();
    mockFlashListProps = {};
    mockMese = [sampleMealBreakfast, sampleMealDinner1, sampleMealDinner2];
    mockCategoriiMeseList = [
      {
        id: 'mic_dejun',
        label: 'Mic dejun',
        icon: 'coffee',
        mese: [sampleMealBreakfast],
        totalCalorii: 350,
        totalProteine: 24,
        totalCarbohidrati: 8,
        totalGrasimi: 22,
        totalFibre: 2,
      },
      {
        id: 'pranz',
        label: 'Prânz',
        icon: 'sun',
        mese: [],
        totalCalorii: 0,
        totalProteine: 0,
        totalCarbohidrati: 0,
        totalGrasimi: 0,
        totalFibre: 0,
      },
      {
        id: 'cina',
        label: 'Cină',
        icon: 'moon',
        mese: [sampleMealDinner1, sampleMealDinner2],
        totalCalorii: 720,
        totalProteine: 48,
        totalCarbohidrati: 60,
        totalGrasimi: 28,
        totalFibre: 5,
      },
      {
        id: 'gustare',
        label: 'Gustări',
        icon: 'apple',
        mese: [],
        totalCalorii: 0,
        totalProteine: 0,
        totalCarbohidrati: 0,
        totalGrasimi: 0,
        totalFibre: 0,
      },
    ];
  });

  describe('MasaCard touch separation (Eliminates nested touch responder conflicts)', () => {
    test('tapping title or stats fires onPress without triggering onEdit or onDelete', async () => {
      const onPress = jest.fn();
      const onEdit = jest.fn();
      const onDelete = jest.fn();

      const screen = await render(
        <MasaCard
          masa={sampleMealDinner1}
          onPress={onPress}
          onEdit={onEdit}
          onDelete={onDelete}
        />,
      );

      // Tap title row
      const titlePressable = screen.getByTestId('meal-title-pressable-dinner-1');
      await act(async () => {
        fireEvent.press(titlePressable);
      });
      expect(onPress).toHaveBeenCalledTimes(1);
      expect(onPress).toHaveBeenCalledWith(sampleMealDinner1);
      expect(onEdit).not.toHaveBeenCalled();
      expect(onDelete).not.toHaveBeenCalled();

      // Tap stats row
      const statsPressable = screen.getByTestId('meal-stats-pressable-dinner-1');
      await act(async () => {
        fireEvent.press(statsPressable);
      });
      expect(onPress).toHaveBeenCalledTimes(2);
      expect(onEdit).not.toHaveBeenCalled();
      expect(onDelete).not.toHaveBeenCalled();
    });

    test('tapping Edit (Pencil) fires onEdit exclusively without triggering card onPress', async () => {
      const onPress = jest.fn();
      const onEdit = jest.fn();
      const onDelete = jest.fn();

      const screen = await render(
        <MasaCard
          masa={sampleMealDinner1}
          onPress={onPress}
          onEdit={onEdit}
          onDelete={onDelete}
        />,
      );

      const editBtn = screen.getByTestId('meal-edit-dinner-1');
      await act(async () => {
        fireEvent.press(editBtn);
      });

      expect(onEdit).toHaveBeenCalledTimes(1);
      expect(onEdit).toHaveBeenCalledWith(sampleMealDinner1);
      expect(onPress).not.toHaveBeenCalled();
      expect(onDelete).not.toHaveBeenCalled();
    });

    test('tapping Delete (Trash) fires onDelete exclusively without triggering card onPress', async () => {
      const onPress = jest.fn();
      const onEdit = jest.fn();
      const onDelete = jest.fn();

      const screen = await render(
        <MasaCard
          masa={sampleMealDinner1}
          onPress={onPress}
          onEdit={onEdit}
          onDelete={onDelete}
        />,
      );

      const deleteBtn = screen.getByTestId('meal-delete-dinner-1');
      await act(async () => {
        fireEvent.press(deleteBtn);
      });

      expect(onDelete).toHaveBeenCalledTimes(1);
      expect(onDelete).toHaveBeenCalledWith(sampleMealDinner1);
      expect(onPress).not.toHaveBeenCalled();
      expect(onEdit).not.toHaveBeenCalled();
    });
  });

  describe('Journal Accordion Expand/Collapse Behavior', () => {
    test('initial state renders all 4 category headers collapsed with correct totals and no individual meals', async () => {
      const screen = await render(<HistoryScreen />);

      // Headers exist
      const micDejunHeader = screen.getByTestId('category-header-mic_dejun');
      const pranzHeader = screen.getByTestId('category-header-pranz');
      const cinaHeader = screen.getByTestId('category-header-cina');
      const gustareHeader = screen.getByTestId('category-header-gustare');

      expect(micDejunHeader).toBeTruthy();
      expect(pranzHeader).toBeTruthy();
      expect(cinaHeader).toBeTruthy();
      expect(gustareHeader).toBeTruthy();

      // Check accessibilityState expanded is false
      expect(micDejunHeader.props.accessibilityState).toEqual({ expanded: false });
      expect(cinaHeader.props.accessibilityState).toEqual({ expanded: false });

      // Dinner summary: 2 alimente · 720 kcal
      expect(screen.getAllByText(/720 kcal/).length).toBeGreaterThanOrEqual(1);
      // Breakfast summary: 1 aliment · 350 kcal
      expect(screen.getAllByText(/350 kcal/).length).toBeGreaterThanOrEqual(1);

      // In collapsed state, meals are NOT visible
      expect(screen.queryByTestId('meal-title-pressable-dinner-1')).toBeNull();
      expect(screen.queryByTestId('meal-title-pressable-dinner-2')).toBeNull();
      expect(screen.queryByTestId('meal-title-pressable-breakfast-1')).toBeNull();
    });

    test('tapping Dinner header expands it and reveals its meals; tapping again collapses it', async () => {
      const screen = await render(<HistoryScreen />);

      const cinaHeader = screen.getByTestId('category-header-cina');

      // Expand Dinner
      await act(async () => {
        fireEvent.press(cinaHeader);
      });

      // Dinner is now expanded
      expect(cinaHeader.props.accessibilityState).toEqual({ expanded: true });
      expect(screen.getByTestId('meal-title-pressable-dinner-1')).toBeTruthy();
      expect(screen.getByTestId('meal-title-pressable-dinner-2')).toBeTruthy();

      // Breakfast meals are still collapsed
      expect(screen.queryByTestId('meal-title-pressable-breakfast-1')).toBeNull();

      // Collapse Dinner again
      await act(async () => {
        fireEvent.press(cinaHeader);
      });

      // Dinner meals are hidden again
      expect(cinaHeader.props.accessibilityState).toEqual({ expanded: false });
      expect(screen.queryByTestId('meal-title-pressable-dinner-1')).toBeNull();
      expect(screen.queryByTestId('meal-title-pressable-dinner-2')).toBeNull();
    });

    test('expanding an empty category shows a discrete Add CTA that opens AddMealBottomSheet', async () => {
      const screen = await render(<HistoryScreen />);

      const pranzHeader = screen.getByTestId('category-header-pranz');

      // Expand Pranz
      await act(async () => {
        fireEvent.press(pranzHeader);
      });

      expect(pranzHeader.props.accessibilityState).toEqual({ expanded: true });

      // Look for the empty CTA button
      const emptyBtn = screen.getByTestId('add-to-empty-pranz');
      expect(emptyBtn).toBeTruthy();

      // Tap the empty CTA
      await act(async () => {
        fireEvent.press(emptyBtn);
      });

      // Should open AddMealBottomSheet with 'pranz'
      expect(mockOpenAddMeal).toHaveBeenCalledWith(null, 'pranz');
    });

    test('FlashList is configured with getItemType for recycling stability without dropping touches', async () => {
      await render(<HistoryScreen />);

      expect(typeof mockFlashListProps.getItemType).toBe('function');
      expect(mockFlashListProps.getItemType({ tip: 'header' })).toBe('header');
      expect(mockFlashListProps.getItemType({ tip: 'masa' })).toBe('masa');
      expect(mockFlashListProps.getItemType({ tip: 'emptyExpanded' })).toBe('emptyExpanded');
      expect(mockFlashListProps.getItemType({ tip: 'addMore' })).toBe('addMore');
    });
  });
});
