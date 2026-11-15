import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  canGoBack: jest.fn(() => false),
};
let mockSegments: string[] = ['auth'];
const focusCallbacks: Array<() => void> = [];

jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>();
  const api = {
    __store: store,
    getItem: jest.fn(async (key: string) => store.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    removeItem: jest.fn(async (key: string) => {
      store.delete(key);
    }),
    multiGet: jest.fn(async (keys: string[]) => keys.map((k) => [k, store.get(k) ?? null])),
    multiSet: jest.fn(async (entries: Array<[string, string]>) => {
      for (const [k, v] of entries) store.set(k, v);
    }),
    multiRemove: jest.fn(async (keys: string[]) => {
      for (const k of keys) store.delete(k);
    }),
    getAllKeys: jest.fn(async () => Array.from(store.keys())),
    clear: jest.fn(async () => {
      store.clear();
    }),
  };
  return { __esModule: true, default: api, ...api };
});

jest.mock('expo-router', () => {
  const ReactActual = require('react');
  const Stack = ({ children }: { children?: React.ReactNode }) =>
    ReactActual.createElement(ReactActual.Fragment, null, children);
  Stack.Screen = () => null;
  return {
    useRouter: () => mockRouter,
    useSegments: () => mockSegments,
    usePathname: () => `/${mockSegments.join('/')}`,
    useRootNavigationState: () => ({ key: 'root-nav-key' }),
    useNavigationContainerRef: () => ({ isReady: () => true, addListener: jest.fn(() => jest.fn()) }),
    useFocusEffect: (cb: () => void) => {
      focusCallbacks.push(cb);
      ReactActual.useEffect(() => cb(), [cb]);
    },
    Stack,
    Redirect: () => null,
  };
});

jest.mock('react-native-safe-area-context', () => {
  const ReactActual = require('react');
  const { View } = require('react-native');
  return {
    useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 }),
    SafeAreaProvider: ({ children }: { children?: React.ReactNode }) =>
      ReactActual.createElement(View, null, children),
    SafeAreaView: ({ children, ...props }: any) => ReactActual.createElement(View, props, children),
  };
});

jest.mock('react-native-reanimated', () => {
  const { View, Text, ScrollView } = require('react-native');
  const noop = () => undefined;
  const builder: any = {};
  builder.delay = () => builder;
  builder.duration = () => builder;
  builder.springify = () => builder;
  return {
    __esModule: true,
    default: {
      View,
      Text,
      ScrollView,
      createAnimatedComponent: (C: any) => C,
      addWhitelistedUIProps: noop,
      addWhitelistedNativeProps: noop,
    },
    View,
    Text,
    ScrollView,
    createAnimatedComponent: (C: any) => C,
    useSharedValue: (v: number) => ({ value: v }),
    useAnimatedStyle: () => ({}),
    useAnimatedProps: () => ({}),
    withTiming: (v: number) => v,
    withRepeat: (v: number) => v,
    withSpring: (v: number) => v,
    cancelAnimation: jest.fn(),
    FadeIn: builder,
    FadeOut: builder,
    FadeInUp: builder,
    FadeInDown: builder,
    FadeOutDown: builder,
    Easing: { linear: noop, ease: noop, inOut: () => noop, out: () => noop },
  };
});

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(async () => undefined),
  selectionAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

jest.mock('expo-linear-gradient', () => {
  const ReactActual = require('react');
  const { View } = require('react-native');
  return {
    LinearGradient: ({ children, ...props }: any) => ReactActual.createElement(View, props, children),
  };
});

jest.mock('expo-blur', () => {
  const ReactActual = require('react');
  const { View } = require('react-native');
  return {
    BlurView: ({ children, ...props }: any) => ReactActual.createElement(View, props, children),
  };
});

jest.mock('lucide-react-native', () => {
  const ReactActual = require('react');
  const { View } = require('react-native');
  return new Proxy(
    {},
    {
      get: (_target, prop) => {
        const Icon = (props: any) => ReactActual.createElement(View, { ...props, accessibilityLabel: String(prop) });
        return Icon;
      },
    },
  );
});

jest.mock('react-native-svg', () => {
  const ReactActual = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: (props: any) => ReactActual.createElement(View, props),
    Svg: (props: any) => ReactActual.createElement(View, props),
    Circle: (props: any) => ReactActual.createElement(View, props),
  };
});

jest.mock('../hooks/useReducedMotion', () => ({
  useReducedMotion: () => true,
}));

jest.mock('../hooks/useResponsiveLayout', () => ({
  useResponsiveLayout: () => ({
    screenWidth: 390,
    screenHeight: 844,
    contentMaxWidth: 680,
    horizontalPadding: 20,
    isCompact: false,
    isTablet: false,
    tabBarHeight: 74,
    scrollPaddingBottom: 90,
    scrollPaddingTop: 60,
  }),
}));

