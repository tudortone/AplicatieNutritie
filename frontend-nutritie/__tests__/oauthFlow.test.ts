import { createOAuthFlow, OAUTH_REDIRECT_URI } from '../lib/oauthFlow';
import type { Session } from '@supabase/supabase-js';

jest.mock('../supabase', () => ({ supabase: { auth: {} } }));
jest.mock('expo-web-browser', () => ({ maybeCompleteAuthSession: jest.fn() }));
const session = (id: string) => ({ user: { id }, access_token: `test-${id}` }) as Session;

function fixture() {
  let current: Session | null = session('old');
  const exchange = jest.fn(async () => {
    current = session('new');
    return { data: { session: current }, error: null };
  });
  const authorize = jest.fn(async () => ({ data: { url: 'https://provider.invalid/authorize' }, error: null }));
  const browser = jest.fn(async (_url: string, _redirect: string) => ({ type: 'success', url: 'nutriai://auth/callback?code=single-use' }));
  const flow = createOAuthFlow({
    auth: { exchangeCodeForSession: exchange, getSession: async () => ({ data: { session: current }, error: null }), signInWithOAuth: authorize },
    openAuthSessionAsync: browser,
    redirectTo: 'nutriai://auth/callback',
  });
  return { flow, exchange, authorize, browser, setSession: (value: Session | null) => { current = value; } };
}

describe('AUTH-OAUTH-001 shared PKCE completion', () => {
  it('keeps the shipped application redirect contract exact', () => {
    expect(OAUTH_REDIRECT_URI).toBe('nutriai://auth/callback');
  });

  it('joins concurrent browser/deep-link delivery and replaces an unrelated existing session', async () => {
    const { flow, exchange } = fixture();
    const results = await Promise.all([flow.complete({ code: 'once' }), flow.complete({ code: 'once' })]);
    expect(results.map(result => result.user.id)).toEqual(['new', 'new']);
    expect(exchange).toHaveBeenCalledTimes(1);
    expect(exchange).toHaveBeenCalledWith('once');
    await expect(flow.complete({ code: 'once' })).resolves.toMatchObject({ user: { id: 'new' } });
    expect(exchange).toHaveBeenCalledTimes(1);
  });

  it('does not revive a completed login after logout or switch to another account', async () => {
    const { flow, setSession, exchange } = fixture();
    await flow.complete({ code: 'once' });
    setSession(session('other'));
    await expect(flow.complete({ code: 'once' })).rejects.toThrow('oauth');
    setSession(null);
    await expect(flow.complete({ code: 'once' })).rejects.toThrow('oauth');
    expect(exchange).toHaveBeenCalledTimes(1);
  });

  it('uses the identical redirect for Supabase and the browser and explicitly disables automatic redirect', async () => {
    const { flow, authorize, browser } = fixture();
    await expect(flow.signIn('google')).resolves.toBe('success');
    expect(authorize).toHaveBeenCalledWith({ provider: 'google', options: { redirectTo: 'nutriai://auth/callback', skipBrowserRedirect: true } });
    expect(browser).toHaveBeenCalledWith('https://provider.invalid/authorize', 'nutriai://auth/callback');
  });

  it('uses the same Supabase PKCE authority and exact callback for Apple', async () => {
    const { flow, authorize, browser } = fixture();
    await expect(flow.signIn('apple')).resolves.toBe('success');
    expect(authorize).toHaveBeenCalledWith({ provider: 'apple', options: { redirectTo: 'nutriai://auth/callback', skipBrowserRedirect: true } });
    expect(browser).toHaveBeenCalledWith('https://provider.invalid/authorize', 'nutriai://auth/callback');
  });

  it('rejects a second tap while the first provider launch is pending', async () => {
    const { flow, authorize } = fixture();
    let release!: (value: { data: { url: string }; error: null }) => void;
    authorize.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const first = flow.signIn('apple');
    await Promise.resolve();
    await expect(flow.signIn('apple')).rejects.toThrow('oauth');
    expect(authorize).toHaveBeenCalledTimes(1);
    release({ data: { url: 'https://provider.invalid/authorize' }, error: null });
    await expect(first).resolves.toBe('success');
  });

  it.each(['cancel', 'dismiss'])('returns %s without exchange', async type => {
    const { flow, browser, exchange } = fixture();
    browser.mockResolvedValue({ type, url: '' });
    await expect(flow.signIn('google')).resolves.toBe('cancelled');
    expect(exchange).not.toHaveBeenCalled();
  });

  it.each(['nutriai://auth/callback-evil?code=bad', 'https://evil.invalid/auth/callback?code=bad', 'nutriai://auth/callback?error=access_denied&code=bad'])('rejects an invalid/provider-error return without exchange: %s', async url => {
    const { flow, browser, exchange } = fixture();
    browser.mockResolvedValue({ type: 'success', url });
    await expect(flow.signIn('google')).rejects.toThrow('oauth');
    expect(exchange).not.toHaveBeenCalled();
  });

  it('does not hide exchange errors behind the previous session', async () => {
    const { flow, exchange } = fixture();
    exchange.mockRejectedValue(new Error('sensitive provider data'));
    await expect(flow.complete({ code: 'bad' })).rejects.toThrow('oauth');
  });
});
