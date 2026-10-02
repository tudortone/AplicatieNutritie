export type AccessTier = 'free' | 'tester' | 'premium';

export type AccessEntitlement = {
  isPremium: boolean;
  isTester: boolean;
  isAdmin: boolean;
  accessTier: AccessTier;
  hasFullAccess: boolean;
};

export const FREE_ACCESS_ENTITLEMENT: Readonly<AccessEntitlement> = Object.freeze({
  isPremium: false,
  isTester: false,
  isAdmin: false,
  accessTier: 'free',
  hasFullAccess: false,
});

export const PREMIUM_ACCESS_ENTITLEMENT: Readonly<AccessEntitlement> = Object.freeze({
  isPremium: true,
  isTester: false,
  isAdmin: false,
  accessTier: 'premium',
  hasFullAccess: true,
});

type ServerAccessResponse = Partial<AccessEntitlement> & {
  validatServer?: boolean;
};

/** Accepta doar contracte server complete si coerente; orice altceva esueaza inchis. */
export function parseServerAccessEntitlement(raw: unknown): AccessEntitlement | null {
  if (!raw || typeof raw !== 'object') return null;
  const response = raw as ServerAccessResponse;
  if (response.validatServer !== true) return null;
  if (
    typeof response.isPremium !== 'boolean'
    || typeof response.isTester !== 'boolean'
    || typeof response.isAdmin !== 'boolean'
    || typeof response.hasFullAccess !== 'boolean'
    || !['free', 'tester', 'premium'].includes(response.accessTier ?? '')
  ) return null;

  if (response.isPremium && response.isTester) return null;
  const expectedTier: AccessTier = response.isPremium
    ? 'premium'
    : response.isTester
      ? 'tester'
      : 'free';
  const expectedFullAccess = response.isPremium || response.isTester || response.isAdmin;
  if (response.accessTier !== expectedTier || response.hasFullAccess !== expectedFullAccess) return null;

  return {
    isPremium: response.isPremium,
    isTester: response.isTester,
    isAdmin: response.isAdmin,
    accessTier: response.accessTier,
    hasFullAccess: response.hasFullAccess,
  };
}
