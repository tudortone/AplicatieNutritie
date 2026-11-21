import { Linking } from 'react-native';

import {
  ANPC_URL,
  COMPANY_ADDRESS,
  COMPANY_CUI,
  COMPANY_NAME,
  COMPANY_REG_COM,
  MANAGE_SUBSCRIPTIONS_URL,
  SUPPORT_EMAIL,
  SUPPORT_PHONE,
  getOperatorName,
  getPrivacySections,
  getTermsSections,
  openLegalDocumentWithFallback,
} from '../constants/legal';

describe('Conformitate Legală Globală (TOT SRL / GetFlow) & Fallback Offline', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('expune identitatea operatorului TOT SRL fără date personale sau placeholder-e comerciale necompletate', () => {
    expect(COMPANY_NAME).toBeTruthy();
    expect(getOperatorName('ro')).toBe('TOT SRL');
    expect(getOperatorName('en')).toBe('TOT SRL');
    expect(COMPANY_CUI).toBeNull();
    expect(COMPANY_REG_COM).toBeNull();
    expect(COMPANY_ADDRESS).toBeNull();
    expect(SUPPORT_PHONE).toBeNull();
    expect(SUPPORT_EMAIL).toBe('supportgetflow@gmail.com');
    expect(MANAGE_SUBSCRIPTIONS_URL).toBe('https://play.google.com/store/account/subscriptions');
    expect(ANPC_URL).toBe('https://anpc.ro');
  });

  it('include toate cele 6 sectiuni obligatorii in Termeni si Conditii (RO & EN) pentru lansare globala', () => {
    const roText = getTermsSections('ro')
      .flatMap((s) => [s.title, ...s.paragraphs])
      .join('\n');
    expect(roText).toContain('TOT SRL');
    expect(roText).toContain('16 ani');
    expect(roText).toContain('Merchant of Record');
    expect(roText).toContain('Google Play');
    expect(roText).toContain('24 de ore');
    expect(roText).toContain('14 zile');
    expect(roText).toContain('OUG');
    expect(roText).toContain('dispozitiv medical');
    expect(roText).toContain('ANPC');
    expect(roText).not.toMatch(/De completat/i);

    const enText = getTermsSections('en')
      .flatMap((s) => [s.title, ...s.paragraphs])
      .join('\n');
    expect(enText).toContain('TOT SRL');
    expect(enText).toContain('16');
    expect(enText).toContain('Merchant of Record');
    expect(enText).toContain('14-day');
    expect(enText).toContain('2011/83/EU');
    expect(enText).toContain('NOT a medical device');
    expect(enText).toContain('ANPC');
    expect(enText).not.toMatch(/De completat/i);

    const roPrivacy = getPrivacySections('ro').flatMap((s) => [s.title, ...s.paragraphs]).join('\n');
    const enPrivacy = getPrivacySections('en').flatMap((s) => [s.title, ...s.paragraphs]).join('\n');
    expect(getPrivacySections('ro').length).toBeGreaterThanOrEqual(4);
    expect(getPrivacySections('en').length).toBeGreaterThanOrEqual(4);
    for (const provider of ['Supabase', 'Google Cloud', 'Gemini', 'AdMob', 'Google Play Billing', 'Sentry', 'ImageKit']) {
      expect(roPrivacy).toContain(provider);
      expect(enPrivacy).toContain(provider);
    }
  });

  it('face fallback automat catre ecranul intern /termeni cand Linking.openURL esueaza', async () => {
    const prevEnv = process.env.EXPO_PUBLIC_APP_ENV;
    process.env.EXPO_PUBLIC_APP_ENV = 'qa';
    const openSpy = jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('offline'));
    const navigateInternal = jest.fn();
    try {
      await openLegalDocumentWithFallback('terms', navigateInternal);
      expect(openSpy).toHaveBeenCalledTimes(1);
      expect(navigateInternal).toHaveBeenCalledWith('/termeni');

      await openLegalDocumentWithFallback('privacy', navigateInternal);
      expect(navigateInternal).toHaveBeenCalledWith('/confidentialitate');
    } finally {
      if (prevEnv === undefined) delete process.env.EXPO_PUBLIC_APP_ENV;
      else process.env.EXPO_PUBLIC_APP_ENV = prevEnv;
    }
  });
});
