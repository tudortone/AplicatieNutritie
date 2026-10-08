import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Modal, Pressable } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  runOnJS,
} from 'react-native-reanimated';
import { Check, Flame, Zap } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../context/ThemeContext';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { MOTION_DURATIONS } from '../../constants/motion';

export interface MealSuccessData {
  nume: string;
  calorii: number;
  proteine?: number;
  carbohidrati?: number;
  grasimi?: number;
  tip_masa?: string;
  isOffline?: boolean;
}

interface MealSaveSuccessModalProps {
  visible: boolean;
  data: MealSuccessData | null;
  onDismiss: () => void;
}

export const MealSaveSuccessModal: React.FC<MealSaveSuccessModalProps> = ({
  visible,
  data,
  onDismiss,
}) => {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const opacity = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    if (!visible || !data) return;

    // 1. Haptic subtil de confirmare
    try {
      if (data.isOffline) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch {}

    if (reduceMotion) {
      opacity.value = 1;
      const timer = setTimeout(() => {
        onDismiss();
      }, MOTION_DURATIONS.feedbackReduced);
      return () => clearTimeout(timer);
    }

    // Safety timeout: guarantees dismissal after 750ms even if Reanimated frame/worklet drops on Android
    const safetyTimer = setTimeout(() => {
      onDismiss();
    }, 750);

    // Tranziție calmă exclusiv prin fade; fără bounce/spring sau scalare.
    opacity.value = withSequence(
      withTiming(1, { duration: 120 }),
      withTiming(1, { duration: 420 }),
      withTiming(0, { duration: 150 }, (finished) => {
        if (finished) runOnJS(onDismiss)();
      })
    );

    return () => clearTimeout(safetyTimer);
  }, [visible, data, reduceMotion, onDismiss, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  if (!visible || !data) return null;

  const titleText = data.isOffline
    ? ((i18n?.isInitialized && i18n.language !== 'ro')
        ? t('postSave.savedOffline', 'Saved offline')
        : (t('postSave.savedOffline') !== 'postSave.savedOffline' ? t('postSave.savedOffline') : 'Salvat offline'))
    : ((i18n?.isInitialized && i18n.language !== 'ro')
        ? t('postSave.mealAdded', 'Meal added!')
        : (t('postSave.mealAdded') !== 'postSave.mealAdded' ? t('postSave.mealAdded') : 'Masă adăugată!'));

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onDismiss}
    >
      <Pressable testID="meal-save-backdrop" style={styles.backdrop} onPress={onDismiss} accessibilityRole="alert" accessibilityLiveRegion="assertive">
        <Animated.View
          style={[
            styles.card,
            {
              backgroundColor: colors.surfaceElevated || '#181D22',
              borderColor: colors.accent,
              shadowColor: colors.accent,
            },
            animatedStyle,
          ]}
        >
          <View style={[styles.iconCircle, { backgroundColor: colors.accent }]}>
            <Check size={22} color={colors.background || '#090C0E'} strokeWidth={3} />
          </View>

          <View style={styles.textWrap}>
            <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
              {titleText}
            </Text>
            <Text style={[styles.mealName, { color: colors.textSecondary }]} numberOfLines={1}>
              {data.nume}
            </Text>

            <View style={styles.macroPillRow}>
              <View style={[styles.macroPill, { backgroundColor: 'rgba(204,255,0,0.12)' }]}>
                <Flame size={12} color={colors.accent} />
                <Text
                  style={[styles.macroPillText, { color: colors.accent }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.75}
                >
                  +{Math.round(data.calorii)} kcal
                </Text>
              </View>

              <View style={[styles.macroPill, { backgroundColor: 'rgba(0,240,255,0.12)' }]}>
                <Zap size={12} color={colors.accentTertiary || '#00F0FF'} />
                <Text
                  style={[styles.macroPillText, { color: colors.accentTertiary || '#00F0FF' }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.75}
                >
                  +{Math.round((data.proteine ?? 0) * 10) / 10}g P
                </Text>
              </View>
            </View>
          </View>
        </Animated.View>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    zIndex: 99999,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 22,
    borderWidth: 1.5,
    gap: 14,
    minWidth: 260,
    maxWidth: '88%',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 12,
  },
  iconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textWrap: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 16,
    fontWeight: '900',
  },
  mealName: {
    fontSize: 13,
    fontWeight: '600',
  },
  macroPillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  macroPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  macroPillText: {
    fontSize: 12,
    fontWeight: '800',
  },
});
