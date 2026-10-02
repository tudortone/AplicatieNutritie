import React from 'react';
import { StyleSheet } from 'react-native';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import '../i18n';
import i18n from '../i18n';
import PaywallScreen from '../app/paywall';
import type { BillingOffer, BillingProduct } from '../lib/billing/types';
import type { PremiumStatus } from '../context/PremiumContext';

const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockCanGoBack = jest.fn(() => true);
jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockBack,
    replace: mockReplace,
    canGoBack: mockCanGoBack,
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

let mockSubscriptionConfirm: (() => void) | null = null;
jest.mock('../components/ui/ConfirmSheet', () => {
  const { View, Text, Pressable } = require('react-native');
  const Sheet = ({
    visible,
    title,
    message,
    confirmLabel,
    cancelLabel,
    onConfirm,
    onCancel,
  }: any) => {
    if (!visible) return null;
    mockSubscriptionConfirm = onConfirm;
    return (
      <View testID="subscription-confirm-sheet">
        <Text>{title}</Text>
        <Text>{message}</Text>
        <Pressable onPress={onConfirm}><Text>{confirmLabel}</Text></Pressable>
        <Pressable onPress={onCancel}><Text>{cancelLabel}</Text></Pressable>
      </View>
    );
  };
  return { __esModule: true, ConfirmSheet: Sheet, default: Sheet };
});

const mockColors = {
  background: '#0B0F19',
  surfaceBg: '#131B2E',
  cardBorder: '#1E293B',
  accent: '#3B82F6',
  accentSecondary: '#6366F1',
  gold: '#F59E0B',
  warning: '#EAB308',
  error: '#EF4444',
  success: '#10B981',
  textPrimary: '#F8FAFC',
  textSecondary: '#94A3B8',
  textTertiary: '#64748B',
};

jest.mock('../context/ThemeContext', () => ({
  useTheme: () => ({ colors: mockColors }),
}));

const mockNotify = {
  success: jest.fn(),
  warning: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
};

jest.mock('../hooks/useNotify', () => ({
  useNotify: () => mockNotify,
}));

jest.mock('../lib/legalUrls', () => ({
  getLegalUrls: () => ({
    termsUrl: 'https://getflow.example/terms',
    privacyUrl: 'https://getflow.example/privacy',
  }),
}));

const mockPurchaseSubscription = jest.fn();
const mockRestore = jest.fn();
const mockRefreshProducts = jest.fn();
const mockRefresh = jest.fn();

let mockPremiumState: PremiumStatus;

jest.mock('../supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(async () => ({ data: { session: null } })),
    },
  },
}));

jest.mock('../context/PremiumContext', () => ({
  PREMIUM_PACKAGE_IDS: ['premium_monthly', 'premium_annual'],
  usePremium: () => mockPremiumState,
}));

function createMockMonthlyProduct(offerOverrides?: Partial<BillingOffer>): BillingProduct {
  return {
    id: 'premium_monthly',
    title: 'Premium lunar (GetFlow)',
    description: '',
    offers: [
      {
        basePlanId: 'monthly-base',
        offerId: null,
        offerToken: 'token-monthly-1',
        displayPrice: '29,99 RON',
        currencyCode: 'RON',
        billingPeriod: 'P1M',
        priceAmountMicros: '29990000',
        ...offerOverrides,
      },
    ],
  };
}

function createMockAnnualProduct(offerOverrides?: Partial<BillingOffer>): BillingProduct {
  return {
    id: 'premium_annual',
    title: 'Premium anual (GetFlow)',
    description: '',
    offers: [
      {
        basePlanId: 'annual-base',
        offerId: null,
        offerToken: 'token-annual-1',
        displayPrice: '199,99 RON',
        currencyCode: 'RON',
        billingPeriod: 'P1Y',
        priceAmountMicros: '199990000',
        ...offerOverrides,
      },
    ],
  };
}

function getDefaultPremiumState(): PremiumStatus {
  return {
    purchasesAvailable: true,
    isPremium: false,
    isTester: false,
    isAdmin: false,
    accessTier: 'free',
    hasFullAccess: false,
    loading: false,
    operation: { status: 'idle' },
    subscriptionPackages: [
      createMockMonthlyProduct(),
      createMockAnnualProduct(),
    ],
    refresh: mockRefresh,
    refreshProducts: mockRefreshProducts,
    purchaseSubscription: mockPurchaseSubscription,
    restore: mockRestore,
  };
}

