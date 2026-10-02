import type { BillingOffer, BillingProduct } from './types';

export const CONFIGURED_BASE_PLANS: Record<string, string> = Object.freeze({
  premium_monthly: 'monthly-base',
  premium_annual: 'annual-base',
});

export type ParsedPeriod = {
  days?: number;
  months?: number;
  years?: number;
};

export function parseIso8601Period(period: string | null | undefined): ParsedPeriod | null {
  if (!period) return null;
  const normalized = period.trim().toUpperCase();
  const dayMatch = normalized.match(/^P(?:(\d+)W)?(?:(\d+)D)?$/);
  if (dayMatch && (dayMatch[1] || dayMatch[2])) {
    const weeks = dayMatch[1] ? parseInt(dayMatch[1], 10) : 0;
    const days = dayMatch[2] ? parseInt(dayMatch[2], 10) : 0;
    return { days: weeks * 7 + days };
  }
  const monthMatch = normalized.match(/^P(\d+)M$/);
  if (monthMatch) {
    return { months: parseInt(monthMatch[1], 10) };
  }
  const yearMatch = normalized.match(/^P(\d+)Y$/);
  if (yearMatch) {
    return { years: parseInt(yearMatch[1], 10) };
  }
  return null;
}

export type TrialOfferDetails = {
  hasTrial: boolean;
  trialDays: number | null;
  trialMonths: number | null;
  rawPeriod: string | null;
  formattedPrice: string | null;
};

export function extractTrialInfo(offer: BillingOffer | null | undefined): TrialOfferDetails {
  if (!offer || !offer.trialPhase) {
    return {
      hasTrial: false,
      trialDays: null,
      trialMonths: null,
      rawPeriod: null,
      formattedPrice: null,
    };
  }

  const phase = offer.trialPhase;
  const micros = parseFloat(phase.priceAmountMicros || '-1');
  if (micros !== 0) {
    return {
      hasTrial: false,
      trialDays: null,
      trialMonths: null,
      rawPeriod: null,
      formattedPrice: null,
    };
  }

  const parsed = parseIso8601Period(phase.billingPeriod);
  return {
    hasTrial: true,
    trialDays: parsed?.days ?? null,
    trialMonths: parsed?.months ?? null,
    rawPeriod: phase.billingPeriod,
    formattedPrice: phase.formattedPrice,
  };
}

export function resolvePlanOffer(
  product: BillingProduct | undefined | null,
  configuredBasePlanId: string | undefined | null,
  preferTrial: boolean = true,
): BillingOffer | null {
  if (!product || !configuredBasePlanId) return null;

  const validOffers = product.offers.filter((offer) => {
    return (
      offer.basePlanId === configuredBasePlanId &&
      typeof offer.offerToken === 'string' &&
      offer.offerToken.trim().length > 0
    );
  });

  if (validOffers.length === 0) return null;

  if (preferTrial) {
    const eligibleTrial = validOffers.find((offer) => {
      if (!offer.trialPhase) return false;
      const micros = parseFloat(offer.trialPhase.priceAmountMicros || '-1');
      return micros === 0;
    });
    if (eligibleTrial) return eligibleTrial;
  }

  const baseRecurringOffer =
    validOffers.find((offer) => !offer.trialPhase || offer.offerId === null) ?? validOffers[0];

  return baseRecurringOffer ?? null;
}

export function calculateSafeSavings(
  monthlyOffer: BillingOffer | null | undefined,
  annualOffer: BillingOffer | null | undefined,
): number | null {
  if (!monthlyOffer || !annualOffer) return null;
  if (!monthlyOffer.currencyCode || !annualOffer.currencyCode) return null;
  if (monthlyOffer.currencyCode !== annualOffer.currencyCode) return null;
  if (!monthlyOffer.priceAmountMicros || !annualOffer.priceAmountMicros) return null;

  const monthlyMicros = parseFloat(monthlyOffer.priceAmountMicros);
  const annualMicros = parseFloat(annualOffer.priceAmountMicros);

  if (
    isNaN(monthlyMicros) ||
    isNaN(annualMicros) ||
    monthlyMicros <= 0 ||
    annualMicros <= 0
  ) {
    return null;
  }

  const annualizedMonthly = monthlyMicros * 12;
  if (annualizedMonthly <= annualMicros) return null;

  const savingsPercent = Math.round(
    ((annualizedMonthly - annualMicros) / annualizedMonthly) * 100,
  );
  return savingsPercent > 0 ? savingsPercent : null;
}

export function getBillingPeriodKey(period: string | null | undefined): string {
  if (!period) return 'period_unknown';
  const p = period.toUpperCase();
  if (p === 'P1M') return 'period_monthly';
  if (p === 'P1Y' || p === 'P12M') return 'period_annual';
  if (p === 'P1W' || p === 'P7D') return 'period_weekly';
  return 'period_unknown';
}
