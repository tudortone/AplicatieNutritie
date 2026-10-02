import React from 'react';
import { render, fireEvent, cleanup, act } from '@testing-library/react-native';
import { MasaCard } from '../components/MasaCard';
import { MealDetailsSheet, type MealDetailsSheetRef } from '../components/MealDetailsModal';
import { PremiumPhotoPreview } from '../components/jurnal/PremiumPhotoPreview';
import type { Masa } from '../types';
import type { PremiumStatus } from '../context/PremiumContext';

// Mocks
const mockPush = jest.fn();
const mockBillingPurchase = jest.fn();

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 24, right: 0, bottom: 16, left: 0 }),
}));

jest.mock('../supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
          single: jest.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    }),
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
    },
  },
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    back: jest.fn(),
  }),
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
    FadeOut: chain,
    SlideInDown: chain,
    SlideOutDown: chain,
    useSharedValue: (init: any) => ({ value: init }),
    useAnimatedStyle: () => ({}),
  };
});

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(),
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
}));

jest.mock('@gorhom/bottom-sheet', () => {
  const { View } = require('react-native');
  const React2 = require('react');
  return {
    BottomSheetModal: React2.forwardRef(({ children }: { children: React.ReactNode }, ref: React.Ref<unknown>) => {
      React2.useImperativeHandle(ref, () => ({ present: jest.fn(), dismiss: jest.fn() }));
      return React2.createElement(View, null, children);
    }),
    BottomSheetScrollView: ({ children }: { children: React.ReactNode }) => React2.createElement(View, null, children),
    BottomSheetBackdrop: () => null,
  };
});

jest.mock('../components/food/FoodDetailModal', () => {
  const React2 = require('react');
  return {
    FoodDetailSheet: React2.forwardRef((_props: any, _ref: any) => null),
  };
});

jest.mock('../components/food/EditAlimentModal', () => {
  const React2 = require('react');
  return {
    EditAlimentSheet: React2.forwardRef((_props: any, _ref: any) => null),
  };
});

jest.mock('expo-linear-gradient', () => {
  const { View } = require('react-native');
  return {
    LinearGradient: ({ children, style }: any) => <View style={style}>{children}</View>,
  };
});

jest.mock('expo-image', () => {
  const { View } = require('react-native');
  return {
    Image: (props: any) => {
      // Retain testID and accessibility props to inspect in tests
      return <View testID="expo-image-mock" {...props} />;
    },
  };
});

jest.mock('../hooks/useReducedMotion', () => ({
  useReducedMotion: () => false,
}));

let mockCurrentPremiumState: Partial<PremiumStatus> = {
  isPremium: false,
  hasFullAccess: false,
  accessTier: 'free',
  isTester: false,
  isAdmin: false,
  purchasesAvailable: true,
  loading: false,
  operation: { status: 'idle' },
  subscriptionPackages: [],
  refresh: jest.fn(),
  refreshProducts: jest.fn(),
  purchaseSubscription: mockBillingPurchase,
  restore: jest.fn(),
};

jest.mock('../context/PremiumContext', () => ({
  usePremium: () => mockCurrentPremiumState,
}));

jest.mock('../context/ThemeContext', () => ({
  useTheme: () => ({
    themeName: 'midnight',
    colors: {
      background: '#090C0E',
      surfaceBg: '#12161A',
      cardBorder: 'rgba(255, 255, 255, 0.08)',
      textPrimary: '#FFFFFF',
      textSecondary: '#94A3B8',
      textTertiary: '#64748B',
      accent: '#CCFF00',
      accentSecondary: '#A855F7',
      accentTertiary: '#00F0FF',
      gold: '#FFD45A',
      warning: '#F59E0B',
      success: '#10B981',
      danger: '#EF4444',
    },
  }),
}));