describe('P0-07 Store-Authoritative Google Play Paywall', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    mockSubscriptionConfirm = null;
    await i18n.changeLanguage('ro');
    mockPremiumState = getDefaultPremiumState();
    mockPurchaseSubscription.mockResolvedValue(undefined);
    mockRestore.mockResolvedValue(true);
    mockRefreshProducts.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
  });

  test('1. store price rendered from actual ProductDetails', async () => {
    mockPremiumState.subscriptionPackages = [
      createMockMonthlyProduct({ displayPrice: '34,99 RON' }),
      createMockAnnualProduct({ displayPrice: '249,99 RON' }),
    ];
    const { getByText } = await render(<PaywallScreen />);
    expect(getByText('34,99 RON')).toBeTruthy();
    expect(getByText('249,99 RON')).toBeTruthy();
  });

  test('2. no hardcoded fallback price when store returns empty', async () => {
    mockPremiumState.subscriptionPackages = [];
    const { queryByText, getByTestId } = await render(<PaywallScreen />);
    expect(getByTestId('billing-unavailable-view')).toBeTruthy();
    expect(queryByText('29,99 RON')).toBeNull();
    expect(queryByText('199,99 RON')).toBeNull();
    expect(queryByText('29.99')).toBeNull();
  });

  test('3. correct currency/format from store (USD without hardcoded assumptions)', async () => {
    mockPremiumState.subscriptionPackages = [
      createMockMonthlyProduct({
        displayPrice: '$7.99',
        currencyCode: 'USD',
        priceAmountMicros: '7990000',
      }),
      createMockAnnualProduct({
        displayPrice: '$59.99',
        currencyCode: 'USD',
        priceAmountMicros: '59990000',
      }),
    ];
    const { getByText, queryByText } = await render(<PaywallScreen />);
    expect(getByText('$7.99')).toBeTruthy();
    expect(getByText('$59.99')).toBeTruthy();
    expect(queryByText(/RON/i)).toBeNull();
    expect(queryByText(/lei/i)).toBeNull();
  });

  test('4. multiple base plans handled deterministically', async () => {
    const multiBaseProduct: BillingProduct = {
      id: 'premium_monthly',
      title: 'Premium Lunar',
      description: '',
      offers: [
        {
          basePlanId: 'unsupported-base',
          offerId: 'wrong',
          offerToken: 'token-wrong',
          displayPrice: '1,99 RON',
          currencyCode: 'RON',
          billingPeriod: 'P1M',
        },
        {
          basePlanId: 'monthly-base',
          offerId: 'correct',
          offerToken: 'token-correct',
          displayPrice: '29,99 RON',
          currencyCode: 'RON',
          billingPeriod: 'P1M',
        },
      ],
    };
    mockPremiumState.subscriptionPackages = [multiBaseProduct];
    const { getByText, queryByText } = await render(<PaywallScreen />);
    expect(getByText('29,99 RON')).toBeTruthy();
    expect(queryByText('1,99 RON')).toBeNull();
  });

  test('5. eligible offer selected correctly', async () => {
    const productWithTrial: BillingProduct = {
      id: 'premium_annual',
      title: 'Premium Anual',
      description: '',
      offers: [
        {
          basePlanId: 'annual-base',
          offerId: 'base-offer',
          offerToken: 'token-base',
          displayPrice: '199,99 RON',
          currencyCode: 'RON',
          billingPeriod: 'P1Y',
        },
        {
          basePlanId: 'annual-base',
          offerId: 'trial-14d',
          offerToken: 'token-trial-14d',
          displayPrice: '199,99 RON',
          currencyCode: 'RON',
          billingPeriod: 'P1Y',
          trialPhase: {
            billingPeriod: 'P14D',
            priceCurrencyCode: 'RON',
            formattedPrice: '0,00 RON',
            priceAmountMicros: '0',
          },
        },
      ],
    };
    mockPremiumState.subscriptionPackages = [productWithTrial];
    const { getByText } = await render(<PaywallScreen />);
    expect(getByText('14 ZILE GRATUIT')).toBeTruthy();
  });

  test('6. missing offer → purchase disabled and unavailable shown', async () => {
    mockPremiumState.subscriptionPackages = [
      {
        id: 'premium_monthly',
        title: 'Premium',
        description: '',
        offers: [],
      },
    ];
    const { getByTestId, queryByTestId } = await render(<PaywallScreen />);
    expect(getByTestId('billing-unavailable-view')).toBeTruthy();
    expect(queryByTestId('purchase-cta-button')).toBeNull();
  });

  test('7. trial shown only when eligible', async () => {
    const productWithTrial = createMockAnnualProduct({
      trialPhase: {
        billingPeriod: 'P7D',
        priceCurrencyCode: 'RON',
        formattedPrice: '0,00 RON',
        priceAmountMicros: '0',
      },
    });
    mockPremiumState.subscriptionPackages = [productWithTrial];
    const { getByText } = await render(<PaywallScreen />);
    expect(getByText('7 ZILE GRATUIT')).toBeTruthy();
  });

  test('8. trial hidden when not eligible', async () => {
    const productWithoutTrial = createMockAnnualProduct({ trialPhase: null });
    mockPremiumState.subscriptionPackages = [productWithoutTrial];
    const { queryByText } = await render(<PaywallScreen />);
    expect(queryByText(/GRATUIT/i)).toBeNull();
    expect(queryByText(/FREE/i)).toBeNull();
    expect(queryByText(/trial/i)).toBeNull();
  });

  test('9. discount not fabricated (only shown when mathematically backed in same currency)', async () => {
    // 29.99 * 12 = 359.88, annual 199.99 -> 44% savings
    mockPremiumState.subscriptionPackages = [
      createMockMonthlyProduct(),
      createMockAnnualProduct(),
    ];
    const { getByText, rerender, queryByText } = await render(<PaywallScreen />);
    expect(getByText('Economisești 44%')).toBeTruthy();

    // Mismatched currency -> do not invent savings
    mockPremiumState.subscriptionPackages = [
      createMockMonthlyProduct({ currencyCode: 'EUR' }),
      createMockAnnualProduct({ currencyCode: 'RON' }),
    ];
    await rerender(<PaywallScreen />);
    expect(queryByText(/Economisești/i)).toBeNull();
  });

  test('10. billing loading state displays spinner without fake price', async () => {
    mockPremiumState.loading = true;
    mockPremiumState.subscriptionPackages = [];
    const { getByTestId, queryByText } = await render(<PaywallScreen />);
    expect(getByTestId('paywall-loading-view')).toBeTruthy();
    expect(queryByText('29,99 RON')).toBeNull();
    expect(queryByText('199,99 RON')).toBeNull();
  });

  test('11. billing unavailable state displayed when store query fails', async () => {
    mockPremiumState.purchasesAvailable = false;
    const { getByTestId, getByText } = await render(<PaywallScreen />);
    expect(getByTestId('billing-unavailable-view')).toBeTruthy();
    expect(getByText('Abonamente indisponibile temporar')).toBeTruthy();
  });

  test('12. retry product query invokes refreshProducts', async () => {
    mockPremiumState.purchasesAvailable = false;
    const { getByTestId } = await render(<PaywallScreen />);
    const retryBtn = getByTestId('retry-button');
    fireEvent.press(retryBtn);
    expect(mockRefreshProducts).toHaveBeenCalledTimes(1);
  });

  test('13. purchase double-tap prevented', async () => {
    mockPremiumState.operation = { status: 'purchasing' };
    const { getByTestId } = await render(<PaywallScreen />);
    const cta = getByTestId('purchase-cta-button');

    expect(cta.props.accessibilityState.disabled).toBe(true);
    fireEvent.press(cta);
    expect(mockPurchaseSubscription).not.toHaveBeenCalled();
  });

  test('13a. subscription CTA requires explicit confirmation before Google Play purchase', async () => {
    const { getByTestId, getByText } = await render(<PaywallScreen />);

    fireEvent.press(getByTestId('purchase-cta-button'));

    expect(mockPurchaseSubscription).not.toHaveBeenCalled();
    await waitFor(() => expect(getByTestId('subscription-confirm-sheet')).toBeTruthy());
    expect(getByText('Confirmă abonamentul')).toBeTruthy();
    expect(getByText('Confirmă și continuă')).toBeTruthy();
    expect(getByText('Renunță')).toBeTruthy();
  });

  test('13b. canceling subscription confirmation never starts billing', async () => {
    const { getByTestId, getByText, queryByText } = await render(<PaywallScreen />);

    fireEvent.press(getByTestId('purchase-cta-button'));
    await waitFor(() => expect(getByTestId('subscription-confirm-sheet')).toBeTruthy());
    fireEvent.press(getByText('Renunță'));

    expect(mockPurchaseSubscription).not.toHaveBeenCalled();
    await waitFor(() => expect(queryByText('Confirmă abonamentul')).toBeNull());
  });

  test('13c. confirming subscription starts exactly one purchase for the selected store offer', async () => {
    let resolvePurchase!: () => void;
    mockPurchaseSubscription.mockImplementation(
      () => new Promise<void>((resolve) => { resolvePurchase = resolve; }),
    );
    const { getByTestId, getByText } = await render(<PaywallScreen />);

    fireEvent.press(getByTestId('purchase-cta-button'));
    await waitFor(() => expect(getByTestId('subscription-confirm-sheet')).toBeTruthy());
    expect(getByText('Confirmă și continuă')).toBeTruthy();
    const confirm = mockSubscriptionConfirm;
    expect(confirm).not.toBeNull();
    await act(() => {
      confirm?.();
      confirm?.();
    });

    await waitFor(() => expect(mockPurchaseSubscription).toHaveBeenCalledTimes(1));
    expect(mockPurchaseSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'premium_annual' }),
      expect.objectContaining({ basePlanId: 'annual-base', offerToken: 'token-annual-1' }),
    );
    await waitFor(() => {
      expect(getByTestId('purchase-cta-button').props.accessibilityState.disabled).toBe(true);
    });
    await act(() => resolvePurchase());
    await waitFor(() => {
      expect(getByTestId('purchase-cta-button').props.accessibilityState.disabled).toBe(false);
    });
  });

  test('14. pending purchase shows pending banner without granting Premium success', async () => {
    mockPremiumState.operation = { status: 'pending' };
    mockPremiumState.isPremium = false;
    mockPremiumState.hasFullAccess = false;
    const { getByTestId, queryByTestId, getByText } = await render(<PaywallScreen />);
    expect(getByTestId('billing-pending-banner')).toBeTruthy();
    expect(getByText('Plată în așteptare')).toBeTruthy();
    expect(queryByTestId('premium-active-view')).toBeNull();
  });

  test('15. canceled purchase returns to retryable paywall without error modal or granting Premium', async () => {
    mockPremiumState.operation = { status: 'canceled' };
    mockPremiumState.isPremium = false;
    const { queryByTestId, getByTestId } = await render(<PaywallScreen />);
    expect(queryByTestId('billing-error-banner')).toBeNull();
    expect(queryByTestId('premium-active-view')).toBeNull();
    expect(getByTestId('purchase-cta-button')).toBeTruthy();
  });

  test('16. backend verification failure shows error banner without granting Premium', async () => {
    mockPremiumState.operation = { status: 'error', code: 'VERIFICATION_FAILED' };
    mockPremiumState.isPremium = false;
    mockPremiumState.hasFullAccess = false;
    const { getByTestId, queryByTestId, getByText } = await render(<PaywallScreen />);
    expect(getByTestId('billing-error-banner')).toBeTruthy();
    expect(getByText('Eroare la achiziție')).toBeTruthy();
    expect(queryByTestId('premium-active-view')).toBeNull();
  });

  test('17. server-confirmed Premium success displays active confirmation', async () => {
    mockPremiumState.isPremium = true;
    mockPremiumState.hasFullAccess = true;
    mockPremiumState.operation = { status: 'verified' };
    const { getByTestId, getByText, queryByTestId } = await render(<PaywallScreen />);
    expect(getByTestId('premium-active-view')).toBeTruthy();
    expect(getByText('Abonament activat!')).toBeTruthy();
    expect(queryByTestId('purchase-cta-button')).toBeNull();
  });

  test('18. restore uses server entitlement and reports result', async () => {
    const { getByTestId } = await render(<PaywallScreen />);
    const restoreBtn = getByTestId('restore-button');
    fireEvent.press(restoreBtn);

    await waitFor(() => {
      expect(mockRestore).toHaveBeenCalledTimes(1);
      expect(mockNotify.success).toHaveBeenCalledWith(
        'Achiziții restaurate',
        expect.any(String),
      );
    });
  });

  test('19. Tester does not require payment and sees tester active state', async () => {
    mockPremiumState.isTester = true;
    mockPremiumState.hasFullAccess = true;
    mockPremiumState.isPremium = false;
    const { getByTestId, getByText, queryByTestId } = await render(<PaywallScreen />);
    expect(getByTestId('tester-active-view')).toBeTruthy();
    expect(getByText('Acces de tester activ')).toBeTruthy();
    expect(queryByTestId('purchase-cta-button')).toBeNull();
    expect(queryByTestId('plan-card-monthly')).toBeNull();
    expect(queryByTestId('plan-card-annual')).toBeNull();
  });

  test('20. Premium user does not see normal purchase CTA', async () => {
    mockPremiumState.isPremium = true;
    mockPremiumState.hasFullAccess = true;
    mockPremiumState.operation = { status: 'idle' };
    const { getByTestId, getByText, queryByTestId } = await render(<PaywallScreen />);
    expect(getByTestId('premium-active-view')).toBeTruthy();
    expect(getByText('Ești deja abonat Premium')).toBeTruthy();
    expect(queryByTestId('purchase-cta-button')).toBeNull();
    expect(queryByTestId('plan-card-monthly')).toBeNull();
    expect(queryByTestId('plan-card-annual')).toBeNull();
  });

  test('21. RO localization displays correct Romanian copy', async () => {
    await act(async () => {
      await i18n.changeLanguage('ro');
    });
    const { getByText } = await render(<PaywallScreen />);
    expect(getByText('Deblochează potențialul tău maxim')).toBeTruthy();
    expect(getByText('Abonament Lunar')).toBeTruthy();
    expect(getByText('Abonament Anual')).toBeTruthy();
    expect(getByText('Restaurează achizițiile')).toBeTruthy();
  });

  test('22. EN localization displays correct English copy', async () => {
    await act(async () => {
      await i18n.changeLanguage('en');
    });
    const { getByText } = await render(<PaywallScreen />);
    expect(getByText('Unlock your full potential')).toBeTruthy();
    expect(getByText('Monthly Plan')).toBeTruthy();
    expect(getByText('Annual Plan')).toBeTruthy();
    expect(getByText('Restore purchases')).toBeTruthy();
  });

  test('23. FR localization displays correct French copy', async () => {
    await act(async () => {
      await i18n.changeLanguage('fr');
    });
    const { getByText } = await render(<PaywallScreen />);
    expect(getByText('Débloquez votre plein potentiel')).toBeTruthy();
    expect(getByText('Abonnement mensuel')).toBeTruthy();
    expect(getByText('Abonnement annuel')).toBeTruthy();
    expect(getByText('Restaurer les achats')).toBeTruthy();
  });

  test('24. DE localization displays correct German copy', async () => {
    await act(async () => {
      await i18n.changeLanguage('de');
    });
    const { getByText } = await render(<PaywallScreen />);
    expect(getByText('Entfesseln Sie Ihr volles Potenzial')).toBeTruthy();
    expect(getByText('Monatsabonnement')).toBeTruthy();
    expect(getByText('Jahresabonnement')).toBeTruthy();
    expect(getByText('Käufe wiederherstellen')).toBeTruthy();
  });

  test('25. long German/French layout renders flexibly without clipping', async () => {
    await act(async () => {
      await i18n.changeLanguage('de');
    });
    const { getByTestId, getByText } = await render(<PaywallScreen />);
    const annualCard = getByTestId('plan-card-annual');
    const monthlyCard = getByTestId('plan-card-monthly');
    expect(annualCard).toBeTruthy();
    expect(monthlyCard).toBeTruthy();

    const annualStyle = StyleSheet.flatten(annualCard.props.style);
    expect(annualStyle.minHeight).toBeGreaterThanOrEqual(140);
    expect(annualStyle.paddingHorizontal).toBeDefined();

    expect(getByText('Jahresabonnement')).toBeTruthy();
    expect(getByText('Monatsabonnement')).toBeTruthy();
  });
});
