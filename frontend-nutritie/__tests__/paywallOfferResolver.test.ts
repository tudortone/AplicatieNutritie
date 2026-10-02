import {
  parseIso8601Period,
  extractTrialInfo,
  resolvePlanOffer,
  calculateSafeSavings,
  getBillingPeriodKey,
  CONFIGURED_BASE_PLANS,
} from '../lib/billing/paywallOfferResolver';
import type { BillingOffer, BillingProduct } from '../lib/billing/types';

describe('paywallOfferResolver', () => {
  describe('parseIso8601Period', () => {
    test('parses days, weeks, months, years correctly', () => {
      expect(parseIso8601Period('P7D')).toEqual({ days: 7 });
      expect(parseIso8601Period('P14D')).toEqual({ days: 14 });
      expect(parseIso8601Period('P1W')).toEqual({ days: 7 });
      expect(parseIso8601Period('P2W')).toEqual({ days: 14 });
      expect(parseIso8601Period('P1M')).toEqual({ months: 1 });
      expect(parseIso8601Period('P1Y')).toEqual({ years: 1 });
      expect(parseIso8601Period('invalid')).toBeNull();
      expect(parseIso8601Period('')).toBeNull();
      expect(parseIso8601Period(null)).toBeNull();
    });
  });

  describe('extractTrialInfo', () => {
    test('returns hasTrial: false if offer has no trial phase or non-zero price', () => {
      expect(extractTrialInfo(null)).toEqual({
        hasTrial: false,
        trialDays: null,
        trialMonths: null,
        rawPeriod: null,
        formattedPrice: null,
      });

      const offerWithoutTrial: BillingOffer = {
        basePlanId: 'monthly-base',
        offerId: null,
        offerToken: 'token-1',
        displayPrice: '29,99 RON',
        currencyCode: 'RON',
        billingPeriod: 'P1M',
      };
      expect(extractTrialInfo(offerWithoutTrial).hasTrial).toBe(false);

      const offerWithPaidIntro: BillingOffer = {
        basePlanId: 'monthly-base',
        offerId: 'paid-intro',
        offerToken: 'token-2',
        displayPrice: '29,99 RON',
        currencyCode: 'RON',
        billingPeriod: 'P1M',
        trialPhase: {
          billingPeriod: 'P1M',
          priceCurrencyCode: 'RON',
          formattedPrice: '9,99 RON',
          priceAmountMicros: '9990000',
        },
      };
      expect(extractTrialInfo(offerWithPaidIntro).hasTrial).toBe(false);
    });

    test('extracts trial days from 0-price trial phase', () => {
      const offerWithFreeTrial: BillingOffer = {
        basePlanId: 'monthly-base',
        offerId: 'trial-7d',
        offerToken: 'token-trial',
        displayPrice: '29,99 RON',
        currencyCode: 'RON',
        billingPeriod: 'P1M',
        trialPhase: {
          billingPeriod: 'P7D',
          priceCurrencyCode: 'RON',
          formattedPrice: '0,00 RON',
          priceAmountMicros: '0',
        },
      };
      const info = extractTrialInfo(offerWithFreeTrial);
      expect(info.hasTrial).toBe(true);
      expect(info.trialDays).toBe(7);
      expect(info.rawPeriod).toBe('P7D');
      expect(info.formattedPrice).toBe('0,00 RON');
    });
  });

  describe('resolvePlanOffer', () => {
    const mockProduct: BillingProduct = {
      id: 'premium_monthly',
      title: 'Premium Monthly',
      description: '',
      offers: [
        {
          basePlanId: 'other-base',
          offerId: 'other-offer',
          offerToken: 'token-other',
          displayPrice: '10,00 RON',
          currencyCode: 'RON',
          billingPeriod: 'P1M',
        },
        {
          basePlanId: 'monthly-base',
          offerId: null,
          offerToken: 'token-base',
          displayPrice: '29,99 RON',
          currencyCode: 'RON',
          billingPeriod: 'P1M',
        },
        {
          basePlanId: 'monthly-base',
          offerId: 'trial-7d',
          offerToken: 'token-trial',
          displayPrice: '29,99 RON',
          currencyCode: 'RON',
          billingPeriod: 'P1M',
          trialPhase: {
            billingPeriod: 'P7D',
            priceCurrencyCode: 'RON',
            formattedPrice: '0,00 RON',
            priceAmountMicros: '0',
          },
        },
      ],
    };

    test('fails closed when product or configured base plan is missing', () => {
      expect(resolvePlanOffer(null, 'monthly-base')).toBeNull();
      expect(resolvePlanOffer(mockProduct, 'non-existent-base')).toBeNull();
      expect(resolvePlanOffer(mockProduct, '')).toBeNull();
    });

    test('ignores offers with empty or missing offer tokens', () => {
      const productWithEmptyToken: BillingProduct = {
        id: 'premium_monthly',
        title: 'Premium Monthly',
        description: '',
        offers: [
          {
            basePlanId: 'monthly-base',
            offerId: null,
            offerToken: '   ',
            displayPrice: '29,99 RON',
            currencyCode: 'RON',
            billingPeriod: 'P1M',
          },
        ],
      };
      expect(resolvePlanOffer(productWithEmptyToken, 'monthly-base')).toBeNull();
    });

    test('deterministically selects trial offer when preferTrial is true', () => {
      const offer = resolvePlanOffer(mockProduct, 'monthly-base', true);
      expect(offer).not.toBeNull();
      expect(offer?.offerToken).toBe('token-trial');
      expect(offer?.trialPhase?.priceAmountMicros).toBe('0');
    });

    test('selects base recurring offer when preferTrial is false', () => {
      const offer = resolvePlanOffer(mockProduct, 'monthly-base', false);
      expect(offer).not.toBeNull();
      expect(offer?.offerToken).toBe('token-base');
    });
  });

  describe('calculateSafeSavings', () => {
    test('calculates correct savings percentage for same currency and valid prices', () => {
      const monthlyOffer: BillingOffer = {
        basePlanId: 'monthly-base',
        offerId: null,
        offerToken: 'm-token',
        displayPrice: '29,99 RON',
        currencyCode: 'RON',
        billingPeriod: 'P1M',
        priceAmountMicros: '29990000',
      };
      const annualOffer: BillingOffer = {
        basePlanId: 'annual-base',
        offerId: null,
        offerToken: 'a-token',
        displayPrice: '199,99 RON',
        currencyCode: 'RON',
        billingPeriod: 'P1Y',
        priceAmountMicros: '199990000',
      };
      // Annualized monthly = 29.99 * 12 = 359.88. Savings = (359.88 - 199.99) / 359.88 = 44.4% -> 44%
      expect(calculateSafeSavings(monthlyOffer, annualOffer)).toBe(44);
    });

    test('refuses to calculate savings if currencies differ (no exchange rate assumptions)', () => {
      const monthlyOffer: BillingOffer = {
        basePlanId: 'monthly-base',
        offerId: null,
        offerToken: 'm-token',
        displayPrice: '5,99 EUR',
        currencyCode: 'EUR',
        billingPeriod: 'P1M',
        priceAmountMicros: '5990000',
      };
      const annualOffer: BillingOffer = {
        basePlanId: 'annual-base',
        offerId: null,
        offerToken: 'a-token',
        displayPrice: '199,99 RON',
        currencyCode: 'RON',
        billingPeriod: 'P1Y',
        priceAmountMicros: '199990000',
      };
      expect(calculateSafeSavings(monthlyOffer, annualOffer)).toBeNull();
    });

    test('refuses to calculate if priceAmountMicros is missing or annual is more expensive', () => {
      const monthlyOffer: BillingOffer = {
        basePlanId: 'monthly-base',
        offerId: null,
        offerToken: 'm-token',
        displayPrice: '29,99 RON',
        currencyCode: 'RON',
        billingPeriod: 'P1M',
      };
      const annualOffer: BillingOffer = {
        basePlanId: 'annual-base',
        offerId: null,
        offerToken: 'a-token',
        displayPrice: '199,99 RON',
        currencyCode: 'RON',
        billingPeriod: 'P1Y',
        priceAmountMicros: '199990000',
      };
      expect(calculateSafeSavings(monthlyOffer, annualOffer)).toBeNull();

      const expensiveAnnual: BillingOffer = {
        ...annualOffer,
        priceAmountMicros: '500000000', // 500 RON > 12 * 29.99
      };
      const monthlyWithMicros = { ...monthlyOffer, priceAmountMicros: '29990000' };
      expect(calculateSafeSavings(monthlyWithMicros, expensiveAnnual)).toBeNull();
    });
  });

  describe('getBillingPeriodKey', () => {
    test('returns canonical period keys', () => {
      expect(getBillingPeriodKey('P1M')).toBe('period_monthly');
      expect(getBillingPeriodKey('P1Y')).toBe('period_annual');
      expect(getBillingPeriodKey('P12M')).toBe('period_annual');
      expect(getBillingPeriodKey('P1W')).toBe('period_weekly');
      expect(getBillingPeriodKey('P7D')).toBe('period_weekly');
      expect(getBillingPeriodKey('P2M')).toBe('period_unknown');
      expect(getBillingPeriodKey(null)).toBe('period_unknown');
    });
  });
});
