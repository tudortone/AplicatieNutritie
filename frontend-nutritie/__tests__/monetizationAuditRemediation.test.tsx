import React from 'react';

// Mock AsyncStorage FIRST before any imports that consume storage or theme
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 375, height: 812, scale: 2, fontScale: 1 }),
}));

jest.mock('lucide-react-native', () => {
  const MockIcon = () => null;
  return new Proxy({}, {
    get: () => MockIcon,
  });
});

jest.mock('react-native-reanimated', () => {
  const View = require('react-native').View;
  const mockAnim = {
    duration: () => mockAnim,
    delay: () => mockAnim,
    springify: () => mockAnim,
  };
  return {
    __esModule: true,
    default: {
      View,
      createAnimatedComponent: (c: any) => c,
    },
    FadeInDown: mockAnim,
    FadeInUp: mockAnim,
    FadeIn: mockAnim,
    FadeOut: mockAnim,
    LinearTransition: mockAnim,
    useSharedValue: (init: any) => ({ value: init }),
  };
});

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
  }),
  useLocalSearchParams: () => ({}),
  useFocusEffect: jest.fn(),
  useNavigation: () => ({
    addListener: jest.fn(() => jest.fn()),
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('expo-linear-gradient', () => {
  const { View } = require('react-native');
  return {
    LinearGradient: ({ children, style }: any) => <View style={style}>{children}</View>,
  };
});

jest.mock('expo-blur', () => ({
  BlurView: ({ children }: any) => <>{children}</>,
}));

jest.mock('../components/ui/ConfirmSheet', () => {
  const { View, Text, Pressable } = require('react-native');
  const Sheet = ({ visible, title, message, onConfirm, onCancel }: any) => visible ? (
    <View testID="subscription-confirm-sheet">
      <Text>{title}</Text>
      <Text>{message}</Text>
      <Pressable testID="confirm-subscription-button" onPress={onConfirm} />
      <Pressable testID="cancel-subscription-button" onPress={onCancel} />
    </View>
  ) : null;
  return { __esModule: true, ConfirmSheet: Sheet, default: Sheet };
});

jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

const mockColors = {
  background: '#0B0F19',
  surfaceBg: '#131B2E',
  cardBg: '#1A232E',
  cardBorder: '#1E293B',
  accent: '#3B82F6',
  accentSecondary: '#6366F1',
  accentTertiary: '#15803d',
  gold: '#F59E0B',
  warning: '#EAB308',
  error: '#EF4444',
  success: '#10B981',
  textPrimary: '#F8FAFC',
  textSecondary: '#94A3B8',
  textTertiary: '#64748B',
  textOnAccent: '#090C0E',
  surfaceElevated: '#1E293B',
};

const mockTheme = { colors: mockColors, themeName: 'dark', setTheme: jest.fn() };
jest.mock('../context/ThemeContext', () => ({
  useTheme: () => mockTheme,
}));

jest.mock('../supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
    })),
    auth: {
      signOut: jest.fn().mockResolvedValue({ error: null }),
    },
  },
}));

const mockBannerActions = { showBanner: jest.fn() };
const mockBannerState = { notifications: [], markAllRead: jest.fn(), clearAll: jest.fn() };
jest.mock('../context/NotificationBannerContext', () => ({
  useNotificationBannerActions: () => mockBannerActions,
  useNotificationBanner: () => mockBannerState,
}));

const mockGamificareData = { streak: 3, puncte: 50, insigne: [] };
jest.mock('../context/GamificareContext', () => ({
  useGamificareData: () => mockGamificareData,
}));

const mockResponsiveLayout = { scrollPaddingTop: 0, scrollPaddingBottom: 0, horizontalPadding: 16 };
jest.mock('../hooks/useResponsiveLayout', () => ({
  useResponsiveLayout: () => mockResponsiveLayout,
}));

jest.mock('../lib/notificationConsent', () => ({
  getConsent: jest.fn(async () => ({ grantedAt: 'consented' })),
  cancelManagedReminders: jest.fn(),
}));

jest.mock('../lib/sincronizeazaTargeturi', () => ({
  citesteTargeturiPending: jest.fn(async () => null),
  salveazaTargeturiPending: jest.fn(),
  stergeTargeturiPending: jest.fn(),
}));

jest.mock('../lib/offlineQueue', () => ({
  clearOfflineQueue: jest.fn(),
}));

jest.mock('../lib/accountDeletion', () => ({
  finalizeConfirmedAccountDeletion: jest.fn(),
}));