jest.mock('../context/ThemeContext', () => {
  const ReactActual = require('react');
  const palette = {
    background: '#090C0E',
    surface: '#11161C',
    surfaceElevated: '#171E26',
    cardBg: '#121820',
    cardBorder: 'rgba(255,255,255,0.08)',
    textPrimary: '#F8FAFC',
    textSecondary: '#94A3B8',
    textTertiary: '#64748B',
    accent: '#CCFF00',
    accentSecondary: '#38BDF8',
    accentTertiary: '#22D3EE',
    accentGradient: ['#CCFF00', '#A3E635'],
    danger: '#EF4444',
    warning: '#F59E0B',
    overlayStrong: 'rgba(255,255,255,0.16)',
  };
  const ThemeContext = ReactActual.createContext({ colors: palette, isDark: true });
  return {
    ThemeContext,
    useTheme: () => ({ colors: palette, isDark: true }),
    ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
    AppThemeProvider: ({ children }: { children: React.ReactNode }) => children,
  };
});

jest.mock('react-native-gesture-handler', () => ({
  GestureHandlerRootView: ({ children }: { children?: React.ReactNode }) => children ?? null,
}));

jest.mock('@gorhom/bottom-sheet', () => {
  const ReactActual = require('react');
  const { View, ScrollView } = require('react-native');
  const BottomSheetModal = ReactActual.forwardRef(({ children }: any, _ref: any) =>
    ReactActual.createElement(View, null, children),
  );
  return {
    BottomSheetModalProvider: ({ children }: { children?: React.ReactNode }) => children ?? null,
    BottomSheetModal,
    BottomSheetView: ({ children, ...props }: any) => ReactActual.createElement(View, props, children),
    BottomSheetScrollView: ({ children, ...props }: any) => ReactActual.createElement(ScrollView, props, children),
    BottomSheetBackdrop: () => null,
  };
});

jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  wrap: (C: any) => C,
  captureException: jest.fn(),
  captureMessage: jest.fn(),
}));

let mockAuthState: any = {
  user: { id: 'user-tour-1', email: 'user@getflow.app', user_metadata: {} },
  session: null,
  loading: false,
  profile: null,
  signOut: jest.fn(),
  refreshSession: jest.fn(),
};