const translations: Record<string, string> = {
  'jurnal.viewMealPhoto': 'Vezi poza mesei și detaliile',
  'jurnal.unlockMealPhotos': 'Deblochează pozele meselor cu Premium',
  'jurnal.unlockPremium': 'Deblochează cu Premium',
  'jurnal.premiumPhotoPreviewTitle': 'Istoric vizual al meselor',
  'jurnal.premiumPhotoPreviewLine1': 'Înregistrări cu poze pentru recunoaștere rapidă a fiecărei mese.',
  'jurnal.premiumPhotoPreviewLine2': 'Construiește o cronologie nutritivă completă cu GetFlow Premium.',
  'jurnal.premiumPhotoBadge': 'PREMIUM FOTO JURNAL',
  'jurnal.macroProtein': 'Proteine',
  'jurnal.macroCarbs': 'Carbohidrați',
  'jurnal.macroFats': 'Grăsimi',
  'jurnal.macroFiber': 'Fibre',
  'jurnal.mealA11y': 'Masa {{nume}}, {{kcal}} kcal',
  'jurnal.editMeal': 'Editează masa',
  'jurnal.deleteMeal': 'Șterge masa',
};

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: any) => {
      let res = translations[key] || key;
      if (options?.nume) res = res.replace('{{nume}}', options.nume);
      if (options?.kcal !== undefined) res = res.replace('{{kcal}}', String(options.kcal));
      return res;
    },
  }),
}));

const sampleMealWithPhoto: Masa = {
  id: 'masa-uuid-999',
  user_id: 'user-uuid-111',
  nume: 'Prânz mediteranean cu somon',
  calorii: 580,
  proteine: 42,
  carbohidrati: 38,
  grasimi: 22,
  fibre: 6,
  tip_masa: 'pranz',
  created_at: '2026-09-25T12:30:00.000Z',
  imagine_url: 'https://ik.imagekit.io/abc123/camera/user_salmon_lunch_secret.jpg',
  alimente: [
    {
      nume: 'Somon la cuptor',
      grame: 200,
      calorii: 400,
      proteine: 38,
      carbohidrati: 0,
      grasimi: 22,
      fibre: 0,
    },
  ],
};

