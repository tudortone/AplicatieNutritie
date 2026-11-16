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

describe('Conformitate Legală (Dezvoltator Individual / Operator GetFlow) & Fallback Offline', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('expune identitatea operatorului fără date personale sau placeholder-e comerciale necompletate', () => {
    expect(COMPANY_NAME).toBeTruthy();
    expect(getOperatorName('ro')).toBe('Dezvoltator Individual (GetFlow)');
    expect(getOperatorName('en')).toBe('Individual Developer (GetFlow)');
    expect(COMPANY_CUI).toBeNull();
    expect(COMPANY_REG_COM).toBeNull();
    expect(COMPANY_ADDRESS).toBeNull();
    expect(SUPPORT_PHONE).toBeNull();
    expect(SUPPORT_EMAIL).toBe('supportgetflow@gmail.com');
    expect(MANAGE_SUBSCRIPTIONS_URL).toBe('https://play.google.com/store/account/subscriptions');
    expect(ANPC_URL).toBe('https://anpc.ro');
  });

  it('include toate cele 6 sectiuni obligatorii in Termeni si Conditii (RO & EN)', () => {
    const roText = getTermsSections('ro')
      .flatMap((s) => [s.title, ...s.paragraphs])
      .join('\n');
    expect(roText).toContain('Dezvoltator Individual (GetFlow)');
    expect(roText).toContain('Google Play Billing');
    expect(roText).toContain('24 de ore');
    expect(roText).toContain('14 zile');
    expect(roText).toContain('OUG');
    expect(roText).toContain('dispozitiv medical');
    expect(roText).toContain('ANPC');
    expect(roText).not.toMatch(/De completat/i);

    const enText = getTermsSections('en')
      .flatMap((s) => [s.title, ...s.paragraphs])
      .join('\n');
    expect(enText).toContain('Individual Developer (GetFlow)');
    expect(enText).toContain('14-day');
    expect(enText).toContain('2011/83/EU');
    expect(enText).toContain('NOT a medical device');
    expect(enText).toContain('ANPC');
    expect(enText).not.toMatch(/De completat/i);

    expect(getPrivacySections('ro').length).toBeGreaterThanOrEqual(3);
    expect(getPrivacySections('en').length).toBeGreaterThanOrEqual(3);
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