jest.mock('../context/AuthContext', () => ({
  useAuth: () => mockAuthState,
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('../context/FlowCreditsContext', () => ({
  useFlowCredits: () => ({
    balance: {
      dailyRemaining: 5,
      rewarded: 0,
      purchased: 0,
      total: 5,
      rewardedGrantsRemaining: 3,
      serverDay: null,
    },
    balanceReady: true,
    credits: 10,
    isPremium: false,
    unlimited: false,
    loading: false,
    visible: false,
    rewardState: 'idle',
    creditProducts: [],
    purchaseStatus: { status: 'idle' },
    lastConsumedCategory: null,
    open: jest.fn(),
    close: jest.fn(),
    refresh: jest.fn(async () => null),
    consumeOptimisticCredit: jest.fn(() => 'daily'),
    rollbackOptimisticCredit: jest.fn(),
    watchRewarded: jest.fn(async () => 'granted'),
    purchase: jest.fn(async () => undefined),
  }),
  FlowCreditsProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('../context/GamificareContext', () => {
  const data = {
    streak: 3,
    xp: 120,
    xpTotal: 120,
    nivel: 2,
    ultimaZiActiva: '2026-11-14',
    questuriAzi: [],
    insigne: [],
    esteInghetatAzi: false,
    zilePanaLaInghet: 0,
    refresh: jest.fn(async () => undefined),
  };
  const actions = {
    refreshGamificare: jest.fn(async () => undefined),
    sincronizeazaCuServer: jest.fn(async () => undefined),
    actualizeazaStreak: jest.fn(async () => undefined),
    adaugaXp: jest.fn(async () => undefined),
    actualizeazaProgresQuest: jest.fn(async () => undefined),
    incarcaGamificare: jest.fn(async () => undefined),
    resetGamificare: jest.fn(async () => undefined),
  };
  return {
    useGamificareData: () => data,
    useGamificareActions: () => actions,
    useGamificare: () => ({ ...data, ...actions }),
    GamificareProvider: ({ children }: { children: React.ReactNode }) => children,
  };
});

jest.mock('../context/NotificationBannerContext', () => {
  const actions = {
    showNotification: jest.fn(),
    showBanner: jest.fn(),
    hideBanner: jest.fn(),
    markAllRead: jest.fn(async () => undefined),
    clearAll: jest.fn(async () => undefined),
  };
  const data = {
    unreadCount: 0,
    notifications: [],
    banners: [],
    refresh: jest.fn(async () => undefined),
  };
  return {
    useNotificationBannerData: () => data,
    useNotificationBannerActions: () => actions,
    useNotificationBanner: () => ({ ...data, ...actions }),
    NotificationBannerProvider: ({ children }: { children: React.ReactNode }) => children,
  };
});

jest.mock('../hooks/useMeseAzi', () => ({
  useMeseAzi: () => ({
    totalCalorii: 650,
    totalProteine: 45,
    totalGrasimi: 20,
    totalCarbohidrati: 72,
    caloriiTinta: 2100,
    proteineTinta: 150,
    carbiTinta: 220,
    grasimiTinta: 65,
    greutateIntrodusaKg: 75,
    user: { id: 'user-tour-1' },
    loading: false,
    eroareFetch: null,
    refresh: jest.fn(async () => undefined),
    optimisticAddMeal: jest.fn(),
  }),
}));

jest.mock('../hooks/useApa', () => ({
  useApa: () => ({
    waterConsumedMl: 750,
    waterTargetMl: 2500,
    waterLoading: false,
    adaugaPahar: jest.fn(),
    scadePahar: jest.fn(),
    setConsumedMl: jest.fn(async () => undefined),
  }),
}));

jest.mock('../hooks/useHealthSync', () => ({
  useHealthSync: () => ({
    pasi: 4200,
    caloriiArse: 180,
    isConnected: true,
    syncing: false,
    ultimaSincronizare: null,
    conecteazaHealth: jest.fn(),
    refresh: jest.fn(async () => undefined),
  }),
  getHealthProvidersForPlatform: () => ['health_connect'],
}));

jest.mock('../hooks/useAntrenamente', () => ({
  useAntrenamente: () => ({
    antrenamente: [],
    caloriiArseAntrenamente: 0,
    refresh: jest.fn(async () => undefined),
  }),
}));

jest.mock('../hooks/useExercitii', () => ({
  useExercitii: () => ({
    exercitii: [],
    refresh: jest.fn(async () => undefined),
  }),
}));

jest.mock('../hooks/useFocusRefresh', () => ({
  useFocusRefresh: () => undefined,
}));

jest.mock('../hooks/useCurrentDayKey', () => ({
  useCurrentDayKey: () => '2026-11-14',
}));

jest.mock('../supabase', () => ({
  supabase: {
    auth: {
      getUser: jest.fn(async () => ({ data: { user: { id: 'user-tour-1', user_metadata: {} } }, error: null })),
      getSession: jest.fn(async () => ({ data: { session: null }, error: null })),
      onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
    },
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn(async () => ({ data: null, error: null })),
      single: jest.fn(async () => ({ data: null, error: null })),
    })),
  },
}));

jest.mock('../components/AddMealBottomSheet', () => ({
  AddMealBottomSheet: () => null,
}));

jest.mock('../components/gamification/StreakBottomSheet', () => ({
  StreakBottomSheet: () => null,
}));

jest.mock('../components/AddWeightModal', () => ({
  AddWeightModal: () => null,
}));

jest.mock('../components/FlowCreditsPill', () => ({
  FlowCreditsPill: () => null,
}));

jest.mock('../components/home/RunnerSphereCompanionCluster', () => ({
  RunnerSphereCompanionCluster: () => null,
}));

jest.mock('../components/home/FlowCompanionModal', () => ({
  FlowCompanionModal: () => null,
}));

jest.mock('../components/fitness/BodyMap', () => ({
  BodyMap: () => null,
}));

jest.mock('../components/SkeletonLoader', () => ({
  SkeletonLoader: () => null,
}));

jest.mock('../lib/sincronizeazaTargeturi', () => ({
  salveazaTargeturiPending: jest.fn(async () => undefined),
  stergeTargeturiPending: jest.fn(async () => undefined),
  citesteTargeturiPending: jest.fn(async () => null),
  sincronizeazaTargeturiLocale: jest.fn(async () => undefined),
}));

jest.mock('../components/onboarding/EcranPas', () => {
  const ReactActual = require('react');
  const { View } = require('react-native');
  const MockEcranPas = ({ children, subsolSecundar }: any) =>
    ReactActual.createElement(View, { testID: 'mock-ecran-pas' }, children, subsolSecundar);
  return {
    __esModule: true,
    default: MockEcranPas,
    EcranPas: MockEcranPas,
  };
});

jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(async () => true),
  hideAsync: jest.fn(async () => true),
}));

jest.mock('expo-font', () => ({
  useFonts: () => [true, null],
  isLoaded: () => true,
}));

jest.mock('expo-updates', () => ({
  checkForUpdateAsync: jest.fn(async () => ({ isAvailable: false })),
  fetchUpdateAsync: jest.fn(async () => ({})),
  reloadAsync: jest.fn(async () => undefined),
  channel: 'production',
  runtimeVersion: '1.0.0',
}));

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  getPermissionsAsync: jest.fn(async () => ({ status: 'undetermined' })),
  requestPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  cancelAllScheduledNotificationsAsync: jest.fn(async () => undefined),
  getAllScheduledNotificationsAsync: jest.fn(async () => []),
}));

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    addEventListener: jest.fn(() => jest.fn()),
    fetch: jest.fn(async () => ({ isConnected: true, isInternetReachable: true })),
  },
  useNetInfo: () => ({ isConnected: true, isInternetReachable: true }),
}));

jest.mock('../lib/offlineQueue', () => ({
  incarcaCoadaOffline: jest.fn(async () => []),
  flushCoadaOffline: jest.fn(async () => undefined),
  processOfflineQueue: jest.fn(async () => undefined),
  aboneazaLaCoadaOffline: jest.fn(() => () => undefined),
}));

jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true })),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import i18n, { changeLanguage, i18nReady, type SupportedLanguage } from '../i18n';
import roLocale from '../i18n/locales/ro.json';
import enLocale from '../i18n/locales/en.json';
import frLocale from '../i18n/locales/fr.json';
import deLocale from '../i18n/locales/de.json';
import {
  InteractiveTourOverlayHost,
  InteractiveTourProvider,
  useInteractiveTour,
  useRegisterTourTarget,
} from '../context/InteractiveTourContext';
import { useAppStore } from '../hooks/useAppStore';
import RootLayout from '../app/_layout';
import PasLimba from '../app/onboarding/index';
import HomeScreen from '../app/(tabs)/index';
import ProfilScreen from '../app/(tabs)/profil';
import { supabase } from '../supabase';
import { SpotlightTourOverlay, type SpotlightStep } from '../components/ui/SpotlightTourOverlay';
import {
  HOME_TOUR_STORAGE_PREFIX,
  consumePendingHomeTourReplay,
  getHomeTourPromptKey,
  markHomeTourPromptHandled,
  requestHomeTourReplay,
  shouldShowHomeTourPrompt,
} from '../lib/homeTour';
import { purgeLocalDataForUser } from '../lib/userDataCleanup';

const asyncStoreMap: Map<string, string> = (AsyncStorage as any).__store;

