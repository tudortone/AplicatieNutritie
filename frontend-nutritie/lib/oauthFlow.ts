import type { Session } from '@supabase/supabase-js';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '../supabase';
import appConfig from '../app.json';

// Același scheme este înregistrat de Expo în manifestul aplicației native.
export const OAUTH_REDIRECT_URI = `${appConfig.expo.scheme}://auth/callback`;
WebBrowser.maybeCompleteAuthSession();

export type CallbackParams = Record<string, string | string[] | undefined>;
type AuthResult = { data: { session: Session | null }; error: unknown };
type Dependencies = {
  auth: {
    exchangeCodeForSession: (code: string) => Promise<AuthResult>;
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
  let signingIn = false;
  async function complete(params: CallbackParams): Promise<Session> {
    const code = params.code;
    if (params.error || params.error_description || typeof code !== 'string' || !code) throw new Error('oauth');
    let pending = exchanges.get(code);
    if (!pending) {
      pending = Promise.resolve().then(async () => {
        try {
          const { data, error } = await auth.exchangeCodeForSession(code);
          if (error || !data.session) throw new Error('oauth');
          return data.session;
        } catch {
          // Nici codul, nici mesajul brut al furnizorului nu ies din această limită.
          throw new Error('oauth');
        }
      });
      exchanges.set(code, pending);
      if (exchanges.size > 8) exchanges.delete(exchanges.keys().next().value!);
    }
    const result = await pending;
    const { data, error } = await auth.getSession();
    if (error || data.session?.user.id !== result.user.id) throw new Error('oauth');
    return data.session;
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
  return { complete, signIn };
}

export const oauthFlow = createOAuthFlow({
  auth: supabase.auth,
  openAuthSessionAsync: WebBrowser.openAuthSessionAsync,
  redirectTo: OAUTH_REDIRECT_URI,
});
