import React from 'react';
import { Alert, Platform } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';

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

// Mock expo-camera
jest.mock('expo-camera', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    CameraView: React.forwardRef(({ children }: any, ref: any) => (
      <View testID="camera-view">{children}</View>
    )),
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
  refresh: jest.fn(async () => null),
  open: jest.fn(),
};
jest.mock('../context/FlowCreditsContext', () => ({
  useFlowCredits: () => mockFlowCreditsReturn,
}));

const mockInsertMeal = jest.fn().mockResolvedValue({ data: null, error: null });
const mockPushOfflineMealVerificat = jest.fn().mockResolvedValue({ persistat: true, lungime: 1 });

jest.mock('../supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
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
}));

jest.mock('../lib/photoJobs', () => ({
  PhotoApiError: class PhotoApiError extends Error {
    status: number;
    code: string;
    constructor(status: number, code: string) { super(code); this.status = status; this.code = code; }
  },
  clearActivePhotoJob: jest.fn(async () => {}),
  cleanupPhotoAsset: jest.fn(async () => {}),
  recoverPhotoJob: jest.fn(async () => null),
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
}));

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
import {
  clearActivePhotoJob,
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
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockRequestPermissions.mockResolvedValue({ granted: true });
    mockInsertMeal.mockResolvedValue({ data: null, error: null });
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

    it('PHOTO BACKGROUND NAVIGATION: leaving after durable submission preserves the job and credit identity', async () => {
      Platform.OS = 'android';
      mockLaunchImageLibrary.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///meal.jpg' }] });
      (waitForPhotoJob as jest.Mock).mockImplementationOnce(() => new Promise(() => {}));

      const view = await render(<CameraScreen />);
      await act(async () => fireEvent.press(view.getByTestId('gallery-button')));
      await waitFor(() => expect(submitPhotoJob).toHaveBeenCalled());

      await act(async () => fireEvent.press(view.getByLabelText('common.close')));

      expect(clearActivePhotoJob).not.toHaveBeenCalled();
      expect(mockRouter.back).toHaveBeenCalledTimes(1);
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
