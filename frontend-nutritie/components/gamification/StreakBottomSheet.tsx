import React, { forwardRef, useImperativeHandle, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Modal, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Flame, Award, CheckCircle2, ShieldCheck, X } from 'lucide-react-native';

import { useTheme } from '../../context/ThemeContext';
import { useGamificareContext } from '../../context/GamificareContext';

export interface StreakBottomSheetRef {
  open: () => void;
  close: () => void;
}

const MILESTONES = [
  { zile: 3, titlu: 'Început promițător', icon: '🌱', xp: 50 },
  { zile: 7, titlu: 'O săptămână plină', icon: '🔥', xp: 150 },
  { zile: 14, titlu: 'Campionul consecvenței', icon: '⚡', xp: 300 },
  { zile: 30, titlu: 'Maestru nutrițional', icon: '🏆', xp: 750 },
  { zile: 100, titlu: 'Legendă NutriAI', icon: '👑', xp: 2500 },
];

export const StreakBottomSheet = forwardRef<StreakBottomSheetRef>((_, ref) => {
  const { colors } = useTheme();
  const { streak, xpTotal, nivel, detaliiNivel } = useGamificareContext();
  const [visible, setVisible] = useState(false);

  useImperativeHandle(ref, () => ({
    open: () => setVisible(true),
    close: () => setVisible(false),
  }));

  return (
    <Modal
      visible={visible}
      onRequestClose={() => setVisible(false)}
      animationType="slide"
      transparent
    >
      <Pressable style={styles.backdrop} onPress={() => setVisible(false)}>
        <Pressable style={[styles.sheet, { backgroundColor: colors.background, borderColor: colors.cardBorder }]} onPress={(e) => e.stopPropagation()}>
        <View style={styles.indicatorWrap}>
          <View style={[styles.indicator, { backgroundColor: colors.overlayStrong }]} />
        </View>

        <TouchableOpacity style={styles.closeBtn} onPress={() => setVisible(false)}>
          <X size={20} color={colors.textSecondary} />
        </TouchableOpacity>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* Header Card */}
          <Animated.View entering={FadeInDown.duration(400)}>
            <LinearGradient colors={colors.accentGradient} style={styles.headerGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
              <View style={styles.flameIconWrap}>
                <Flame size={48} color={colors.background} fill={colors.background} />
              </View>
              <Text style={[styles.streakCount, { color: colors.background }]}>{streak} Zile</Text>
              <Text style={[styles.streakSubtitle, { color: colors.background }]}>Seria ta de consecvență nutrițională</Text>
            </LinearGradient>
          </Animated.View>

          {/* Level Info Banner */}
          <View style={[styles.levelCard, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}>
            <View style={styles.levelRow}>
              <Award size={24} color={colors.accent} />
              <View style={styles.levelTextWrap}>
                <Text style={[styles.levelTitle, { color: colors.textPrimary }]}>
                  Nivelul {nivel} • {detaliiNivel.titlu}
                </Text>
                <Text style={[styles.levelSub, { color: colors.textSecondary }]}>
                  {xpTotal} XP adunați în total
                </Text>
              </View>
            </View>

            <View style={[styles.progressTrack, { backgroundColor: colors.overlayLight }]}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${detaliiNivel.procentNivel}%`, backgroundColor: colors.accent }
                ]}
              />
            </View>
          </View>

          {/* Milestones list */}
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Jaloane de Consecvență</Text>

          <View style={styles.milestonesList}>
            {MILESTONES.map((m) => {
              const atins = streak >= m.zile;
              return (
                <View
                  key={m.zile}
                  style={[
                    styles.milestoneItem,
                    {
                      backgroundColor: atins ? colors.surfaceBg : colors.cardBg,
                      borderColor: atins ? colors.accent : colors.cardBorder,
                      opacity: atins ? 1 : 0.6,
                    }
                  ]}
                >
                  <Text style={{ fontSize: 24 }}>{m.icon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.mTitle, { color: colors.textPrimary }]}>{m.titlu}</Text>
                    <Text style={[styles.mSub, { color: colors.textSecondary }]}>{m.zile} zile consecutive • +{m.xp} XP</Text>
                  </View>
                  {atins ? (
                    <CheckCircle2 size={22} color={colors.accent} />
                  ) : (
                    <ShieldCheck size={20} color={colors.textSecondary} />
                  )}
                </View>
              );
            })}
          </View>
        </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
});

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 32, borderTopRightRadius: 32, borderWidth: 1, maxHeight: '82%', paddingHorizontal: 20 },
  indicatorWrap: { alignItems: 'center', paddingVertical: 12 },
  indicator: { width: 44, height: 5, borderRadius: 3 },
  closeBtn: { position: 'absolute', top: 16, right: 20, zIndex: 10, padding: 6 },
  content: { paddingBottom: 32, gap: 16 },
  headerGrad: { borderRadius: 24, padding: 24, alignItems: 'center' },
  flameIconWrap: { marginBottom: 8 },
  streakCount: { fontSize: 44, fontWeight: '900', letterSpacing: -1 },
  streakSubtitle: { fontSize: 14, fontWeight: '700', opacity: 0.8, marginTop: 2 },
  levelCard: { borderRadius: 20, borderWidth: 1, padding: 16, gap: 12 },
  levelRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  levelTextWrap: { flex: 1 },
  levelTitle: { fontSize: 16, fontWeight: '800' },
  levelSub: { fontSize: 13, marginTop: 2 },
  progressTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },
  sectionTitle: { fontSize: 18, fontWeight: '800', marginTop: 8 },
  milestonesList: { gap: 10 },
  milestoneItem: { flexDirection: 'row', alignItems: 'center', borderRadius: 16, borderWidth: 1, padding: 14, gap: 12 },
  mTitle: { fontSize: 15, fontWeight: '800' },
  mSub: { fontSize: 12, marginTop: 2 },
});
