import React from 'react';
import { Alert } from 'react-native';
import { render, waitFor } from '@testing-library/react-native';
import type { Session } from '@supabase/supabase-js';
import AuthCallbackScreen from '../app/auth/callback';

const mockReplace = jest.fn();
const mockRouter = { replace: mockReplace };
const mockT = (key: string) => key;
const mockExchange = jest.fn();
let mockParams: Record<string, string> = {};
let mockCurrent: Session | null = null;
let mockObserved: Session | null = null;
let mockLoading = false;
let testNumber = 0;
const makeSession = (id: string) => ({ user: { id }, access_token: `test-${id}` }) as Session;

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => mockParams }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: mockT }) }));
jest.mock('expo-web-browser', () => ({ maybeCompleteAuthSession: jest.fn() }));
jest.mock('../context/ThemeContext', () => ({
  useTheme: () => ({ colors: { background: '#000', accent: '#fff', textSecondary: '#aaa' } }),
}));
jest.mock('../context/AuthContext', () => ({
  useAuth: () => ({ session: mockObserved, loadingAuth: mockLoading }),
}));
jest.mock('../supabase', () => ({
  supabase: { auth: {
    getSession: async () => ({ data: { session: mockCurrent }, error: null }),
    exchangeCodeForSession: (code: string) => mockExchange(code),
  } },
}));

describe('AUTH-OAUTH-001 callback and AuthContext convergence', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = { code: `unique-test-${++testNumber}` };
    mockCurrent = null; mockObserved = null; mockLoading = false;
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockExchange.mockImplementation(async () => {
      mockCurrent = makeSession('new');
      mockObserved = mockCurrent;
      return { data: { session: mockCurrent }, error: null };
    });
  });

  it('exchanges a fresh code despite an unrelated existing session', async () => {
    mockCurrent = makeSession('old');
    mockObserved = mockCurrent;
    await render(<AuthCallbackScreen />);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/auth/complete'));
    expect(mockExchange).toHaveBeenCalledWith(mockParams.code);
    expect(mockCurrent?.user.id).toBe('new');
    expect(mockReplace).not.toHaveBeenCalledWith('/(tabs)');
  });

  it('handles a cold callback without an existing session', async () => {
    await render(<AuthCallbackScreen />);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/auth/complete'));
    expect(mockExchange).toHaveBeenCalledTimes(1);
  });

  it('waits for AuthContext instead of navigating as the previously observed account', async () => {
    mockObserved = makeSession('old');
    mockExchange.mockImplementation(async () => {
      mockCurrent = makeSession('new');
      return { data: { session: mockCurrent }, error: null };
    });
    const view = await render(<AuthCallbackScreen />);
    expect(mockReplace).not.toHaveBeenCalled();
    mockObserved = mockCurrent;
    mockLoading = true;
    await view.rerender(<AuthCallbackScreen />);
    expect(mockReplace).not.toHaveBeenCalled();
    mockLoading = false;
    await view.rerender(<AuthCallbackScreen />);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/auth/complete'));
  });

  it('does not re-exchange a completed callback after remount', async () => {
    const first = await render(<AuthCallbackScreen />);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/auth/complete'));
    await first.unmount();
    await render(<AuthCallbackScreen />);
    expect(mockExchange).toHaveBeenCalledTimes(1);
  });

  it('does not reuse the previous completion while a different callback is exchanging', async () => {
    const view = await render(<AuthCallbackScreen />);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/auth/complete'));
    mockReplace.mockClear();
    mockParams = { code: 'second-callback-delivery', flow: 'recovery' };
    mockExchange.mockImplementation(() => new Promise(() => {}));
    await view.rerender(<AuthCallbackScreen />);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it.each(['flow', 'type'])('preserves %s=recovery and changes the account before password reset', async marker => {
    mockCurrent = makeSession('old'); mockObserved = mockCurrent;
    mockParams[marker] = 'recovery';
    await render(<AuthCallbackScreen />);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/auth/noua-parola'));
    expect(mockCurrent?.user.id).toBe('new');
    expect(mockExchange).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalledWith('/auth/complete');
  });

  it.each(['provider', 'exchange', 'missing-session', 'missing-code', 'implicit-token'])('fails safely on %s with localized feedback', async failure => {
    if (failure === 'provider') mockParams.error_description = 'private-provider-data';
    if (failure === 'exchange') mockExchange.mockRejectedValue(new Error('private-provider-data'));
    if (failure === 'missing-session') mockExchange.mockResolvedValue({ data: { session: null }, error: null });
    if (failure === 'missing-code') mockParams = {};
    if (failure === 'implicit-token') mockParams = { access_token: 'untrusted', refresh_token: 'untrusted' };
    await render(<AuthCallbackScreen />);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/auth'));
    expect(Alert.alert).toHaveBeenCalledWith('alerts.titluri.eroareOAuth', 'alerts.mesaje.problemaConexiuneOAuth');
    expect(mockReplace).not.toHaveBeenCalledWith('/auth/complete');
    expect(mockReplace).not.toHaveBeenCalledWith('/auth/noua-parola');
  });
});
