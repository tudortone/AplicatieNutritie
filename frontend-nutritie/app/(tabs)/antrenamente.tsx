import React, { useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  FlatList,
  Platform
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Dumbbell, Flame, Plus, Trash2, Trophy, Sparkles } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { useTheme } from '../../context/ThemeContext';
import { useAntrenamente, Antrenament } from '../../hooks/useAntrenamente';
import { AddWorkoutBottomSheet, AddWorkoutBottomSheetRef } from '../../components/AddWorkoutBottomSheet';

export default function AntrenamenteScreen() {
  const { colors } = useTheme();
  const {
    antrenamente,
    totalCaloriiArse,
    numarAntrenamente,
    stergeAntrenament,
    loading,
    refresh
  } = useAntrenamente();

  const bottomSheetRef = useRef<AddWorkoutBottomSheetRef>(null);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const handleStergere = (item: Antrenament) => {
    Alert.alert(
      "Șterge antrenamentul",
      `Ești sigur că vrei să ștergi "${item.nume}" (-${item.calorii_arse} kcal)?`,
      [
        { text: "Anulează", style: "cancel" },
        {
          text: "Șterge",
          style: "destructive",
          onPress: async () => {
            try {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              await stergeAntrenament(item.id);
            } catch {}
          }
        }
      ]
    );
  };

  const renderItem = ({ item }: { item: Antrenament }) => (
    <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}>
      <View style={styles.cardLeft}>
        <View style={[styles.cardIconBox, { backgroundColor: colors.warning + '26' }]}>
          <Dumbbell size={20} color={colors.warning} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>{item.nume}</Text>
          <Text style={[styles.cardSub, { color: colors.textSecondary }]}>{item.durata_min} minute • {item.tip}</Text>
        </View>
      </View>

      <View style={styles.cardRight}>
        <View style={styles.kcalBadge}>
          <Flame size={14} color={colors.warning} />
          <Text style={[styles.kcalText, { color: colors.warning }]}>+{item.calorii_arse} kcal</Text>
        </View>

        <TouchableOpacity
          onPress={() => handleStergere(item)}
          style={[styles.deleteBtn, { backgroundColor: colors.danger + '1A' }]}
          accessibilityLabel={`Șterge antrenamentul ${item.nume}`}
          accessibilityRole="button"
        >
          <Trash2 size={16} color={colors.danger} />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={[styles.outerContainer, { backgroundColor: colors.background }]}>
      {/* Gradients decorative */}
      <View style={[styles.glowTop, { backgroundColor: colors.warning }]} />

      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Sport & Activitate</Text>
            <Text style={[styles.headerSub, { color: colors.textSecondary }]}>
              Caloriile arse măresc bugetul zilnic
            </Text>
          </View>

          <TouchableOpacity
            onPress={() => bottomSheetRef.current?.open()}
            style={[styles.addTopBtn, { backgroundColor: colors.warning }]}
            accessibilityLabel="Adaugă un nou antrenament"
            accessibilityRole="button"
          >
            <Plus size={22} color="#000" strokeWidth={3} />
          </TouchableOpacity>
        </View>

        {/* Summary Card */}
        <BlurView intensity={20} tint="dark" style={[styles.summaryCard, { borderColor: colors.warning + '40' }]}>
          <LinearGradient
            colors={[colors.warning + '1A', 'rgba(0,0,0,0)']}
            style={styles.summaryGradient}
          >
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>TOTAL ARS AZI</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Flame size={24} color={colors.warning} />
                <Text style={[styles.summaryValue, { color: colors.warning }]}>
                  +{totalCaloriiArse}
                </Text>
                <Text style={[styles.summaryUnit, { color: colors.textSecondary }]}>kcal</Text>
              </View>
            </View>

            <View style={[styles.divider, { backgroundColor: colors.cardBorder }]} />

            <View style={styles.summaryItem}>
              <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>ANTRENAMENTE</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Trophy size={22} color={colors.accent} />
                <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>
                  {numarAntrenamente}
                </Text>
              </View>
            </View>
          </LinearGradient>
        </BlurView>

        {/* Listă Antrenamente */}
        <FlatList
          data={antrenamente}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={[styles.emptyBox, { borderColor: colors.cardBorder, backgroundColor: colors.surfaceBg }]}>
              <Dumbbell size={42} color={colors.textTertiary} />
              <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
                Nu ai înregistrat niciun antrenament azi
              </Text>
              <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
                Orice exercițiu sau plimbare înregistrată îți adaugă calorii suplimentare în bugetul zilnic.
              </Text>
              <TouchableOpacity
                onPress={() => bottomSheetRef.current?.open()}
                style={[styles.emptyBtn, { backgroundColor: colors.warning }]}
              >
                <Text style={styles.emptyBtnText}>Adaugă primul antrenament</Text>
              </TouchableOpacity>
            </View>
          }
        />
      </View>

      <AddWorkoutBottomSheet ref={bottomSheetRef} onSuccess={refresh} />
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: { flex: 1 },
  container: { flex: 1, paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 56 : 32 },
  glowTop: { position: 'absolute', top: -100, right: -60, width: 280, height: 280, borderRadius: 140, opacity: 0.08 },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  headerTitle: { fontSize: 26, fontWeight: '900', letterSpacing: -0.5 },
  headerSub: { fontSize: 13, fontWeight: '600', marginTop: 2 },
  addTopBtn: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },

  summaryCard: { borderRadius: 22, overflow: 'hidden', borderWidth: 1, marginBottom: 20 },
  summaryGradient: { flexDirection: 'row', alignItems: 'center', padding: 18 },
  summaryItem: { flex: 1 },
  summaryLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8, marginBottom: 6 },
  summaryValue: { fontSize: 26, fontWeight: '900' },
  summaryUnit: { fontSize: 14, fontWeight: '700', alignSelf: 'flex-end', marginBottom: 3 },
  divider: { width: 1, height: '80%', marginHorizontal: 16 },

  listContent: { paddingBottom: 100 },
  card: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderRadius: 18, borderWidth: 1, marginBottom: 12 },
  cardLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  cardIconBox: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '800' },
  cardSub: { fontSize: 13, fontWeight: '600', marginTop: 2 },

  cardRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  kcalBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: 'rgba(245, 158, 11, 0.12)' },
  kcalText: { fontSize: 14, fontWeight: '800' },
  deleteBtn: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },

  emptyBox: { padding: 32, borderRadius: 22, borderWidth: 1, alignItems: 'center', marginTop: 20 },
  emptyTitle: { fontSize: 18, fontWeight: '800', textAlign: 'center', marginTop: 14, marginBottom: 8 },
  emptySub: { fontSize: 14, lineHeight: 20, textAlign: 'center', marginBottom: 20 },
  emptyBtn: { paddingHorizontal: 20, paddingVertical: 14, borderRadius: 14 },
  emptyBtnText: { color: '#000', fontSize: 15, fontWeight: '800' },
});
