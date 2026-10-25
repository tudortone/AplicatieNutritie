import React from 'react';
import { Alert, Platform } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

// Mock expo-image-picker
const mockRequestPermissions = jest.fn();
const mockLaunchImageLibrary = jest.fn();

jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: (...args: unknown[]) => mockRequestPermissions(...args),
  launchImageLibraryAsync: (...args: unknown[]) => mockLaunchImageLibrary(...args),
}));

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// Mock expo-router
const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  canGoBack: jest.fn(() => true),
};
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useFocusEffect: jest.fn((cb) => {
    // optional focus trigger
  }),
  useNavigation: () => ({
    addListener: jest.fn(() => jest.fn()),
  }),
}));

const mockTakePictureAsync = jest.fn(async () => ({ uri: 'file:///mock-camera-capture.jpg' }));

// Mock expo-camera
jest.mock('expo-camera', () => {
  const React = require('react');
  const { View } = require('react-native');
  const MockCameraView = React.forwardRef(({ children, onCameraReady }: any, ref: any) => {
    React.useImperativeHandle(ref, () => ({
      takePictureAsync: mockTakePictureAsync,
    }));
    React.useEffect(() => {
      onCameraReady?.();
    }, [onCameraReady]);
    return <View testID="camera-view">{children}</View>;
  });
  MockCameraView.displayName = 'MockCameraView';
  return {
    CameraView: MockCameraView,
    useCameraPermissions: () => [{ granted: true, canAskAgain: true }, jest.fn()],
  };
});

// Mock expo-haptics
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

// Mock expo-linear-gradient & blur
jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: any) => <>{children}</>,
}));
jest.mock('expo-blur', () => ({
  BlurView: ({ children }: any) => <>{children}</>,
}));

// Mock safe-area
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 40, bottom: 20, left: 0, right: 0 }),
}));

// Mock i18n — referința `t` rămâne stabilă, la fel ca în react-i18next. O
// funcție nouă la fiecare render ar reporni artificial efectele de recovery.
const mockTranslate = (key: string, _opts?: any) => key;
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: mockTranslate,
    i18n: {
      language: 'ro',
      changeLanguage: jest.fn(),
    },
  }),
  initReactI18next: {
    type: '3rdParty',
    init: jest.fn(),
  },
}));

jest.mock('../i18n', () => ({
  changeLanguage: jest.fn(),
  SUPPORTED_LANGUAGES: ['ro', 'en'],
  LANGUAGE_NAMES: {
    ro: { label: 'Română', flag: '🇷🇴' },
    en: { label: 'English', flag: '🇬🇧' },
  },
}));

// Stable mock objects to avoid re-render loops
const mockColors = {
  accent: '#22c55e',
  accentSecondary: '#16a34a',
  accentTertiary: '#15803d',
  accentGradient: ['#22c55e', '#16a34a'] as [string, string],
  background: '#090C0E',
  surfaceBg: '#12181F',
  cardBg: '#1A232E',
  cardBorder: '#23303E',
  textPrimary: '#F1F5F9',
  textSecondary: '#94A3B8',
  textOnAccent: '#090C0E',
  warning: '#F59E0B',
  error: '#EF4444',
  surfaceElevated: '#1E293B',
};
const mockTheme = { colors: mockColors, themeName: 'dark', setTheme: jest.fn() };
jest.mock('../context/ThemeContext', () => ({
  useTheme: () => mockTheme,
}));

const mockSession = {
  access_token: 'valid-token',
  user: {
    id: 'test-user-id',
    email: 'test@example.com',
    user_metadata: {},
  },
};
const mockUser = {
  id: 'test-user-id',
  email: 'test@example.com',
  user_metadata: {},
};
const mockAuthReturn = {
  session: mockSession,
  user: mockUser,
  loadingAuth: false,
};

jest.mock('@/context/AuthContext', () => ({
  useAuth: () => mockAuthReturn,
}));
jest.mock('../context/AuthContext', () => ({
  useAuth: () => mockAuthReturn,
}));

const mockAdsReturn = {
  adBannerProps: null,
  showInterstitial: jest.fn(),
  recordSuccessfulPhotoAnalysis: jest.fn(),
  maybeShowInterstitial: jest.fn(),
};
jest.mock('@/context/AdsContext', () => ({
  useAds: () => mockAdsReturn,
}));

const mockFlowCreditsReturn = {
  balance: {
    dailyRemaining: 0,
    rewarded: 0,
    purchased: 0,
    total: 0,
    rewardedGrantsRemaining: 0,
    serverDay: null,
  },
  unlimited: false,
  consumeOptimisticCredit: jest.fn(() => 'daily'),
  refresh: jest.fn(async () => null),
  open: jest.fn(),
};
jest.mock('../context/FlowCreditsContext', () => ({
  useFlowCredits: () => mockFlowCreditsReturn,
}));

const mockMaybeSingleMeal = jest.fn().mockResolvedValue({ data: null, error: null });
const mockInsertMeal = jest.fn().mockResolvedValue({ data: null, error: null });
const mockPushOfflineMealVerificat = jest.fn().mockResolvedValue({ persistat: true, lungime: 1 });

jest.mock('../supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
      maybeSingle: (...args: unknown[]) => mockMaybeSingleMeal(...args),
      insert: (...args: unknown[]) => ({
        select: () => mockInsertMeal(...args),
      }),
      upsert: jest.fn().mockResolvedValue({ data: null, error: null }),
    })),
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: mockUser }, error: null }),
      signOut: jest.fn().mockResolvedValue({ error: null }),
    },
  },
}));

jest.mock('../lib/offlineQueue', () => ({
  pushOfflineMealVerificat: (...args: unknown[]) => mockPushOfflineMealVerificat(...args),
  processOfflineQueue: jest.fn().mockResolvedValue({ procesate: 0, ramase: 0 }),
}));

jest.mock('../lib/imagekit', () => ({
  uploadImageToImageKit: jest.fn().mockResolvedValue({
    url: 'https://cdn.example.test/meal.jpg',
    fileId: 'meal-file-id',
  }),
  getImageKitAuthParams: jest.fn().mockResolvedValue({
    token: 'mock-token',
    expire: 1234567890,
    signature: 'mock-signature',
  }),
  clearImageKitAuthCache: jest.fn(),
}));

jest.mock('../lib/photoJobs', () => {
  const mockedRecovery = jest.fn(async () => null);
  return ({
  PhotoApiError: class PhotoApiError extends Error {
    status: number;
    code: string;
    constructor(status: number, code: string) { super(code); this.status = status; this.code = code; }
  },
  clearActivePhotoJob: jest.fn(async () => {}),
  hasPendingPhotoSave: jest.fn(async () => false),
  savePhotoJobSaveAttempt: jest.fn(async () => true),
  cleanupPhotoAsset: jest.fn(async () => {}),
  recoverPhotoJob: mockedRecovery,
  recoverPhotoJobForCamera: mockedRecovery,
  submitPhotoJob: jest.fn(async () => ({
    id: 'photo-job-1',
    status: 'succeeded',
    result: {
      success: true,
      items: [{
        nume: 'Chicken', estimare_grame: 100, calorii_per_100g: 165,
        proteine_per_100g: 31, carbohidrati_per_100g: 0, grasimi_per_100g: 3.6,
      }],
    },
  })),
  waitForPhotoJob: jest.fn(async () => ({
    id: 'photo-job-1',
    status: 'succeeded',
    result: {
      success: true,
      tipMasa: 'cina',
      items: [{
        nume: 'Chicken', estimare_grame: 100, calorii_per_100g: 165,
        proteine_per_100g: 31, carbohidrati_per_100g: 0, grasimi_per_100g: 3.6,
        fibre_per_100g: 0,
      }],
    },
  })),
  });
});

