import React from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Droplet, Minus, Plus, Scale } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../context/ThemeContext';

export interface WaterIntakeCardProps {
  consumedMl: number;
  targetMl: number | null;
  loading: boolean;
  onAddGlass: () => void;
  onRemoveGlass: () => void;
  onAddWeight: () => void;
}

export function WaterIntakeCard({
  consumedMl,
  targetMl,
  loading,
  onAddGlass,
  onRemoveGlass,
  onAddWeight,
}: WaterIntakeCardProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const hasTarget = typeof targetMl === 'number' && Number.isFinite(targetMl) && targetMl > 0;
  const progressPercent = hasTarget
    ? Math.min(Math.max((consumedMl / targetMl) * 100, 0), 100)
    : 0;

  return (
    <View
      style={[styles.card, { borderColor: colors.accentTertiary + '33' }]}
      accessibilityState={{ busy: loading }}
    >
      {Platform.OS === 'ios' ? (
        <BlurView intensity={20} tint="dark" style={styles.backdrop}>
          <CardContents />
        </BlurView>
      ) : (
        <View style={styles.backdrop}>
          <CardContents />
        </View>
      )}
    </View>
  );

  function CardContents() {
    return (
      <LinearGradient
        colors={[colors.accentTertiary + '15', 'rgba(0,0,0,0)']}
        style={styles.content}
      >
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <View style={[styles.iconWrap, { backgroundColor: colors.accentTertiary + '25' }]}>
              <Droplet size={20} color={colors.accentTertiary} fill={colors.accentTertiary} />
            </View>
            <View style={styles.heading}>
              <Text style={[styles.title, { color: colors.textPrimary }]} maxFontSizeMultiplier={1.3}>
                {t('home.waterTitle')}
              </Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.3}>
                {hasTarget
                  ? t('home.waterTargetMl', { ml: targetMl })
                  : t('home.waterMissingWeight')}
              </Text>
            </View>
          </View>

          <View style={styles.controls}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={t('home.waterMinusA11y')}
              accessibilityState={{ disabled: loading }}
              disabled={loading}
              testID="water-remove-glass"
              hitSlop={6}
              style={[styles.removeButton, { backgroundColor: colors.surfaceBg, borderColor: colors.cardBorder }]}
              onPress={onRemoveGlass}
            >
              <Minus size={19} color={colors.textPrimary} />
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={t('home.waterPlusA11y')}
              accessibilityState={{ disabled: loading }}
              disabled={loading}
              testID="water-add-glass"
              hitSlop={4}
              style={[styles.addButton, { shadowColor: colors.accentTertiary }]}
              onPress={onAddGlass}
            >
              <LinearGradient colors={[colors.accentTertiary, colors.accentTertiary + '66']} style={styles.addButtonFill}>
                <Plus size={22} color={colors.textOnAccent} strokeWidth={3} />
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>

        {hasTarget ? (
          <View
            testID="water-progress"
            accessibilityRole="progressbar"
            accessibilityLabel={t('home.waterProgressA11y')}
            accessibilityValue={{ min: 0, max: targetMl, now: Math.min(consumedMl, targetMl) }}
            style={styles.progressTrack}
          >
            <LinearGradient
              colors={[colors.accentTertiary, colors.accentTertiary + '66']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.progressFill, { width: `${progressPercent}%` }]}
            />
          </View>
        ) : null}

        <View style={styles.footer}>
          <Text
            testID="water-consumed-ml"
            accessibilityLabel={t('home.waterConsumedMl', { ml: consumedMl })}
            style={[styles.consumed, { color: colors.textPrimary }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
            maxFontSizeMultiplier={1.3}
          >
            <Text style={{ fontSize: 22, fontWeight: '900', color: colors.accentTertiary }}>{consumedMl}</Text> ml
          </Text>
          {hasTarget ? (
            <Text
              testID="water-target-ml"
              style={[styles.target, { color: colors.textTertiary }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.75}
              maxFontSizeMultiplier={1.3}
            >
              {t('home.waterTargetValue', { ml: targetMl })}
            </Text>
          ) : (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={t('home.waterAddWeight')}
              testID="water-add-weight"
              onPress={onAddWeight}
              style={styles.addWeightButton}
            >
              <Scale size={15} color={colors.accentTertiary} />
              <Text style={[styles.addWeightText, { color: colors.accentTertiary }]} maxFontSizeMultiplier={1.3}>
                {t('home.waterAddWeight')}
              </Text>
            </TouchableOpacity>
          )}
        </View>
        {loading ? <ActivityIndicator accessibilityLabel={t('common.loading')} color={colors.accentTertiary} style={styles.loading} /> : null}
      </LinearGradient>
    );
  }
}

const styles = StyleSheet.create({
  card: { width: '100%', maxWidth: 680, alignSelf: 'center', borderRadius: 24, overflow: 'hidden', borderWidth: 1, marginBottom: 20 },
  backdrop: { overflow: 'hidden' },
  content: { padding: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 16 },
  titleRow: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWrap: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  heading: { flex: 1, minWidth: 0 },
  title: { fontSize: 16, fontWeight: '800' },
  subtitle: { fontSize: 12, fontWeight: '500', marginTop: 2 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  removeButton: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  addButton: { width: 44, height: 44, borderRadius: 14, overflow: 'hidden', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 },
  addButtonFill: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' },
  progressTrack: { width: '100%', height: 10, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 5, overflow: 'hidden', marginBottom: 12 },
  progressFill: { height: '100%', borderRadius: 5 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  consumed: { fontSize: 14, fontWeight: '700' },
  target: { fontSize: 13, fontWeight: '800' },
  addWeightButton: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 6 },
  addWeightText: { fontSize: 13, fontWeight: '800' },
  loading: { position: 'absolute', right: 0, bottom: 0 },
});
