import React, { useContext } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Camera, Crown, Play, ShieldAlert, ShoppingBag, Sparkles, X } from 'lucide-react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useFlowCredits } from '../context/FlowCreditsContext';
import { useTheme } from '../context/ThemeContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { openLegalDocumentWithFallback } from '../constants/legal';

const FALLBACK_INSETS_CONTEXT = React.createContext<{ bottom?: number } | null>(null);

function packCount(id: string) {
  return id.endsWith('_30') ? 30 : 10;
}

export function FlowCreditsModalHost() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const flow = useFlowCredits();
  const reduceMotion = useReducedMotion();
  const insets = useContext(SafeAreaInsetsContext ?? FALLBACK_INSETS_CONTEXT);
  const busy = flow.rewardState === 'loading' || flow.rewardState === 'awaiting-server';
  const purchaseStatus = flow.purchaseStatus?.status ?? 'idle';
  const catalogLoading = purchaseStatus === 'loading';
  const purchaseBusy = purchaseStatus === 'purchasing' || purchaseStatus === 'verifying';
  const balanceReady = flow.balanceReady !== false;
  const balanceLoading = !flow.unlimited && flow.loading && !balanceReady;
  const balanceFailed = !flow.unlimited && !flow.loading && !balanceReady;
  const rewardedLimitReached =
    flow.rewardState === 'limit'
    || (balanceReady && !flow.loading && flow.balance.rewardedGrantsRemaining <= 0 && flow.rewardState !== 'granted');
  const canContinueScanning =
    !flow.unlimited
    && balanceReady
    && flow.balance.total > 0
    && (flow.rewardState === 'granted' || purchaseStatus === 'verified');
  const bottomPadding = Math.max(36, 24 + (insets?.bottom ?? 0));

  return (
    <Modal
      visible={flow.visible}
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      presentationStyle="overFullScreen"
      animationType={reduceMotion ? 'none' : 'slide'}
      onRequestClose={flow.close}
    >
      <View style={styles.backdrop} accessibilityViewIsModal>
        <Pressable
          testID="flow-credits-backdrop"
          style={StyleSheet.absoluteFill}
          onPress={flow.close}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
        />
        <View style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
          <View style={styles.grabber} />
          <TouchableOpacity
            onPress={flow.close}
            style={styles.close}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
          >
            <X size={20} color={colors.textSecondary} />
          </TouchableOpacity>
          <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottomPadding }]} showsVerticalScrollIndicator={false}>
            <View style={[styles.heroIcon, { backgroundColor: `${colors.accent}1A` }]}>
              <Sparkles size={24} color={colors.accent} />
            </View>
            <Text maxFontSizeMultiplier={1.3} style={[styles.title, { color: colors.textPrimary }]}>
              {balanceReady && flow.balance.total === 0 && !flow.unlimited ? t('flowCredits.emptyTitle') : t('flowCredits.title')}
            </Text>
            <Text maxFontSizeMultiplier={1.3} style={[styles.subtitle, { color: colors.textSecondary }]}>{t('flowCredits.subtitle')}</Text>

            <View style={[styles.balanceCard, { backgroundColor: colors.background, borderColor: `${colors.accent}4D` }]}>
              {balanceLoading ? (
                <View style={styles.balanceSkeleton} testID="flow-credits-balance-skeleton">
                  <ActivityIndicator size="small" color={colors.accent} />
                  <View style={styles.skeletonBarPrimary} />
                  <View style={styles.skeletonBarSecondary} />
                </View>
              ) : balanceFailed ? (
                <View style={styles.balanceErrorWrap} testID="flow-credits-balance-error">
                  <Text maxFontSizeMultiplier={1.3} style={[styles.balanceErrorText, { color: colors.warning }]}>
                    {t('flowCredits.balanceUnavailable', t('common.networkError', 'Soldul nu a putut fi încărcat.'))}
                  </Text>
                  <TouchableOpacity
                    testID="flow-credits-balance-retry"
                    onPress={() => void flow.refresh()}
                    style={[styles.retryBtn, { borderColor: colors.accent }]}
                    accessibilityRole="button"
                    accessibilityLabel={t('chat.retry')}
                  >
                    <Text maxFontSizeMultiplier={1.3} style={[styles.retryBtnText, { color: colors.accent }]}>{t('chat.retry')}</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <Text maxFontSizeMultiplier={1.3} style={[styles.balance, { color: colors.accent }]}>{flow.unlimited ? '∞' : flow.balance.total}</Text>
                  <Text maxFontSizeMultiplier={1.3} style={[styles.balanceLabel, { color: colors.textSecondary }]}>{flow.unlimited ? t('flowCredits.premiumAccess') : t('flowCredits.available')}</Text>
                  {!flow.unlimited ? (
                    <>
                      <View style={styles.breakdown}>
                        <Text maxFontSizeMultiplier={1.3} style={[styles.breakdownText, { color: colors.textPrimary }]}>{t('flowCredits.daily')}: {flow.balance.dailyRemaining}</Text>
                        <Text maxFontSizeMultiplier={1.3} style={[styles.breakdownText, { color: colors.textPrimary }]}>{t('flowCredits.bonus')}: {flow.balance.rewarded}</Text>
                        <Text maxFontSizeMultiplier={1.3} style={[styles.breakdownText, { color: colors.textPrimary }]}>{t('flowCredits.purchased')}: {flow.balance.purchased}</Text>
                      </View>
                      {flow.balance.serverDay ? <Text maxFontSizeMultiplier={1.3} style={[styles.reset, { color: colors.textTertiary }]}>{t('flowCredits.resetInfo')}</Text> : null}
                    </>
                  ) : null}
                </>
              )}
            </View>

            {!flow.unlimited ? (
              <TouchableOpacity
                style={[styles.action, { backgroundColor: colors.accent }, (busy || purchaseBusy || flow.loading || !balanceReady || flow.balance.rewardedGrantsRemaining <= 0) && styles.disabled]}
                onPress={() => void flow.watchRewarded()}
                disabled={busy || purchaseBusy || flow.loading || !balanceReady || flow.balance.rewardedGrantsRemaining <= 0}
                accessibilityRole="button"
                accessibilityLabel={
                  flow.rewardState === 'loading'
                    ? t('flowCredits.preparingAd')
                    : flow.rewardState === 'awaiting-server'
                    ? t('flowCredits.verifyingReward')
                    : flow.loading
                    ? t('common.loading')
                    : flow.rewardState === 'unavailable' || flow.rewardState === 'blocked'
                    ? t('flowCredits.retryAd')
                    : t('flowCredits.watchAd')
                }
              >
                {busy || flow.loading ? (
                  <ActivityIndicator color={colors.textOnAccent} />
                ) : (
                  <Play size={18} color={colors.textOnAccent} fill={colors.textOnAccent} />
                )}
                <Text
                  maxFontSizeMultiplier={1.3}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                  style={[styles.actionText, { color: colors.textOnAccent }]}
                >
                  {flow.rewardState === 'loading'
                    ? t('flowCredits.preparingAd')
                    : flow.rewardState === 'awaiting-server'
                    ? t('flowCredits.verifyingReward')
                    : flow.loading
                    ? t('common.loading')
                    : flow.rewardState === 'unavailable' || flow.rewardState === 'blocked'
                    ? t('flowCredits.retryAd')
                    : t('flowCredits.watchAd')}
                </Text>
              </TouchableOpacity>
            ) : null}
            {flow.rewardState === 'granted' ? <Text maxFontSizeMultiplier={1.3} style={[styles.success, { color: colors.accent }]}>{t('flowCredits.rewardGranted')}</Text> : null}
            {!flow.unlimited && rewardedLimitReached ? <Text maxFontSizeMultiplier={1.3} style={[styles.note, { color: colors.warning }]}>{t('flowCredits.rewardLimit')}</Text> : null}
            {flow.rewardState === 'blocked' ? (
              <View
                testID="flow-credits-ad-blocked-notice"
                style={styles.adBlockedNotice}
                accessibilityRole="alert"
                accessibilityLiveRegion="polite"
              >
                <View style={styles.adBlockedHeader}>
                  <ShieldAlert size={16} color={colors.warning} />
                  <Text maxFontSizeMultiplier={1.3} style={[styles.adBlockedTitle, { color: colors.warning }]}>
                    {t('flowCredits.adBlockedTitle')}
                  </Text>
                </View>
                <Text maxFontSizeMultiplier={1.3} style={[styles.adBlockedHint, { color: colors.textSecondary }]}>
                  {t('flowCredits.adBlockedHint')}
                </Text>
              </View>
            ) : null}
            {flow.rewardState === 'unavailable' ? (
              <>
                <Text maxFontSizeMultiplier={1.3} style={[styles.note, { color: colors.textSecondary }]}>{t('flowCredits.adUnavailable')}</Text>
                <Text
                  testID="flow-credits-ad-dns-tip"
                  maxFontSizeMultiplier={1.3}
                  style={[styles.dnsTip, { color: colors.textTertiary }]}
                >
                  {t('flowCredits.adUnavailableDnsTip')}
                </Text>
              </>
            ) : null}

            {canContinueScanning ? (
              <TouchableOpacity
                testID="flow-credits-continue-btn"
                style={[styles.continueBtn, { backgroundColor: colors.background, borderColor: colors.accent }]}
                onPress={flow.close}
                accessibilityRole="button"
                accessibilityLabel={t('flowCredits.continueScanning')}
              >
                <Camera size={17} color={colors.accent} />
                <Text
                  maxFontSizeMultiplier={1.3}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                  style={[styles.continueBtnText, { color: colors.accent }]}
                >
                  {t('flowCredits.continueScanning')}
                </Text>
              </TouchableOpacity>
            ) : null}

            <View style={styles.sectionTitleRow}>
              <ShoppingBag size={17} color={colors.textPrimary} />
              <Text maxFontSizeMultiplier={1.3} style={[styles.sectionTitle, { color: colors.textPrimary }]}>{t('flowCredits.getCredits')}</Text>
            </View>
            {flow.creditProducts.map((product) => {
              const count = packCount(product.id);
              return (
                <TouchableOpacity
                  key={product.id}
                  style={[styles.pack, { borderColor: count === 30 ? colors.accent : colors.cardBorder }, purchaseBusy && styles.disabled]}
                  onPress={() => void flow.purchase(product)}
                  disabled={purchaseBusy}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: purchaseBusy, busy: purchaseBusy }}
                >
                  <View style={styles.packLeft}>
                    <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={[styles.packTitle, { color: colors.textPrimary }]}>{count} Flow Credits</Text>
                    <Text maxFontSizeMultiplier={1.3} numberOfLines={2} style={[styles.packSub, { color: colors.textSecondary }]}>{t('flowCredits.photoAnalyses', { count })}</Text>
                  </View>
                  <View style={styles.packRight}>
                    {count === 30 ? <Text maxFontSizeMultiplier={1.3} style={[styles.best, { color: colors.accent }]}>{t('flowCredits.bestValue')}</Text> : null}
                    <Text maxFontSizeMultiplier={1.3} style={[styles.price, { color: colors.textPrimary }]}>{product.displayPrice}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
            {catalogLoading ? (
              <View style={styles.statusRow} testID="flow-credits-catalog-loading">
                <ActivityIndicator size="small" color={colors.accent} />
                <Text maxFontSizeMultiplier={1.3} style={[styles.note, styles.statusNote, { color: colors.textSecondary }]}>
                  {t('common.loading')}
                </Text>
              </View>
            ) : null}
            {purchaseBusy ? (
              <View style={styles.statusRow} testID="flow-credits-purchase-busy">
                <ActivityIndicator size="small" color={colors.accent} />
                <Text maxFontSizeMultiplier={1.3} style={[styles.note, styles.statusNote, { color: colors.textSecondary }]}>{t('flowCredits.purchaseProcessing')}</Text>
              </View>
            ) : null}
            {purchaseStatus === 'pending' ? (
              <Text maxFontSizeMultiplier={1.3} style={[styles.note, { color: colors.warning }]} testID="flow-credits-purchase-pending">{t('flowCredits.purchasePending')}</Text>
            ) : null}
            {purchaseStatus === 'error' ? (
              <Text maxFontSizeMultiplier={1.3} style={[styles.note, { color: colors.warning }]} testID="flow-credits-purchase-error">{t('flowCredits.purchaseError')}</Text>
            ) : null}
            {!catalogLoading && flow.creditProducts.length === 0 ? <Text maxFontSizeMultiplier={1.3} style={[styles.note, { color: colors.textSecondary }]}>{t('flowCredits.storeUnavailable')}</Text> : null}

            <TouchableOpacity style={[styles.premium, { borderColor: colors.gold }]} onPress={() => { flow.close(); router.push('/paywall'); }} accessibilityRole="button">
              <Crown size={18} color={colors.gold} />
              <Text
                maxFontSizeMultiplier={1.3}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
                style={[styles.premiumText, { color: colors.gold }]}
              >
                {t('flowCredits.upgradePremium')}
              </Text>
            </TouchableOpacity>
            <Text maxFontSizeMultiplier={1.3} style={[styles.legal, { color: colors.textTertiary }]}>
              {t('flowCredits.serverAuthority')}
              {'\n'}
              {t('flowCredits.legalNotice', 'Processed via Google Play Billing. Instant digital delivery.')}
            </Text>
            <View style={styles.legalLinksRow}>
              <TouchableOpacity
                style={styles.legalLinkBtn}
                accessibilityRole="link"
                onPress={() => {
                  flow.close();
                  void openLegalDocumentWithFallback('terms', (route) => router.push(route as never));
                }}
              >
                <Text maxFontSizeMultiplier={1.3} style={[styles.legalLinkText, { color: colors.textTertiary }]}>
                  {t('paywall.legal.terms')}
                </Text>
              </TouchableOpacity>
              <Text style={[styles.legalDot, { color: colors.textTertiary }]}>·</Text>
              <TouchableOpacity
                style={styles.legalLinkBtn}
                accessibilityRole="link"
                onPress={() => {
                  flow.close();
                  void openLegalDocumentWithFallback('privacy', (route) => router.push(route as never));
                }}
              >
                <Text maxFontSizeMultiplier={1.3} style={[styles.legalLinkText, { color: colors.textTertiary }]}>
                  {t('paywall.legal.privacy')}
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', justifyContent: 'flex-end', alignItems: 'center' },
  sheet: { maxHeight: '88%', width: '100%', maxWidth: 540, alignSelf: 'center', borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, overflow: 'hidden' },
  grabber: { width: 38, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.22)', alignSelf: 'center', marginTop: 10 },
  content: { padding: 24, paddingTop: 18, paddingBottom: 36 },
  close: { position: 'absolute', right: 14, top: 14, zIndex: 2, minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  heroIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  title: { fontSize: 27, fontWeight: '900', paddingRight: 42 },
  subtitle: { fontSize: 14, lineHeight: 20, marginTop: 6, marginBottom: 18 },
  balanceCard: { borderRadius: 20, borderWidth: 1, padding: 18, alignItems: 'center' },
  balanceSkeleton: { alignItems: 'center', gap: 10, paddingVertical: 8, width: '100%' },
  skeletonBarPrimary: { width: 88, height: 22, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.08)' },
  skeletonBarSecondary: { width: 168, height: 12, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.06)' },
  balanceErrorWrap: { alignItems: 'center', gap: 10, paddingVertical: 6 },
  balanceErrorText: { fontSize: 13, fontWeight: '600', textAlign: 'center', lineHeight: 18 },
  retryBtn: { minHeight: 44, paddingHorizontal: 18, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  retryBtnText: { fontSize: 13, fontWeight: '800' },
  balance: { fontSize: 42, lineHeight: 48, fontWeight: '900' },
  balanceLabel: { fontSize: 12, fontWeight: '700' },
  breakdown: { marginTop: 15, flexDirection: 'row', gap: 12, flexWrap: 'wrap', justifyContent: 'center' },
  breakdownText: { fontSize: 12, fontWeight: '600' },
  reset: { fontSize: 10, lineHeight: 14, textAlign: 'center', marginTop: 10 },
  action: { marginTop: 16, minHeight: 50, paddingHorizontal: 14, borderRadius: 16, flexDirection: 'row', gap: 9, alignItems: 'center', justifyContent: 'center' },
  actionText: { flexShrink: 1, fontSize: 15, fontWeight: '900' },
  disabled: { opacity: 0.45 },
  success: { textAlign: 'center', marginTop: 8, fontSize: 12, fontWeight: '700' },
  continueBtn: { marginTop: 12, borderWidth: 1.5, minHeight: 48, paddingHorizontal: 14, borderRadius: 16, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  continueBtnText: { flexShrink: 1, fontSize: 14, fontWeight: '800' },
  note: { textAlign: 'center', marginTop: 10, fontSize: 12, lineHeight: 17 },
  dnsTip: { textAlign: 'center', marginTop: 4, fontSize: 11, lineHeight: 16 },
  adBlockedNotice: {
    marginTop: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.35)',
    backgroundColor: 'rgba(245, 158, 11, 0.10)',
    padding: 12,
    gap: 6,
  },
  adBlockedHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  adBlockedTitle: { fontSize: 13, fontWeight: '800' },
  adBlockedHint: { fontSize: 12, lineHeight: 17, textAlign: 'center' },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 10 },
  statusNote: { marginTop: 0 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 24, marginBottom: 10 },
  sectionTitle: { fontSize: 16, fontWeight: '800' },
  pack: { borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  packLeft: { flex: 1, minWidth: 0 },
  packTitle: { fontSize: 15, fontWeight: '800' },
  packSub: { fontSize: 11, marginTop: 3 },
  packRight: { alignItems: 'flex-end', flexShrink: 0 },
  best: { fontSize: 9, fontWeight: '900', textTransform: 'uppercase', marginBottom: 3 },
  price: { fontSize: 14, fontWeight: '800' },
  premium: { marginTop: 12, borderWidth: 1, minHeight: 48, paddingHorizontal: 14, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  premiumText: { flexShrink: 1, fontSize: 14, fontWeight: '800' },
  legal: { fontSize: 10, lineHeight: 15, textAlign: 'center', marginTop: 16 },
  legalLinksRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 2 },
  legalLinkBtn: { minHeight: 44, paddingHorizontal: 10, justifyContent: 'center', alignItems: 'center' },
  legalLinkText: { fontSize: 11, textDecorationLine: 'underline', fontWeight: '600' },
  legalDot: { fontSize: 11 },
});