jest.mock('../lib/gdprExport', () => ({
  buildCompleteUserExport: jest.fn(),
  fetchServerGdprExport: jest.fn(),
}));

jest.mock('../components/ui/KeyboardAwareScreen', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('../components/ui/FeedbackModal', () => ({
  FeedbackModal: () => null,
}));

jest.mock('../components/ui/DeleteAccountModal', () => ({
  DeleteAccountModal: () => null,
}));

jest.mock('../components/ui/WatchSelectorSheet', () => ({
  WatchSelectorSheet: () => null,
}));

jest.mock('../hooks/useReducedMotion', () => ({
  useReducedMotion: () => false,
}));

const mockBiometricsReturn = {
  isSupported: false,
  isEnabled: false,
  biometricType: 'Fingerprint',
  toggleBiometric: jest.fn(),
};
jest.mock('../hooks/useBiometrics', () => ({
  useBiometrics: () => mockBiometricsReturn,
}));

const mockHealthSyncReturn = {
  isEnabled: false,
  isSyncing: false,
  platformName: 'Google Fit',
  providerInfo: null,
  toggleSync: jest.fn(),
  syncNow: jest.fn(),
};
jest.mock('../hooks/useHealthSync', () => ({
  useHealthSync: () => mockHealthSyncReturn,
}));

const mockNotifyObj = {
  success: jest.fn(),
  warning: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
};
jest.mock('../hooks/useNotify', () => ({
  useNotify: () => mockNotifyObj,
}));

const mockNotificationsReturn = {
  enabled: false,
  toggleReminders: jest.fn(),
  isExpoGo: false,
  reminders: [],
  updateReminder: jest.fn(),
};
jest.mock('../hooks/useNotifications', () => ({
  useNotifications: () => mockNotificationsReturn,
}));

const mockPurchaseSubscription = jest.fn();
const mockRestore = jest.fn();
const mockRefreshProducts = jest.fn();

let mockPremiumState = {
  isPremium: false,
  isTester: false,
  isAdmin: false,
  loading: false,
  operation: { status: 'idle' },
  subscriptionPackages: [
    {
      id: 'premium_monthly',
      title: 'GetFlow Premium Monthly',
      description: 'Monthly auto-renewing subscription',
      offers: [
        {
          offerToken: 'token_monthly_base',
          basePlanId: 'monthly-base',
          offerId: null,
          displayPrice: '29,99 RON',
          currencyCode: 'RON',
          priceAmountMicros: '29990000',
          billingPeriod: 'P1M',
          phases: [
            {
              priceFormatted: '29,99 RON',
              priceCurrencyCode: 'RON',
              billingPeriod: 'P1M',
              recurrenceMode: 1,
            },
          ],
        },
      ],
    },
    {
      id: 'premium_annual',
      title: 'GetFlow Premium Annual',
      description: 'Annual auto-renewing subscription',
      offers: [
        {
          offerToken: 'token_annual_base',
          basePlanId: 'annual-base',
          offerId: null,
          displayPrice: '199,99 RON',
          currencyCode: 'RON',
          priceAmountMicros: '199990000',
          billingPeriod: 'P1Y',
          phases: [
            {
              priceFormatted: '199,99 RON',
              priceCurrencyCode: 'RON',
              billingPeriod: 'P1Y',
              recurrenceMode: 1,
            },
          ],
        },
      ],
    },
  ],
  purchasesAvailable: true,
  purchaseSubscription: mockPurchaseSubscription,
  refreshProducts: mockRefreshProducts,
  restore: mockRestore,
};

jest.mock('../context/PremiumContext', () => ({
  PREMIUM_PACKAGE_IDS: ['premium_monthly', 'premium_annual'],
  usePremium: () => mockPremiumState,
}));

const mockFlowOpen = jest.fn();
const mockFlowClose = jest.fn();
const mockWatchRewarded = jest.fn();
const mockPurchaseCredits = jest.fn();

let mockFlowState = {
  balance: {
    dailyRemaining: 2,
    rewarded: 1,
    purchased: 5,
    total: 8,
    rewardedGrantsRemaining: 4,
    serverDay: '2026-09-23',
  },
  loading: false,
  unlimited: false,
  visible: false,
  rewardState: 'idle' as const,
  creditProducts: [
    {
      id: 'getflow_credits_10',
      title: '10 Flow Credits',
      description: '10 photo analyses',
      displayPrice: '9,99 RON',
      currency: 'RON',
    },
    {
      id: 'getflow_credits_30',
      title: '30 Flow Credits',
      description: '30 photo analyses',
      displayPrice: '24,99 RON',
      currency: 'RON',
    },
  ],
  open: mockFlowOpen,
  close: mockFlowClose,
  refresh: jest.fn(),
  watchRewarded: mockWatchRewarded,
  purchase: mockPurchaseCredits,
};

jest.mock('../context/FlowCreditsContext', () => ({
  useFlowCredits: () => mockFlowState,
}));

const mockSession = {
  user: { id: 'test-user-123', email: 'test@example.com', user_metadata: {} },
  access_token: 'valid-token',
};
const mockUser = {
  id: 'test-user-123',
  email: 'test@example.com',
  user_metadata: {},
};
const mockAuthReturn = {
  session: mockSession,
  user: mockUser,
  loadingAuth: false,
};

jest.mock('../context/AuthContext', () => ({
  useAuth: () => mockAuthReturn,
}));

const mockAdsReturn = {
  privacyOptionsRequired: false,
  showPrivacyOptions: jest.fn(),
  recordChatUserMessage: jest.fn(),
  maybeShowInterstitial: jest.fn(),
};

jest.mock('../context/AdsContext', () => ({
  useAds: () => mockAdsReturn,
}));

import { render, fireEvent, waitFor } from '@testing-library/react-native';
import PaywallScreen from '../app/paywall';
import ProfilScreen from '../app/(tabs)/profil';
import { FlowCreditsModalHost } from '../components/FlowCreditsModalHost';
import { FlowCreditsPill } from '../components/FlowCreditsPill';
import {
  evaluateAdEligibility,
  recordChatUserMessage,
  AD_GATE_INITIAL_STATE,
  type AdGateState,
} from '../lib/ads/adGate';
import i18n from '../i18n';

describe('Monetization Forensic Remediation Test Suite', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPremiumState.isPremium = false;
    mockPremiumState.isTester = false;
    mockPremiumState.isAdmin = false;
    mockPremiumState.loading = false;
    mockPremiumState.operation = { status: 'idle' };
    mockFlowState.visible = false;
    mockFlowState.unlimited = false;
  });

  describe('1. Store-Authoritative Subscriptions on Paywall', () => {
    test('renders store-authoritative prices for monthly and annual without hardcoded fallbacks', async () => {
      const view = await render(<PaywallScreen />);
      expect(view.getByText('29,99 RON')).toBeTruthy();
      expect(view.getByText('199,99 RON')).toBeTruthy();
    });

    test('purchasing subscription triggers purchaseSubscription with selected offer', async () => {
      const view = await render(<PaywallScreen />);
      const ctaBtn = view.getByTestId('purchase-cta-button');
      fireEvent.press(ctaBtn);
      expect(mockPurchaseSubscription).not.toHaveBeenCalled();
      await waitFor(() => expect(view.getByTestId('subscription-confirm-sheet')).toBeTruthy());
      fireEvent.press(view.getByTestId('confirm-subscription-button'));
      expect(mockPurchaseSubscription).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'premium_annual' }),
        expect.objectContaining({ offerToken: 'token_annual_base' })
      );
    });

    test('paywall features a cross-link to Flow Credits packs', async () => {
      const view = await render(<PaywallScreen />);
      const creditsOption = view.getByTestId('paywall-credits-option');
      expect(creditsOption).toBeTruthy();
      fireEvent.press(creditsOption);
      expect(mockFlowOpen).toHaveBeenCalledTimes(1);
    });

    test('already owned subscription renders active state without purchase CTA', async () => {
      mockPremiumState.isPremium = true;
      const view = await render(<PaywallScreen />);
      expect(view.getByTestId('premium-active-view')).toBeTruthy();
      expect(view.queryByTestId('purchase-cta-button')).toBeNull();
    });
  });

  describe('2. Flow Credits Packs & Pill Discovery', () => {
    test('FlowCreditsPill displays correct total and opens modal on tap', async () => {
      const view = await render(<FlowCreditsPill />);
      expect(view.getByText('8')).toBeTruthy();
      fireEvent.press(view.getByRole('button'));
      expect(mockFlowOpen).toHaveBeenCalledTimes(1);
    });

    test('FlowCreditsModalHost displays credit packs with store prices and purchase triggers', async () => {
      mockFlowState.visible = true;
      const view = await render(<FlowCreditsModalHost />);
      expect(view.getByText('10 Flow Credits')).toBeTruthy();
      expect(view.getByText('30 Flow Credits')).toBeTruthy();
      expect(view.getByText('9,99 RON')).toBeTruthy();
      expect(view.getByText('24,99 RON')).toBeTruthy();

      fireEvent.press(view.getByText('10 Flow Credits'));
      expect(mockPurchaseCredits).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'getflow_credits_10' })
      );
    });

    test('FlowCreditsModalHost displays watch ad button with rewarded state', async () => {
      mockFlowState.visible = true;
      const view = await render(<FlowCreditsModalHost />);
      const adBtn = view.getByText(i18n.t('flowCredits.watchAd'));
      expect(adBtn).toBeTruthy();
      fireEvent.press(adBtn);
      expect(mockWatchRewarded).toHaveBeenCalledTimes(1);
    });
  });

  describe('3. Profile Discovery of Monetization Surfaces', () => {
    test('Profile includes both GetFlow Premium and Flow Credits cards', async () => {
      const view = await render(<ProfilScreen />);
      const card = await waitFor(() => view.getByTestId('profile-flow-credits-card'), { timeout: 4000 });
      expect(card).toBeTruthy();
      fireEvent.press(card);
      expect(mockFlowOpen).toHaveBeenCalledTimes(1);
    });
  });

  describe('4. Chat Interstitial Gate Semantics', () => {
    const chatOpts = { hasFullAccess: false, nowMs: 1000000, source: 'chat' as const, everyN: 15, minIntervalSeconds: 600 };

    test('chat interstitial requires exactly 15 user messages', () => {
      let state: AdGateState = { ...AD_GATE_INITIAL_STATE };
      for (let i = 1; i <= 14; i++) {
        state = recordChatUserMessage(state);
        expect(evaluateAdEligibility(state, chatOpts).eligible).toBe(false);
      }
      state = recordChatUserMessage(state);
      expect(state.chatMessageCount).toBe(15);
      const decision = evaluateAdEligibility(state, chatOpts);
      expect(decision.eligible).toBe(true);
      expect(decision.nextStateIfAttempted.chatMessageCount).toBe(0);
      expect(decision.nextStateIfAttempted.lastAdShownAtMs).toBe(1000000);
    });

    test('chat interstitial suppressed for users with Full Access', () => {
      let state: AdGateState = { ...AD_GATE_INITIAL_STATE, chatMessageCount: 15 };
      const decision = evaluateAdEligibility(state, { ...chatOpts, hasFullAccess: true });
      expect(decision.eligible).toBe(false);
      expect(decision.reason).toBe('full-access');
    });

    test('chat interstitial enforces shared 600s cooldown', () => {
      let state: AdGateState = { ...AD_GATE_INITIAL_STATE, chatMessageCount: 15, lastAdShownAtMs: 800000 };
      // 1000000 - 800000 = 200s < 600s
      const decision = evaluateAdEligibility(state, chatOpts);
      expect(decision.eligible).toBe(false);
      expect(decision.reason).toBe('min-interval');
    });
  });

  describe('5. Localization Integrity across RO / EN / FR / DE', () => {
    const fs = require('fs');
    const path = require('path');
    const locales = ['ro', 'en', 'fr', 'de'];

    test('all locales define required monetization keys without raw fallbacks', () => {
      for (const lang of locales) {
        const file = path.resolve(__dirname, `../i18n/locales/${lang}.json`);
        const json = JSON.parse(fs.readFileSync(file, 'utf8'));

        // Paywall
        expect(json.paywall?.badge).toBeTruthy();
        expect(json.paywall?.title).toBeTruthy();
        expect(json.paywall?.plans?.monthly).toBeTruthy();
        expect(json.paywall?.plans?.annual).toBeTruthy();
        expect(json.paywall?.creditsOption?.title).toBeTruthy();
        expect(json.paywall?.creditsOption?.cta).toBeTruthy();

        // Flow Credits
        expect(json.flowCredits?.title).toBeTruthy();
        expect(json.flowCredits?.getCredits).toBeTruthy();
        expect(json.flowCredits?.watchAd).toBeTruthy();
        expect(json.flowCredits?.upgradePremium).toBeTruthy();

        // Profile
        expect(json.profile?.premiumTitle).toBeTruthy();
        expect(json.profile?.flowCreditsTitle).toBeTruthy();
        expect(json.profile?.flowCreditsA11y).toBeTruthy();

        // Camera Quota
        expect(json.camera?.quotaExceededTitle).toBeTruthy();
        expect(json.camera?.quotaExceededMessage).toBeTruthy();
      }
    });
  });
});
