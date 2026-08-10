// H1: ecranul de finalizare a resetării parolei (/auth/noua-parola). Verificăm
// că (1) fără sesiune trimite înapoi la login, (2) cu parole valide și identice
// apelează updateUser cu parola nouă.
import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import NouaParolaScreen from '../app/auth/noua-parola';

const mockReplace = jest.fn();
const mockGetSession = jest.fn();
const mockUpdateUser = jest.fn();
const mockAlert = jest.spyOn(Alert, 'alert');

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

jest.mock('../context/ThemeContext', () => ({
  useTheme: () => ({
    colors: {
      background: '#0b0f1a',
      accent: '#00e5ff',
      accentSecondary: '#0088ff',
      accentGradient: ['#00e5ff', '#0088ff'],
      cardBg: '#131a2b',
      cardBorder: '#232c44',
      textPrimary: '#fff',
      textSecondary: '#8b93a7',
      inputBg: '#0f1424',
      inputBorder: '#232c44',
      danger: '#f43f5e',
      dangerBg: '#2a1522',
      dangerBorder: '#4a2438',
      success: '#22c55e',
      overlayLight: 'rgba(255,255,255,0.05)',
      overlayStrong: 'rgba(255,255,255,0.12)',
      surfaceBg: '#111827',
    },
  }),
}));

jest.mock('../supabase', () => ({
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
      updateUser: (attrs: object) => mockUpdateUser(attrs),
    },
  },
}));

jest.mock('../hooks/useResponsiveLayout', () => ({
  useResponsiveLayout: () => ({ contentMaxWidth: 520 }),
}));

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  NotificationFeedbackType: { Error: 'Error', Success: 'Success' },
}));

jest.mock('lucide-react-native', () => {
  const ReactMock = require('react');
  const { View } = require('react-native');
  const Icon = () => ReactMock.createElement(View);
  return {
    KeyRound: Icon,
    Lock: Icon,
    Eye: Icon,
    EyeOff: Icon,
    CheckCircle2: Icon,
    Circle: Icon,
    ArrowRight: Icon,
  };
});

describe('app/auth/noua-parola — resetare parolă (H1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAlert.mockClear();
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } }, error: null });
    mockUpdateUser.mockResolvedValue({ error: null });
  });

  // RNTL v14: render() e async (întoarce Promise), deci toate testele sunt async.
  it('redă titlul ecranului de parolă nouă', async () => {
    const { getByText } = await render(<NouaParolaScreen />);
    expect(getByText('Setare parolă nouă')).toBeTruthy();
  });

  it('fără sesiune (link expirat) → alertă + înapoi la login', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });

    await render(<NouaParolaScreen />);

    await waitFor(() => expect(mockAlert).toHaveBeenCalled());
    expect(mockReplace).toHaveBeenCalledWith('/auth');
  });

  it('cu parole valide și identice → updateUser cu parola nouă', async () => {
    const { getByLabelText, getByText } = await render(<NouaParolaScreen />);

    await fireEvent.changeText(getByLabelText('Parolă nouă'), 'Parola123');
    await fireEvent.changeText(getByLabelText('Confirmă parola'), 'Parola123');
    await fireEvent.press(getByText('Salvează parola nouă'));

    await waitFor(() => expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'Parola123' }));
  });

  it('parole care nu coincid → NU apelează updateUser', async () => {
    const { getByLabelText, getByText } = await render(<NouaParolaScreen />);

    await fireEvent.changeText(getByLabelText('Parolă nouă'), 'Parola123');
    await fireEvent.changeText(getByLabelText('Confirmă parola'), 'Parola124');
    await fireEvent.press(getByText('Salvează parola nouă'));

    await waitFor(() => expect(getByText('Parolele nu coincid.')).toBeTruthy());
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });
});