jest.mock('lucide-react-native', () => {
  const MockIcon = () => null;
  return new Proxy({}, {
    get: () => MockIcon,
  });
});

jest.mock('../hooks/useReducedMotion', () => ({
  useReducedMotion: () => false,
}));
jest.mock('@/hooks/useReducedMotion', () => ({
  useReducedMotion: () => false,
}));

jest.mock('../lib/imageOptimizer', () => ({
  optimizeImageBeforeUpload: jest.fn().mockResolvedValue({ uri: 'optimized.jpg' }),
  saveLocalImageDraft: jest.fn().mockResolvedValue('draft-1'),
  discardLocalImageDraft: jest.fn().mockResolvedValue(true),
  listPendingDrafts: jest.fn().mockResolvedValue([]),
  purgeLocalImageDrafts: jest.fn().mockResolvedValue(true),
  amprentaOperatieFoto: jest.fn().mockResolvedValue('photo-operation-fingerprint'),
}));

jest.mock('../components/ui/MealSaveSuccessModal', () => ({
  MealSaveSuccessModal: () => null,
}));

jest.mock('../components/food/ProductSearch', () => ({
  ProductSearch: () => null,
}));

jest.mock('../components/food/IngredientCorrectionInput', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('../components/ui/KeyboardAwareScreen', () => ({
  __esModule: true,
  default: ({ children }: any) => <>{children}</>,
}));

const mockNotificationsReturn = {
  enabled: false,
  toggleReminders: jest.fn(),
  isExpoGo: false,
};
jest.mock('../hooks/useNotifications', () => ({
  useNotifications: () => mockNotificationsReturn,
}));

jest.mock('../lib/notificationConsent', () => ({
  getConsent: jest.fn().mockResolvedValue({ grantedAt: null }),
  cancelManagedReminders: jest.fn().mockResolvedValue(undefined),
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

const mockBannerActions = {
  showBanner: jest.fn(),
};
jest.mock('../context/NotificationBannerContext', () => ({
  useNotificationBannerActions: () => mockBannerActions,
}));

jest.mock('../hooks/useNotify', () => ({
  useNotify: () => jest.fn(),
}));

const mockGamificareReturn = {
  streak: 5,
  puncte: 100,
  insigne: [],
};
jest.mock('../context/GamificareContext', () => ({
  useGamificareData: () => mockGamificareReturn,
}));

const mockResponsiveReturn = {
  contentMaxWidth: 500,
  isTablet: false,
  scrollPaddingTop: 20,
  scrollPaddingBottom: 20,
};
jest.mock('../hooks/useResponsiveLayout', () => ({
  useResponsiveLayout: () => mockResponsiveReturn,
}));

jest.mock('../components/ui/FeedbackModal', () => ({
  FeedbackModal: () => null,
}));

jest.mock('../components/ui/WatchSelectorSheet', () => ({
  WatchSelectorSheet: () => null,
}));

jest.mock('../lib/sincronizeazaTargeturi', () => ({
  salveazaTargeturiPending: jest.fn().mockResolvedValue(undefined),
  stergeTargeturiPending: jest.fn().mockResolvedValue(undefined),
  citesteTargeturiPending: jest.fn().mockResolvedValue(null),
}));

jest.mock('../lib/userDataCleanup', () => ({
  purgeLocalDataForUser: jest.fn().mockResolvedValue(undefined),
}));

// Import components under test
import CameraScreen from '../app/camera';
import ProfilScreen from '../app/(tabs)/profil';
import { aboneazaLaModificariMese } from '../lib/freshnessMese';
import { discardLocalImageDraft, listPendingDrafts } from '../lib/imageOptimizer';
import { construiestePayloadMasaCamera } from '../lib/payloadMese';
import {
  clearActivePhotoJob,
  hasPendingPhotoSave,
  savePhotoJobSaveAttempt,
  recoverPhotoJob,
  submitPhotoJob,
  waitForPhotoJob,
  PhotoApiError,
} from '../lib/photoJobs';

const originalFetch = global.fetch;

describe('Blocker 1: Android Gallery Permission Hardening (API 24-32)', () => {
  const originalPlatform = Platform.OS;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthReturn.session = mockSession;
    mockAuthReturn.user = mockUser;
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockRequestPermissions.mockResolvedValue({ granted: true });
    mockInsertMeal.mockResolvedValue({ data: null, error: null });
    mockMaybeSingleMeal.mockResolvedValue({ data: null, error: null });
    (savePhotoJobSaveAttempt as jest.Mock).mockResolvedValue(true);
    (listPendingDrafts as jest.Mock).mockReset().mockResolvedValue([]);
    (discardLocalImageDraft as jest.Mock).mockReset().mockResolvedValue(true);
    mockPushOfflineMealVerificat.mockResolvedValue({ persistat: true, lungime: 1 });
    Platform.OS = originalPlatform;
  });

  afterEach(() => {
    Platform.OS = originalPlatform;
    global.fetch = originalFetch;
  });

  describe('Food gallery selection (app/camera.tsx)', () => {
    it('ANDROID: does NOT call requestMediaLibraryPermissionsAsync, calls launchImageLibraryAsync directly', async () => {
      Platform.OS = 'android';
      mockLaunchImageLibrary.mockResolvedValueOnce({
        canceled: true,
        assets: [],
      });

      const view = await render(<CameraScreen />);
      const galleryBtn = view.getByTestId('gallery-button');

      expect(galleryBtn.props.accessibilityLabel).toBe('camera.galleryButton');
      expect(galleryBtn.props.accessibilityHint).toBe('camera.galleryHint');
      expect(view.getByTestId('shutter-button').props.accessibilityLabel).toBe('camera.shutterButton');
      expect(view.getByText('camera.galleryLabel')).toBeTruthy();
      expect(view.getByText('camera.shutterLabel')).toBeTruthy();

      await act(async () => {
        fireEvent.press(galleryBtn);
      });

      expect(mockRequestPermissions).not.toHaveBeenCalled();
      expect(mockLaunchImageLibrary).toHaveBeenCalledTimes(1);
      expect(mockLaunchImageLibrary).toHaveBeenCalledWith({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.7,
      });
    });

    it('ANDROID: cancellation restores usable state and allows a second attempt', async () => {
      Platform.OS = 'android';
      mockLaunchImageLibrary.mockResolvedValueOnce({
        canceled: true,
        assets: [],
      });

      const view = await render(<CameraScreen />);
      const galleryBtn = view.getByTestId('gallery-button');

      // First attempt cancelled
      await act(async () => {
        fireEvent.press(galleryBtn);
      });
      expect(mockLaunchImageLibrary).toHaveBeenCalledTimes(1);

      // Second attempt executes
      mockLaunchImageLibrary.mockResolvedValueOnce({
        canceled: false,
        assets: [{ uri: 'file:///photo.jpg' }],
      });
      await act(async () => {
        fireEvent.press(galleryBtn);
      });

      expect(mockLaunchImageLibrary).toHaveBeenCalledTimes(2);
      expect(mockRequestPermissions).not.toHaveBeenCalled();
    });

    it('ANDROID: error recovers and second attempt remains possible', async () => {
      Platform.OS = 'android';
      mockLaunchImageLibrary.mockRejectedValueOnce(new Error('Picker crashed'));

      const view = await render(<CameraScreen />);
      const galleryBtn = view.getByTestId('gallery-button');

      // First attempt throws
      await act(async () => {
        fireEvent.press(galleryBtn);
      });
      expect(mockLaunchImageLibrary).toHaveBeenCalledTimes(1);
      expect(Alert.alert).toHaveBeenCalled();

      // Second attempt executes
      mockLaunchImageLibrary.mockResolvedValueOnce({
        canceled: true,
        assets: [],
      });
      await act(async () => {
        fireEvent.press(galleryBtn);
      });

      expect(mockLaunchImageLibrary).toHaveBeenCalledTimes(2);
    });

    it('IOS: preserves requestMediaLibraryPermissionsAsync check', async () => {
      Platform.OS = 'ios';
      mockRequestPermissions.mockResolvedValueOnce({ granted: true });
      mockLaunchImageLibrary.mockResolvedValueOnce({
        canceled: true,
        assets: [],
      });

      const view = await render(<CameraScreen />);
      const galleryBtn = view.getByTestId('gallery-button');

      await act(async () => {
        fireEvent.press(galleryBtn);
      });

      expect(mockRequestPermissions).toHaveBeenCalledTimes(1);
      expect(mockLaunchImageLibrary).toHaveBeenCalledTimes(1);
    });

    it('IOS: denied permission blocks launchImageLibraryAsync and alerts user', async () => {
      Platform.OS = 'ios';
      mockRequestPermissions.mockResolvedValueOnce({ granted: false });

      const view = await render(<CameraScreen />);
      const galleryBtn = view.getByTestId('gallery-button');

      await act(async () => {
        fireEvent.press(galleryBtn);
      });

      expect(mockRequestPermissions).toHaveBeenCalledTimes(1);
      expect(mockLaunchImageLibrary).not.toHaveBeenCalled();
      expect(Alert.alert).toHaveBeenCalledWith(
        'alerts.titluri.permisiuneNecesara',
        'alerts.mesaje.permisiuneGaleriePoze'
      );
    });

    it('PHOTO RESULT: uses durable job output, hides the photo and extra-product action, and shows a compact auto category', async () => {
      Platform.OS = 'android';
      mockLaunchImageLibrary.mockResolvedValueOnce({
        canceled: false,
        assets: [{ uri: 'file:///meal.jpg' }],
      });

      const view = await render(<CameraScreen />);
      await act(async () => fireEvent.press(view.getByTestId('gallery-button')));

      await waitFor(() => expect(view.getByTestId('camera-add-journal-btn')).toBeTruthy());
      expect(waitForPhotoJob).toHaveBeenCalled();
      expect(view.getByText('camera.detectedMeal')).toBeTruthy();
      expect(view.getAllByText('Chicken').length).toBeGreaterThanOrEqual(1);
      expect(view.getByText('chat.mealCategory.cina')).toBeTruthy();
      expect(view.getByText('camera.fiber')).toBeTruthy();
      expect(view.queryByText('camera.addExtraProduct')).toBeNull();
      expect(view.getByTestId('camera-add-journal-btn').props.accessibilityLabel).toBe('camera.addToJournal');
    });

    it('PHOTO CATEGORY: category selection keeps the result visible and only Add to Journal persists it', async () => {
      Platform.OS = 'android';
      mockLaunchImageLibrary.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///meal.jpg' }] });
      mockInsertMeal.mockImplementationOnce(async (payload: Record<string, unknown>) => ({
        data: [{ ...payload }], error: null,
      }));

      const view = await render(<CameraScreen />);
      await act(async () => fireEvent.press(view.getByTestId('gallery-button')));
      await waitFor(() => expect(view.getByTestId('camera-add-journal-btn')).toBeTruthy());

      await act(async () => fireEvent.press(view.getByTestId('camera-meal-correction-toggle')));
      await act(async () => fireEvent.press(view.getByRole('radio', { name: 'chat.mealCategory.gustare' })));

      expect(view.getAllByText('Chicken').length).toBeGreaterThan(0);
      expect(view.getByText('chat.mealCategory.gustare')).toBeTruthy();
      expect(mockInsertMeal).not.toHaveBeenCalled();

      await act(async () => fireEvent.press(view.getByTestId('camera-add-journal-btn')));
      expect(mockInsertMeal).toHaveBeenCalledTimes(1);
      expect((mockInsertMeal.mock.calls[0][0] as Record<string, unknown>).tip_masa).toBe('gustare');
    });

    it('PHOTO FAILURE: maps backend Photo API failures through the active locale', async () => {
      Platform.OS = 'android';
      (submitPhotoJob as jest.Mock).mockRejectedValueOnce(
        new PhotoApiError(503, 'PHOTO_SERVICE_UNAVAILABLE'),
      );
      mockLaunchImageLibrary.mockResolvedValueOnce({
        canceled: false,
        assets: [{ uri: 'file:///meal-failure.jpg' }],
      });

      const view = await render(<CameraScreen />);
      await act(async () => fireEvent.press(view.getByTestId('gallery-button')));

      await waitFor(() => expect(view.getByText('camera.genericScanError')).toBeTruthy());
      expect(view.queryByText('PHOTO_SERVICE_UNAVAILABLE')).toBeNull();
    });

    it('ISOLATED QA: captures locally, explains unavailable cloud analysis and re-enables the shutter', async () => {
      const previousEnvironment = process.env.EXPO_PUBLIC_APP_ENV;
      process.env.EXPO_PUBLIC_APP_ENV = 'qa';
      try {
        Platform.OS = 'android';
        const imageKit = jest.requireMock('../lib/imagekit') as { uploadImageToImageKit: jest.Mock };
        const view = await render(<CameraScreen />);
        await fireEvent.press(view.getByTestId('shutter-button'));
        await waitFor(() => expect(view.getByText('camera.qaAnalysisUnavailable')).toBeTruthy());
        expect(mockTakePictureAsync).toHaveBeenCalledTimes(1);
        expect(imageKit.uploadImageToImageKit).not.toHaveBeenCalled();
        expect(submitPhotoJob).not.toHaveBeenCalled();
        expect(view.getByTestId('shutter-button').props.accessibilityState.disabled).toBe(false);
        await fireEvent.press(view.getByTestId('shutter-button'));
        await waitFor(() => expect(mockTakePictureAsync).toHaveBeenCalledTimes(2));
      } finally {
        if (previousEnvironment === undefined) delete process.env.EXPO_PUBLIC_APP_ENV;
        else process.env.EXPO_PUBLIC_APP_ENV = previousEnvironment;
      }
    });

    it('CAMERA CAPTURE: pressing shutter captures image and triggers Photo AI analysis', async () => {
      Platform.OS = 'android';
      mockTakePictureAsync.mockResolvedValueOnce({ uri: 'file:///snapped-food.jpg' });

      const view = await render(<CameraScreen />);
      const shutterBtn = view.getByTestId('shutter-button');

      await act(async () => {
        fireEvent.press(shutterBtn);
      });

      expect(mockTakePictureAsync).toHaveBeenCalledWith({
        quality: 0.7,
        base64: false,
        shutterSound: false,
      });
      await waitFor(() => expect(view.getByTestId('camera-add-journal-btn')).toBeTruthy());
      expect(view.getAllByText('Chicken').length).toBeGreaterThan(0);
    });

    it('CAMERA CAPTURE: capture exception displays captureFailed error and resets loading state', async () => {
      Platform.OS = 'android';
      mockTakePictureAsync.mockRejectedValueOnce(new Error('Failed to capture image'));

      const view = await render(<CameraScreen />);
      const shutterBtn = view.getByTestId('shutter-button');

      await act(async () => {
        fireEvent.press(shutterBtn);
      });

      await waitFor(() => expect(view.getByText('camera.captureFailed')).toBeTruthy());
      expect(shutterBtn.props.accessibilityState.disabled).toBe(false);
    });

    it('CAMERA CAPTURE: rapid duplicate taps do not trigger concurrent takePictureAsync calls', async () => {
      Platform.OS = 'android';
      let resolveCapture: (val: any) => void = () => {};
      const capturePromise = new Promise<{ uri: string }>((res) => { resolveCapture = res; });
      mockTakePictureAsync.mockReturnValueOnce(capturePromise);

      const view = await render(<CameraScreen />);
      const shutterBtn = view.getByTestId('shutter-button');

      await act(async () => {
        fireEvent.press(shutterBtn);
        fireEvent.press(shutterBtn);
      });

      expect(mockTakePictureAsync).toHaveBeenCalledTimes(1);

      await act(async () => {
        resolveCapture({ uri: 'file:///first-capture.jpg' });
      });

      await waitFor(() => expect(view.getByTestId('camera-add-journal-btn')).toBeTruthy());
    });

    it('PHOTO RESULT: blocks journal save and exposes review guidance for implausible 3180g output', async () => {
      Platform.OS = 'android';
      (waitForPhotoJob as jest.Mock).mockResolvedValueOnce({
        id: 'photo-job-implausible',
        status: 'succeeded',
        result: {
          success: true,
          tipMasa: 'pranz',
          items: [{
            nume: 'Cartofi prăjiți', estimare_grame: 3180, calorii_per_100g: 300,
            proteine_per_100g: 3, carbohidrati_per_100g: 40, grasimi_per_100g: 15,
            fibre_per_100g: 4,
          }],
        },
      });
      mockLaunchImageLibrary.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///fries.jpg' }] });

      const view = await render(<CameraScreen />);
      await act(async () => fireEvent.press(view.getByTestId('gallery-button')));

      await waitFor(() => expect(view.getByTestId('camera-quality-warning')).toBeTruthy());
      expect(view.getByTestId('camera-add-journal-btn').props.accessibilityState.disabled).toBe(true);
      expect(view.getByText('camera.reviewRequiredTitle')).toBeTruthy();
    });

    it('PHOTO BACKGROUND FAILURE: remains visible after reload and retries with a fresh idempotency identity', async () => {
      Platform.OS = 'android';
      (recoverPhotoJob as jest.Mock).mockResolvedValueOnce({
        job: { id: 'failed-job-1', status: 'failed', errorCode: 'PROVIDER_FAILED' },
        pointer: {
          userId: mockUser.id,
          jobId: 'failed-job-1',
          draftUri: 'file:///durable-failed-draft.jpg',
          savedAt: 1,
        },
      });

      const view = await render(<CameraScreen />);

      await waitFor(() => expect(view.getByTestId('camera-failed-job')).toBeTruthy());
      expect(view.getByText('photoJob.failedTitle')).toBeTruthy();
      expect(clearActivePhotoJob).not.toHaveBeenCalled();

      await act(async () => fireEvent.press(view.getByTestId('camera-failed-retry')));

      await waitFor(() => expect(submitPhotoJob).toHaveBeenCalled());
      const retryInput = (submitPhotoJob as jest.Mock).mock.calls.at(-1)?.[0];
      expect(retryInput.analysisId).toMatch(/^photo-operation-fingerprint:retry:/);
      expect(clearActivePhotoJob).toHaveBeenCalledWith(mockUser.id, 'failed-job-1');
    });

    it('PHOTO ACCOUNT ISOLATION: clears an already recovered user A result before user B can see it', async () => {
      Platform.OS = 'android';
      (recoverPhotoJob as jest.Mock).mockResolvedValueOnce({
        job: {
          id: 'user-a-photo-job', status: 'succeeded',
          result: { success: true, tipMasa: 'cina', items: [{
            nume: 'User A private meal', estimare_grame: 100, calorii_per_100g: 165,
            proteine_per_100g: 31, carbohidrati_per_100g: 0, grasimi_per_100g: 3.6,
          }] },
        },
        pointer: {
          userId: mockUser.id, jobId: 'user-a-photo-job', savedAt: 1,
          imageUrl: 'https://cdn.example.test/user-a-private.jpg',
          saveOperationId: 'user-a-save-operation',
          savePayload: {
            id: 'user-a-meal-id', user_id: mockUser.id,
            nume: 'User A private meal', data: '2026-10-11', ora: '20:00:00',
            created_at: '2026-10-11T17:00:00.000Z', tip_masa: 'cina',
            calorii: 165, proteine: 31, carbohidrati: 0, grasimi: 3.6, fibre: 0,
            alimente: [{ nume: 'User A private meal', grame: 100, calorii: 165, proteine: 31, carbohidrati: 0, grasimi: 3.6, fibre: 0 }],
          },
        },
      });

      const view = await render(<CameraScreen />);
      await waitFor(() => expect(view.getAllByText('User A private meal').length).toBeGreaterThan(0));
      expect(view.getByTestId('camera-add-journal-btn')).toBeTruthy();

      const userB = { id: 'test-user-b', email: 'b@example.test', user_metadata: {} };
      mockAuthReturn.user = userB;
      mockAuthReturn.session = { access_token: 'user-b-token', user: userB } as typeof mockSession;
      await act(async () => view.rerender(<CameraScreen />));

      await waitFor(() => expect(recoverPhotoJob).toHaveBeenCalledWith(expect.objectContaining({ userId: userB.id })));
      expect(view.queryByText('User A private meal')).toBeNull();
      expect(view.queryByTestId('camera-add-journal-btn')).toBeNull();
      expect(view.queryByText('camera.detectedMeal')).toBeNull();
    });

    it('PHOTO ACCOUNT ISOLATION: ignores a user A recovery that resolves only after switching to user B', async () => {
      Platform.OS = 'android';
      let resolveUserARecovery!: (value: unknown) => void;
      (recoverPhotoJob as jest.Mock).mockImplementationOnce(() => new Promise((resolve) => {
        resolveUserARecovery = resolve;
      }));

      const view = await render(<CameraScreen />);
      await waitFor(() => expect(recoverPhotoJob).toHaveBeenCalledWith(expect.objectContaining({ userId: mockUser.id })));

      const userB = { id: 'test-user-b', email: 'b@example.test', user_metadata: {} };
      mockAuthReturn.user = userB;
      mockAuthReturn.session = { access_token: 'user-b-token', user: userB } as typeof mockSession;
      await act(async () => view.rerender(<CameraScreen />));
      await waitFor(() => expect(recoverPhotoJob).toHaveBeenCalledWith(expect.objectContaining({ userId: userB.id })));

      await act(async () => resolveUserARecovery({
        job: {
          id: 'late-user-a-job', status: 'succeeded',
          result: { success: true, items: [{
            nume: 'Late private user A meal', estimare_grame: 100, calorii_per_100g: 200,
            proteine_per_100g: 20, carbohidrati_per_100g: 10, grasimi_per_100g: 5,
          }] },
        },
        pointer: { userId: mockUser.id, jobId: 'late-user-a-job', savedAt: 1 },
      }));

      expect(view.queryByText('Late private user A meal')).toBeNull();
      expect(view.queryByTestId('camera-add-journal-btn')).toBeNull();
      expect(clearActivePhotoJob).not.toHaveBeenCalled();
    });

    it('PHOTO DRAFT ACCOUNT ISOLATION: ignores user A drafts that finish loading after switching to B', async () => {
      Platform.OS = 'android';
      let resolveUserADrafts!: (drafts: string[]) => void;
      (listPendingDrafts as jest.Mock).mockImplementationOnce(() => new Promise((resolve) => {
        resolveUserADrafts = resolve;
      }));

      const view = await render(<CameraScreen />);
      await waitFor(() => expect(listPendingDrafts).toHaveBeenCalledWith(mockUser.id));

      const userB = { id: 'test-user-b', email: 'b@example.test', user_metadata: {} };
      mockAuthReturn.user = userB;
      mockAuthReturn.session = { access_token: 'user-b-token', user: userB } as typeof mockSession;
      view.rerender(<CameraScreen />);
      await waitFor(() => expect(recoverPhotoJob).toHaveBeenCalledWith(expect.objectContaining({ userId: userB.id })));

      await act(async () => resolveUserADrafts(['file:///user-a-private-draft.jpg']));
      expect(Alert.alert).not.toHaveBeenCalled();
    });

    it('PHOTO DRAFT ACCOUNT ISOLATION: stale Resume and Discard callbacks cannot act for user A after switching to B', async () => {
      Platform.OS = 'android';
      (listPendingDrafts as jest.Mock).mockResolvedValueOnce(['file:///user-a-private-draft.jpg']);

      const view = await render(<CameraScreen />);
      await waitFor(() => expect(Alert.alert).toHaveBeenCalledTimes(1));
      const buttons = (Alert.alert as jest.Mock).mock.calls[0][2] as Array<{ onPress?: () => void }>;
      expect(buttons).toHaveLength(2);

      const userB = { id: 'test-user-b', email: 'b@example.test', user_metadata: {} };
      mockAuthReturn.user = userB;
      mockAuthReturn.session = { access_token: 'user-b-token', user: userB } as typeof mockSession;
      view.rerender(<CameraScreen />);
      await waitFor(() => expect(recoverPhotoJob).toHaveBeenCalledWith(expect.objectContaining({ userId: userB.id })));

      await act(async () => {
        buttons[0].onPress?.();
        buttons[1].onPress?.();
      });
      expect(discardLocalImageDraft).not.toHaveBeenCalled();
      expect(submitPhotoJob).not.toHaveBeenCalled();
    });

    it('PHOTO ACCOUNT ISOLATION: does not submit user A meal after auth switches while save snapshot is being stored', async () => {
      Platform.OS = 'android';
      mockLaunchImageLibrary.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///user-a-meal.jpg' }] });
      let resolveSaveSnapshot!: (saved: boolean) => void;
      let saveSnapshotPromiseSettled = false;
      let resolveUserBRecovery!: (value: unknown) => void;
      let userBRecoverySettled = false;
      (savePhotoJobSaveAttempt as jest.Mock).mockImplementationOnce(() => new Promise((resolve) => {
        resolveSaveSnapshot = (saved) => {
          saveSnapshotPromiseSettled = true;
          resolve(saved);
        };
      }));

      const view = await render(<CameraScreen />);
      await act(async () => fireEvent.press(view.getByTestId('gallery-button')));
      await waitFor(() => expect(view.getByTestId('camera-add-journal-btn')).toBeTruthy());
      try {
        // The save handler intentionally waits for durable idempotency metadata;
        // don't make act await that deferred promise before switching accounts.
        await act(async () => {
          fireEvent.press(view.getByTestId('camera-add-journal-btn'));
          await Promise.resolve();
        });
        await waitFor(() => expect(savePhotoJobSaveAttempt).toHaveBeenCalled());

        const userB = { id: 'test-user-b', email: 'b@example.test', user_metadata: {} };
        (recoverPhotoJob as jest.Mock).mockImplementationOnce(() => new Promise((resolve) => {
          resolveUserBRecovery = (value) => {
            userBRecoverySettled = true;
            resolve(value);
          };
        }));
        mockAuthReturn.user = userB;
        mockAuthReturn.session = { access_token: 'user-b-token', user: userB } as typeof mockSession;
        view.rerender(<CameraScreen />);
        await waitFor(() => expect(recoverPhotoJob).toHaveBeenCalledWith(expect.objectContaining({ userId: userB.id })));
        // The auth-change render must not expose the prior result even before
        // checking that the new user's recovery has started.
        expect(view.queryAllByText('Chicken')).toHaveLength(0);
        expect(view.queryByTestId('camera-add-journal-btn')).toBeNull();

        await act(async () => resolveUserBRecovery({
          job: {
            id: 'user-b-photo-job', status: 'succeeded',
            result: { success: true, items: [{
              nume: 'User B meal', estimare_grame: 100, calorii_per_100g: 120,
              proteine_per_100g: 20, carbohidrati_per_100g: 3, grasimi_per_100g: 2,
            }] },
          },
          pointer: { userId: userB.id, jobId: 'user-b-photo-job', savedAt: 2 },
        }));
        await waitFor(() => expect(view.getAllByText('User B meal').length).toBeGreaterThan(0));
        await act(async () => resolveSaveSnapshot(true));
        expect(mockInsertMeal).not.toHaveBeenCalled();
        expect(view.queryAllByText('Chicken')).toHaveLength(0);

        mockInsertMeal.mockImplementationOnce(async (payload: Record<string, unknown>) => ({
          data: [{ ...payload }], error: null,
        }));
        await act(async () => fireEvent.press(view.getByTestId('camera-add-journal-btn')));
        await waitFor(() => expect(mockInsertMeal).toHaveBeenCalledTimes(1));
        expect(mockInsertMeal.mock.calls[0][0]).toEqual(expect.objectContaining({
          user_id: userB.id,
          alimente: expect.arrayContaining([expect.objectContaining({ nume: 'User B meal' })]),
        }));
        expect(savePhotoJobSaveAttempt).toHaveBeenLastCalledWith(
          userB.id,
          'user-b-photo-job',
          expect.any(String),
          expect.objectContaining({ user_id: userB.id, alimente: expect.arrayContaining([expect.objectContaining({ nume: 'User B meal' })]) }),
        );
      } finally {
        if (resolveSaveSnapshot && !saveSnapshotPromiseSettled) {
          await act(async () => resolveSaveSnapshot(false));
        }
        if (resolveUserBRecovery && !userBRecoverySettled) {
          await act(async () => resolveUserBRecovery(null));
        }
      }
    });

    it('PHOTO CORRUPT SAVE RECOVERY: shows a safe error and leaves corrupt pending state untouched', async () => {
      Platform.OS = 'android';
      mockLaunchImageLibrary.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///next-meal.jpg' }] });
      (recoverPhotoJob as jest.Mock).mockRejectedValueOnce(new PhotoApiError(500, 'INVALID_PENDING_MEAL_SAVE_DRAFT'));
      (recoverPhotoJob as jest.Mock).mockRejectedValueOnce(new PhotoApiError(500, 'INVALID_PENDING_MEAL_SAVE_DRAFT'));
      (hasPendingPhotoSave as jest.Mock).mockRejectedValueOnce(new PhotoApiError(500, 'INVALID_PENDING_MEAL_SAVE_DRAFT'));

      const view = await render(<CameraScreen />);
      await waitFor(() => expect(view.getByText('camera.genericScanError')).toBeTruthy());
      expect(view.queryByTestId('camera-add-journal-btn')).toBeNull();
      expect(view.getByTestId('camera-recovery-retry')).toBeTruthy();
      expect(clearActivePhotoJob).not.toHaveBeenCalled();

      await act(async () => fireEvent.press(view.getByTestId('camera-recovery-retry')));
      await waitFor(() => expect(view.getByTestId('camera-recovery-retry')).toBeTruthy());
      expect(clearActivePhotoJob).not.toHaveBeenCalled();

      await act(async () => fireEvent.press(view.getByTestId('gallery-button')));
      expect(submitPhotoJob).not.toHaveBeenCalled();
      expect(clearActivePhotoJob).not.toHaveBeenCalled();
      expect(Alert.alert).toHaveBeenCalledWith(
        'alerts.titluri.eroareSalvare',
        'alerts.mesaje.problemaNecunoscutaConectare',
      );
    });

    it('PHOTO BACKGROUND NAVIGATION: returns Home after durable submission and preserves the job', async () => {
      Platform.OS = 'android';
      mockLaunchImageLibrary.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///meal.jpg' }] });
      (waitForPhotoJob as jest.Mock).mockImplementationOnce(() => new Promise(() => {}));

      mockRouter.canGoBack.mockReturnValueOnce(false);
      const view = await render(<CameraScreen />);
      await act(async () => fireEvent.press(view.getByTestId('gallery-button')));
      await waitFor(() => expect(submitPhotoJob).toHaveBeenCalled());

      await act(async () => fireEvent.press(view.getByLabelText('common.close')));
      expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)');
      expect(clearActivePhotoJob).not.toHaveBeenCalled();
    });

    it('CAMERA DATA CONTRACT: a structured RLS error is not queued or reported as an offline save', async () => {
      Platform.OS = 'android';
      mockLaunchImageLibrary.mockResolvedValueOnce({
        canceled: false,
        assets: [{ uri: 'file:///meal.jpg' }],
      });
      mockInsertMeal.mockResolvedValueOnce({
        data: null,
        error: { code: '42501', message: 'row-level security policy rejected insert' },
      });
      (global.fetch as jest.Mock) = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ([{
            nume: 'Chicken',
            estimare_grame: 100,
            calorii_per_100g: 165,
            proteine_per_100g: 31,
            carbohidrati_per_100g: 0,
            grasimi_per_100g: 3.6,
          }]),
      });

      const view = await render(<CameraScreen />);
      await act(async () => {
        fireEvent.press(view.getByTestId('gallery-button'));
      });

      const saveButton = await waitFor(() => view.getByTestId('camera-add-journal-btn'));
      await act(async () => {
        fireEvent.press(saveButton);
      });

      expect(mockInsertMeal).toHaveBeenCalledTimes(1);
      expect(mockPushOfflineMealVerificat).not.toHaveBeenCalled();
      expect(Alert.alert).toHaveBeenCalledWith(
        'alerts.titluri.eroareSalvare',
        'alerts.mesaje.bazaDateRefuza',
      );
    });

    it('V7 CAMERA → JOURNAL: confirmed save persists today once and invalidates canonical consumers', async () => {
      Platform.OS = 'android';
      const freshnessSignals: string[] = [];
      const unsubscribe = aboneazaLaModificariMese((userId) => freshnessSignals.push(userId));
      mockLaunchImageLibrary.mockResolvedValueOnce({
        canceled: false,
        assets: [{ uri: 'file:///meal.jpg' }],
      });
      mockInsertMeal.mockImplementationOnce(async (payload: Record<string, unknown>) => ({
        data: [{ ...payload, id: payload.id || 'camera-meal-id' }],
        error: null,
      }));
      (global.fetch as jest.Mock) = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ([{
          nume: 'Chicken',
          estimare_grame: 100,
          calorii_per_100g: 165,
          proteine_per_100g: 31,
          carbohidrati_per_100g: 0,
          grasimi_per_100g: 3.6,
        }]),
      });

      try {
        const view = await render(<CameraScreen />);
        await act(async () => {
          fireEvent.press(view.getByTestId('gallery-button'));
        });
        const saveButton = await waitFor(() => view.getByTestId('camera-add-journal-btn'));
        await act(async () => {
          fireEvent.press(saveButton);
        });

        expect(mockInsertMeal).toHaveBeenCalledTimes(1);
        const payload = mockInsertMeal.mock.calls[0][0] as Record<string, any>;
        expect(payload.user_id).toBe(mockUser.id);
        expect(payload.data).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(payload.ora).toMatch(/^\d{2}:\d{2}:\d{2}$/);
        expect(payload.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        expect(payload.alimente).toHaveLength(1);
        expect(mockPushOfflineMealVerificat).not.toHaveBeenCalled();
        expect(freshnessSignals).toEqual([mockUser.id]);
      } finally {
        unsubscribe();
      }
    });

    it('CAMERA DOUBLE TAP: ignores a second save callback while the first durable snapshot is pending', async () => {
      Platform.OS = 'android';
      mockLaunchImageLibrary.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///meal.jpg' }] });
      mockInsertMeal.mockImplementationOnce(async (payload: Record<string, unknown>) => ({
        data: [{ ...payload }],
        error: null,
      }));
      let resolveSaveSnapshot!: (saved: boolean) => void;
      (savePhotoJobSaveAttempt as jest.Mock).mockImplementationOnce(() => new Promise((resolve) => {
        resolveSaveSnapshot = resolve;
      }));
      (global.fetch as jest.Mock) = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ([{
          nume: 'Chicken', estimare_grame: 100, calorii_per_100g: 165,
          proteine_per_100g: 31, carbohidrati_per_100g: 0, grasimi_per_100g: 3.6,
        }]),
      });

      const view = await render(<CameraScreen />);
      await act(async () => fireEvent.press(view.getByTestId('gallery-button')));
      const saveButton = await waitFor(() => view.getByTestId('camera-add-journal-btn'));
      await act(async () => {
        // Invoke the same render's callback twice before React can commit the
        // disabled/busy button state, as can happen with closely spaced taps.
        fireEvent.press(saveButton);
        fireEvent.press(saveButton);
        await Promise.resolve();
        expect(savePhotoJobSaveAttempt).toHaveBeenCalledTimes(1);
        resolveSaveSnapshot(true);
      });
      await waitFor(() => expect(mockInsertMeal).toHaveBeenCalledTimes(1));

      expect(mockInsertMeal).toHaveBeenCalledTimes(1);
      expect(clearActivePhotoJob).toHaveBeenCalledWith(mockUser.id, 'photo-job-1');
    });

    it('CAMERA DATA LOSS GUARD: does not report success when insert and readback confirm no persisted row', async () => {
      Platform.OS = 'android';
      mockLaunchImageLibrary.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///meal.jpg' }] });
      mockInsertMeal.mockResolvedValueOnce({ data: [], error: null });
      (global.fetch as jest.Mock) = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ([{
          nume: 'Chicken',
          estimare_grame: 100,
          calorii_per_100g: 165,
          proteine_per_100g: 31,
          carbohidrati_per_100g: 0,
          grasimi_per_100g: 3.6,
        }]),
      });
      const freshnessSignals: string[] = [];
      const unsubscribe = aboneazaLaModificariMese((userId) => freshnessSignals.push(userId));

      try {
        const view = await render(<CameraScreen />);
        await act(async () => fireEvent.press(view.getByTestId('gallery-button')));
        const saveButton = await waitFor(() => view.getByTestId('camera-add-journal-btn'));
        await act(async () => fireEvent.press(saveButton));

        await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith(
          'alerts.titluri.eroareSalvare',
          'alerts.mesaje.problemaNecunoscutaConectare',
        ));
        expect(view.queryByText('Masă adăugată!')).toBeNull();
        expect(view.getByTestId('camera-add-journal-btn')).toBeTruthy();
        expect(freshnessSignals).toEqual([]);
        expect(clearActivePhotoJob).not.toHaveBeenCalled();
      } finally {
        unsubscribe();
      }
    });

    it('CAMERA PERSISTENCE READBACK: confirms an ambiguous insert only after the exact row is found', async () => {
      Platform.OS = 'android';
      mockLaunchImageLibrary.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///meal.jpg' }] });
      mockInsertMeal.mockImplementationOnce(async () => {
        mockMaybeSingleMeal.mockImplementationOnce(async () => ({
          data: { ...(mockInsertMeal.mock.calls[0][0] as Record<string, unknown>) },
          error: null,
        }));
        return { data: [], error: null };
      });
      (global.fetch as jest.Mock) = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ([{
          nume: 'Chicken', estimare_grame: 100, calorii_per_100g: 165,
          proteine_per_100g: 31, carbohidrati_per_100g: 0, grasimi_per_100g: 3.6,
        }]),
      });

      const view = await render(<CameraScreen />);
      await act(async () => fireEvent.press(view.getByTestId('gallery-button')));
      const saveButton = await waitFor(() => view.getByTestId('camera-add-journal-btn'));
      await act(async () => fireEvent.press(saveButton));

      expect(mockInsertMeal).toHaveBeenCalledTimes(1);
      expect(mockMaybeSingleMeal).toHaveBeenCalledTimes(1);
      expect(mockPushOfflineMealVerificat).not.toHaveBeenCalled();
      expect(savePhotoJobSaveAttempt).toHaveBeenCalledWith(
        mockUser.id,
        'photo-job-1',
        expect.any(String),
        expect.objectContaining({ user_id: mockUser.id }),
      );
      expect(clearActivePhotoJob).toHaveBeenCalledWith(mockUser.id, 'photo-job-1');
    });

    it('CAMERA PERSISTENCE RETRY: reuses the same operation id after an inconclusive readback', async () => {
      Platform.OS = 'android';
      mockLaunchImageLibrary.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///meal.jpg' }] });
      mockInsertMeal.mockResolvedValueOnce({ data: [], error: null });
      mockInsertMeal.mockResolvedValueOnce({ data: [], error: null });
      mockMaybeSingleMeal.mockResolvedValueOnce({ data: null, error: null });
      mockMaybeSingleMeal.mockImplementationOnce(async () => ({
        data: { ...(mockInsertMeal.mock.calls[1][0] as Record<string, unknown>) },
        error: null,
      }));
      (global.fetch as jest.Mock) = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ([{
          nume: 'Chicken', estimare_grame: 100, calorii_per_100g: 165,
          proteine_per_100g: 31, carbohidrati_per_100g: 0, grasimi_per_100g: 3.6,
        }]),
      });

      const view = await render(<CameraScreen />);
      await act(async () => fireEvent.press(view.getByTestId('gallery-button')));
      const saveButton = await waitFor(() => view.getByTestId('camera-add-journal-btn'));
      await act(async () => fireEvent.press(saveButton));
      await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith(
        'alerts.titluri.eroareSalvare',
        'alerts.mesaje.problemaNecunoscutaConectare',
      ));
      await act(async () => fireEvent.press(saveButton));

      expect(mockInsertMeal).toHaveBeenCalledTimes(2);
      const firstPayload = mockInsertMeal.mock.calls[0][0] as Record<string, unknown>;
      const retryPayload = mockInsertMeal.mock.calls[1][0] as Record<string, unknown>;
      expect(retryPayload.id).toBe(firstPayload.id);
      expect(mockMaybeSingleMeal).toHaveBeenCalledTimes(2);
      expect(Alert.alert).toHaveBeenCalledTimes(1);
      expect(clearActivePhotoJob).toHaveBeenCalledWith(mockUser.id, 'photo-job-1');
    });

    it('CAMERA RESTART RECOVERY: retries the exact reviewed category, portions and local date', async () => {
      Platform.OS = 'android';
      const reviewedResult = {
        nume: 'Chicken', estimare_grame: 150, calorii_per_100g: 165,
        proteine_per_100g: 31, carbohidrati_per_100g: 0, grasimi_per_100g: 3.6,
      };
      const reviewedMeal = construiestePayloadMasaCamera({
        idOperatie: 'recovered-photo-save',
        user_id: mockUser.id,
        rezultat: [reviewedResult],
        now: new Date('2026-10-10T20:30:00.000Z'),
        tip_masa: 'gustare',
      }).payload;
      (recoverPhotoJob as jest.Mock).mockResolvedValueOnce({
        job: {
          id: 'photo-job-1', status: 'succeeded',
          result: { success: true, tipMasa: 'cina', items: [{ ...reviewedResult, estimare_grame: 100 }] },
        },
        pointer: {
          userId: mockUser.id, jobId: 'photo-job-1', savedAt: 1,
          saveOperationId: 'recovered-photo-save', savePayload: reviewedMeal,
        },
      });
      mockInsertMeal.mockImplementationOnce(async () => ({ data: [{ ...reviewedMeal }], error: null }));

      const view = await render(<CameraScreen />);
      await waitFor(() => expect(view.getByText('chat.mealCategory.gustare')).toBeTruthy());
      const saveButton = await waitFor(() => view.getByTestId('camera-add-journal-btn'));
      await act(async () => fireEvent.press(saveButton));

      const inserted = mockInsertMeal.mock.calls[0][0] as Record<string, unknown>;
      expect(inserted).toEqual(reviewedMeal);
      expect(savePhotoJobSaveAttempt).toHaveBeenCalledWith(
        mockUser.id, 'photo-job-1', 'recovered-photo-save', reviewedMeal,
      );
      expect(clearActivePhotoJob).toHaveBeenCalledWith(mockUser.id, 'photo-job-1');
    });

    it('CAMERA RESTART RECOVERY: restores the exact edited ingredient list when it differs from AI output', async () => {
      Platform.OS = 'android';
      const reviewedItems = [
        {
          nume: 'Chicken', estimare_grame: 140, calorii_per_100g: 165,
          proteine_per_100g: 31, carbohidrati_per_100g: 0, grasimi_per_100g: 3.6,
        },
        {
          nume: 'Avocado', estimare_grame: 80, calorii_per_100g: 160,
          proteine_per_100g: 2, carbohidrati_per_100g: 9, grasimi_per_100g: 15,
        },
      ];
      const reviewedMeal = construiestePayloadMasaCamera({
        idOperatie: 'edited-photo-save',
        user_id: mockUser.id,
        rezultat: reviewedItems,
        now: new Date('2026-10-10T20:30:00.000Z'),
        tip_masa: 'gustare',
      }).payload;
      (recoverPhotoJob as jest.Mock).mockResolvedValueOnce({
        job: {
          id: 'photo-job-edited', status: 'succeeded',
          result: { success: true, tipMasa: 'cina', items: [
            reviewedItems[0],
            { nume: 'Rice (removed by user)', estimare_grame: 120, calorii_per_100g: 130, proteine_per_100g: 3, carbohidrati_per_100g: 28, grasimi_per_100g: 1 },
            { nume: 'Broccoli (removed by user)', estimare_grame: 80, calorii_per_100g: 34, proteine_per_100g: 2.8, carbohidrati_per_100g: 7, grasimi_per_100g: 0.4 },
          ] },
        },
        pointer: {
          userId: mockUser.id, jobId: 'photo-job-edited', savedAt: 1,
          saveOperationId: 'edited-photo-save', savePayload: reviewedMeal,
        },
      });
      mockInsertMeal.mockImplementationOnce(async () => ({ data: [{ ...reviewedMeal }], error: null }));

      const view = await render(<CameraScreen />);
      await waitFor(() => expect(view.getByText('chat.mealCategory.gustare')).toBeTruthy());
      expect(view.getAllByText('Chicken').length).toBeGreaterThan(0);
      expect(view.getAllByText('Avocado').length).toBeGreaterThan(0);
      expect(view.queryByText('Rice (removed by user)')).toBeNull();
      expect(view.queryByText('Broccoli (removed by user)')).toBeNull();

      await act(async () => fireEvent.press(view.getByTestId('camera-add-journal-btn')));
      expect(mockInsertMeal).toHaveBeenCalledTimes(1);
      expect(mockInsertMeal.mock.calls[0][0]).toEqual(reviewedMeal);
    });

    it('CAMERA ORPHANED SAVE: recovers a locked snapshot after job expiry and retries the exact owner UUID', async () => {
      Platform.OS = 'android';
      const reviewedItems = [{
        nume: 'Măr', estimare_grame: 175, calorii_per_100g: 52,
        proteine_per_100g: 0.3, carbohidrati_per_100g: 14, grasimi_per_100g: 0.2,
      }];
      const reviewedMeal = construiestePayloadMasaCamera({
        idOperatie: 'orphaned-photo-save',
        user_id: mockUser.id,
        rezultat: reviewedItems,
        now: new Date('2026-10-10T20:30:00.000Z'),
        tip_masa: 'gustare',
      }).payload;
      const pointer = {
        userId: mockUser.id,
        jobId: 'expired-photo-job',
        savedAt: 1,
        saveOperationId: 'orphaned-photo-save',
        savePayload: reviewedMeal,
      };
      (recoverPhotoJob as jest.Mock).mockResolvedValueOnce({ job: null, pointer, missingJob: true });
      mockMaybeSingleMeal.mockResolvedValueOnce({ data: null, error: null });
      mockInsertMeal.mockImplementationOnce(async () => ({ data: [{ ...reviewedMeal }], error: null }));

      const view = await render(<CameraScreen />);
      await waitFor(() => expect(view.getByTestId('camera-pending-save-lock-notice')).toBeTruthy());
      expect(mockMaybeSingleMeal).toHaveBeenCalledTimes(1);
      expect(view.getByText('chat.mealCategory.gustare')).toBeTruthy();
      expect(view.getAllByText('Măr').length).toBeGreaterThan(0);

      const categoryButton = view.getByTestId('camera-meal-correction-toggle');
      expect(categoryButton.props.accessibilityState.disabled).toBe(true);
      await act(async () => fireEvent.press(categoryButton));
      expect(view.queryByRole('radiogroup')).toBeNull();
      expect(view.getByText('chat.mealCategory.gustare')).toBeTruthy();
      expect(view.getByTestId('camera-locked-ingredient-grams').props.children).toEqual([175, ' g']);

      await act(async () => fireEvent.press(view.getByTestId('camera-add-journal-btn')));
      expect(mockInsertMeal).toHaveBeenCalledTimes(1);
      expect(mockInsertMeal.mock.calls[0][0]).toEqual(reviewedMeal);
      expect(savePhotoJobSaveAttempt).toHaveBeenCalledWith(
        mockUser.id, 'expired-photo-job', 'orphaned-photo-save', reviewedMeal,
      );
      expect(clearActivePhotoJob).toHaveBeenCalledWith(mockUser.id, 'expired-photo-job');
    });

    it('PENDING PHOTO SAVE LOCK: has localized recovery guidance in RO, EN, FR and DE', () => {
      const locales = [
        require('../i18n/locales/ro.json'),
        require('../i18n/locales/en.json'),
        require('../i18n/locales/fr.json'),
        require('../i18n/locales/de.json'),
      ];
      for (const locale of locales) {
        expect(locale.camera.pendingPhotoSaveLocked).toEqual(expect.any(String));
        expect(locale.camera.pendingPhotoSaveLocked.trim().length).toBeGreaterThan(20);
      }
    });
  });

  describe('Avatar gallery selection (app/(tabs)/profil.tsx)', () => {
    it('ANDROID: does NOT call requestMediaLibraryPermissionsAsync, calls launchImageLibraryAsync directly', async () => {
      Platform.OS = 'android';
      mockLaunchImageLibrary.mockResolvedValueOnce({
        canceled: true,
        assets: [],
      });

      const view = await render(<ProfilScreen />);
      expect(view.getAllByText('profile.premiumTitle')).toHaveLength(2);
      expect(view.getByText('profile.displayNameLabel')).toBeTruthy();
      expect(view.getByPlaceholderText('profile.displayNamePlaceholder')).toBeTruthy();
      expect(view.getAllByLabelText('profile.themeA11y')).toHaveLength(3);
      const avatarBtn = await waitFor(() => view.getByLabelText('profile.chooseProfilePhotoA11y'));

      await act(async () => {
        fireEvent.press(avatarBtn);
      });

      expect(mockRequestPermissions).not.toHaveBeenCalled();
      expect(mockLaunchImageLibrary).toHaveBeenCalledTimes(1);
      expect(mockLaunchImageLibrary).toHaveBeenCalledWith({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });
    });

    it('ANDROID: cancellation restores usable state and allows a second attempt', async () => {
      Platform.OS = 'android';
      mockLaunchImageLibrary.mockResolvedValueOnce({
        canceled: true,
        assets: [],
      });

      const view = await render(<ProfilScreen />);
      const avatarBtn = await waitFor(() => view.getByLabelText('profile.chooseProfilePhotoA11y'));

      // First attempt cancelled
      await act(async () => {
        fireEvent.press(avatarBtn);
      });
      expect(mockLaunchImageLibrary).toHaveBeenCalledTimes(1);

      // Second attempt executes
      mockLaunchImageLibrary.mockResolvedValueOnce({
        canceled: false,
        assets: [{ uri: 'file:///avatar.jpg' }],
      });
      await act(async () => {
        fireEvent.press(avatarBtn);
      });

      expect(mockLaunchImageLibrary).toHaveBeenCalledTimes(2);
      expect(mockRequestPermissions).not.toHaveBeenCalled();
    });

    it('ANDROID: error recovers and second attempt remains possible', async () => {
      Platform.OS = 'android';
      mockLaunchImageLibrary.mockRejectedValueOnce(new Error('Avatar picker error'));

      const view = await render(<ProfilScreen />);
      const avatarBtn = await waitFor(() => view.getByLabelText('profile.chooseProfilePhotoA11y'));

      // First attempt throws
      await act(async () => {
        fireEvent.press(avatarBtn);
      });
      expect(mockLaunchImageLibrary).toHaveBeenCalledTimes(1);

      // Second attempt executes
      mockLaunchImageLibrary.mockResolvedValueOnce({
        canceled: true,
        assets: [],
      });
      await act(async () => {
        fireEvent.press(avatarBtn);
      });

      expect(mockLaunchImageLibrary).toHaveBeenCalledTimes(2);
    });

    it('IOS: preserves requestMediaLibraryPermissionsAsync check', async () => {
      Platform.OS = 'ios';
      mockRequestPermissions.mockResolvedValueOnce({ granted: true });
      mockLaunchImageLibrary.mockResolvedValueOnce({
        canceled: true,
        assets: [],
      });

      const view = await render(<ProfilScreen />);
      const avatarBtn = await waitFor(() => view.getByLabelText('profile.chooseProfilePhotoA11y'));

      await act(async () => {
        fireEvent.press(avatarBtn);
      });

      expect(mockRequestPermissions).toHaveBeenCalledTimes(1);
      expect(mockLaunchImageLibrary).toHaveBeenCalledTimes(1);
    });

    it('IOS: denied permission blocks launchImageLibraryAsync and alerts user', async () => {
      Platform.OS = 'ios';
      mockRequestPermissions.mockResolvedValueOnce({ granted: false });

      const view = await render(<ProfilScreen />);
      const avatarBtn = await waitFor(() => view.getByLabelText('profile.chooseProfilePhotoA11y'));

      await act(async () => {
        fireEvent.press(avatarBtn);
      });

      expect(mockRequestPermissions).toHaveBeenCalledTimes(1);
      expect(mockLaunchImageLibrary).not.toHaveBeenCalled();
      expect(Alert.alert).toHaveBeenCalledWith(
        'alerts.titluri.permisiuneNecesara',
        'alerts.mesaje.permisiuneGaleriaProfil'
      );
    });
  });
});
