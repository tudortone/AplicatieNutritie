import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, Alert, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Check, Crown, X, ScanLine, MessageSquareText, SlidersHorizontal, BarChart3, RefreshCcw } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { usePremium, PREMIUM_PACKAGE_IDS } from '../context/PremiumContext';
import { useNotify } from '../hooks/useNotify';
import { getLegalUrls } from '../lib/legalUrls';
import type { PurchasesPackage } from 'react-native-purchases';

const FEATURES = [
  { icon: ScanLine, title: 'Scanări AI nelimitate', desc: 'Fotografiază farfuria fără limite' },
  { icon: MessageSquareText, title: 'Chat NutriAI nelimitat', desc: 'Consiliere nutrițională fără restricții' },
  { icon: SlidersHorizontal, title: 'Macro-uri personalizate', desc: 'Proteine, carbohidrați și grăsimi ajustate' },
  { icon: BarChart3, title: 'Statistici avansate', desc: 'Evoluție completă pe săptămâni și luni' },
];

function formatPrice(pkg: PurchasesPackage): string {
  return pkg.product?.priceString ?? '—';
}

export default function PaywallScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const notify = useNotify();
  const { isPremium, loading, subscriptionPackages, purchasesAvailable, purchaseSubscription, restore } = usePremium();
  const [buying, setBuying] = useState<string | null>(null);

  const monthly = subscriptionPackages.find((p) => p.identifier === PREMIUM_PACKAGE_IDS[0]);
  const annual = subscriptionPackages.find((p) => p.identifier === PREMIUM_PACKAGE_IDS[1]);

  const buy = async (pkg: PurchasesPackage) => {
    if (!purchasesAvailable) {
      notify.warning('Indisponibil în Expo Go', 'Achizițiile funcționează în versiunea instalată (build de producție).');
      return;
    }
    setBuying(pkg.identifier);
    const ok = await purchaseSubscription(pkg);
    setBuying(null);
    if (ok) {
      notify.success('Premium activat', 'Mulțumim! Ai acces la toate funcțiile.');
      // BUG-033: back doar dacă există stack; altfel înapoi la tabs (nu rată moartă).
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/(tabs)');
      }
    } else {
      notify.warning('Achiziție anulată', 'Nu s-a finalizat plata.');
    }
  };

  // P-02: deschide documentele legale în browser extern; fail-closed cu Alert pe eșec.
  const openLegal = (key: 'termsUrl' | 'privacyUrl') => {
    try {
      const { termsUrl, privacyUrl } = getLegalUrls();
      Linking.openURL(key === 'termsUrl' ? termsUrl : privacyUrl);
    } catch {
      Alert.alert('Document indisponibil', 'Documentul legal nu e momentan disponibil. Încearcă din nou mai târziu.');
    }
  };

  const handleRestore = async () => {
    const ok = await restore();
    if (ok) {
      notify.success('Restaurat', 'Abonamentul tău Premium e activ.');
      // BUG-033: back doar dacă există stack; altfel înapoi la tabs (nu rată moartă).
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/(tabs)');
      }
    } else {
      notify.warning('Nimic de restaurat', 'Nu am găsit achiziții anterioare pe acest cont.');
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={[styles.glowTop, { backgroundColor: colors.gold }]} />
      <View style={[styles.glowBottom, { backgroundColor: colors.accentSecondary }]} />

      <View style={styles.header}>
        {/* BUG-030: țintă de atingere minimă 44×44 pentru butonul X (doar icon). */}
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} style={styles.closeBtn} accessibilityRole="button" accessibilityLabel="Închide">
          <X size={22} color={colors.textSecondary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>NutriAI Premium</Text>
        <View style={{ width: 44 }} />
      </View>

      {isPremium ? (
        <View style={styles.premiumActive}>
          <Crown size={44} color={colors.gold} />
          <Text maxFontSizeMultiplier={1.3} style={[styles.premiumActiveTitle, { color: colors.textPrimary }]}>Ești deja Premium 🎉</Text>
          <Text style={[styles.premiumActiveDesc, { color: colors.textSecondary }]}>
            Toate funcțiile sunt active pe acest cont.
          </Text>
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
            style={({ pressed }) => [styles.primaryBtn, { backgroundColor: colors.accent, opacity: pressed ? 0.8 : 1 }]}
          >
            <Text style={[styles.primaryBtnText, { color: colors.background }]}>Înapoi la aplicație</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          <View style={styles.hero}>
            <LinearGradient colors={[colors.gold + '33', 'rgba(0,0,0,0)']} style={[styles.heroBadge, { borderColor: colors.gold + '44' }]}>
              <Crown size={18} color={colors.gold} />
              <Text maxFontSizeMultiplier={1.3} style={[styles.heroBadgeText, { color: colors.gold }]}>DEBLOCHEAZĂ TOT</Text>
            </LinearGradient>
            <Text maxFontSizeMultiplier={1.3} style={[styles.heroTitle, { color: colors.textPrimary }]}>NutriAI Premium</Text>
            <Text style={[styles.heroSubtitle, { color: colors.textSecondary }]}>
              Toată puterea AI-ului, fără limite. Anulezi oricând.
            </Text>
          </View>

          <View style={styles.features}>
            {FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <View key={f.title} style={[styles.feature, { backgroundColor: colors.surfaceBg, borderColor: colors.cardBorder }]}>
                  <View style={[styles.featureIcon, { backgroundColor: `${colors.accent}1A` }]}>
                    <Icon size={18} color={colors.accent} />
                  </View>
                  <View style={styles.featureCopy}>
                    <Text style={[styles.featureTitle, { color: colors.textPrimary }]}>{f.title}</Text>
                    <Text style={[styles.featureDesc, { color: colors.textSecondary }]}>{f.desc}</Text>
                  </View>
                  <Check size={16} color={colors.success} strokeWidth={3} />
                </View>
              );
            })}
          </View>

          {loading ? (
            <ActivityIndicator size="large" color={colors.accent} style={{ marginVertical: 24 }} />
          ) : (
            <>
              <View style={styles.plans}>
                {monthly ? (
                  <Pressable
                    onPress={() => buy(monthly)}
                    disabled={buying != null}
                    style={({ pressed }) => [styles.planCard, { borderColor: colors.cardBorder, backgroundColor: colors.surfaceBg, opacity: pressed ? 0.85 : 1 }]}
                    accessibilityRole="button"
                    accessibilityLabel={`Abonament Lunar ${formatPrice(monthly)} pe lună`}
                    accessibilityState={{ disabled: buying != null }}
                  >
                    <Text maxFontSizeMultiplier={1.3} style={[styles.planName, { color: colors.textPrimary }]}>Lunar</Text>
                    <Text maxFontSizeMultiplier={1.3} style={[styles.planPrice, { color: colors.textPrimary }]}>{formatPrice(monthly)}</Text>
                    <Text style={[styles.planPer, { color: colors.textSecondary }]}>pe lună</Text>
                    {buying === monthly.identifier ? <ActivityIndicator color={colors.accent} /> : null}
                  </Pressable>
                ) : null}

                {annual ? (
                  <Pressable
                    onPress={() => buy(annual)}
                    disabled={buying != null}
                    style={({ pressed }) => [
                      styles.planCard,
                      styles.planCardHighlight,
                      { borderColor: colors.gold, backgroundColor: `${colors.accent}14`, opacity: pressed ? 0.85 : 1 },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={`Abonament Anual ${formatPrice(annual)} pe an`}
                    accessibilityState={{ disabled: buying != null }}
                  >
                    <View style={[styles.bestTag, { backgroundColor: colors.gold }]}>
                      <Text maxFontSizeMultiplier={1.3} style={[styles.bestTagText, { color: colors.textOnAccent }]}>CEL MAI BUN PREȚ</Text>
                    </View>
                    <Text maxFontSizeMultiplier={1.3} style={[styles.planName, { color: colors.textPrimary }]}>Anual</Text>
                    <Text maxFontSizeMultiplier={1.3} style={[styles.planPrice, { color: colors.gold }]}>{formatPrice(annual)}</Text>
                    <Text style={[styles.planPer, { color: colors.textSecondary }]}>pe an · ~35% reducere</Text>
                    {buying === annual.identifier ? <ActivityIndicator color={colors.gold} /> : null}
                  </Pressable>
                ) : null}
              </View>

              <Text style={[styles.trialNote, { color: colors.textTertiary }]}>
                Începe cu o perioadă de trial gratuit, apoi se facturează automat. Anulezi oricând din contul Google Play.
              </Text>

              <Pressable onPress={handleRestore} style={styles.restoreBtn} accessibilityRole="button">
                <RefreshCcw size={13} color={colors.textSecondary} />
                <Text style={[styles.restoreText, { color: colors.textSecondary }]}>Restaurează achizițiile</Text>
              </Pressable>
            </>
          )}

          <Text style={[styles.legal, { color: colors.textTertiary }]}>
            Plata se procesează prin Google Play. Abonamentul se reînnoiește automat până la anulare.{'\n'}
            <Text style={{ textDecorationLine: 'underline' }} onPress={() => openLegal('termsUrl')}>{'Termeni'}</Text> · <Text style={{ textDecorationLine: 'underline' }} onPress={() => openLegal('privacyUrl')}>{'Confidențialitate'}</Text>
          </Text>
        </ScrollView>
      )}

      </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  glowTop: { position: 'absolute', top: -120, right: -120, width: 380, height: 380, borderRadius: 190, opacity: 0.1 },
  glowBottom: { position: 'absolute', bottom: -120, left: -120, width: 320, height: 320, borderRadius: 160, opacity: 0.08 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 12 },
  closeBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '900' },
  scroll: { paddingHorizontal: 20, paddingBottom: 40 },
  hero: { alignItems: 'center', marginTop: 8, marginBottom: 20 },
  // heroBadge: borderColor (gold+44) e setat inline în render; aici doar layout.
  heroBadge: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1, marginBottom: 14 },
  heroBadgeText: { fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  heroTitle: { fontSize: 30, fontWeight: '900', letterSpacing: -0.5 },
  heroSubtitle: { fontSize: 14, marginTop: 8, textAlign: 'center', maxWidth: 300 },
  features: { gap: 10, marginBottom: 22 },
  feature: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, borderWidth: 1, padding: 12 },
  featureIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  featureCopy: { flex: 1 },
  featureTitle: { fontSize: 14, fontWeight: '800' },
  featureDesc: { fontSize: 12, marginTop: 2 },
  plans: { flexDirection: 'row', gap: 12 },
  planCard: { flex: 1, borderRadius: 18, borderWidth: 1, padding: 16, alignItems: 'center', minHeight: 140, justifyContent: 'center' },
  planCardHighlight: { borderWidth: 2 },
  bestTag: { position: 'absolute', top: -10, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 },
  bestTagText: { fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
  planName: { fontSize: 14, fontWeight: '800', marginTop: 8 },
  planPrice: { fontSize: 22, fontWeight: '900', marginTop: 6 },
  planPer: { fontSize: 11, marginTop: 2 },
  trialNote: { fontSize: 11, textAlign: 'center', marginTop: 14, lineHeight: 16 },
  restoreBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 14, minHeight: 44, paddingHorizontal: 12, paddingVertical: 8 },
  restoreText: { fontSize: 12, fontWeight: '700' },
  legal: { fontSize: 11, textAlign: 'center', marginTop: 18, lineHeight: 16 },
  premiumActive: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30, gap: 10 },
  premiumActiveTitle: { fontSize: 22, fontWeight: '900', marginTop: 6 },
  premiumActiveDesc: { fontSize: 14, textAlign: 'center' },
  primaryBtn: { marginTop: 18, borderRadius: 16, paddingHorizontal: 28, paddingVertical: 14 },
  primaryBtnText: { fontSize: 15, fontWeight: '900' },
});
