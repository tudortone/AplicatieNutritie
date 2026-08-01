import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  FadeIn,
  FadeInDown,
  ZoomIn,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
} from 'react-native-reanimated';
import { Lock, ShieldCheck } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../context/ThemeContext';

interface LockScreenProps {
  biometricType: string;
  onUnlock: () => Promise<boolean>;
}

export default function LockScreen({ biometricType, onUnlock }: LockScreenProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const pulseScale = useSharedValue(1);
  const btnScale = useSharedValue(1);
  const [unlocking, setUnlocking] = useState(false);

  React.useEffect(() => {
    pulseScale.value = withRepeat(withTiming(1.07, { duration: 1300 }), -1, true);
  }, [pulseScale]);

  const shieldAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  const btnAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: btnScale.value }],
  }));

  const handleUnlockPress = async () => {
    if (unlocking) return;
    setUnlocking(true);
    btnScale.value = withSequence(
      withTiming(0.93, { duration: 100 }),
      withTiming(1, { duration: 100 }),
    );
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      await onUnlock();
    } finally {
      setUnlocking(false);
    }
  };

  return (
    <Animated.View
      style={[styles.container, { backgroundColor: colors.background }]}
      entering={FadeIn.duration(300)}
      accessibilityViewIsModal
      importantForAccessibility="yes"
    >
      <LinearGradient
        colors={[colors.background, colors.cardBg, colors.background]}
        style={StyleSheet.absoluteFillObject}
      />
      <BlurView
        intensity={Platform.OS === 'ios' ? 80 : 100}
        tint="dark"
        style={StyleSheet.absoluteFillObject}
      />

      <View
        style={[
          styles.content,
          {
            paddingTop: Math.max(insets.top, 24),
            paddingBottom: Math.max(insets.bottom, 24),
          },
        ]}
      >
        <Animated.View
          entering={ZoomIn.delay(100).duration(500)}
          style={[styles.iconRingOuter, shieldAnimatedStyle]}
        >
          <View
            style={[
              styles.iconRingInner,
              {
                borderColor: colors.accent,
                backgroundColor: `${colors.accent}15`,
                shadowColor: colors.accent,
              },
            ]}
          >
            <ShieldCheck size={64} color={colors.accent} />
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(200).duration(400)} style={styles.textContainer}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>NutriAI securizat</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Aplicația este blocată automat pentru a-ți proteja datele de nutriție și progresul fizic.
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(300).duration(400)} style={[styles.buttonContainer, btnAnimatedStyle]}>
          <Pressable
            style={({ pressed }) => [
              styles.unlockButton,
              { backgroundColor: colors.accent, shadowColor: colors.shadow, opacity: pressed || unlocking ? 0.72 : 1 },
            ]}
            onPress={handleUnlockPress}
            disabled={unlocking}
            accessibilityRole="button"
            accessibilityLabel={`Deblochează cu ${biometricType} sau parola dispozitivului`}
            accessibilityState={{ busy: unlocking, disabled: unlocking }}
          >
            {unlocking ? (
              <ActivityIndicator color={colors.background} />
            ) : (
              <>
                <Lock size={20} color={colors.background} style={styles.btnIcon} />
                <Text style={[styles.unlockText, { color: colors.background }]} numberOfLines={2}>
                  Deblochează cu {biometricType} / parolă
                </Text>
              </>
            )}
          </Pressable>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    elevation: 9999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    width: '100%',
    maxWidth: 600,
  },
  iconRingOuter: {
    width: 140,
    height: 140,
    borderRadius: 70,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 32,
  },
  iconRingInner: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  textContainer: {
    alignItems: 'center',
    marginBottom: 48,
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    marginBottom: 12,
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 360,
  },
  buttonContainer: {
    width: '100%',
    maxWidth: 420,
  },
  unlockButton: {
    flexDirection: 'row',
    minHeight: 58,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  btnIcon: { marginRight: 10 },
  unlockText: {
    flexShrink: 1,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '800',
  },
});
