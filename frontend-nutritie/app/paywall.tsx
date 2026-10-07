import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import {
  Check,
  Crown,
  X,
  ScanLine,
  MessageSquareText,
  SlidersHorizontal,
  BarChart3,
  RefreshCcw,
  Clock,
  AlertCircle,
  Sparkles,
  ChevronRight,
} from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { usePremium, PREMIUM_PACKAGE_IDS } from '../context/PremiumContext';
import { useFlowCredits } from '../context/FlowCreditsContext';
import { useNotify } from '../hooks/useNotify';
import { getLegalUrls } from '../lib/legalUrls';
import { useTranslation } from 'react-i18next';
import type { BillingOffer, BillingProduct } from '../lib/billing/types';
import { getBillingUnavailableMessageKey } from '../lib/billing/billingUnavailableCopy';
import {
  CONFIGURED_BASE_PLANS,
  resolvePlanOffer,
  extractTrialInfo,
  calculateSafeSavings,
  getBillingPeriodKey,
} from '../lib/billing/paywallOfferResolver';
import { ConfirmSheet } from '../components/ui/ConfirmSheet';

const FEATURE_ITEMS = [
  {
    icon: ScanLine,
    titleKey: 'paywall.features.scan_title',
    descKey: 'paywall.features.scan_desc',
  },
  {
    icon: MessageSquareText,
    titleKey: 'paywall.features.chat_title',
    descKey: 'paywall.features.chat_desc',
  },
  {
    icon: SlidersHorizontal,
    titleKey: 'paywall.features.ai_title',
    descKey: 'paywall.features.ai_desc',
  },
  {
    icon: BarChart3,
    titleKey: 'paywall.features.insights_title',
    descKey: 'paywall.features.insights_desc',
  },
];

function formatPrice(offer?: BillingOffer | null): string {
  if (!offer) return '';
  return offer.displayPrice;
}

function getPeriodKeyFromOffer(offer?: BillingOffer | null): string {
  if (!offer) return 'period_unknown';
  return getBillingPeriodKey(offer.billingPeriod);
}

