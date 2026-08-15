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

  describe('REV-002 — sesiuni de recuperare parolă & izolare conturi', () => {
    it('1. cont B activ + link de recovery valid pentru cont A -> execută schimbul de cod și stabilește sesiunea lui A', async () => {
      // Sesiune inițială aparține contului B
      mockGetSession.mockResolvedValueOnce({ data: { session: { user: { id: 'user_B' } } }, error: null });
      mockParams = { code: 'recovery_code_for_user_A', type: 'recovery' };

      mockExchangeCodeForSession.mockImplementationOnce(() => {
        // Schimbul reușit stabilește sesiunea contului A
        mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'user_A' } } }, error: null });
        return Promise.resolve({ error: null });
      });

      render(<AuthCallbackScreen />);

      // REV-002: Nu se face short-circuit pe user_B; exchangeCodeForSession este apelat pentru codul lui A
      await waitFor(() => expect(mockExchangeCodeForSession).toHaveBeenCalledWith('recovery_code_for_user_A'));
      await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/auth/noua-parola'));
      const finalSession = await mockGetSession();
      expect(finalSession.data.session.user.id).toBe('user_A');
    });

    it('2. callback duplicat OAuth cu sesiune deja existentă -> nu repetă schimbul', async () => {
      mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'user_OAuth' } } }, error: null });
      mockParams = { code: 'oauth_code', provider: 'google' };

      render(<AuthCallbackScreen />);

      await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(tabs)'));
      expect(mockExchangeCodeForSession).not.toHaveBeenCalled();
    });

    it('3. link recovery invalid sau expirat -> redirecționează la /auth și NU navighează la noua-parola', async () => {
      mockGetSession.mockResolvedValueOnce({ data: { session: { user: { id: 'user_B' } } }, error: null });
      mockParams = { code: 'invalid_expired_code', type: 'recovery' };
      mockExchangeCodeForSession.mockResolvedValueOnce({ error: new Error('Token has expired or is invalid') });

      render(<AuthCallbackScreen />);

      await waitFor(() => expect(mockExchangeCodeForSession).toHaveBeenCalledWith('invalid_expired_code'));
      await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/auth'));
      expect(mockReplace).not.toHaveBeenCalledWith('/auth/noua-parola');
    });

    it('4. recovery fără sesiune existentă -> funcționează normal și navighează la noua-parola', async () => {
      mockGetSession.mockResolvedValueOnce({ data: { session: null }, error: null });
      mockParams = { code: 'clean_recovery_code', type: 'recovery' };
      mockExchangeCodeForSession.mockImplementationOnce(() => {
        mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'user_Clean' } } }, error: null });
        return Promise.resolve({ error: null });
      });

      render(<AuthCallbackScreen />);

      await waitFor(() => expect(mockExchangeCodeForSession).toHaveBeenCalledWith('clean_recovery_code'));
      await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/auth/noua-parola'));
    });
  });
});
