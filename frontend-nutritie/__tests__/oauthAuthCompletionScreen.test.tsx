import React from 'react';
import { render, waitFor, screen, fireEvent, act } from '@testing-library/react-native';
import AuthCompletionScreen from '../app/auth/complete';

const mockReplace = jest.fn();
const mockRouter = { replace: mockReplace };
let mockSession: { user: { id: string }; access_token: string } | null = null;
let mockLoading = false;
let mockDone = false;
const mockSetDone = jest.fn(async (val: boolean) => { mockDone = val; });
const mockRestore = jest.fn(async (_profile: unknown) => {});
const mockGetSession = jest.fn();
const mockSingle = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
}));

jest.mock('../context/AuthContext', () => ({
  useAuth: () => ({ session: mockSession, loadingAuth: mockLoading }),
}));

jest.mock('../context/ThemeContext', () => ({
  useTheme: () => ({
    colors: { background: '#090C0E', accent: '#CCFF00', textSecondary: '#888', surface: '#12161A', border: '#222', textPrimary: '#FFF' },
  }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback || key,
  }),
}));

jest.mock('../hooks/useAppStore', () => {
  const getState = () => ({
    isOnboardingDone: mockDone,
    setOnboardingDone: mockSetDone,
  });
  const useAppStore = () => getState();
  useAppStore.getState = getState;
  return { useAppStore };
});

jest.mock('../supabase', () => ({
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => mockSingle(),
        }),
      }),
    }),
  },
}));

jest.mock('../lib/onboarding', () => ({
  restaureazaProfilLocal: (profile: unknown) => mockRestore(profile),
}));

describe('AUTH-COMPLETION-001 AuthCompletionScreen active deterministic navigation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSession = null;
    mockLoading = false;
    mockDone = false;
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockSingle.mockResolvedValue({ data: null });
    global.fetch = jest.fn();
  });

  it('navigates directly to /(tabs) when local onboarding is already done', async () => {
    mockDone = true;
    mockSession = { user: { id: 'user-done' }, access_token: 'tok-done' };

    render(<AuthCompletionScreen />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(tabs)');
    });
  });

  it('restores server profile and routes returning user to /(tabs)', async () => {
    mockDone = false;
    mockSession = { user: { id: 'returning-user' }, access_token: 'tok-returning' };
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        exista: true,
        complet: true,
        profil: { caloriiTinta: 2200, greutate: 75 },
      }),
    });

    render(<AuthCompletionScreen />);

    await waitFor(() => {
      expect(mockRestore).toHaveBeenCalledWith({ caloriiTinta: 2200, greutate: 75 });
      expect(mockSetDone).toHaveBeenCalledWith(true);
      expect(mockReplace).toHaveBeenCalledWith('/(tabs)');
    });
  });

  it('routes new user without server or DB profile to /onboarding', async () => {
    mockDone = false;
    mockSession = { user: { id: 'brand-new-user' }, access_token: 'tok-new' };
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ exista: false }),
    });
    mockSingle.mockResolvedValueOnce({ data: null });

    render(<AuthCompletionScreen />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/onboarding');
    });
  });

  describe('Watchdog and error recovery', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('watchdog recovers if AuthContext had delayed state but Supabase session exists', async () => {
      mockDone = true;
      mockSession = null; // AuthContext hasn't published yet
      mockLoading = true;
      mockGetSession.mockResolvedValue({
        data: { session: { user: { id: 'delayed-user' }, access_token: 'tok-delayed' } },
      });

      await render(<AuthCompletionScreen />);
      expect(mockReplace).not.toHaveBeenCalled();

      // Advance watchdog timer
      await act(async () => {
        await jest.advanceTimersByTimeAsync(2600);
      });

      expect(mockReplace).toHaveBeenCalledWith('/(tabs)');
    });

    it('shows retry button if watchdog expires with no session found, allowing user recovery', async () => {
      mockSession = null;
      mockLoading = true;
      mockGetSession.mockResolvedValue({ data: { session: null } });

      const { getByTestId } = await render(<AuthCompletionScreen />);

      await act(async () => {
        await jest.advanceTimersByTimeAsync(2600);
      });

      const retryBtn = getByTestId('auth-completion-retry');
      expect(retryBtn).toBeTruthy();

      // Clicking retry with still no session returns to /auth safely
      await act(async () => {
        fireEvent.press(retryBtn);
      });

      expect(mockReplace).toHaveBeenCalledWith('/auth');
    });
  });
});
