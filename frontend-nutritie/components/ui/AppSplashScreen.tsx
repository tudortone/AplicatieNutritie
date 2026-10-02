import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, Text, Image } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import * as SplashScreen from 'expo-splash-screen';
import { useReducedMotion } from '../../hooks/useReducedMotion';

interface AppSplashScreenProps {
  isReady: boolean;
  onAnimationComplete?: () => void;
}

const SPLASH_LOGO = require('../../assets/images/splash-icon.png');

// Durate calibrate pentru o tranzitie fina, minimalista si eleganta
const MIN_DISPLAY_MS = 650;
const MAX_FALLBACK_MS = 1400;

export const AppSplashScreen: React.FC<AppSplashScreenProps> = ({
  isReady,
  onAnimationComplete,
}) => {
  const [mounted, setMounted] = useState(true);
  const [isExiting, setIsExiting] = useState(false);
  const reduceMotion = useReducedMotion();
  const startTimeRef = useRef(Date.now());
  const exitStartedRef = useRef(false);

  // Valori animate
  const containerOpacity = useSharedValue(1);
  const logoScale = useSharedValue(reduceMotion ? 1 : 0.94);
  const glowScale = useSharedValue(reduceMotion ? 1 : 0.88);
  const glowOpacity = useSharedValue(reduceMotion ? 0.08 : 0.04);
  const textOpacity = useSharedValue(reduceMotion ? 1 : 0);
  const textTranslateY = useSharedValue(reduceMotion ? 0 : 6);

  // Ascunde splash screen-ul nativ imediat ce componenta React Native e montata
  useEffect(() => {
    void SplashScreen.hideAsync().catch(() => {});
  }, []);

  // Animatia de intrare subtila (doar daca nu este redus motion-ul)
  useEffect(() => {
    if (reduceMotion) {
      containerOpacity.value = 1;
      logoScale.value = 1;
      textOpacity.value = 1;
      return;
    }

    // Logo breathing entrance
    logoScale.value = withTiming(1, {
      duration: 600,
      easing: Easing.bezier(0.16, 1, 0.3, 1),
    });

    // Subtle ambient glow
    glowScale.value = withTiming(1.08, {
      duration: 700,
      easing: Easing.out(Easing.cubic),
    });
    glowOpacity.value = withTiming(0.14, {
      duration: 500,
      easing: Easing.out(Easing.quad),
    });

    // Elegant text & subtitle fade-in
    textOpacity.value = withDelay(
      150,
      withTiming(1, {
        duration: 400,
        easing: Easing.out(Easing.quad),
      })
    );
    textTranslateY.value = withDelay(
      150,
      withTiming(0, {
        duration: 400,
        easing: Easing.bezier(0.16, 1, 0.3, 1),
      })
    );
  }, [reduceMotion, containerOpacity, logoScale, glowScale, glowOpacity, textOpacity, textTranslateY]);

  // Declansare exit animation
  const startExit = () => {
    if (exitStartedRef.current) return;
    exitStartedRef.current = true;
    setIsExiting(true);

    const onExitDone = () => {
      setMounted(false);
      onAnimationComplete?.();
    };

    if (reduceMotion) {
      containerOpacity.value = withTiming(0, { duration: 150 }, () => {
        runOnJS(onExitDone)();
      });
      return;
    }

    logoScale.value = withTiming(1.03, {
      duration: 320,
      easing: Easing.out(Easing.quad),
    });

    containerOpacity.value = withTiming(
      0,
      {
        duration: 320,
        easing: Easing.out(Easing.quad),
      },
      (finished) => {
        if (finished) {
          runOnJS(onExitDone)();
        }
      }
    );

    // Defensive timeout asigura ca onExitDone se apeleaza intotdeauna (inclusiv in medii de test sau frame-uri intarziate)
    setTimeout(() => {
      onExitDone();
    }, 330);
  };

  // Verificare conditie de dismiss (isReady + minDisplayTime sau fallback timeout)
  useEffect(() => {
    if (!mounted || exitStartedRef.current) return;

    if (isReady) {
      const elapsed = Date.now() - startTimeRef.current;
      const remaining = Math.max(0, MIN_DISPLAY_MS - elapsed);
      const timer = setTimeout(() => {
        startExit();
      }, remaining);
      return () => clearTimeout(timer);
    }

    // Safety fallback daca incarcarea depaseste MAX_FALLBACK_MS
    const fallbackTimer = setTimeout(() => {
      startExit();
    }, MAX_FALLBACK_MS);

    return () => clearTimeout(fallbackTimer);
  }, [isReady, mounted]);

  const animatedContainerStyle = useAnimatedStyle(() => ({
    opacity: containerOpacity.value,
  }));

  const animatedLogoStyle = useAnimatedStyle(() => ({
    transform: [{ scale: logoScale.value }],
  }));

  const animatedGlowStyle = useAnimatedStyle(() => ({
    transform: [{ scale: glowScale.value }],
    opacity: glowOpacity.value,
  }));

  const animatedTextStyle = useAnimatedStyle(() => ({
    opacity: textOpacity.value,
    transform: [{ translateY: textTranslateY.value }],
  }));

  if (!mounted) return null;

  return (
    <Animated.View
      testID="app-splash-screen"
      pointerEvents={isExiting ? 'none' : 'auto'}
      style={[styles.container, animatedContainerStyle]}
    >
      <View style={styles.centerBox}>
        {/* Soft Ambient Radial Glow */}
        <Animated.View style={[styles.glow, animatedGlowStyle]} />

        {/* Logo Card */}
        <Animated.View style={[styles.logoWrapper, animatedLogoStyle]}>
          <Image
            source={SPLASH_LOGO}
            style={styles.logoImage}
            resizeMode="contain"
            accessibilityLabel="GetFlow Logo"
          />
        </Animated.View>

        {/* Minimalist Wordmark & Tagline */}
        <Animated.View style={[styles.textWrapper, animatedTextStyle]}>
          <Text style={styles.title}>GetFlow</Text>
          <View style={styles.accentBar} />
          <Text style={styles.subtitle}>NUTRIȚIE &amp; ENERGIE</Text>
        </Animated.View>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#090C0E',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999999,
  },
  centerBox: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: '#70FF00',
  },
  logoWrapper: {
    width: 96,
    height: 96,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#70FF00',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 6,
  },
  logoImage: {
    width: 96,
    height: 96,
    borderRadius: 22,
  },
  textWrapper: {
    alignItems: 'center',
    marginTop: 18,
  },
  title: {
    color: '#F8FAFC',
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 2,
    fontFamily: undefined,
  },
  accentBar: {
    width: 28,
    height: 2,
    backgroundColor: '#A3E635',
    borderRadius: 1,
    opacity: 0.5,
    marginVertical: 6,
  },
  subtitle: {
    color: '#64748B',
    fontSize: 9.5,
    fontWeight: '600',
    letterSpacing: 2.8,
  },
});

export default AppSplashScreen;
