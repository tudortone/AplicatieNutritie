import { extrageCodDinUrl } from '../lib/oauth';

describe('lib/oauth — extrageCodDinUrl (PKCE)', () => {
  it('extrage `code` dintr-un URL de redirect PKCE', () => {
    const url = 'nutriai://auth/callback?code=abc123&provider=google';
    expect(extrageCodDinUrl(url)).toBe('abc123');
  });

  it('returneaza null cand nu exista code', () => {
    expect(extrageCodDinUrl('nutriai://auth/callback?error=access_denied')).toBeNull();
    expect(extrageCodDinUrl('nutriai://auth/callback')).toBeNull();
  });

  it('decodeaza valoarea URL-encoded', () => {
    const url = 'nutriai://auth/callback?code=a%2Bb%2Bc';
    expect(extrageCodDinUrl(url)).toBe('a+b+c');
  });

  it('nu confunda alte param-uri cu code (state inaintea lui code)', () => {
    const url = 'nutriai://auth/callback?state=x&code=real&provider=apple';
    expect(extrageCodDinUrl(url)).toBe('real');
  });
});
