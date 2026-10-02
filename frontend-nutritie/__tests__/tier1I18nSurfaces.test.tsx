import React from 'react';
import { Text, View } from 'react-native';
import { fireEvent, render, waitFor, within } from '@testing-library/react-native';
import fs from 'fs';
import path from 'path';

const mockBack = jest.fn();
const mockPush = jest.fn();
const mockToggleReminders = jest.fn();
const mockToggleBiometric = jest.fn();
const mockMarkAllRead = jest.fn();
let mockNotifications: Array<Record<string, unknown>> = [];
let mockI18nLocale = 'en';
let mockResolveTranslations = false;
let mockProfileSession: { user: { id: string; email: string; user_metadata: Record<string, unknown> }; access_token: string } | null = null;

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
jest.mock('../i18n', () => ({
  __esModule: true,
  changeLanguage: jest.fn(),
  SUPPORTED_LANGUAGES: ['ro', 'en', 'fr', 'de'],
  LANGUAGE_NAMES: {
    ro: { label: 'Română', flag: '🇷🇴' }, en: { label: 'English', flag: '🇬🇧' },
    fr: { label: 'Français', flag: '🇫🇷' }, de: { label: 'Deutsch', flag: '🇩🇪' },
  },
}));

jest.mock('expo-router', () => ({
  router: { back: mockBack, push: jest.fn() },
  useRouter: () => ({ back: mockBack, push: mockPush, replace: jest.fn(), canGoBack: () => false }),
  useNavigation: () => ({ addListener: jest.fn(() => jest.fn()), setOptions: jest.fn() }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined), removeItem: jest.fn(async () => undefined),
}));
jest.mock('../supabase', () => ({ supabase: { auth: { getUser: jest.fn() }, from: jest.fn() } }));
jest.mock('expo-file-system/legacy', () => ({ cacheDirectory: null, documentDirectory: null }));
jest.mock('expo-image-picker', () => ({ requestMediaLibraryPermissionsAsync: jest.fn(), launchImageLibraryAsync: jest.fn() }));

jest.mock('../context/ThemeContext', () => ({
  useTheme: () => ({
    colors: {
      background: '#000', textPrimary: '#fff', textSecondary: '#aaa', textTertiary: '#777',
      accent: '#0ff', accentSecondary: '#0f0', accentTertiary: '#09f', surface: '#111',
      surfaceElevated: '#222', surfaceBg: '#181818', border: '#333', success: '#0f0',
      warning: '#ff0', danger: '#f00',
      accentGradient: ['#0ff', '#0f0'], textOnAccent: '#000', cardBg: '#111', cardBorder: '#333',
    },
  }),
}));

jest.mock('../context/NotificationBannerContext', () => ({
  useNotificationBannerActions: () => ({ showBanner: jest.fn() }),
  useNotificationBanner: () => ({ notifications: mockNotifications, markAllRead: mockMarkAllRead, clearAll: jest.fn() }),
}));

jest.mock('expo-camera', () => ({
  CameraView: () => null,
  useCameraPermissions: () => [{ granted: false, canAskAgain: false }, jest.fn()],
}));

