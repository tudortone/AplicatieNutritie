import { getLegalUrls, validateLegalUrl } from '../lib/legalUrls';

describe('URL-urile documentelor legale', () => {
  it('uses only local legal documents in isolated QA, ignoring hosted overrides', () => {
    const previousEnvironment = process.env.EXPO_PUBLIC_APP_ENV;
    process.env.EXPO_PUBLIC_APP_ENV = 'qa';
    try {
      expect(getLegalUrls({ termsUrl: 'https://remote.invalid/terms', privacyUrl: 'https://remote.invalid/privacy' })).toEqual({
        termsUrl: 'http://127.0.0.1:3000/terms',
        privacyUrl: 'http://127.0.0.1:3000/privacy',
      });
    } finally {
      if (previousEnvironment === undefined) delete process.env.EXPO_PUBLIC_APP_ENV;
      else process.env.EXPO_PUBLIC_APP_ENV = previousEnvironment;
    }
  });
  it('accepta numai pagini HTTPS publice reale', () => {
    expect(validateLegalUrl('https://legal.nutriai.ro/termeni', 'termeni')).toBe(
      'https://legal.nutriai.ro/termeni',
    );
    expect(() => validateLegalUrl('http://localhost:3000/terms', 'termeni')).toThrow();
    expect(() => validateLegalUrl('https://legal.example.com/terms', 'termeni')).toThrow();
  });

  it('citeste numele canonice statice pentru inlining Expo', () => {
    expect(getLegalUrls({
      termsUrl: 'https://legal.nutriai.ro/termeni',
      privacyUrl: 'https://legal.nutriai.ro/confidentialitate',
    })).toEqual({
      termsUrl: 'https://legal.nutriai.ro/termeni',
      privacyUrl: 'https://legal.nutriai.ro/confidentialitate',
    });
  });
});
