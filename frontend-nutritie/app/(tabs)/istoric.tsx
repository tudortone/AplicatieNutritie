import React, { useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, Platform } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInUp, FadeInDown, Layout } from 'react-native-reanimated';
import { Flame, Activity, Clock } from 'lucide-react-native';
import { useMeseAzi } from '../../hooks/useMeseAzi';
import { useTheme } from '../../context/ThemeContext';

export default function HistoryScreen() {
  const { colors } = useTheme();
  const { 
    mese, 
    totalCalorii, 
    totalProteine, 
    loading, 
    refresh 
  } = useMeseAzi();

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const onRefresh = useCallback(async () => {
    await refresh();
  }, [refresh]);

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Se încarcă istoricul...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.glowTop, { backgroundColor: colors.accentTertiary }]} />
      <View style={[styles.glowBottom, { backgroundColor: colors.accent }]} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={false} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.accent]} />
        }
      >
        <Animated.View entering={FadeInDown.duration(500)} style={styles.header}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Jurnalul tău</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Astăzi, {new Date().toLocaleDateString('ro-RO', { day: 'numeric', month: 'long' })}</Text>
        </Animated.View>

        {/* Daily summary */}
        {mese.length > 0 && (
          <Animated.View entering={FadeInDown.duration(600).delay(100)} style={[styles.summaryCard, { borderColor: colors.cardBorder }]}>
            <BlurView intensity={20} tint="dark" style={styles.summaryBlur}>
              <LinearGradient colors={[colors.accent + '12', 'rgba(0,0,0,0)']} style={styles.summaryGrad}>
                <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>TOTAL ZI</Text>
                <View style={styles.summaryRow}>
                  <View style={styles.summaryItem}>
                    <Flame size={20} color={colors.accent} />
                    <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>{totalCalorii}</Text>
                    <Text style={[styles.summaryUnit, { color: colors.textSecondary }]}>kcal</Text>
                  </View>
                  <View style={styles.summaryDivider} />
                  <View style={styles.summaryItem}>
                    <Activity size={20} color={colors.accentSecondary} />
                    <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>{totalProteine}g</Text>
                    <Text style={[styles.summaryUnit, { color: colors.textSecondary }]}>proteine</Text>
                  </View>
                  <View style={styles.summaryDivider} />
                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryEmoji}>🍽️</Text>
                    <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>{mese.length}</Text>
                    <Text style={[styles.summaryUnit, { color: colors.textSecondary }]}>mese</Text>
                  </View>
                </View>
              </LinearGradient>
            </BlurView>
          </Animated.View>
        )}

        {/* Meal list */}
        {mese.length === 0 ? (
          <Animated.View entering={FadeInUp.duration(600).delay(200)} style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <LinearGradient colors={[colors.accent + '1A', 'rgba(0,0,0,0)']} style={[styles.emptyIconGrad, { borderColor: colors.accent + '1A' }]}>
                <Text style={{ fontSize: 48 }}>🍽️</Text>
              </LinearGradient>
            </View>
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>Nicio masă înregistrată</Text>
            <Text style={[styles.emptySub, { color: colors.textSecondary }]}>Deschide scannerul AI din ecranul principal pentru a-ți urmări prima masă.</Text>
          </Animated.View>
        ) : (
          mese.map((masa, index) => (
            <Animated.View
              key={masa.id}
              entering={FadeInUp.duration(500).delay(index * 80).springify()}
              layout={Layout.springify()}
            >
              <BlurView intensity={20} tint="dark" style={[styles.card, { borderColor: colors.cardBorder }]}>
                <LinearGradient colors={[colors.cardBg, 'rgba(0,0,0,0)']} style={styles.cardGrad}>
                  <View style={styles.cardHeader}>
                    <View style={styles.cardTitleRow}>
                      <Text style={[styles.cardName, { color: colors.textPrimary }]}>{masa.nume}</Text>
                    </View>
                    <View style={styles.timeBadge}>
                      <Clock size={12} color={colors.textSecondary} />
                      <Text style={[styles.timeText, { color: colors.textSecondary }]}>{new Date(masa.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                    </View>
                  </View>

                  <View style={styles.cardStats}>
                    <View style={styles.cardStatItem}>
                      <LinearGradient colors={[colors.accent + '25', 'rgba(0,0,0,0)']} style={styles.cardStatBg}>
                        <Text style={[styles.cardStatValue, { color: colors.accent }]}>{masa.calorii || 0}</Text>
                        <Text style={[styles.cardStatLabel, { color: colors.textSecondary }]}>kcal</Text>
                      </LinearGradient>
                    </View>
                    <View style={styles.cardStatItem}>
                      <LinearGradient colors={[colors.accentSecondary + '25', 'rgba(0,0,0,0)']} style={styles.cardStatBg}>
                        <Text style={[styles.cardStatValue, { color: colors.accentSecondary }]}>{masa.proteine || 0}g</Text>
                        <Text style={[styles.cardStatLabel, { color: colors.textSecondary }]}>proteine</Text>
                      </LinearGradient>
                    </View>
                    <View style={styles.cardStatItem}>
                      <LinearGradient colors={[colors.accentTertiary + '1A', 'rgba(0,0,0,0)']} style={styles.cardStatBg}>
                        <Text style={[styles.cardStatValue, { color: colors.accentTertiary }]}>{masa.carbohidrati != null ? masa.carbohidrati : '—'}{masa.carbohidrati != null ? 'g' : ''}</Text>
                        <Text style={[styles.cardStatLabel, { color: colors.textSecondary }]}>carbs</Text>
                      </LinearGradient>
                    </View>
                  </View>
                </LinearGradient>
              </BlurView>
            </Animated.View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  glowTop: { position: 'absolute', top: -150, right: -100, width: 350, height: 350, borderRadius: 175, opacity: 0.04 },
  glowBottom: { position: 'absolute', bottom: -100, left: -80, width: 300, height: 300, borderRadius: 150, opacity: 0.04 },

  scroll: { paddingTop: Platform.OS === 'ios' ? 48 : 28, paddingHorizontal: 20, paddingBottom: Platform.OS === 'ios' ? 160 : 50 },

  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, fontSize: 15, fontWeight: '500' },

  header: { marginBottom: 28 },
  title: { fontSize: 36, fontWeight: '900', letterSpacing: -0.5 },
  subtitle: { fontSize: 15, marginTop: 4, fontWeight: '500' },

  // Summary card
  summaryCard: { borderRadius: 28, overflow: 'hidden', borderWidth: 1, marginBottom: 24 },
  summaryBlur: { overflow: 'hidden' },
  summaryGrad: { padding: 24 },
  summaryLabel: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 16 },
  summaryRow: { flexDirection: 'row', alignItems: 'center' },
  summaryItem: { flex: 1, alignItems: 'center', gap: 6 },
  summaryValue: { fontSize: 26, fontWeight: '900' },
  summaryUnit: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  summaryDivider: { width: 1, height: 60, backgroundColor: 'rgba(255,255,255,0.06)' },
  summaryEmoji: { fontSize: 20 },

  // Empty state
  emptyState: { alignItems: 'center', marginTop: 60, paddingHorizontal: 32 },
  emptyIcon: { marginBottom: 28, borderRadius: 40, overflow: 'hidden' },
  emptyIconGrad: { width: 120, height: 120, borderRadius: 40, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },
  emptyTitle: { fontSize: 22, fontWeight: '900', marginBottom: 12 },
  emptySub: { fontSize: 15, textAlign: 'center', lineHeight: 24 },

  // Meal card
  card: { borderRadius: 24, overflow: 'hidden', marginBottom: 16, borderWidth: 1 },
  cardGrad: { padding: 20 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  cardTitleRow: { flex: 1, marginRight: 12 },
  cardName: { fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  timeBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.05)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  timeText: { fontSize: 12, fontWeight: '600', marginLeft: 4 },

  cardStats: { flexDirection: 'row', gap: 10 },
  cardStatItem: { flex: 1, borderRadius: 14, overflow: 'hidden' },
  cardStatBg: { padding: 14, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)', borderRadius: 14 },
  cardStatValue: { fontSize: 18, fontWeight: '900', marginBottom: 2 },
  cardStatLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
});
