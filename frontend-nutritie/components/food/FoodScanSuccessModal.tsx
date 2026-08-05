import React, { useMemo } from 'react';
import { Modal, View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import { Check, Plus, X } from 'lucide-react-native';
import { AminoaciziEsentiali } from '../../types';
import { useTheme } from '../../context/ThemeContext';
import { useTranslation } from 'react-i18next';
import type { ThemeColors } from '../../constants/theme';

export interface AlimentScanat {
  nume: string;
  estimare_grame: number;
  calorii_per_100g: number;
  proteine_per_100g: number;
  grasimi_per_100g: number;
  carbohidrati_per_100g: number;
  aminoacizi_per_100g?: AminoaciziEsentiali;
}

interface Props {
  visible: boolean;
  alimente: AlimentScanat[];
  onAddToDiary: () => void;
  onClose: () => void;
}

const kcalTotal = (a: AlimentScanat) =>
  Math.round((a.calorii_per_100g * a.estimare_grame) / 100);

export default function FoodScanSuccessModal({ visible, alimente, onAddToDiary, onClose }: Props) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const totalCalorii = alimente.reduce((s, a) => s + kcalTotal(a), 0);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View entering={FadeIn.duration(180)} style={styles.overlay}>
        <Animated.View entering={FadeInUp.springify().damping(16)} style={styles.card}>
          <Pressable
            style={styles.closeBtn}
            onPress={onClose}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t('food.success.close')}
          >
            <X size={20} color={colors.textTertiary} />
          </Pressable>

          <View style={styles.badge}>
            <Check size={28} color={colors.background} strokeWidth={3} />
          </View>

          <Text style={styles.title}>{t('food.success.title')}</Text>
          <Text style={styles.subtitle}>
            {t('food.success.subtitle', { count: alimente.length, numar: alimente.length, kcal: totalCalorii })}
          </Text>

          <ScrollView style={styles.list} contentContainerStyle={{ paddingBottom: 8 }}>
            {alimente.map((a, i) => (
              <View key={`${a.nume}-${i}`} style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowName} numberOfLines={1}>{a.nume}</Text>
                  <Text style={styles.rowMeta}>{a.estimare_grame} g</Text>
                </View>
                <Text style={styles.rowKcal}>{kcalTotal(a)} kcal</Text>
              </View>
            ))}
          </ScrollView>

          <Pressable
            style={styles.cta}
            onPress={onAddToDiary}
            accessibilityRole="button"
            accessibilityLabel={t('food.success.addToDiary')}
          >
            <Plus size={20} color={colors.background} strokeWidth={2.5} />
            <Text style={styles.ctaText}>{t('food.success.addToDiary')}</Text>
          </Pressable>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.8)',
      justifyContent: 'center',
      paddingHorizontal: 20,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 24,
      padding: 24,
      maxHeight: '80%',
    },
    closeBtn: { position: 'absolute', top: 16, right: 16, zIndex: 2 },
    badge: {
      alignSelf: 'center',
      width: 56, height: 56, borderRadius: 28,
      backgroundColor: colors.accent,
      alignItems: 'center', justifyContent: 'center',
      marginBottom: 16, marginTop: 4,
    },
    title: { color: colors.textPrimary, fontSize: 20, fontWeight: '700', textAlign: 'center' },
    subtitle: { color: colors.textTertiary, fontSize: 14, textAlign: 'center', marginTop: 4, marginBottom: 16 },
    list: { flexGrow: 0, marginBottom: 20 },
    row: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: colors.surfaceElevated,
      borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14, marginBottom: 8,
    },
    rowName: { color: colors.textPrimary, fontSize: 15, fontWeight: '600' },
    rowMeta: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
    rowKcal: { color: colors.accent, fontSize: 14, fontWeight: '700' },
    cta: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
      backgroundColor: colors.accent,
      borderRadius: 16, paddingVertical: 16, width: '100%',
    },
    ctaText: { color: colors.background, fontSize: 16, fontWeight: '700' },
  });