jest.mock('expo-blur', () => {
  const ReactMock = require('react');
  const { View: MockView } = require('react-native');
  return { BlurView: ({ children }: { children: React.ReactNode }) => ReactMock.createElement(MockView, null, children) };
});
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(), selectionAsync: jest.fn(), notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'Light', Medium: 'Medium' },
  NotificationFeedbackType: { Success: 'Success', Warning: 'Warning' },
}));
jest.mock('lucide-react-native', () => {
  const ReactMock = require('react');
  const { View: MockView } = require('react-native');
  return new Proxy({}, { get: () => () => ReactMock.createElement(MockView) });
});
jest.mock('../lib/openfoodfacts', () => ({ getProdusByBarcode: jest.fn() }));
jest.mock('../hooks/useCamara', () => ({
  useCamara: () => ({ produse: [], adaugaProdus: jest.fn(), modificaCantitate: jest.fn(), toggleCongelator: jest.fn(), stergeProdus: jest.fn() }),
}));
jest.mock('../components/AddMealBottomSheet', () => ({ AddMealBottomSheet: () => null }));
jest.mock('../components/food/ManualProductForm', () => ({ ManualProductForm: () => null }));
jest.mock('../components/ui/ConfirmSheet', () => ({
  ConfirmSheet: ({ visible, title, message, confirmLabel }: { visible: boolean; title: string; message: string; confirmLabel: string }) => {
    const ReactMock = require('react');
    const { View: MockView, Text: MockText } = require('react-native');
    return visible
      ? ReactMock.createElement(MockView, null,
        ReactMock.createElement(MockText, null, title),
        ReactMock.createElement(MockText, null, message),
        ReactMock.createElement(MockText, null, confirmLabel))
      : null;
  },
}));
jest.mock('../hooks/useReducedMotion', () => ({ useReducedMotion: () => true }));
jest.mock('../context/AuthContext', () => ({ useAuth: () => ({ session: mockProfileSession, user: mockProfileSession?.user ?? null, loadingAuth: false }) }));
jest.mock('../hooks/useNotifications', () => ({ useNotifications: () => ({ enabled: false, toggleReminders: mockToggleReminders, isExpoGo: false }) }));
jest.mock('../hooks/useBiometrics', () => ({ useBiometrics: () => ({ isSupported: true, biometricType: 'Face ID', isEnabled: false, toggleBiometric: mockToggleBiometric }) }));
jest.mock('../hooks/useHealthSync', () => ({ useHealthSync: () => ({ isEnabled: false, platformName: 'Test', toggleSync: jest.fn(), providerInfo: null }) }));
jest.mock('../hooks/useNotify', () => ({ useNotify: () => ({ success: jest.fn(), error: jest.fn(), info: jest.fn() }) }));
jest.mock('../context/AdsContext', () => ({ useAds: () => ({ privacyOptionsRequired: false, showPrivacyOptions: jest.fn() }) }));
jest.mock('../context/NotificationBannerContext', () => ({
  useNotificationBannerActions: () => ({ showBanner: jest.fn() }),
  useNotificationBanner: () => ({ notifications: mockNotifications, markAllRead: mockMarkAllRead, clearAll: jest.fn() }),
}));
jest.mock('../context/GamificareContext', () => ({ useGamificareData: () => ({ insigne: [] }) }));
jest.mock('../hooks/useResponsiveLayout', () => ({ useResponsiveLayout: () => ({ scrollPaddingTop: 0, scrollPaddingBottom: 0 }) }));
jest.mock('../lib/notificationConsent', () => ({ getConsent: jest.fn(async () => ({ grantedAt: 'consented' })), cancelManagedReminders: jest.fn() }));
jest.mock('../lib/sincronizeazaTargeturi', () => ({ citesteTargeturiPending: jest.fn(async () => null), salveazaTargeturiPending: jest.fn(), stergeTargeturiPending: jest.fn() }));
jest.mock('../lib/offlineQueue', () => ({ clearOfflineQueue: jest.fn() }));
jest.mock('../lib/accountDeletion', () => ({ finalizeConfirmedAccountDeletion: jest.fn() }));
jest.mock('../lib/gdprExport', () => ({ buildCompleteUserExport: jest.fn(), fetchServerGdprExport: jest.fn() }));
jest.mock('../components/ui/KeyboardAwareScreen', () => ({ __esModule: true, default: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('../components/ui/FeedbackModal', () => ({ FeedbackModal: () => null }));
jest.mock('../components/ui/WatchSelectorSheet', () => ({ WatchSelectorSheet: () => null }));
jest.mock('../context/FlowCreditsContext', () => ({ useFlowCredits: () => ({ balance: 0, loading: false }) }));
jest.mock('../lib/photoJobs', () => ({
  clearActivePhotoJob: jest.fn(), cleanupPhotoAsset: jest.fn(), recoverPhotoJob: jest.fn(async () => null),
  submitPhotoJob: jest.fn(), waitForPhotoJob: jest.fn(), PhotoApiError: class PhotoApiError extends Error {},
}));
jest.mock('../lib/mealUtils', () => ({ clampValoare: jest.fn(), LIMITE_DB_MESE: {}, MEAL_CATEGORIES: [], CATEGORIE_ICONA: {}, getTipMasaDupaOra: jest.fn(), insereazaMasaCuPoza: jest.fn() }));

import ScannerBarcodeScreen from '../app/scanner-barcode';
import CameraScreen from '../app/camera';
import ProfileScreen from '../app/(tabs)/profil';
import NotificariScreen from '../app/notificari';
import LockScreen from '../components/LockScreen';
import { DEFAULT_MEAL_REMINDERS } from '../lib/notifications';

describe('Tier 1 i18n — production callers', () => {
  beforeEach(() => {
    mockNotifications = [];
    mockI18nLocale = 'en';
    mockResolveTranslations = false;
    mockProfileSession = null;
    jest.clearAllMocks();
  });

  test.each(['ro', 'en', 'fr', 'de'])('mounts the production Camera permission screen without raw keys in %s', async (locale) => {
    mockI18nLocale = locale;
    mockResolveTranslations = true;
    const resources: Record<string, any> = {
      ro: require('../i18n/locales/ro.json'),
      en: require('../i18n/locales/en.json'),
      fr: require('../i18n/locales/fr.json'),
      de: require('../i18n/locales/de.json'),
    };
    const view = await render(<CameraScreen />);
    expect(view.getByText(resources[locale].camera.permissionTitle)).toBeTruthy();
    expect(view.getByText(resources[locale].camera.permissionSubtitle)).toBeTruthy();
    expect(view.getByText(resources[locale].camera.openSettings)).toBeTruthy();
    expect(view.getByText(resources[locale].camera.permissionDeniedPermanent)).toBeTruthy();
    expect(view.getByText(resources[locale].camera.back)).toBeTruthy();
  });

  test.each(['ro', 'en', 'fr', 'de'])('Profile hides numeric nutrition targets and keeps settings in %s', async (locale) => {
    mockI18nLocale = locale;
    mockResolveTranslations = true;
    mockProfileSession = {
      user: { id: 'profile-i18n-test', email: 'tester@example.com', user_metadata: {} },
      access_token: 'test-token',
    };
    const resources: Record<string, any> = {
      ro: require('../i18n/locales/ro.json'),
      en: require('../i18n/locales/en.json'),
      fr: require('../i18n/locales/fr.json'),
      de: require('../i18n/locales/de.json'),
    };
    const view = await render(<ProfileScreen />);
    await waitFor(() => expect(view.getByTestId('profile-recalculate-goals')).toBeTruthy());
    for (const key of ['weight', 'target_weight', 'calories', 'protein', 'carbs', 'fats']) {
      expect(view.queryByLabelText(resources[locale].profile[key])).toBeNull();
    }
    expect(view.queryByText(resources[locale].profile.howItWorksDesc)).toBeNull();
    const contact = within(view.getByTestId('profile-contact-section'));
    const dataPrivacy = within(view.getByTestId('profile-data-privacy-section'));
    expect(contact.getByLabelText(resources[locale].profile.contactUsA11y)).toBeTruthy();
    expect(contact.queryByLabelText(resources[locale].profile.termsA11y)).toBeNull();
    expect(dataPrivacy.getByLabelText(resources[locale].profile.termsA11y)).toBeTruthy();
    expect(dataPrivacy.getByLabelText(resources[locale].profile.exportDataA11y)).toBeTruthy();
    expect(dataPrivacy.getByLabelText(resources[locale].profile.deleteAccountA11y)).toBeTruthy();
    expect(view.getByText(resources[locale].profile.themeSection)).toBeTruthy();
    expect(view.getByText(resources[locale].profile.languageSection)).toBeTruthy();
    expect(view.getByLabelText(resources[locale].profile.notificationsTitle)).toBeTruthy();
    expect(view.getByText(resources[locale].profile.securityTitle)).toBeTruthy();
    expect(view.getByText(resources[locale].profile.preferencesSection)).toBeTruthy();
    await fireEvent(view.getByTestId('profile-notifications-toggle'), 'valueChange', true);
    await fireEvent(view.getByTestId('profile-biometric-toggle'), 'valueChange', true);
    expect(mockToggleReminders).toHaveBeenCalledWith(true);
    expect(mockToggleBiometric).toHaveBeenCalledWith(true);
  });

  test('Profile recalculation action preserves the existing AI goals route', async () => {
    mockProfileSession = {
      user: { id: 'profile-recalculate-test', email: 'tester@example.com', user_metadata: {} },
      access_token: 'test-token',
    };
    const view = await render(<ProfileScreen />);
    await fireEvent.press(view.getByTestId('profile-recalculate-goals'));
    expect(mockPush).toHaveBeenCalledWith('/calculator-ai');
  });

  test.each(['ro', 'en', 'fr', 'de'])('Profile shows the configured meal reminder schedule compactly in %s', async (locale) => {
    mockI18nLocale = locale;
    mockResolveTranslations = true;
    mockProfileSession = {
      user: { id: 'profile-reminders-test', email: 'tester@example.com', user_metadata: {} },
      access_token: 'test-token',
    };
    const resources: Record<string, any> = {
      ro: require('../i18n/locales/ro.json'),
      en: require('../i18n/locales/en.json'),
      fr: require('../i18n/locales/fr.json'),
      de: require('../i18n/locales/de.json'),
    };
    const mealLabelKeyByReminderId: Record<string, string> = {
      reminder_mic_dejun: 'breakfast',
      reminder_pranz: 'lunch',
      reminder_cina: 'dinner',
    };
    const view = await render(<ProfileScreen />);
    const reminderTimes = within(view.getByTestId('profile-meal-reminder-times'));

    expect(view.getByTestId('profile-notifications-toggle')).toBeTruthy();
    expect(reminderTimes.queryAllByRole('switch')).toHaveLength(0);
    expect(DEFAULT_MEAL_REMINDERS).toHaveLength(3);
    for (const reminder of DEFAULT_MEAL_REMINDERS) {
      const reminderChip = within(view.getByTestId(`profile-meal-reminder-${reminder.id}`));
      const mealKey = mealLabelKeyByReminderId[reminder.id];
      expect(reminderChip.getByText(resources[locale].chat.recipeGen.tipMasa[mealKey])).toBeTruthy();
      expect(reminderChip.getByText(`${String(reminder.hour).padStart(2, '0')}:${String(reminder.minute).padStart(2, '0')}`)).toBeTruthy();
    }

    const biometricRow = within(view.getByTestId('profile-biometric-row'));
    expect(biometricRow.getByTestId('profile-biometric-toggle')).toBeTruthy();
    expect(biometricRow.getByText(resources[locale].profile.securityTitle)).toBeTruthy();
  });

  test('scanner permission surface is translated through canonical keys', async () => {
    const view = await render(<ScannerBarcodeScreen />);
    expect(view.getByText('scannerBarcode.permissionTitle')).toBeTruthy();
    expect(view.getByText('scannerBarcode.permissionSubtitle')).toBeTruthy();
    expect(view.getByText('scannerBarcode.openSettings')).toBeTruthy();
    expect(view.getByLabelText('scannerBarcode.openSettingsA11y')).toBeTruthy();
  });

  test('notification center empty state uses translations', async () => {
    const view = await render(<NotificariScreen />);
    expect(view.getByText('notificationCenter.title')).toBeTruthy();
    expect(view.getByText('notificationCenter.emptyTitle')).toBeTruthy();
    expect(view.getByText('notificationCenter.emptyMessage')).toBeTruthy();
  });

  test('notification center destructive confirmation uses translations', async () => {
    mockNotifications = [{
      id: 'n1', title: 'Title', message: 'Message', type: 'info', createdAt: Date.now(), read: false,
    }];
    const view = await render(<NotificariScreen />);
    await fireEvent.press(view.getByLabelText('notificationCenter.clearAllA11y'));
    await waitFor(() => expect(view.getByText('notificationCenter.clearTitle')).toBeTruthy());
    expect(view.getByText('notificationCenter.clearMessage')).toBeTruthy();
    expect(view.getByText('notificationCenter.clearConfirm')).toBeTruthy();
  });

  test('biometric lock screen uses translations for the critical access action', async () => {
    const view = await render(<LockScreen biometricType="Fingerprint" onUnlock={jest.fn(async () => true)} />);
    expect(view.getByText('lockScreen.title')).toBeTruthy();
    expect(view.getByText('lockScreen.subtitle')).toBeTruthy();
    expect(view.getByText('lockScreen.unlockAction')).toBeTruthy();
    expect(view.getByLabelText('lockScreen.unlockA11y')).toBeTruthy();
  });

  test('global crash fallback resolves visible copy through i18n', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'components', 'GlobalErrorBoundary.tsx'), 'utf8');
    expect(source).toContain("i18n.t('globalError.title')");
    expect(source).toContain("i18n.t('globalError.message')");
    expect(source).toContain("i18n.t('globalError.retry')");
  });
});