describe('Skip Onboarding + Interactive Home Spotlight Tour', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    asyncStoreMap.clear();
    focusCallbacks.length = 0;
    consumePendingHomeTourReplay();
    mockSegments = ['auth'];
    mockAuthState = {
      user: { id: 'user-tour-1', email: 'user@getflow.app', user_metadata: {} },
      session: null,
      loading: false,
      profile: null,
      signOut: jest.fn(),
      refreshSession: jest.fn(),
    };
    await i18n.changeLanguage('ro');
    await useAppStore.getState().setOnboardingDone(false);
    useAppStore.setState({
      isOnboardingDone: false,
      skipOnboardingToAuth: false,
    });
  });

  it('PasLimba renders localized skip-to-signin CTA, updates selected language highlight without reverting, and sets transient skip flag without marking onboarding done', async () => {
    await i18n.changeLanguage('en');
    const screen = await render(<PasLimba />);

    const skipBtn = screen.getByTestId('onboarding-skip-signin');
    expect(skipBtn).toBeTruthy();
    expect(screen.getByText(/Already have an account/i)).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'English' }).props.accessibilityState.selected).toBe(true);
    expect(screen.getByRole('radio', { name: 'Română' }).props.accessibilityState.selected).toBe(false);

    await fireEvent.press(screen.getByRole('radio', { name: 'Română' }));
    await waitFor(() => {
      expect(screen.getByText(/Ai deja cont\?/i)).toBeTruthy();
      expect(screen.getByRole('radio', { name: 'Română' }).props.accessibilityState.selected).toBe(true);
      expect(screen.getByRole('radio', { name: 'English' }).props.accessibilityState.selected).toBe(false);
    });

    await fireEvent.press(screen.getByTestId('onboarding-skip-signin'));
    expect(useAppStore.getState().skipOnboardingToAuth).toBe(true);
    expect(useAppStore.getState().isOnboardingDone).toBe(false);
    expect(mockRouter.replace).toHaveBeenCalledWith('/auth');
  });

  it('useAppStore resets skipOnboardingToAuth when onboarding completes', async () => {
    useAppStore.getState().setSkipOnboardingToAuth(true);
    expect(useAppStore.getState().skipOnboardingToAuth).toBe(true);

    await useAppStore.getState().setOnboardingDone(true);
    expect(useAppStore.getState().skipOnboardingToAuth).toBe(false);
    expect(useAppStore.getState().isOnboardingDone).toBe(true);
  });

  it('homeTour per-user state handles optional prompt, dismissal, and GDPR user purge', async () => {
    const keyUser1 = getHomeTourPromptKey('user-1');
    const keyUser2 = getHomeTourPromptKey('user-2');
    expect(keyUser1).toBe(`${HOME_TOUR_STORAGE_PREFIX}user-1_prompted_v1`);
    expect(await shouldShowHomeTourPrompt('user-1')).toBe(true);

    await markHomeTourPromptHandled('user-1', 'dismissed');
    await markHomeTourPromptHandled('user-2', 'completed');

    expect(await shouldShowHomeTourPrompt('user-1')).toBe(false);
    expect(asyncStoreMap.get(keyUser1)).toBe('dismissed');
    expect(asyncStoreMap.get(keyUser2)).toBe('completed');

    await purgeLocalDataForUser('user-1');
    expect(asyncStoreMap.has(keyUser1)).toBe(false);
    expect(asyncStoreMap.has(keyUser2)).toBe(true);
  });

  it('HomeScreen shows optional tour invite on first open, persists dismiss, and replays via bottom trigger', async () => {
    const screen = await render(<HomeScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('home-tour-invite-card')).toBeTruthy();
    });

    await fireEvent.press(screen.getByTestId('home-tour-invite-later'));
    await waitFor(() => {
      expect(screen.queryByTestId('home-tour-invite-card')).toBeNull();
    });
    expect(asyncStoreMap.get(getHomeTourPromptKey('user-tour-1'))).toBe('dismissed');

    const bottomTrigger = screen.getByTestId('home-tour-bottom-trigger');
    expect(bottomTrigger).toBeTruthy();
    await fireEvent.press(bottomTrigger);

    await waitFor(() => {
      expect(screen.getByTestId('spotlight-tour-overlay')).toBeTruthy();
      expect(screen.getByText(/Pasul 1 din 11/i)).toBeTruthy();
    });

    await fireEvent.press(screen.getByTestId('spotlight-next-btn'));
    await waitFor(() => {
      expect(screen.getByText(/Pasul 2 din 11/i)).toBeTruthy();
    });

    await fireEvent.press(screen.getByTestId('spotlight-back-btn'));
    await waitFor(() => {
      expect(screen.getByText(/Pasul 1 din 11/i)).toBeTruthy();
    });

    await fireEvent.press(screen.getByTestId('spotlight-skip-btn'));
    await waitFor(() => {
      expect(screen.queryByTestId('spotlight-tour-overlay')).toBeNull();
    });
    expect(asyncStoreMap.get(getHomeTourPromptKey('user-tour-1'))).toBe('skipped');
  });

  it('HomeScreen starts Option B tour from invite CTA, traverses all 11 cross-app steps with navigation, and marks completed', async () => {
    const screen = await render(
      <InteractiveTourProvider userId="user-tour-1">
        <HomeScreen />
        <InteractiveTourOverlayHost screen="tabs" />
        <InteractiveTourOverlayHost screen="pantry" />
      </InteractiveTourProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('home-tour-invite-start')).toBeTruthy();
    });

    await fireEvent.press(screen.getByTestId('home-tour-invite-start'));
    await waitFor(() => {
      expect(screen.getByTestId('spotlight-tour-overlay')).toBeTruthy();
      expect(screen.getByText(/Pasul 1 din 11/i)).toBeTruthy();
      expect(screen.getByText(roLocale.homeTour.steps.calorieTitle)).toBeTruthy();
    });

    const expectedSequence = [
      { stepNum: 2, title: roLocale.homeTour.steps.scanTitle },
      { stepNum: 3, title: roLocale.homeTour.steps.hydrationTitle },
      { stepNum: 4, title: roLocale.homeTour.steps.homeMuscleTitle },
      {
        stepNum: 5,
        title: roLocale.homeTour.steps.journalOverviewTitle,
        expectedRoute: '/(tabs)/istoric',
      },
      { stepNum: 6, title: roLocale.homeTour.steps.journalPantryTitle },
      {
        stepNum: 7,
        title: roLocale.homeTour.steps.pantryManageTitle,
        expectedRoute: { pathname: '/scanner-barcode', params: { tab: 'camara', tour: '1' } },
      },
      { stepNum: 8, title: roLocale.homeTour.steps.pantryRecipesTitle },
      {
        stepNum: 9,
        title: roLocale.homeTour.steps.sportMapTitle,
        expectedRoute: '/(tabs)/antrenamente',
      },
      { stepNum: 10, title: roLocale.homeTour.steps.sportWorkoutsTitle },
      {
        stepNum: 11,
        title: roLocale.homeTour.steps.coachTitle,
        expectedRoute: '/(tabs)/chat',
      },
    ];

    for (const item of expectedSequence) {
      await fireEvent.press(screen.getByTestId('spotlight-next-btn'));
      await waitFor(() => {
        expect(screen.getByText(new RegExp(`Pasul ${item.stepNum} din 11`, 'i'))).toBeTruthy();
        expect(screen.getByText(item.title)).toBeTruthy();
      });
      if (item.expectedRoute) {
        expect(mockRouter.push).toHaveBeenCalledWith(item.expectedRoute);
      }
    }

    expect(screen.getByText(roLocale.homeTour.finish)).toBeTruthy();

    await fireEvent.press(screen.getByTestId('spotlight-next-btn'));
    await waitFor(() => {
      expect(screen.queryByTestId('spotlight-tour-overlay')).toBeNull();
    });
    expect(mockRouter.push).toHaveBeenCalledWith('/(tabs)');
    expect(asyncStoreMap.get(getHomeTourPromptKey('user-tour-1'))).toBe('completed');
  });

  it.each(['ro', 'en', 'fr', 'de'] as SupportedLanguage[])(
    'Option B tutorial renders every phase and step strictly in selected language (%s)',
    async (locale) => {
      const localesMap = {
        ro: roLocale,
        en: enLocale,
        fr: frLocale,
        de: deLocale,
      } as const;
      const loc = localesMap[locale];

      await i18nReady;
      await changeLanguage(locale);

      const screen = await render(
        <InteractiveTourProvider userId="user-tour-1">
          <HomeScreen />
          <InteractiveTourOverlayHost screen="tabs" />
          <InteractiveTourOverlayHost screen="pantry" />
        </InteractiveTourProvider>,
      );
      await waitFor(() => {
        expect(screen.getByTestId('home-tour-invite-start')).toBeTruthy();
        expect(screen.getByText(loc.home.tourInviteStart)).toBeTruthy();
      });

      await fireEvent.press(screen.getByTestId('home-tour-invite-start'));
      await waitFor(() => {
        expect(screen.getByText(loc.homeTour.steps.calorieTitle)).toBeTruthy();
        expect(screen.getByText(loc.homeTour.phases.home)).toBeTruthy();
      });

      // Step through remaining 10 steps verifying phase + title localization in chosen language
      const checkPoints: Array<{ phase: string; title: string; isLast?: boolean }> = [
        { phase: loc.homeTour.phases.home, title: loc.homeTour.steps.scanTitle },
        { phase: loc.homeTour.phases.home, title: loc.homeTour.steps.hydrationTitle },
        { phase: loc.homeTour.phases.home, title: loc.homeTour.steps.homeMuscleTitle },
        { phase: loc.homeTour.phases.journal, title: loc.homeTour.steps.journalOverviewTitle },
        { phase: loc.homeTour.phases.journal, title: loc.homeTour.steps.journalPantryTitle },
        { phase: loc.homeTour.phases.pantry, title: loc.homeTour.steps.pantryManageTitle },
        { phase: loc.homeTour.phases.pantry, title: loc.homeTour.steps.pantryRecipesTitle },
        { phase: loc.homeTour.phases.sport, title: loc.homeTour.steps.sportMapTitle },
        { phase: loc.homeTour.phases.sport, title: loc.homeTour.steps.sportWorkoutsTitle },
        { phase: loc.homeTour.phases.coach, title: loc.homeTour.steps.coachTitle, isLast: true },
      ];

      for (const cp of checkPoints) {
        await fireEvent.press(screen.getByTestId('spotlight-next-btn'));
        await waitFor(() => {
          expect(screen.getByText(cp.title)).toBeTruthy();
          expect(screen.getAllByText(cp.phase).length).toBeGreaterThanOrEqual(1);
        });
        if (cp.isLast) {
          expect(screen.getByText(loc.homeTour.finish)).toBeTruthy();
        }
      }

      await fireEvent.press(screen.getByTestId('spotlight-next-btn'));
    },
  );

  it('InteractiveTourOverlayHost switches overlay ownership cleanly between tabs and pantry modal host', async () => {
    mockSegments = ['(tabs)'];
    const screen = await render(
      <InteractiveTourProvider userId="user-host-switch">
        <HomeScreen />
        <InteractiveTourOverlayHost screen="tabs" />
        <InteractiveTourOverlayHost screen="pantry" />
      </InteractiveTourProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('home-tour-invite-start')).toBeTruthy();
    });
    await fireEvent.press(screen.getByTestId('home-tour-invite-start'));

    // Steps 1..6 live on 'tabs' host
    await waitFor(() => {
      expect(screen.getAllByTestId('spotlight-tour-overlay')).toHaveLength(1);
      expect(screen.getByText(/Pasul 1 din 11/i)).toBeTruthy();
    });

    for (let i = 0; i < 6; i += 1) {
      await fireEvent.press(screen.getByTestId('spotlight-next-btn'));
    }

    // Step 7 lives on 'pantry' fullScreenModal host — still only 1 active overlay host rendered
    await waitFor(() => {
      expect(screen.getAllByTestId('spotlight-tour-overlay')).toHaveLength(1);
      expect(screen.getByText(roLocale.homeTour.steps.pantryManageTitle)).toBeTruthy();
    });
  });

  it('SpotlightTourOverlay supports interactive glowing target taps on highlighted elements', async () => {
    const onNext = jest.fn();
    const onScanPress = jest.fn();
    const steps: SpotlightStep[] = [
      {
        key: 'calorie',
        title: 'Calorii',
        body: 'Inel calorii',
        targetRect: { x: 20, y: 120, width: 320, height: 180 },
        canTapTarget: true,
      },
      {
        key: 'scan',
        title: 'Scan AI',
        body: 'Scaneaza masa',
        targetRect: { x: 20, y: 340, width: 320, height: 80 },
        canTapTarget: true,
        onTargetPress: onScanPress,
      },
    ];

    const screen = await render(
      <SpotlightTourOverlay
        visible
        steps={steps}
        stepIndex={0}
        onNext={onNext}
        onBack={jest.fn()}
        onSkip={jest.fn()}
        onFinish={jest.fn()}
      />,
    );

    await fireEvent.press(screen.getByTestId('spotlight-target-calorie'));
    expect(onNext).toHaveBeenCalledTimes(1);

    await screen.rerender(
      <SpotlightTourOverlay
        visible
        steps={steps}
        stepIndex={1}
        onNext={onNext}
        onBack={jest.fn()}
        onSkip={jest.fn()}
        onFinish={jest.fn()}
      />,
    );

    await fireEvent.press(screen.getByTestId('spotlight-target-scan'));
    expect(onScanPress).toHaveBeenCalledTimes(1);
  });

  it('SpotlightTourOverlay hides cutout softly during transitioning and respects bottomReserve + preferredCardPosition', async () => {
    const stepDock: SpotlightStep = {
      key: 'coachAi',
      title: 'Coach AI',
      body: 'Sugereaza mese si adauga in jurnal',
      targetRect: { x: 0, y: 1120, width: 750, height: 110 },
      canTapTarget: true,
      preferredCardPosition: 'above',
    };

    const screen = await render(
      <SpotlightTourOverlay
        visible
        transitioning
        bottomReserve={82}
        steps={[stepDock]}
        stepIndex={0}
        onNext={jest.fn()}
        onBack={jest.fn()}
        onSkip={jest.fn()}
        onFinish={jest.fn()}
      />,
    );

    expect(screen.getByTestId('spotlight-transition-veil')).toBeTruthy();
    expect(screen.queryByTestId('spotlight-target-coachAi')).toBeNull();
    expect(screen.getByTestId('spotlight-coach-card')).toBeTruthy();

    await screen.rerender(
      <SpotlightTourOverlay
        visible
        transitioning={false}
        bottomReserve={82}
        steps={[stepDock]}
        stepIndex={0}
        onNext={jest.fn()}
        onBack={jest.fn()}
        onSkip={jest.fn()}
        onFinish={jest.fn()}
      />,
    );

    expect(screen.queryByTestId('spotlight-transition-veil')).toBeNull();
    const target = screen.getByTestId('spotlight-target-coachAi');
    expect(target.props.style.left).toBe(8);
    expect(target.props.style.width).toBe(734);
    const card = screen.getByTestId('spotlight-coach-card');
    const cardTopStyle = Array.isArray(card.props.style)
      ? card.props.style.find((st: any) => st && typeof st.top === 'number')
      : card.props.style;
    expect(cardTopStyle.top).toBeLessThan(target.props.style.top);
  });

  it('InteractiveTourContext dynamically computes scrollToOffset to frame off-viewport targets cleanly', async () => {
    jest.useFakeTimers();
    try {
      const { View, Pressable } = require('react-native');
      const scrollYRef = { current: 40 };
      const scrollToOffset = jest.fn((offset: number) => {
        scrollYRef.current = offset;
      });
      let rectCall = 0;

      function DynamicTargetHarness() {
        const ref = React.useRef<any>(null);
        const tour = useInteractiveTour();
        React.useEffect(() => {
          if (!ref.current) return;
          ref.current.measureInWindow = (cb: (x: number, y: number, w: number, h: number) => void) => {
            rectCall += 1;
            if (rectCall === 1) {
              cb(16, 1280, 360, 140);
            } else {
              cb(16, 108, 360, 140);
            }
          };
        });
        useRegisterTourTarget('calorie', {
          targetRef: ref,
          scrollOffsetRef: scrollYRef,
          scrollToOffset,
        }, []);
        return (
          <View>
            <View ref={ref} testID="harness-target" />
            <Pressable
              testID="harness-start-tour"
              onPress={() => tour?.startTour('user-dyn')}
            />
          </View>
        );
      }

      const screen = await render(
        <InteractiveTourProvider userId="user-dyn">
          <DynamicTargetHarness />
          <InteractiveTourOverlayHost screen="tabs" />
        </InteractiveTourProvider>,
      );

      await fireEvent.press(screen.getByTestId('harness-start-tour'));
      await act(async () => {
        jest.advanceTimersByTime(600);
      });

      expect(scrollToOffset).toHaveBeenCalledTimes(1);
      expect(scrollToOffset.mock.calls[0][0]).toBeGreaterThan(1000);
      expect(screen.getByTestId('spotlight-target-calorie').props.style.top).toBe(102);
    } finally {
      jest.useRealTimers();
    }
  });

  it('ProfilScreen interactive guide button queues home tour replay and navigates to Home', async () => {
    mockAuthState = {
      user: { id: 'user-tour-1', email: 'user@getflow.app', user_metadata: {} },
      session: { access_token: 'tok-1', user: { id: 'user-tour-1', email: 'user@getflow.app', user_metadata: {} } },
      loading: false,
      profile: null,
      signOut: jest.fn(),
      refreshSession: jest.fn(),
    };
    const screen = await render(<ProfilScreen />);

    try {
      await waitFor(() => {
        expect(screen.getByTestId('profile-interactive-guide')).toBeTruthy();
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.log('PROFIL_JSON_HEAD:', JSON.stringify(screen.toJSON())?.slice(0, 1200));
      throw err;
    }

    await fireEvent.press(screen.getByTestId('profile-interactive-guide'));
    expect(consumePendingHomeTourReplay()).toBe(true);
    expect(mockRouter.push).toHaveBeenCalledWith('/(tabs)');
  });

  it('RootLayout holds /auth when skipOnboardingToAuth is active without session, and restores/resets on sign-in', async () => {
    mockSegments = ['auth'];
    mockAuthState = {
      user: null,
      session: null,
      loading: false,
      profile: null,
      signOut: jest.fn(),
      refreshSession: jest.fn(),
    };
    useAppStore.setState({ isOnboardingDone: false, skipOnboardingToAuth: true });

    const screen = await render(<RootLayout />);
    await waitFor(() => {
      expect(mockRouter.replace).not.toHaveBeenCalledWith('/onboarding');
    });

    // Simulate returning user signing in with existing server profile
    (global as any).fetch = jest.fn(async (input: string) => {
      if (String(input).includes('/user/profil')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            exista: true,
            complet: true,
            profil: {
              sex: 'masculin',
              varsta: 29,
              inaltime: 180,
              greutate: 78,
              greutateTinta: 74,
              obiectiv: 'slabire',
              activitate: 'moderat',
              caloriiTinta: 2100,
              proteineTinta: 150,
              carbiTinta: 210,
              grasimiTinta: 65,
            },
          }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });
    ((supabase.from as jest.Mock)).mockImplementation((table: string) => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn(async () =>
        table === 'profil'
          ? {
              data: { calorii_tinta: 2100, proteine_tinta: 150, carbi_tinta: 210, grasimi_tinta: 65, greutate: 78 },
              error: null,
            }
          : { data: null, error: null },
      ),
      single: jest.fn(async () => ({ data: null, error: null })),
    }));

    mockAuthState = {
      user: { id: 'returning-user', email: 'ret@getflow.app', user_metadata: {} },
      session: { access_token: 'tok-returning', user: { id: 'returning-user', email: 'ret@getflow.app', user_metadata: {} } },
      loading: false,
      profile: null,
      signOut: jest.fn(),
      refreshSession: jest.fn(),
    };
    await screen.rerender(<RootLayout />);

    await waitFor(() => {
      expect(useAppStore.getState().skipOnboardingToAuth).toBe(false);
      expect(useAppStore.getState().isOnboardingDone).toBe(true);
      expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)');
    });
  });

  it('RootLayout resets skipOnboardingToAuth and routes back to /onboarding when signed-in user has no server profile', async () => {
    mockSegments = ['auth'];
    (global as any).fetch = jest.fn(async (input: string) => {
      if (String(input).includes('/user/profil')) {
        return { ok: true, status: 200, json: async () => ({ exista: false, complet: false, profil: null }) };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });
    ((supabase.from as jest.Mock)).mockReturnValueOnce({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn(async () => ({ data: null, error: null })),
    });

    mockAuthState = {
      user: { id: 'new-user', email: 'new@getflow.app', user_metadata: {} },
      session: { access_token: 'tok-new', user: { id: 'new-user', email: 'new@getflow.app', user_metadata: {} } },
      loading: false,
      profile: null,
      signOut: jest.fn(),
      refreshSession: jest.fn(),
    };
    useAppStore.setState({ isOnboardingDone: false, skipOnboardingToAuth: true });

    await render(<RootLayout />);
    await waitFor(() => {
      expect(useAppStore.getState().skipOnboardingToAuth).toBe(false);
      expect(mockRouter.replace).toHaveBeenCalledWith('/onboarding');
    });
  });

  it('SpotlightTourOverlay renders in-window with defocused scrim, zero-elevation light band, swipe handlers, and BackHandler skip', async () => {
    const { BackHandler } = require('react-native');
    let registeredBackHandler: (() => boolean) | undefined;
    const removeMock = jest.fn();
    const backSpy = jest
      .spyOn(BackHandler, 'addEventListener')
      .mockImplementation((_event: any, handler: any) => {
        registeredBackHandler = handler;
        return { remove: removeMock };
      });

    const onNext = jest.fn();
    const onBack = jest.fn();
    const onSkip = jest.fn();
    const steps: SpotlightStep[] = [
      {
        key: 'calorie',
        title: 'Calorii',
        body: 'Pas 1',
        targetRect: { x: 20, y: 120, width: 320, height: 180 },
        canTapTarget: true,
      },
      {
        key: 'scan',
        title: 'Scanare',
        body: 'Pas 2',
        targetRect: { x: 20, y: 340, width: 320, height: 90 },
        canTapTarget: true,
      },
    ];

    try {
      const screen = await render(
        <SpotlightTourOverlay
          visible
          steps={steps}
          stepIndex={0}
          onNext={onNext}
          onBack={onBack}
          onSkip={onSkip}
          onFinish={jest.fn()}
        />,
      );

      const treeJson = JSON.stringify(screen.toJSON());
      expect(treeJson).not.toContain('"RCTModalHostView"');

      const card = screen.getByTestId('spotlight-coach-card');
      expect(typeof card.props.onMoveShouldSetResponder).toBe('function');
      expect(typeof registeredBackHandler).toBe('function');
      expect(registeredBackHandler?.()).toBe(true);
      expect(onSkip).toHaveBeenCalledTimes(1);

      // Step change triggers once-only directional transition without double-firing on rerender
      await screen.rerender(
        <SpotlightTourOverlay
          visible
          steps={steps}
          stepIndex={1}
          onNext={onNext}
          onBack={onBack}
          onSkip={onSkip}
          onFinish={jest.fn()}
        />,
      );
      expect(screen.getByText(/Pasul 2 din 2/i)).toBeTruthy();

      await screen.unmount();
      expect(removeMock).toHaveBeenCalled();
    } finally {
      backSpy.mockRestore();
    }
  });
});
