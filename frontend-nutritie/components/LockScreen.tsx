import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated';
import { Lock, ShieldCheck, Key } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../context/ThemeContext';

const { width, height } = Dimensions.get('window');

interface LockScreenProps {
  biometricType: string;
  onUnlock: () => Promise<boolean>;
}

export default function LockScreen({ biometricType, onUnlock }: LockScreenProps) {
  const { colors } = useTheme();

  return (
    <Animated.View style={[styles.container, { backgroundColor: colors.background }]} entering={FadeIn.duration(300)}>
      <LinearGradient
        colors={[colors.background, colors.cardBg, colors.background]}
        style={StyleSheet.absoluteFillObject}
      />
      <BlurView intensity={Platform.OS === 'ios' ? 80 : 100} tint="dark" style={StyleSheet.absoluteFillObject} />

      <View style={styles.content}>
        <Animated.View entering={ZoomIn.delay(100).duration(500)} style={styles.iconRingOuter}>
          <View style={[styles.iconRingInner, { borderColor: colors.accent, backgroundColor: `${colors.accent}15` }]}>
            <ShieldCheck size={64} color={colors.accent} />
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(200).duration(400)} style={styles.textContainer}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>NutriAI Securizat</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Aplicația este blocată automat pentru a-ți proteja datele de nutriție și progresul fizic.
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(300).duration(400)} style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.unlockButton, { backgroundColor: colors.accent }]}
            activeOpacity={0.8}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              onUnlock();
            }}
          >
            <Lock size={20} color={colors.background} style={styles.btnIcon} />
            <Text style={[styles.unlockText, { color: colors.background }]}>
              Deblochează cu {biometricType} / Parolă
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    justifyContent: 'center',
    alignItems: 'center',
    width,
    height,
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: 32,
    width: '100%',
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
    shadowColor: '#CCFF00',
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
  },
  subtitle: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 280,
  },
  buttonContainer: {
    width: '100%',
  },
  unlockButton: {
    flexDirection: 'row',
    height: 58,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  btnIcon: {
    marginRight: 10,
  },
  unlockText: {
    fontSize: 16,
    fontWeight: '800',
  },
});