describe('GetFlow Premium Meal Photo Locked Experience Redesign', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCurrentPremiumState = {
      isPremium: false,
      hasFullAccess: false,
      accessTier: 'free',
      isTester: false,
      isAdmin: false,
      purchasesAvailable: true,
      loading: false,
      operation: { status: 'idle' },
      subscriptionPackages: [],
      refresh: jest.fn(),
      refreshProducts: jest.fn(),
      purchaseSubscription: mockBillingPurchase,
      restore: jest.fn(),
    };
  });

  afterEach(async () => {
    await cleanup();
  });

  describe('1. Free User Behavior', () => {
    it('free user → real image is NOT rendered (user photo URI completely absent from DOM)', async () => {
      mockCurrentPremiumState.hasFullAccess = false;
      mockCurrentPremiumState.isPremium = false;
      mockCurrentPremiumState.accessTier = 'free';

      const screen = await render(
        <MasaCard
          masa={sampleMealWithPhoto}
          onPress={jest.fn()}
          onEdit={jest.fn()}
          onDelete={jest.fn()}
          afisarePoze={true}
        />
      );

      // Verify no expo-image element has the user's secret photo URI
      const renderedImages = screen.queryAllByTestId('expo-image-mock');
      expect(renderedImages.length).toBe(0);

      // Raw inspection of entire serialized tree guarantees no URI leak
      const json = JSON.stringify(screen.toJSON());
      expect(json).not.toContain('user_salmon_lunch_secret');
      expect(json).not.toContain('https://ik.imagekit.io/abc123/camera');
    });

    it('free user → Premium preview is rendered with benefits and decorative timeline', async () => {
      mockCurrentPremiumState.hasFullAccess = false;
      mockCurrentPremiumState.isPremium = false;
      mockCurrentPremiumState.accessTier = 'free';

      const screen = await render(
        <MasaCard
          masa={sampleMealWithPhoto}
          onPress={jest.fn()}
          onEdit={jest.fn()}
          onDelete={jest.fn()}
          afisarePoze={true}
        />
      );

      // Premium preview surface is mounted
      const preview = screen.getByTestId('premium-photo-preview');
      expect(preview).toBeTruthy();

      // Title & badge
      expect(screen.getByText('PREMIUM FOTO JURNAL')).toBeTruthy();
      expect(screen.getByText('Istoric vizual al meselor')).toBeTruthy();

      // Benefit copy
      expect(
        screen.getByText('Înregistrări cu poze pentru recunoaștere rapidă a fiecărei mese.')
      ).toBeTruthy();

      // Visual timeline demonstration elements (safe decorative times)
      expect(screen.getByText('08:30', { includeHiddenElements: true })).toBeTruthy();
      expect(screen.getByText('13:15', { includeHiddenElements: true })).toBeTruthy();
      expect(screen.getByText('19:45', { includeHiddenElements: true })).toBeTruthy();

      // Clear CTA exists
      const cta = screen.getByTestId('premium-photo-unlock-cta');
      expect(cta).toBeTruthy();
      expect(screen.getByText('Deblochează cu Premium')).toBeTruthy();
    });

    it('CTA → opens paywall route and does NOT trigger card meal click', async () => {
      mockCurrentPremiumState.hasFullAccess = false;
      mockCurrentPremiumState.isPremium = false;

      const mockOnPressMeal = jest.fn();

      const screen = await render(
        <MasaCard
          masa={sampleMealWithPhoto}
          onPress={mockOnPressMeal}
          onEdit={jest.fn()}
          onDelete={jest.fn()}
          afisarePoze={true}
        />
      );

      const cta = screen.getByTestId('premium-photo-unlock-cta');
      fireEvent.press(cta);

      // Navigated to paywall
      expect(mockPush).toHaveBeenCalledWith('/paywall');
      // Did NOT trigger meal details
      expect(mockOnPressMeal).not.toHaveBeenCalled();
    });

    it('CTA → Billing is NOT directly invoked (paywall remains authoritative)', async () => {
      mockCurrentPremiumState.hasFullAccess = false;
      mockCurrentPremiumState.isPremium = false;

      const screen = await render(
        <MasaCard
          masa={sampleMealWithPhoto}
          onPress={jest.fn()}
          onEdit={jest.fn()}
          onDelete={jest.fn()}
          afisarePoze={true}
        />
      );

      const cta = screen.getByTestId('premium-photo-unlock-cta');
      fireEvent.press(cta);

      // Verify billing service was never called directly
      expect(mockBillingPurchase).not.toHaveBeenCalled();
    });
  });

  describe('2. Premium User Behavior', () => {
    it('premium user → actual image is rendered normally with photo URI', async () => {
      mockCurrentPremiumState.hasFullAccess = true;
      mockCurrentPremiumState.isPremium = true;
      mockCurrentPremiumState.accessTier = 'premium';

      const screen = await render(
        <MasaCard
          masa={sampleMealWithPhoto}
          onPress={jest.fn()}
          onEdit={jest.fn()}
          onDelete={jest.fn()}
          afisarePoze={true}
        />
      );

      // Premium preview must NOT be rendered
      expect(screen.queryByTestId('premium-photo-preview')).toBeNull();

      // Real image must be rendered
      const renderedImages = screen.getAllByTestId('expo-image-mock');
      expect(renderedImages.length).toBe(1);

      // Verify image source points to the meal photo
      expect(renderedImages[0].props.source.uri).toContain('user_salmon_lunch_secret');
    });

    it('clicking image on premium user calls onPress for meal details', async () => {
      mockCurrentPremiumState.hasFullAccess = true;
      mockCurrentPremiumState.isPremium = true;

      const mockOnPressMeal = jest.fn();

      const screen = await render(
        <MasaCard
          masa={sampleMealWithPhoto}
          onPress={mockOnPressMeal}
          onEdit={jest.fn()}
          onDelete={jest.fn()}
          afisarePoze={true}
        />
      );

      const imageButton = screen.getByLabelText('Vezi poza mesei și detaliile');
      fireEvent.press(imageButton);

      expect(mockOnPressMeal).toHaveBeenCalledWith(sampleMealWithPhoto);
      expect(mockPush).not.toHaveBeenCalled();
    });
  });

  describe('3. Account Switch & Entitlement Transitions', () => {
    it('dynamically adapts from Free preview to Premium photo when user subscribes/switches', async () => {
      // 1. Initial Free user
      mockCurrentPremiumState.hasFullAccess = false;
      mockCurrentPremiumState.isPremium = false;
      function TestHost({ isPremium }: { isPremium: boolean }) {
        return (
          <MasaCard
            key={isPremium ? 'premium-user' : 'free-user'}
            masa={sampleMealWithPhoto}
            onPress={jest.fn()}
            onEdit={jest.fn()}
            onDelete={jest.fn()}
            afisarePoze={true}
          />
        );
      }

      const { rerender, queryByTestId, getAllByTestId, queryAllByTestId } = await render(
        <TestHost isPremium={false} />
      );

      expect(queryByTestId('premium-photo-preview')).toBeTruthy();
      expect(queryAllByTestId('expo-image-mock').length).toBe(0);

      // 2. User upgrades to Premium or switches to subscribed account
      mockCurrentPremiumState.hasFullAccess = true;
      mockCurrentPremiumState.isPremium = true;
      mockCurrentPremiumState.accessTier = 'premium';

      await rerender(<TestHost isPremium={true} />);

      expect(queryByTestId('premium-photo-preview')).toBeNull();
      const images = getAllByTestId('expo-image-mock');
      expect(images.length).toBe(1);
      expect(images[0].props.source.uri).toContain('user_salmon_lunch_secret');

      // 3. User subscription expires or switches back to free account
      mockCurrentPremiumState.hasFullAccess = false;
      mockCurrentPremiumState.isPremium = false;
      mockCurrentPremiumState.accessTier = 'free';

      await rerender(<TestHost isPremium={false} />);

      expect(queryByTestId('premium-photo-preview')).toBeTruthy();
      expect(queryAllByTestId('expo-image-mock').length).toBe(0);
    });
  });

  describe('4. Standalone PremiumPhotoPreview Component', () => {
    it('renders modal variant with secondary supporting copy and handles custom paywall callback', async () => {
      const customPaywallCallback = jest.fn();

      const screen = await render(
        <PremiumPhotoPreview
          variant="modal"
          onPressPaywall={customPaywallCallback}
        />
      );

      expect(screen.getByTestId('premium-photo-preview')).toBeTruthy();
      expect(
        screen.getByText('Construiește o cronologie nutritivă completă cu GetFlow Premium.')
      ).toBeTruthy();

      const cta = screen.getByTestId('premium-photo-unlock-cta');
      fireEvent.press(cta);

      expect(customPaywallCallback).toHaveBeenCalledTimes(1);
      expect(mockPush).not.toHaveBeenCalled();
      expect(mockBillingPurchase).not.toHaveBeenCalled();
    });

    it('falls back to router.push("/paywall") if onPressPaywall is not provided', async () => {
      const screen = await render(<PremiumPhotoPreview variant="card" />);

      const cta = screen.getByTestId('premium-photo-unlock-cta');
      fireEvent.press(cta);

      expect(mockPush).toHaveBeenCalledWith('/paywall');
      expect(mockBillingPurchase).not.toHaveBeenCalled();
    });
  });

  describe('5. MealDetailsSheet Modal Experience', () => {
    it('free user opening meal details sheet sees Premium preview and NOT real photo', async () => {
      mockCurrentPremiumState.hasFullAccess = false;
      mockCurrentPremiumState.isPremium = false;
      mockCurrentPremiumState.accessTier = 'free';

      const ref = React.createRef<MealDetailsSheetRef>();
      const screen = await render(<MealDetailsSheet ref={ref} />);

      await act(async () => {
        ref.current?.open(sampleMealWithPhoto);
      });

      expect(screen.getByTestId('premium-photo-preview')).toBeTruthy();
      const images = screen.queryAllByTestId('expo-image-mock');
      expect(images.length).toBe(0);
      expect(JSON.stringify(screen.toJSON())).not.toContain('user_salmon_lunch_secret');
    });

    it('premium user opening meal details sheet sees actual photo', async () => {
      mockCurrentPremiumState.hasFullAccess = true;
      mockCurrentPremiumState.isPremium = true;
      mockCurrentPremiumState.accessTier = 'premium';

      const ref = React.createRef<MealDetailsSheetRef>();
      const screen = await render(<MealDetailsSheet ref={ref} />);

      await act(async () => {
        ref.current?.open(sampleMealWithPhoto);
      });

      expect(screen.queryByTestId('premium-photo-preview')).toBeNull();
      const images = screen.getAllByTestId('expo-image-mock');
      expect(images.length).toBe(1);
      expect(images[0].props.source.uri).toContain('user_salmon_lunch_secret');
    });
  });
});
