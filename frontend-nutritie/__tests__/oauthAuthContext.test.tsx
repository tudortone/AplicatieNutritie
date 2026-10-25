import React from 'react';
import { Text } from 'react-native';
import { act, render, waitFor } from '@testing-library/react-native';
import type { Session } from '@supabase/supabase-js';
import { AuthProvider, useAuth } from '../context/AuthContext';

let mockListener: (event: string, session: Session | null) => void;
const mockGetSession = jest.fn();
const mockPrepare = jest.fn();
const mockSync = jest.fn(async (_id: string) => {});
const mockHydrate = jest.fn(async (_id: string) => true);
jest.mock('../supabase', () => ({ supabase: { auth: {
  getSession: () => mockGetSession(),
  onAuthStateChange: (listener: typeof mockListener) => {
    mockListener = listener;
    return { data: { subscription: { unsubscribe: jest.fn() } } };
  },
} } }));
jest.mock('../lib/userDataCleanup', () => ({
  prepareLocalDataForUser: (id: string) => mockPrepare(id),
  prepareLocalDataForNoSession: async () => false,
  clearLocalUserData: async () => {},
}));
jest.mock('../lib/onboarding', () => ({
  sincronizeazaOnboardingLaProfil: (id: string) => mockSync(id),
  restaureazaProfilSesiune: (id: string) => mockHydrate(id),
}));
jest.mock('../hooks/useAppStore', () => ({ useAppStore: { getState: () => ({ setOnboardingDone: async () => {} }) } }));
const session = (id: string) => ({ user: { id }, access_token: `test-${id}` }) as Session;
function Probe() {
  const { session: current, loadingAuth } = useAuth();
  return <Text>{loadingAuth ? 'loading' : current?.user.id ?? 'signed-out'}</Text>;
}

describe('AUTH-OAUTH-001 AuthContext event ordering', () => {
  beforeEach(() => { jest.clearAllMocks(); mockPrepare.mockResolvedValue(false); mockHydrate.mockReset().mockResolvedValue(true); });

  it('restores the returning account targets before publishing it and avoids repeated hydration on token refresh', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
    let release!: (value: boolean) => void;
    mockHydrate.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const view = await render(<AuthProvider><Probe /></AuthProvider>);
    await act(async () => mockListener('SIGNED_IN', session('returning')));
    await waitFor(() => expect(mockHydrate).toHaveBeenCalledWith('returning'));
    expect(view.queryByText('returning')).toBeNull();
    await act(async () => release(true));
    await waitFor(() => expect(view.getByText('returning')).toBeTruthy());
    await act(async () => mockListener('TOKEN_REFRESHED', session('returning')));
    expect(mockHydrate).toHaveBeenCalledTimes(1);
  });

  it('does not overwrite the completed OAuth login with a late cold-start snapshot', async () => {
    let resolveInitial!: (result: unknown) => void;
    mockGetSession.mockImplementation(() => new Promise(resolve => { resolveInitial = resolve; }));
    const view = await render(<AuthProvider><Probe /></AuthProvider>);
    await act(async () => mockListener('SIGNED_IN', session('oauth-user')));
    await waitFor(() => expect(view.getByText('oauth-user')).toBeTruthy());
    await act(async () => resolveInitial({ data: { session: null }, error: null }));
    expect(view.getByText('oauth-user')).toBeTruthy();
  });

  it('serializes a newer account behind in-flight profile writes and never publishes the stale account', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
    let release!: (value: boolean) => void;
    mockHydrate.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const view = await render(<AuthProvider><Probe /></AuthProvider>);
    await act(async () => mockListener('SIGNED_IN', session('old')));
    await waitFor(() => expect(mockHydrate).toHaveBeenCalledWith('old'));
    await act(async () => mockListener('SIGNED_IN', session('new')));
    expect(mockPrepare).not.toHaveBeenCalledWith('new');
    await act(async () => release(true));
    await waitFor(() => expect(view.getByText('new')).toBeTruthy());
    expect(view.queryByText('old')).toBeNull();
    expect(mockHydrate.mock.calls.map(([id]) => id)).toEqual(['old', 'new']);
  });

  it('never publishes an older account after a newer auth event while local preparation is pending', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
    let releaseOld!: (value: boolean) => void;
    mockPrepare.mockImplementation((id: string) => id === 'old' ? new Promise(resolve => { releaseOld = resolve; }) : Promise.resolve(true));
    const view = await render(<AuthProvider><Probe /></AuthProvider>);
    await act(async () => mockListener('SIGNED_IN', session('old')));
    await act(async () => mockListener('SIGNED_IN', session('new')));
    await act(async () => releaseOld(false));
    await waitFor(() => expect(view.getByText('new')).toBeTruthy());
    expect(view.queryByText('old')).toBeNull();
    await act(async () => mockListener('TOKEN_REFRESHED', session('new')));
    expect(view.getByText('new')).toBeTruthy();
  });
});
