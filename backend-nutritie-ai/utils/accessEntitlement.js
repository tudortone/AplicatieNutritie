'use strict';

const ACCESS_TIER_FREE = 'free';
const ACCESS_TIER_TESTER = 'tester';
const ACCESS_TIER_PREMIUM = 'premium';

/**
 * Compune drepturile de produs din identitatea verificata de Auth si verdictul
 * verdictul comercial persistent al backend-ului. Rolul administrativ ramane
 * separat de abonament si de tester.
 */
function derivaDrepturiAcces(utilizator, premiumPlatit = false) {
  const isPremium = premiumPlatit === true;
  const isTester = !isPremium && utilizator?.esteTester === true;
  const isAdmin = utilizator?.esteAdmin === true;
  const accessTier = isPremium
    ? ACCESS_TIER_PREMIUM
    : isTester
      ? ACCESS_TIER_TESTER
      : ACCESS_TIER_FREE;

  return {
    premium: isPremium,
    isPremium,
    isTester,
    isAdmin,
    accessTier,
    hasFullAccess: isPremium || isTester || isAdmin,
  };
}

function compuneRaspunsAcces(utilizator, payloadPremium) {
  return {
    ...payloadPremium,
    ...derivaDrepturiAcces(utilizator, payloadPremium?.premium === true),
    validatServer: true,
  };
}

module.exports = {
  ACCESS_TIER_FREE,
  ACCESS_TIER_TESTER,
  ACCESS_TIER_PREMIUM,
  derivaDrepturiAcces,
  compuneRaspunsAcces,
};
