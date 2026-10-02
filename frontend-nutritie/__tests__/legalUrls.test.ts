import { getLegalUrls, validateLegalUrl } from '../lib/legalUrls';

describe('URL-urile documentelor legale', () => {
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
