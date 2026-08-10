// G1: guard de idempotență pe fluxul OAuth PKCE — pe Android, `openAuthSessionAsync`
// polifilizează prin Linking.addEventListener('url'), la care e abonat și
// expo-router, deci callback.tsx poate fi declanșat de două ori cu același `code`.
// Testăm că, dacă sesiunea există deja, nu se mai face exchangeCodeForSession.
import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import AuthCallbackScreen from '../app/auth/callback';

const mockReplace = jest.fn();
const mockGetSession = jest.fn();
const mockExchangeCodeForSession = jest.fn();
let mockParams: Record<string, string> = { code: 'cod-unic', provider: 'google' };

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useLocalSearchParams: () => mockParams,
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

jest.mock('../context/ThemeContext', () => ({
  useTheme: () => ({ colors: { background: '#000', accent: '#fff', textSecondary: '#aaa' } }),
}));

jest.mock('../supabase', () => ({
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
      exchangeCodeForSession: (cod: string) => mockExchangeCodeForSession(cod),
    },
  },
}));

describe('app/auth/callback — guard idempotență OAuth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = { code: 'cod-unic', provider: 'google' };
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
    mockExchangeCodeForSession.mockImplementation((cod: string) => {
      // Schimbul reușit populează sesiunea, pe care getSession() o întoarce apoi.
      mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } }, error: null });
      return Promise.resolve({ error: null });
    });
  });

  it('nu schimbă codul când sesiunea există deja (dublă procesare Android)', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } }, error: null });

    render(<AuthCallbackScreen />);

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(tabs)'));
    expect(mockExchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('schimbă codul când nu există sesiune', async () => {
    render(<AuthCallbackScreen />);

    await waitFor(() => expect(mockExchangeCodeForSession).toHaveBeenCalledWith('cod-unic'));
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)');
  });

  // H1: emailul de resetare a parolei redirecționează cu `type=recovery` în hash.
  // După stabilirea sesiunii, callback-ul trebuie să ducă la ecranul de parolă
  // NOUĂ, nu în (tabs) — altfel utilizatorul rămâne blocat cu parola veche.
  it('redirectează la /auth/noua-parola când type=recovery', async () => {
    mockParams = { code: 'cod-unic', type: 'recovery' };

    render(<AuthCallbackScreen />);

    await waitFor(() => expect(mockExchangeCodeForSession).toHaveBeenCalledWith('cod-unic'));
    expect(mockReplace).toHaveBeenCalledWith('/auth/noua-parola');
    expect(mockReplace).not.toHaveBeenCalledWith('/(tabs)');
  });
});
