export type BillingOperationStatus =
  | 'unavailable'
  | 'idle'
  | 'loading'
  | 'purchasing'
  | 'pending'
  | 'verifying'
  | 'verified'
  | 'error'
  | 'canceled';

export type BillingOperationState = {
  status: BillingOperationStatus;
  code?: string;
};

export type BillingPricingPhase = {
  billingPeriod: string;
  priceCurrencyCode: string;
  formattedPrice: string;
  priceAmountMicros: string;
  recurrenceMode?: number;
  billingCycleCount?: number;
};

export type BillingOffer = {
  basePlanId: string;
  offerId: string | null;
  offerToken: string;
  displayPrice: string;
  currencyCode: string | null;
  billingPeriod: string | null;
  priceAmountMicros?: string | null;
  offerTags?: string[];
  pricingPhases?: BillingPricingPhase[];
  trialPhase?: BillingPricingPhase | null;
  introPhase?: BillingPricingPhase | null;
};

export type BillingProduct = {
  id: string;
  title: string;
  description: string;
  offers: BillingOffer[];
};

export type BillingCreditProduct = {
  id: string;
  title: string;
  description: string;
  displayPrice: string;
  currencyCode: string | null;
};

export type BillingAuthSnapshot = {
  userId: string;
  accessToken: string;
};

export type NativePurchase = {
  productId: string;
  purchaseToken: string | null;
  state: 'pending' | 'purchased' | 'unknown';
  raw: unknown;
};

export type NativeListenerSubscription = { remove: () => void };

export type NativeBillingAdapter = {
  connect: () => Promise<boolean>;
  disconnect: () => Promise<void>;
  addPurchaseUpdatedListener: (
    listener: (purchase: NativePurchase) => void | Promise<void>,
  ) => NativeListenerSubscription;
  addPurchaseErrorListener: (
    listener: (error: { code?: string; message?: string }) => void,
  ) => NativeListenerSubscription;
  fetchSubscriptions: (productIds: string[]) => Promise<BillingProduct[]>;
  fetchConsumables: (productIds: string[]) => Promise<BillingCreditProduct[]>;
  requestSubscription: (request: {
    productId: string;
    offerToken: string;
    obfuscatedAccountId: string;
  }) => Promise<void>;
  requestConsumable: (request: {
    productId: string;
    obfuscatedAccountId: string;
  }) => Promise<void>;
  getAvailablePurchases: () => Promise<NativePurchase[]>;
  finishTransaction: (purchase: NativePurchase) => Promise<void>;
};

export type BillingBackend = {
  getCatalog: (auth: BillingAuthSnapshot) => Promise<{
    packageName: string;
    productIds: string[];
    creditProductIds: string[];
  }>;
  verify: (input: BillingAuthSnapshot & { purchaseToken: string }) => Promise<{
    premium: boolean;
    validatServer: boolean;
  }>;
  resync: (input: BillingAuthSnapshot & { purchaseTokens: string[] }) => Promise<{
    premium: boolean;
    validatServer: boolean;
    restored: number;
  }>;
  verifyConsumable: (input: BillingAuthSnapshot & {
    productId: string;
    purchaseToken: string;
  }) => Promise<{
    validatServer: boolean;
    productId: string;
    creditsGranted: number;
    consumed: boolean;
  }>;
};
