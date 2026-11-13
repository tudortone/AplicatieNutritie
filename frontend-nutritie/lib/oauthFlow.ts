import type { Session } from '@supabase/supabase-js';
import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';
import { supabase } from '../supabase';
import appConfig from '../app.json';

// app.config.js overrides the native scheme for the isolated QA application.
const configuredScheme = Constants.expoConfig?.scheme;
const nativeScheme = (Array.isArray(configuredScheme) ? configuredScheme[0] : configuredScheme) || appConfig.expo.scheme;
export const OAUTH_REDIRECT_URI = `${nativeScheme}://auth/callback`;
WebBrowser.maybeCompleteAuthSession();

export type CallbackParams = Record<string, string | string[] | undefined>;
type AuthResult = { data: { session: Session | null }; error: unknown };
type Dependencies = {
  auth: {
    exchangeCodeForSession: (code: string) => Promise<AuthResult>;
    verifyOtp?: (params: { token_hash: string; type: 'recovery' }) => Promise<AuthResult>;
    getSession: () => Promise<AuthResult>;
    signInWithOAuth: (options: { provider: 'google' | 'apple'; options: { redirectTo: string; skipBrowserRedirect: true } }) => Promise<{ data: { url: string | null }; error: unknown }>;
  };
  openAuthSessionAsync: (url: string, redirect: string) => Promise<{ type: string; url?: string }>;
  redirectTo: string;
};

export function createOAuthFlow({ auth, openAuthSessionAsync, redirectTo }: Dependencies) {
  // Memorie exclusiv procesului, limitată: aceeași promisiune pentru browser și
  // Expo Router. O sesiune preexistentă NU este dovadă că acest cod a fost schimbat.
  const exchanges = new Map<string, Promise<Session>>();
  const recoveryTokens = new Map<string, Promise<Session>>();
  let signingIn = false;

  async function deduplicatedSession(
    cache: Map<string, Promise<Session>>,
    key: string,
    exchange: () => Promise<AuthResult>,
  ): Promise<Session> {
    let pending = cache.get(key);
    if (!pending) {
      pending = Promise.resolve().then(async () => {
        try {
          const { data, error } = await exchange();
          if (error || !data.session) throw new Error('oauth');
          return data.session;
        } catch {
          // Nici codul, nici mesajul brut al furnizorului nu ies din această limită.
          throw new Error('oauth');
        }
      });
      cache.set(key, pending);
      if (cache.size > 8) cache.delete(cache.keys().next().value!);
    }
    const result = await pending;
    const { data, error } = await auth.getSession();
    if (error || data.session?.user.id !== result.user.id) throw new Error('oauth');
    return data.session;
  }

  async function complete(params: CallbackParams): Promise<Session> {
    const code = params.code;
    if (params.error || params.error_description || typeof code !== 'string' || !code) throw new Error('oauth');
    return deduplicatedSession(exchanges, code, () => auth.exchangeCodeForSession(code));
  }

  async function completeRecoveryToken(tokenHash: string): Promise<Session> {
    const normalized = tokenHash.trim();
    if (!normalized || !auth.verifyOtp) throw new Error('oauth');
    return deduplicatedSession(recoveryTokens, normalized, () =>
      auth.verifyOtp!({ token_hash: normalized, type: 'recovery' }),
    );
  }

  async function signIn(provider: 'google' | 'apple'): Promise<'success' | 'cancelled'> {
    if (signingIn) throw new Error('oauth');
    signingIn = true;
    try {
      const { data, error } = await auth.signInWithOAuth({ provider, options: { redirectTo, skipBrowserRedirect: true } });
      if (error || !data.url) throw new Error('oauth');
      const result = await openAuthSessionAsync(data.url, redirectTo);
      if (result.type === 'cancel' || result.type === 'dismiss') return 'cancelled';
      if (result.type !== 'success' || !result.url || result.url.split(/[?#]/, 1)[0] !== redirectTo) throw new Error('oauth');
      const url = new URL(result.url);
      const params: CallbackParams = {};
      for (const [key, value] of url.searchParams) {
        params[key] = params[key] === undefined ? value : [String(params[key]), value];
      }
      await complete(params);
      return 'success';
    } catch {
      throw new Error('oauth');
    } finally {
      signingIn = false;
    }
  }
  return { complete, completeRecoveryToken, signIn };
}

export const oauthFlow = createOAuthFlow({
  auth: supabase.auth,
  openAuthSessionAsync: WebBrowser.openAuthSessionAsync,
  redirectTo: OAUTH_REDIRECT_URI,
});
