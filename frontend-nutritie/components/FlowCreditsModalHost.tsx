import React from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Crown, Play, ShoppingBag, Sparkles, X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useFlowCredits } from '../context/FlowCreditsContext';
import { useTheme } from '../context/ThemeContext';

function packCount(id: string) {
  return id.endsWith('_30') ? 30 : 10;
}

export function FlowCreditsModalHost() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const flow = useFlowCredits();
  const busy = flow.rewardState === 'loading' || flow.rewardState === 'awaiting-server';
  return (
    <Modal visible={flow.visible} transparent animationType="slide" onRequestClose={flow.close}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
          <TouchableOpacity onPress={flow.close} style={styles.close} accessibilityRole="button" accessibilityLabel={t('common.close')}>
            <X size={20} color={colors.textSecondary} />
          </TouchableOpacity>
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <View style={styles.heroIcon}><Sparkles size={24} color="#CCFF00" /></View>
            <Text style={[styles.title, { color: colors.textPrimary }]}>{flow.balance.total === 0 && !flow.unlimited ? t('flowCredits.emptyTitle') : t('flowCredits.title')}</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{t('flowCredits.subtitle')}</Text>

            <View style={styles.balanceCard}>
              <Text style={styles.balance}>{flow.unlimited ? '∞' : flow.balance.total}</Text>
              <Text style={styles.balanceLabel}>{flow.unlimited ? t('flowCredits.premiumAccess') : t('flowCredits.available')}</Text>
              {!flow.unlimited ? (
                <>
                  <View style={styles.breakdown}>
                    <Text style={styles.breakdownText}>{t('flowCredits.daily')}: {flow.balance.dailyRemaining}</Text>
                    <Text style={styles.breakdownText}>{t('flowCredits.bonus')}: {flow.balance.rewarded}</Text>
                    <Text style={styles.breakdownText}>{t('flowCredits.purchased')}: {flow.balance.purchased}</Text>
                  </View>
                  {flow.balance.serverDay ? <Text style={styles.reset}>{t('flowCredits.resetInfo')}</Text> : null}
                </>
              ) : null}
            </View>

            <TouchableOpacity
              style={[styles.action, flow.balance.rewardedGrantsRemaining <= 0 && styles.disabled]}
              onPress={() => void flow.watchRewarded()}
              disabled={busy || flow.balance.rewardedGrantsRemaining <= 0}
              accessibilityRole="button"
            >
              {busy ? <ActivityIndicator color="#0A0C0A" /> : <Play size={18} color="#0A0C0A" fill="#0A0C0A" />}
              <Text style={styles.actionText}>{busy ? t('flowCredits.verifyingReward') : t('flowCredits.watchAd')}</Text>
            </TouchableOpacity>
            {flow.rewardState === 'granted' ? <Text style={styles.success}>{t('flowCredits.rewardGranted')}</Text> : null}
            {flow.rewardState === 'limit' ? <Text style={[styles.note, { color: colors.warning }]}>{t('flowCredits.rewardLimit')}</Text> : null}
            {flow.rewardState === 'unavailable' ? <Text style={[styles.note, { color: colors.textSecondary }]}>{t('flowCredits.rewardPending')}</Text> : null}

            <View style={styles.sectionTitleRow}>
              <ShoppingBag size={17} color={colors.textPrimary} />
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{t('flowCredits.getCredits')}</Text>
            </View>
            {flow.creditProducts.map((product) => {
              const count = packCount(product.id);
              return (
                <TouchableOpacity key={product.id} style={[styles.pack, { borderColor: count === 30 ? '#CCFF00' : colors.cardBorder }]} onPress={() => void flow.purchase(product)} accessibilityRole="button">
                  <View>
                    <Text style={[styles.packTitle, { color: colors.textPrimary }]}>{count} Flow Credits</Text>
                    <Text style={[styles.packSub, { color: colors.textSecondary }]}>{t('flowCredits.photoAnalyses', { count })}</Text>
                  </View>
                  <View style={styles.packRight}>
                    {count === 30 ? <Text style={styles.best}>{t('flowCredits.bestValue')}</Text> : null}
                    <Text style={[styles.price, { color: colors.textPrimary }]}>{product.displayPrice}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
            {flow.creditProducts.length === 0 ? <Text style={[styles.note, { color: colors.textSecondary }]}>{t('flowCredits.storeUnavailable')}</Text> : null}

            <TouchableOpacity style={[styles.premium, { borderColor: colors.gold }]} onPress={() => { flow.close(); router.push('/paywall'); }} accessibilityRole="button">
              <Crown size={18} color={colors.gold} />
              <Text style={[styles.premiumText, { color: colors.gold }]}>{t('flowCredits.upgradePremium')}</Text>
            </TouchableOpacity>
            <Text style={[styles.legal, { color: colors.textTertiary }]}>{t('flowCredits.serverAuthority')}</Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', justifyContent: 'flex-end', alignItems: 'center' },
  sheet: { maxHeight: '88%', width: '100%', maxWidth: 540, alignSelf: 'center', borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1 },
  content: { padding: 24, paddingBottom: 36 },
  close: { position: 'absolute', right: 18, top: 18, zIndex: 2, padding: 8 },
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
  note: { textAlign: 'center', marginTop: 10, fontSize: 12, lineHeight: 17 },
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
