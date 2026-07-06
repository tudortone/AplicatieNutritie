import React, { useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Platform, RefreshControl } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Scan, TrendingUp, Flame, Activity, Camera, Zap } from 'lucide-react-native';
import { useMeseAzi } from '../../hooks/useMeseAzi';
import { useTheme } from '../../context/ThemeContext';

export default function HomeScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { 
    totalCalorii, 
    totalProteine, 
    totalGrasimi, 
    totalCarbohidrati, 
    numarMese, 
    caloriiTinta, 
    proteineTinta, 
    user,
    loading, 
    refresh 
  } = useMeseAzi();

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const caloriiConsumate = totalCalorii;
  const proteineConsumate = totalProteine;
  const caloriiRamase = caloriiTinta - caloriiConsumate;
  const procentCalorii = Math.min((caloriiConsumate / caloriiTinta) * 100, 100);
  const procentProteine = Math.min((proteineConsumate / proteineTinta) * 100, 100);

  const userName = user?.email ? user.email.split('@')[0] : 'Prieten';
  const capitalizedName = userName.charAt(0).toUpperCase() + userName.slice(1);

  const sfaturiZilnice = [
    "💡 Hidratarea este cheia metabolizării eficiente a nutrienților. Bea un pahar cu apă cu 30 de minute înainte de fiecare masă.",
    "💡 Proteinele ajută la sațietate pe termen lung și menținerea masei musculare în deficit caloric.",
    "💡 Nu uita de fibre! Încearcă să incluzi cel puțin o porție de legume proaspete sau frunze verzi la prânz și cină.",
    "💡 Grăsimile sănătoase din avocado, nuci sau ulei de măsline sunt esențiale pentru absorbția vitaminelor A, D, E și K.",
    "💡 Somnul de 7-8 ore este vital pentru reglarea hormonilor foamei (grelina și leptina). Odihnește-te bine!",
    "💡 Carbohidrații complecși (ovăz, cartof dulce, orez brun) îți oferă energie constantă fără vârfuri de insulină.",
    "💡 Nu te stresa dacă într-o zi depășești ușor ținta. Consecvența pe termen lung este mult mai importantă decât perfecțiunea zilnică.",
    "💡 Consumă alimente bogate în magneziu și zinc pentru o recuperare musculară optimă după antrenamente.",
    "💡 Mănâncă încet și mestecă bine mâncarea — creierul are nevoie de aproximativ 20 de minute pentru a înregistra senzația de sațietate.",
    "💡 Planifică-ți mesele principale în avans pentru a evita deciziile impulsive când apare senzația de foame."
  ];
  const sfatAles = sfaturiZilnice[new Date().getDate() % sfaturiZilnice.length];

  if (loading) {
    return (
      <View style={[s.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={[s.loadingText, { color: colors.textSecondary }]}>Se încarcă jurnalul de astăzi...</Text>
      </View>
    );
  }

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <View style={[s.glowTop, { backgroundColor: colors.accent }]} />
      <View style={[s.glowBottom, { backgroundColor: colors.accentSecondary }]} />

      <ScrollView 
        showsVerticalScrollIndicator={false} 
        contentContainerStyle={s.scroll}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={refresh} tintColor={colors.accent} colors={[colors.accent]} />
        }
      >
        {/* Header */}
        <Animated.View entering={FadeInDown.duration(500)} style={s.header}>
          <View>
            <Text style={[s.greeting, { color: colors.textPrimary }]}>Salut, {capitalizedName}! 👋</Text>
            <Text style={[s.greetingSub, { color: colors.textSecondary }]}>Urmărește-ți nutriția de astăzi</Text>
          </View>
          <View style={s.streakBadge}>
            <LinearGradient colors={colors.accentGradient} style={s.streakGrad}>
              <Flame size={14} color={colors.background} />
              <Text style={[s.streakText, { color: colors.background }]}>{numarMese} mese</Text>
            </LinearGradient>
          </View>
        </Animated.View>

        {/* Main calorie ring card */}
        <Animated.View entering={FadeInDown.duration(700).delay(100)} style={[s.ringCard, { borderColor: colors.cardBorder }]}>
          <BlurView intensity={20} tint="dark" style={s.ringCardBlur}>
            <LinearGradient colors={[colors.accent + '10', 'rgba(0,0,0,0)']} style={s.ringCardGrad}>
              <Text style={[s.ringCardTitle, { color: colors.textSecondary }]}>CALORII RĂMASE</Text>
              <Text style={[s.ringCardValue, { color: colors.textPrimary }]}>{Math.max(caloriiRamase, 0)}</Text>
              <Text style={[s.ringCardSub, { color: colors.textSecondary }]}>din {caloriiTinta} kcal țintă</Text>

              <View style={s.progressBarBg}>
                <LinearGradient
                  colors={procentCalorii > 90 ? ['#f43f5e', '#fb7185'] : colors.accentGradient}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={[s.progressBarFill, { width: `${procentCalorii}%` }]}
                />
              </View>
              <Text style={[s.progressBarLabel, { color: colors.textSecondary }]}>{Math.round(procentCalorii)}% consumat</Text>

              <View style={s.macroRow}>
                <View style={s.macroItem}>
                  <View style={[s.macroIconBg, { backgroundColor: colors.accentSecondary + '25' }]}>
                    <Activity size={16} color={colors.accentSecondary} />
                  </View>
                  <Text style={[s.macroValue, { color: colors.textPrimary }]}>{proteineConsumate}g</Text>
                  <Text style={[s.macroLabel, { color: colors.textSecondary }]}>Proteine</Text>
                  <View style={s.macroBarBg}>
                    <LinearGradient colors={colors.accentSecondaryGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                      style={[s.macroBarFill, { width: `${procentProteine}%` }]} />
                  </View>
                </View>

                <View style={s.macroDivider} />

                <View style={s.macroItem}>
                  <View style={[s.macroIconBg, { backgroundColor: colors.accentTertiary + '25' }]}>
                    <Zap size={16} color={colors.accentTertiary} />
                  </View>
                  <Text style={[s.macroValue, { color: colors.textPrimary }]}>{totalCarbohidrati}g</Text>
                  <Text style={[s.macroLabel, { color: colors.textSecondary }]}>Carbi</Text>
                  <View style={s.macroBarBg}>
                    <LinearGradient colors={[colors.accentTertiary, colors.accentTertiary + 'AA']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                      style={[s.macroBarFill, { width: `${Math.min((totalCarbohidrati / 250) * 100, 100)}%` }]} />
                  </View>
                </View>

                <View style={s.macroDivider} />

                <View style={s.macroItem}>
                  <View style={[s.macroIconBg, { backgroundColor: colors.warning + '25' }]}>
                    <Flame size={16} color={colors.warning} />
                  </View>
                  <Text style={[s.macroValue, { color: colors.textPrimary }]}>{totalGrasimi}g</Text>
                  <Text style={[s.macroLabel, { color: colors.textSecondary }]}>Grăsimi</Text>
                  <View style={s.macroBarBg}>
                    <LinearGradient colors={[colors.warning, colors.warning + 'AA']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                      style={[s.macroBarFill, { width: `${Math.min((totalGrasimi / 70) * 100, 100)}%` }]} />
                  </View>
                </View>

                <View style={s.macroDivider} />

                <View style={s.macroItem}>
                  <View style={[s.macroIconBg, { backgroundColor: colors.accent + '25' }]}>
                    <TrendingUp size={16} color={colors.accent} />
                  </View>
                  <Text style={[s.macroValue, { color: colors.textPrimary }]}>{numarMese}</Text>
                  <Text style={[s.macroLabel, { color: colors.textSecondary }]}>Mese azi</Text>
                  <View style={s.macroBarBg}>
                    <LinearGradient colors={colors.accentGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                      style={[s.macroBarFill, { width: `${Math.min(numarMese / 5, 1) * 100}%` }]} />
                  </View>
                </View>
              </View>
            </LinearGradient>
          </BlurView>
        </Animated.View>

        {/* Camera scan CTA */}
        <Animated.View entering={FadeInDown.duration(700).delay(250)}>
          <TouchableOpacity
            style={[s.scanCTA, { shadowColor: colors.accent }]}
            onPress={() => router.push('/camera')}
            activeOpacity={0.85}
          >
            <LinearGradient colors={colors.accentGradient} style={s.scanCTAGrad}>
              <View style={s.scanCTAIcon}>
                <Camera size={28} color={colors.background} strokeWidth={2.5} />
              </View>
              <View style={s.scanCTAText}>
                <Text style={[s.scanCTATitle, { color: colors.background }]}>Scanează Mâncarea</Text>
                <Text style={s.scanCTASub}>Analiză nutrițională instantă cu AI</Text>
              </View>
              <View style={s.scanCTAArrow}>
                <Scan size={20} color={colors.background} />
              </View>
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>

        {/* Tips card */}
        <Animated.View entering={FadeInDown.duration(700).delay(350)} style={[s.tipsCard, { borderColor: colors.accentSecondary + '25' }]}>
          <BlurView intensity={20} tint="dark" style={s.tipsBlur}>
            <LinearGradient colors={[colors.accentSecondary + '14', 'rgba(0,0,0,0)']} style={s.tipsGrad}>
              <Text style={[s.tipsTitle, { color: colors.textPrimary }]}>✨ Sfat NutriAI al Zilei</Text>
              <Text style={[s.tipsText, { color: colors.textTertiary }]}>{sfatAles}</Text>
            </LinearGradient>
          </BlurView>
        </Animated.View>

      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  glowTop: { position: 'absolute', top: -200, right: -100, width: 400, height: 400, borderRadius: 200, opacity: 0.04 },
  glowBottom: { position: 'absolute', bottom: -150, left: -100, width: 350, height: 350, borderRadius: 175, opacity: 0.06 },
  scroll: { paddingTop: Platform.OS === 'ios' ? 48 : 28, paddingHorizontal: 20, paddingBottom: Platform.OS === 'ios' ? 160 : 50 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, fontSize: 15, fontWeight: '500' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 },
  greeting: { fontSize: 32, fontWeight: '900', letterSpacing: -0.5 },
  greetingSub: { fontSize: 14, marginTop: 4, fontWeight: '500' },
  streakBadge: { borderRadius: 20, overflow: 'hidden' },
  streakGrad: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, gap: 6 },
  streakText: { fontWeight: '800', fontSize: 13, marginLeft: 4 },
  ringCard: { borderRadius: 32, overflow: 'hidden', borderWidth: 1, marginBottom: 20 },
  ringCardBlur: { overflow: 'hidden' },
  ringCardGrad: { padding: 28 },
  ringCardTitle: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 8 },
  ringCardValue: { fontSize: 72, fontWeight: '900', letterSpacing: -3, lineHeight: 80 },
  ringCardSub: { fontSize: 14, fontWeight: '500', marginBottom: 24 },
  progressBarBg: { width: '100%', height: 8, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden', marginBottom: 8 },
  progressBarFill: { height: '100%', borderRadius: 4 },
  progressBarLabel: { fontSize: 12, fontWeight: '600', marginBottom: 28 },
  macroRow: { flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 20, padding: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)' },
  macroItem: { flex: 1, alignItems: 'center' },
  macroIconBg: { width: 36, height: 36, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  macroValue: { fontSize: 18, fontWeight: '900', marginBottom: 2 },
  macroLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  macroBarBg: { width: '80%', height: 4, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' },
  macroBarFill: { height: '100%', borderRadius: 2 },
  macroDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginHorizontal: 4 },
  scanCTA: { borderRadius: 24, overflow: 'hidden', marginBottom: 20, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 20, elevation: 12 },
  scanCTAGrad: { flexDirection: 'row', alignItems: 'center', padding: 20, gap: 16 },
  scanCTAIcon: { width: 56, height: 56, borderRadius: 18, backgroundColor: 'rgba(9,12,14,0.15)', justifyContent: 'center', alignItems: 'center' },
  scanCTAText: { flex: 1 },
  scanCTATitle: { fontSize: 18, fontWeight: '900', letterSpacing: -0.3 },
  scanCTASub: { fontSize: 13, color: 'rgba(9,12,14,0.6)', fontWeight: '500', marginTop: 2 },
  scanCTAArrow: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(9,12,14,0.15)', justifyContent: 'center', alignItems: 'center' },
  tipsCard: { borderRadius: 24, overflow: 'hidden', borderWidth: 1 },
  tipsBlur: { overflow: 'hidden' },
  tipsGrad: { padding: 24 },
  tipsTitle: { fontSize: 16, fontWeight: '800', marginBottom: 10 },
  tipsText: { fontSize: 15, lineHeight: 24, fontWeight: '400' },
});