export default function PaywallScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const notify = useNotify();
  const { t } = useTranslation();
  const flowCredits = useFlowCredits();
  const {
    isPremium,
    isTester,
    isAdmin,
    loading,
    operation,
    subscriptionPackages,
    purchasesAvailable,
    purchaseSubscription,
    refreshProducts,
    restore,
  } = usePremium();

  const [buying, setBuying] = useState<string | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string>(PREMIUM_PACKAGE_IDS[1]);
  const [pendingPurchase, setPendingPurchase] = useState<{
    product: BillingProduct;
    offer: BillingOffer;
  } | null>(null);
  const isPurchasingRef = useRef(false);

  // Deterministic product lookup and base plan resolution
  const monthlyProduct = subscriptionPackages.find((p) => p.id === PREMIUM_PACKAGE_IDS[0]);
  const annualProduct = subscriptionPackages.find((p) => p.id === PREMIUM_PACKAGE_IDS[1]);

  const monthlyOffer = resolvePlanOffer(
    monthlyProduct,
    CONFIGURED_BASE_PLANS[PREMIUM_PACKAGE_IDS[0]],
  );
  const annualOffer = resolvePlanOffer(
    annualProduct,
    CONFIGURED_BASE_PLANS[PREMIUM_PACKAGE_IDS[1]],
  );

  // Auto-select valid plan if the current selection is unavailable
  useEffect(() => {
    if (selectedPlanId === PREMIUM_PACKAGE_IDS[1] && !annualOffer && monthlyOffer) {
      setSelectedPlanId(PREMIUM_PACKAGE_IDS[0]);
    } else if (selectedPlanId === PREMIUM_PACKAGE_IDS[0] && !monthlyOffer && annualOffer) {
      setSelectedPlanId(PREMIUM_PACKAGE_IDS[1]);
    }
  }, [selectedPlanId, annualOffer, monthlyOffer]);

  const selectedProduct =
    selectedPlanId === PREMIUM_PACKAGE_IDS[1] ? annualProduct : monthlyProduct;
  const selectedOffer =
    selectedPlanId === PREMIUM_PACKAGE_IDS[1] ? annualOffer : monthlyOffer;

  const annualTrial = extractTrialInfo(annualOffer);
  const monthlyTrial = extractTrialInfo(monthlyOffer);
  const selectedTrial = extractTrialInfo(selectedOffer);
  const safeSavings = calculateSafeSavings(monthlyOffer, annualOffer);

  const buy = async (product: BillingProduct, offer: BillingOffer | null) => {
    if (isPurchasingRef.current) return;
    if (!purchasesAvailable || !offer || !offer.offerToken) {
      notify.warning(
        t('paywall.states.unavailable_title'),
        t('paywall.states.unavailable_message'),
      );
      return;
    }
    isPurchasingRef.current = true;
    setBuying(product.id);
    try {
      await purchaseSubscription(product, offer);
    } finally {
      setBuying(null);
      isPurchasingRef.current = false;
    }
  };

  const handleRetry = async () => {
    if (refreshProducts) {
      try {
        await refreshProducts();
      } catch {
        // Handled via billing operation state
      }
    }
  };

  const openLegal = (key: 'termsUrl' | 'privacyUrl') => {
    try {
      const { termsUrl, privacyUrl } = getLegalUrls();
      Linking.openURL(key === 'termsUrl' ? termsUrl : privacyUrl);
    } catch {
      Alert.alert(
        t('authLegal.unavailableTitle'),
        t('authLegal.unavailableMessage'),
      );
    }
  };

  const handleRestore = async () => {
    try {
      const ok = await restore();
      if (ok) {
        notify.success(
          t('paywall.states.restore_success_title'),
          t('paywall.states.restore_success_message'),
        );
        if (router.canGoBack()) {
          router.back();
        } else {
          router.replace('/(tabs)');
        }
      } else {
        notify.warning(
          t('paywall.states.restore_none_title'),
          t('paywall.states.restore_none_message'),
        );
      }
    } catch {
      notify.error(
        t('paywall.states.error_title'),
        t('paywall.states.error_message'),
      );
    }
  };

  // State: Tester access
  if (isTester) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
            style={styles.closeBtn}
            accessibilityRole="button"
            accessibilityLabel={t('paywall.cta.back_to_app')}
          >
            <X size={22} color={colors.textSecondary} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>GetFlow</Text>
          <View style={{ width: 44 }} />
        </View>
        <View style={styles.activeContainer} testID="tester-active-view">
          <Crown size={48} color={colors.gold} />
          <Text maxFontSizeMultiplier={1.3} style={[styles.activeTitle, { color: colors.textPrimary }]}>
            {t('access.testerTitle')}
          </Text>
          <Text style={[styles.activeDesc, { color: colors.textSecondary }]}>
            {t('access.testerDescription')}
          </Text>
          <Pressable
            testID="back-to-app-button"
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
            style={({ pressed }) => [
              styles.primaryActionBtn,
              { backgroundColor: colors.accent, opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <Text style={[styles.primaryActionBtnText, { color: colors.background }]}>
              {t('access.backToApp')}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // State: Admin access (non-paying)
  if (isAdmin && !isPremium) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
            style={styles.closeBtn}
            accessibilityRole="button"
            accessibilityLabel={t('paywall.cta.back_to_app')}
          >
            <X size={22} color={colors.textSecondary} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>GetFlow</Text>
          <View style={{ width: 44 }} />
        </View>
        <View style={styles.activeContainer} testID="admin-active-view">
          <Crown size={48} color={colors.gold} />
          <Text maxFontSizeMultiplier={1.3} style={[styles.activeTitle, { color: colors.textPrimary }]}>
            {t('access.adminTitle')}
          </Text>
          <Text style={[styles.activeDesc, { color: colors.textSecondary }]}>
            {t('access.adminDescription')}
          </Text>
          <Pressable
            testID="back-to-app-button"
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
            style={({ pressed }) => [
              styles.primaryActionBtn,
              { backgroundColor: colors.accent, opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <Text style={[styles.primaryActionBtnText, { color: colors.background }]}>
              {t('access.backToApp')}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // State: Existing server-confirmed Premium
  if (isPremium && operation.status !== 'verifying' && operation.status !== 'purchasing') {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
            style={styles.closeBtn}
            accessibilityRole="button"
            accessibilityLabel={t('paywall.cta.back_to_app')}
          >
            <X size={22} color={colors.textSecondary} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>GetFlow</Text>
          <View style={{ width: 44 }} />
        </View>
        <View style={styles.activeContainer} testID="premium-active-view">
          <Crown size={48} color={colors.gold} />
          <Text maxFontSizeMultiplier={1.3} style={[styles.activeTitle, { color: colors.textPrimary }]}>
            {operation.status === 'verified'
              ? t('paywall.states.success_title')
              : t('paywall.states.already_premium_title')}
          </Text>
          <Text style={[styles.activeDesc, { color: colors.textSecondary }]}>
            {operation.status === 'verified'
              ? t('paywall.states.success_message')
              : t('paywall.states.already_premium_message')}
          </Text>
          <Pressable
            testID="back-to-app-button"
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
            style={({ pressed }) => [
              styles.primaryActionBtn,
              { backgroundColor: colors.accent, opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <Text style={[styles.primaryActionBtnText, { color: colors.background }]}>
              {operation.status === 'verified' ? t('paywall.cta.continue') : t('access.backToApp')}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const isStoreUnavailable =
    !purchasesAvailable ||
    operation.status === 'unavailable' ||
    (!monthlyOffer && !annualOffer);
  const unavailableMessageKey = getBillingUnavailableMessageKey(operation.code);

  const isActionDisabled =
    buying != null ||
    isPurchasingRef.current ||
    !selectedProduct ||
    !selectedOffer ||
    !purchasesAvailable ||
    operation.status === 'purchasing' ||
    operation.status === 'verifying';

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={[styles.glowTop, { backgroundColor: colors.gold }]} />
      <View style={[styles.glowBottom, { backgroundColor: colors.accentSecondary }]} />

      <View style={styles.header}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
          style={styles.closeBtn}
          accessibilityRole="button"
          accessibilityLabel={t('paywall.cta.back_to_app')}
        >
          <X size={22} color={colors.textSecondary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>GetFlow</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {/* Hero Section */}
        <View style={styles.hero}>
          <LinearGradient
            colors={[colors.gold + '33', 'rgba(0,0,0,0)']}
            style={[styles.heroBadge, { borderColor: colors.gold + '44' }]}
          >
            <Crown size={16} color={colors.gold} />
            <Text maxFontSizeMultiplier={1.3} style={[styles.heroBadgeText, { color: colors.gold }]}>
              {t('paywall.badge')}
            </Text>
          </LinearGradient>
          <Text maxFontSizeMultiplier={1.3} style={[styles.heroTitle, { color: colors.textPrimary }]}>
            {t('paywall.title')}
          </Text>
          <Text style={[styles.heroSubtitle, { color: colors.textSecondary }]}>
            {t('paywall.subtitle')}
          </Text>
        </View>

        <View
          testID="paywall-meal-preview"
          style={[styles.mealPreview, { backgroundColor: colors.surfaceBg, borderColor: colors.cardBorder }]}
        >
          <Image
            testID="paywall-meal-image"
            source={require('../assets/images/paywall-meal-preview.webp')}
            style={styles.mealPreviewImage}
            contentFit="cover"
            transition={180}
            accessibilityLabel={t('paywall.preview.imageA11y')}
          />
          <LinearGradient
            colors={['rgba(5,7,7,0.02)', 'rgba(5,7,7,0.96)']}
            style={styles.mealPreviewShade}
          />
          <View style={styles.mealPreviewCopy}>
            <View style={[styles.exampleBadge, { backgroundColor: colors.accent }]}>
              <Check size={12} color={colors.background} strokeWidth={3} />
              <Text style={[styles.exampleBadgeText, { color: colors.background }]}>
                {t('paywall.preview.label')}
              </Text>
            </View>
            <Text style={[styles.mealPreviewTitle, { color: colors.textPrimary }]}>
              {t('paywall.preview.meal')}
            </Text>
            <View style={styles.mealPreviewStats}>
              {[
                ['540', t('paywall.preview.calories')],
                ['42 g', t('paywall.preview.protein')],
                ['56 g', t('paywall.preview.carbs')],
                ['18 g', t('paywall.preview.fat')],
              ].map(([value, label]) => (
                <View key={label} style={styles.mealPreviewStat}>
                  <Text style={[styles.mealPreviewStatValue, { color: colors.textPrimary }]}>{value}</Text>
                  <Text
                    numberOfLines={2}
                    style={[styles.mealPreviewStatLabel, { color: colors.textSecondary }]}
                  >
                    {label}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* Feature List */}
        <View style={styles.features}>
          {FEATURE_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <View
                key={item.titleKey}
                style={[
                  styles.feature,
                  { backgroundColor: colors.surfaceBg, borderColor: colors.cardBorder },
                ]}
              >
                <View style={[styles.featureIcon, { backgroundColor: `${colors.accent}1A` }]}>
                  <Icon size={18} color={colors.accent} />
                </View>
                <View style={styles.featureCopy}>
                  <Text style={[styles.featureTitle, { color: colors.textPrimary }]}>
                    {t(item.titleKey)}
                  </Text>
                  <Text style={[styles.featureDesc, { color: colors.textSecondary }]}>
                    {t(item.descKey)}
                  </Text>
                </View>
                <Check size={16} color={colors.success} strokeWidth={3} />
              </View>
            );
          })}
        </View>

        {/* Dynamic State Banners */}
        {operation.status === 'pending' ? (
          <View
            style={[
              styles.statusBanner,
              { backgroundColor: `${colors.warning}1A`, borderColor: colors.warning },
            ]}
            testID="billing-pending-banner"
          >
            <Clock size={20} color={colors.warning} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.statusBannerTitle, { color: colors.warning }]}>
                {t('paywall.states.pending_title')}
              </Text>
              <Text style={[styles.statusBannerText, { color: colors.textSecondary }]}>
                {t('paywall.states.pending_message')}
              </Text>
            </View>
          </View>
        ) : null}

        {operation.status === 'verifying' ? (
          <View
            style={[
              styles.statusBanner,
              { backgroundColor: `${colors.accent}1A`, borderColor: colors.accent },
            ]}
            testID="billing-verifying-banner"
          >
            <ActivityIndicator size="small" color={colors.accent} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.statusBannerTitle, { color: colors.accent }]}>
                {t('paywall.states.verifying_title')}
              </Text>
              <Text style={[styles.statusBannerText, { color: colors.textSecondary }]}>
                {t('paywall.states.verifying_message')}
              </Text>
            </View>
          </View>
        ) : null}

        {operation.status === 'error' ? (
          <View
            style={[
              styles.statusBanner,
              { backgroundColor: `${colors.danger}1A`, borderColor: colors.danger },
            ]}
            testID="billing-error-banner"
          >
            <AlertCircle size={20} color={colors.danger} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.statusBannerTitle, { color: colors.danger }]}>
                {t('paywall.states.error_title')}
              </Text>
              <Text style={[styles.statusBannerText, { color: colors.textSecondary }]}>
                {t('paywall.states.error_message')}
              </Text>
            </View>
          </View>
        ) : null}

        {/* Pricing / Plan Selection Section */}
        {loading || operation.status === 'loading' ? (
          <View style={styles.loadingContainer} testID="paywall-loading-view">
            <ActivityIndicator size="large" color={colors.accent} />
            <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
              {t('paywall.states.loading_offers')}
            </Text>
          </View>
        ) : isStoreUnavailable ? (
          <View
            style={[
              styles.unavailableBox,
              { backgroundColor: colors.surfaceBg, borderColor: colors.cardBorder },
            ]}
            testID="billing-unavailable-view"
          >
            <AlertCircle size={32} color={colors.warning} />
            <Text maxFontSizeMultiplier={1.3} style={[styles.unavailableTitle, { color: colors.textPrimary }]}>
              {t('paywall.states.unavailable_title')}
            </Text>
            <Text style={[styles.unavailableMessage, { color: colors.textSecondary }]}>
              {t(unavailableMessageKey)}
            </Text>
            <Pressable
              testID="retry-button"
              onPress={handleRetry}
              style={({ pressed }) => [
                styles.retryBtn,
                { backgroundColor: colors.accent, opacity: pressed ? 0.8 : 1 },
              ]}
              accessibilityRole="button"
            >
              <RefreshCcw size={15} color={colors.background} />
              <Text style={[styles.retryBtnText, { color: colors.background }]}>
                {t('paywall.cta.retry')}
              </Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={styles.plansContainer}>
              {/* Monthly Plan Card */}
              {monthlyOffer ? (
                <Pressable
                  testID="plan-card-monthly"
                  onPress={() => setSelectedPlanId(PREMIUM_PACKAGE_IDS[0])}
                  disabled={isActionDisabled}
                  style={({ pressed }) => [
                    styles.planCard,
                    {
                      borderColor:
                        selectedPlanId === PREMIUM_PACKAGE_IDS[0] ? colors.accent : colors.cardBorder,
                      backgroundColor:
                        selectedPlanId === PREMIUM_PACKAGE_IDS[0]
                          ? `${colors.accent}14`
                          : colors.surfaceBg,
                      opacity: pressed ? 0.85 : 1,
                    },
                  ]}
                  accessibilityRole="radio"
                  accessibilityState={{
                    selected: selectedPlanId === PREMIUM_PACKAGE_IDS[0],
                    disabled: isActionDisabled,
                  }}
                  accessibilityLabel={`${t('paywall.plans.monthly')} ${formatPrice(monthlyOffer)} ${t(`paywall.plans.${getPeriodKeyFromOffer(monthlyOffer)}`)}`}
                >
                  {monthlyTrial.hasTrial ? (
                    <View style={[styles.trialBadge, { backgroundColor: colors.accent }]}>
                      <Text style={[styles.trialBadgeText, { color: colors.background }]}>
                        {monthlyTrial.trialDays
                          ? t('paywall.plans.trial_badge', { count: monthlyTrial.trialDays })
                          : t('paywall.plans.trial_badge_generic')}
                      </Text>
                    </View>
                  ) : null}

                  <Text
                    maxFontSizeMultiplier={1.3}
                    style={[styles.planTitle, { color: colors.textPrimary }]}
                  >
                    {t('paywall.plans.monthly')}
                  </Text>
                  <Text
                    maxFontSizeMultiplier={1.3}
                    style={[styles.planPrice, { color: colors.textPrimary }]}
                  >
                    {formatPrice(monthlyOffer)}
                  </Text>
                  <Text style={[styles.planPeriod, { color: colors.textSecondary }]}>
                    {t(`paywall.plans.${getPeriodKeyFromOffer(monthlyOffer)}`)}
                  </Text>
                </Pressable>
              ) : null}

              {/* Annual Plan Card */}
              {annualOffer ? (
                <Pressable
                  testID="plan-card-annual"
                  onPress={() => setSelectedPlanId(PREMIUM_PACKAGE_IDS[1])}
                  disabled={isActionDisabled}
                  style={({ pressed }) => [
                    styles.planCard,
                    styles.planCardAnnual,
                    {
                      borderColor:
                        selectedPlanId === PREMIUM_PACKAGE_IDS[1] ? colors.gold : colors.cardBorder,
                      backgroundColor:
                        selectedPlanId === PREMIUM_PACKAGE_IDS[1]
                          ? `${colors.gold}14`
                          : colors.surfaceBg,
                      opacity: pressed ? 0.85 : 1,
                    },
                  ]}
                  accessibilityRole="radio"
                  accessibilityState={{
                    selected: selectedPlanId === PREMIUM_PACKAGE_IDS[1],
                    disabled: isActionDisabled,
                  }}
                  accessibilityLabel={`${t('paywall.plans.annual')} ${formatPrice(annualOffer)} ${t(`paywall.plans.${getPeriodKeyFromOffer(annualOffer)}`)}`}
                >
                  {safeSavings !== null ? (
                    <View style={[styles.saveBadge, { backgroundColor: colors.gold }]}>
                      <Text style={[styles.saveBadgeText, { color: colors.background }]}>
                        {t('paywall.plans.save_percentage', { percent: safeSavings })}
                      </Text>
                    </View>
                  ) : null}

                  {annualTrial.hasTrial ? (
                    <View style={[styles.trialBadge, { backgroundColor: colors.accent }]}>
                      <Text style={[styles.trialBadgeText, { color: colors.background }]}>
                        {annualTrial.trialDays
                          ? t('paywall.plans.trial_badge', { count: annualTrial.trialDays })
                          : t('paywall.plans.trial_badge_generic')}
                      </Text>
                    </View>
                  ) : null}

                  <Text
                    maxFontSizeMultiplier={1.3}
                    style={[styles.planTitle, { color: colors.textPrimary }]}
                  >
                    {t('paywall.plans.annual')}
                  </Text>
                  <Text
                    maxFontSizeMultiplier={1.3}
                    style={[styles.planPrice, { color: colors.gold }]}
                  >
                    {formatPrice(annualOffer)}
                  </Text>
                  <Text style={[styles.planPeriod, { color: colors.textSecondary }]}>
                    {t(`paywall.plans.${getPeriodKeyFromOffer(annualOffer)}`)}
                  </Text>
                </Pressable>
              ) : null}
            </View>

            {/* Primary Action Button */}
            <Pressable
              testID="purchase-cta-button"
              onPress={() => {
                if (selectedProduct && selectedOffer) {
                  setPendingPurchase({ product: selectedProduct, offer: selectedOffer });
                }
              }}
              disabled={isActionDisabled}
              style={({ pressed }) => [
                styles.purchaseCtaBtn,
                {
                  backgroundColor: colors.accent,
                  opacity: isActionDisabled ? 0.5 : pressed ? 0.85 : 1,
                },
              ]}
              accessibilityRole="button"
              accessibilityState={{ disabled: isActionDisabled }}
            >
              {buying != null ||
              operation.status === 'purchasing' ||
              operation.status === 'verifying' ? (
                <View style={styles.ctaRow}>
                  <ActivityIndicator size="small" color={colors.background} />
                  <Text style={[styles.purchaseCtaText, { color: colors.background }]}>
                    {t('paywall.cta.processing')}
                  </Text>
                </View>
              ) : (
                <Text style={[styles.purchaseCtaText, { color: colors.background }]}>
                  {selectedTrial.hasTrial && selectedTrial.trialDays
                    ? t('paywall.cta.start_trial', { count: selectedTrial.trialDays })
                    : t('paywall.cta.subscribe')}
                </Text>
              )}
            </Pressable>
          </>
        )}

        {/* Flow Credits Packs Discovery */}
        <Pressable
          testID="paywall-credits-option"
          onPress={() => flowCredits.open()}
          style={({ pressed }) => [
            styles.creditPacksCard,
            {
              backgroundColor: colors.surfaceBg,
              borderColor: colors.cardBorder,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel={t('paywall.creditsOption.title')}
        >
          <View style={[styles.creditPacksIcon, { backgroundColor: 'rgba(204, 255, 0, 0.12)' }]}>
            <Sparkles size={20} color="#CCFF00" />
          </View>
          <View style={{ flex: 1 }}>
            <Text maxFontSizeMultiplier={1.3} style={[styles.creditPacksTitle, { color: colors.textPrimary }]}>
              {t('paywall.creditsOption.title')}
            </Text>
            <Text style={[styles.creditPacksSubtitle, { color: colors.textSecondary }]}>
              {t('paywall.creditsOption.subtitle')}
            </Text>
          </View>
          <ChevronRight size={18} color={colors.textSecondary} />
        </Pressable>

        {/* Restore Purchases */}
        <Pressable
          testID="restore-button"
          onPress={handleRestore}
          style={styles.restoreBtn}
          accessibilityRole="button"
          disabled={
            buying != null ||
            operation.status === 'purchasing' ||
            operation.status === 'verifying'
          }
        >
          <RefreshCcw size={14} color={colors.textSecondary} />
          <Text style={[styles.restoreText, { color: colors.textSecondary }]}>
            {t('paywall.cta.restore')}
          </Text>
        </Pressable>

        {/* Legal Disclaimers and External Links */}
        <Text style={[styles.legalText, { color: colors.textTertiary }]}>
          {t('paywall.legal.disclaimer')}
          {'\n'}
          <Text
            style={{ textDecorationLine: 'underline' }}
            onPress={() => openLegal('termsUrl')}
          >
            {t('paywall.legal.terms')}
          </Text>
          {' · '}
          <Text
            style={{ textDecorationLine: 'underline' }}
            onPress={() => openLegal('privacyUrl')}
          >
            {t('paywall.legal.privacy')}
          </Text>
        </Text>
      </ScrollView>

      <ConfirmSheet
        visible={pendingPurchase != null}
        title={t('paywall.confirm.title')}
        message={
          pendingPurchase
            ? t('paywall.confirm.message', {
                plan: t(
                  pendingPurchase.product.id === PREMIUM_PACKAGE_IDS[1]
                    ? 'paywall.plans.annual'
                    : 'paywall.plans.monthly',
                ),
                price: formatPrice(pendingPurchase.offer),
                period: t(`paywall.plans.${getPeriodKeyFromOffer(pendingPurchase.offer)}`),
              })
            : undefined
        }
        confirmLabel={t('paywall.confirm.confirm')}
        cancelLabel={t('paywall.confirm.cancel')}
        onCancel={() => setPendingPurchase(null)}
        onConfirm={() => {
          const purchase = pendingPurchase;
          if (!purchase || isPurchasingRef.current) return;
          setPendingPurchase(null);
          void buy(purchase.product, purchase.offer);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  glowTop: {
    position: 'absolute',
    top: -120,
    right: -120,
    width: 380,
    height: 380,
    borderRadius: 190,
    opacity: 0.1,
  },
  glowBottom: {
    position: 'absolute',
    bottom: -120,
    left: -120,
    width: 320,
    height: 320,
    borderRadius: 160,
    opacity: 0.08,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  closeBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '900',
  },
  scroll: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
  },
  hero: {
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 20,
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 14,
  },
  heroBadgeText: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  heroSubtitle: {
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
    maxWidth: 320,
    lineHeight: 20,
  },
  mealPreview: {
    minHeight: 224,
    borderRadius: 22,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 20,
  },
  mealPreviewImage: {
    width: '100%',
    height: 224,
  },
  mealPreviewShade: {
    ...StyleSheet.absoluteFillObject,
  },
  mealPreviewCopy: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 13,
  },
  exampleBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
    marginBottom: 7,
  },
  exampleBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  mealPreviewTitle: {
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 9,
  },
  mealPreviewStats: {
    flexDirection: 'row',
    gap: 6,
  },
  mealPreviewStat: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 5,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: 'rgba(10,14,14,0.78)',
    alignItems: 'center',
  },
  mealPreviewStatValue: {
    fontSize: 13,
    fontWeight: '900',
  },
  mealPreviewStatLabel: {
    fontSize: 9,
    fontWeight: '600',
    marginTop: 2,
    minHeight: 22,
    textAlign: 'center',
  },
  features: {
    gap: 10,
    marginBottom: 22,
  },
  feature: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
  },
  featureIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureCopy: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  featureDesc: {
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
  },
  statusBannerTitle: {
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 2,
  },
  statusBannerText: {
    fontSize: 12,
    lineHeight: 16,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
    textAlign: 'center',
  },
  unavailableBox: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    borderWidth: 1,
    padding: 24,
    marginVertical: 12,
    gap: 10,
  },
  unavailableTitle: {
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
  },
  unavailableMessage: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 280,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
    marginTop: 6,
  },
  retryBtnText: {
    fontSize: 14,
    fontWeight: '800',
  },
  plansContainer: {
    flexDirection: 'row',
    gap: 12,
    marginVertical: 12,
  },
  planCard: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 2,
    paddingHorizontal: 12,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 150,
  },
  planCardAnnual: {
    // Shared structure, distinct highlight
  },
  saveBadge: {
    position: 'absolute',
    top: -12,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  saveBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  trialBadge: {
    position: 'absolute',
    bottom: -11,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  trialBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  planTitle: {
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
  },
  planPrice: {
    fontSize: 22,
    fontWeight: '900',
    marginTop: 8,
    textAlign: 'center',
  },
  planPeriod: {
    fontSize: 12,
    marginTop: 2,
    textAlign: 'center',
  },
  purchaseCtaBtn: {
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
    minHeight: 52,
  },
  ctaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  purchaseCtaText: {
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  creditPacksCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 16,
    marginBottom: 8,
    gap: 12,
  },
  creditPacksIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  creditPacksTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  creditPacksSubtitle: {
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
  },
  restoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 16,
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  restoreText: {
    fontSize: 12,
    fontWeight: '700',
  },
  legalText: {
    fontSize: 11,
    textAlign: 'center',
    marginTop: 18,
    lineHeight: 17,
  },
  activeContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
    gap: 12,
  },
  activeTitle: {
    fontSize: 22,
    fontWeight: '900',
    marginTop: 8,
    textAlign: 'center',
  },
  activeDesc: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  primaryActionBtn: {
    marginTop: 20,
    borderRadius: 16,
    paddingHorizontal: 32,
    paddingVertical: 14,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryActionBtnText: {
    fontSize: 15,
    fontWeight: '900',
  },
});
