import React, { useContext } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Camera, Crown, Play, ShoppingBag, Sparkles, X } from 'lucide-react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useFlowCredits } from '../context/FlowCreditsContext';
import { useTheme } from '../context/ThemeContext';
import { useReducedMotion } from '../hooks/useReducedMotion';

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
  const purchaseBusy = purchaseStatus === 'purchasing' || purchaseStatus === 'verifying' || purchaseStatus === 'loading';
  const rewardedLimitReached =
    flow.rewardState === 'limit'
    || (!flow.loading && flow.balance.rewardedGrantsRemaining <= 0 && flow.rewardState !== 'granted');
  const canContinueScanning =
    !flow.unlimited
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
            <View style={styles.heroIcon}><Sparkles size={24} color="#CCFF00" /></View>
            <Text maxFontSizeMultiplier={1.3} style={[styles.title, { color: colors.textPrimary }]}>{flow.balance.total === 0 && !flow.unlimited ? t('flowCredits.emptyTitle') : t('flowCredits.title')}</Text>
            <Text maxFontSizeMultiplier={1.3} style={[styles.subtitle, { color: colors.textSecondary }]}>{t('flowCredits.subtitle')}</Text>

            <View style={styles.balanceCard}>
              <Text maxFontSizeMultiplier={1.3} style={styles.balance}>{flow.unlimited ? '∞' : flow.balance.total}</Text>
              <Text maxFontSizeMultiplier={1.3} style={styles.balanceLabel}>{flow.unlimited ? t('flowCredits.premiumAccess') : t('flowCredits.available')}</Text>
              {!flow.unlimited ? (
                <>
                  <View style={styles.breakdown}>
                    <Text maxFontSizeMultiplier={1.3} style={styles.breakdownText}>{t('flowCredits.daily')}: {flow.balance.dailyRemaining}</Text>
                    <Text maxFontSizeMultiplier={1.3} style={styles.breakdownText}>{t('flowCredits.bonus')}: {flow.balance.rewarded}</Text>
                    <Text maxFontSizeMultiplier={1.3} style={styles.breakdownText}>{t('flowCredits.purchased')}: {flow.balance.purchased}</Text>
                  </View>
                  {flow.balance.serverDay ? <Text maxFontSizeMultiplier={1.3} style={styles.reset}>{t('flowCredits.resetInfo')}</Text> : null}
                </>
              ) : null}
            </View>

            {!flow.unlimited ? (
              <TouchableOpacity
                style={[styles.action, (purchaseBusy || flow.loading || flow.balance.rewardedGrantsRemaining <= 0) && styles.disabled]}
                onPress={() => void flow.watchRewarded()}
                disabled={busy || purchaseBusy || flow.loading || flow.balance.rewardedGrantsRemaining <= 0}
                accessibilityRole="button"
                accessibilityLabel={
                  busy
                    ? t('flowCredits.verifyingReward')
                    : flow.loading
                    ? t('common.loading')
                    : flow.rewardState === 'unavailable'
                    ? t('flowCredits.retryAd')
                    : t('flowCredits.watchAd')
                }
              >
                {busy || flow.loading ? (
                  <ActivityIndicator color="#0A0C0A" />
                ) : (
                  <Play size={18} color="#0A0C0A" fill="#0A0C0A" />
                )}
                <Text maxFontSizeMultiplier={1.3} style={styles.actionText}>
                  {busy
                    ? t('flowCredits.verifyingReward')
                    : flow.loading
                    ? t('common.loading')
                    : flow.rewardState === 'unavailable'
                    ? t('flowCredits.retryAd')
                    : t('flowCredits.watchAd')}
                </Text>
              </TouchableOpacity>
            ) : null}
            {flow.rewardState === 'granted' ? <Text maxFontSizeMultiplier={1.3} style={styles.success}>{t('flowCredits.rewardGranted')}</Text> : null}
            {!flow.unlimited && rewardedLimitReached ? <Text maxFontSizeMultiplier={1.3} style={[styles.note, { color: colors.warning }]}>{t('flowCredits.rewardLimit')}</Text> : null}
            {flow.rewardState === 'unavailable' ? <Text maxFontSizeMultiplier={1.3} style={[styles.note, { color: colors.textSecondary }]}>{t('flowCredits.adUnavailable')}</Text> : null}

            {canContinueScanning ? (
              <TouchableOpacity
                testID="flow-credits-continue-btn"
                style={styles.continueBtn}
                onPress={flow.close}
                accessibilityRole="button"
                accessibilityLabel={t('flowCredits.continueScanning')}
              >
                <Camera size={17} color="#CCFF00" />
                <Text maxFontSizeMultiplier={1.3} style={styles.continueBtnText}>{t('flowCredits.continueScanning')}</Text>
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
                  style={[styles.pack, { borderColor: count === 30 ? '#CCFF00' : colors.cardBorder }, purchaseBusy && styles.disabled]}
                  onPress={() => void flow.purchase(product)}
                  disabled={purchaseBusy}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: purchaseBusy, busy: purchaseBusy }}
                >
                  <View>
                    <Text maxFontSizeMultiplier={1.3} style={[styles.packTitle, { color: colors.textPrimary }]}>{count} Flow Credits</Text>
                    <Text maxFontSizeMultiplier={1.3} style={[styles.packSub, { color: colors.textSecondary }]}>{t('flowCredits.photoAnalyses', { count })}</Text>
                  </View>
                  <View style={styles.packRight}>
                    {count === 30 ? <Text maxFontSizeMultiplier={1.3} style={styles.best}>{t('flowCredits.bestValue')}</Text> : null}
                    <Text maxFontSizeMultiplier={1.3} style={[styles.price, { color: colors.textPrimary }]}>{product.displayPrice}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
            {purchaseBusy ? (
              <View style={styles.statusRow} testID="flow-credits-purchase-busy">
                <ActivityIndicator size="small" color="#CCFF00" />
                <Text maxFontSizeMultiplier={1.3} style={[styles.note, styles.statusNote, { color: colors.textSecondary }]}>{t('flowCredits.purchaseProcessing')}</Text>
              </View>
            ) : null}
            {purchaseStatus === 'pending' ? (
              <Text maxFontSizeMultiplier={1.3} style={[styles.note, { color: colors.warning }]} testID="flow-credits-purchase-pending">{t('flowCredits.purchasePending')}</Text>
            ) : null}
            {purchaseStatus === 'error' ? (
              <Text maxFontSizeMultiplier={1.3} style={[styles.note, { color: colors.warning }]} testID="flow-credits-purchase-error">{t('flowCredits.purchaseError')}</Text>
            ) : null}
            {flow.creditProducts.length === 0 ? <Text maxFontSizeMultiplier={1.3} style={[styles.note, { color: colors.textSecondary }]}>{t('flowCredits.storeUnavailable')}</Text> : null}

            <TouchableOpacity style={[styles.premium, { borderColor: colors.gold }]} onPress={() => { flow.close(); router.push('/paywall'); }} accessibilityRole="button">
              <Crown size={18} color={colors.gold} />
              <Text maxFontSizeMultiplier={1.3} style={[styles.premiumText, { color: colors.gold }]}>{t('flowCredits.upgradePremium')}</Text>
            </TouchableOpacity>
            <Text maxFontSizeMultiplier={1.3} style={[styles.legal, { color: colors.textTertiary }]}>{t('flowCredits.serverAuthority')}</Text>
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
  heroIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: 'rgba(204,255,0,0.1)', alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  title: { fontSize: 27, fontWeight: '900', paddingRight: 42 },
  subtitle: { fontSize: 14, lineHeight: 20, marginTop: 6, marginBottom: 18 },
  balanceCard: { backgroundColor: '#090C0A', borderRadius: 20, borderWidth: 1, borderColor: 'rgba(204,255,0,0.3)', padding: 18, alignItems: 'center' },
  balance: { color: '#CCFF00', fontSize: 42, lineHeight: 48, fontWeight: '900' },
  balanceLabel: { color: '#AAB39A', fontSize: 12, fontWeight: '700' },
  breakdown: { marginTop: 15, flexDirection: 'row', gap: 12, flexWrap: 'wrap', justifyContent: 'center' },
  breakdownText: { color: '#DDE5D5', fontSize: 12, fontWeight: '600' },
  reset: { color: '#7E8877', fontSize: 10, lineHeight: 14, textAlign: 'center', marginTop: 10 },
  action: { marginTop: 16, backgroundColor: '#CCFF00', minHeight: 50, borderRadius: 16, flexDirection: 'row', gap: 9, alignItems: 'center', justifyContent: 'center' },
  actionText: { color: '#0A0C0A', fontSize: 15, fontWeight: '900' },
  disabled: { opacity: 0.45 },
  success: { color: '#CCFF00', textAlign: 'center', marginTop: 8, fontSize: 12, fontWeight: '700' },
  continueBtn: { marginTop: 12, backgroundColor: '#090C0A', borderWidth: 1.5, borderColor: '#CCFF00', minHeight: 48, borderRadius: 16, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  continueBtnText: { color: '#CCFF00', fontSize: 14, fontWeight: '800' },
  note: { textAlign: 'center', marginTop: 10, fontSize: 12, lineHeight: 17 },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 10 },
  statusNote: { marginTop: 0 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 24, marginBottom: 10 },
  sectionTitle: { fontSize: 16, fontWeight: '800' },
  pack: { borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  packTitle: { fontSize: 15, fontWeight: '800' },
  packSub: { fontSize: 11, marginTop: 3 },
  packRight: { alignItems: 'flex-end' },
  best: { color: '#CCFF00', fontSize: 9, fontWeight: '900', textTransform: 'uppercase', marginBottom: 3 },
  price: { fontSize: 14, fontWeight: '800' },
  premium: { marginTop: 12, borderWidth: 1, minHeight: 48, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  premiumText: { fontSize: 14, fontWeight: '800' },
  legal: { fontSize: 10, lineHeight: 15, textAlign: 'center', marginTop: 16 },
});
