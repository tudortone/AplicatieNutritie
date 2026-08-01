import React, { useEffect, useRef, useState } from 'react';
import {
  useWindowDimensions,
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { Camera, Bot, TrendingUp, ArrowRight, Check } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { useAppStore } from '../hooks/useAppStore';

const SLIDES = [
  {
    id: '1',
    icon: Camera,
    title: 'Scanează farfuria cu AI',
    description: 'Fă o poză mâncării tale și inteligența artificială va identifica ingredientele, estimând caloriile și macronutrienții.',
    badge: 'RECUNOAȘTERE VIZUALĂ',
    color: '#CCFF00',
  },
  {
    id: '2',
    icon: Bot,
    title: 'Asistent NutriAI personal',
    description: 'Primești consiliere nutrițională în chat pentru rețete, ajustări și recomandări personalizate.',
    badge: 'CHAT INTERACTIV',
    color: '#00e5ff',
  },
  {
    id: '3',
    icon: TrendingUp,
    title: 'Evoluție și hidratare',
    description: 'Urmărește graficele săptămânale, consumul de apă și alimentele favorite pentru acces rapid.',
    badge: 'PROGRES MĂSURABIL',
    color: '#ff007f',
  },
];

export default function OnboardingScreen() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const { setOnboardingDone } = useAppStore();
  const [currentIndex, setCurrentIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const compactHeight = height < 700;
  const compactWidth = width < 360;

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ x: currentIndex * width, animated: false });
    });
    return () => cancelAnimationFrame(frame);
  }, [width, currentIndex]);

  const finalizaOnboarding = () => {
    setOnboardingDone(true);
    router.replace('/(tabs)');
  };

  const nextSlide = () => {
    if (currentIndex < SLIDES.length - 1) {
      const next = currentIndex + 1;
      scrollRef.current?.scrollTo({ x: next * width, animated: true });
      setCurrentIndex(next);
      return;
    }
    finalizaOnboarding();
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={[styles.glowTop, { backgroundColor: SLIDES[currentIndex].color }]} />
      <View style={[styles.glowBottom, { backgroundColor: colors.accentSecondary }]} />

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(event) => {
          const index = Math.max(0, Math.min(SLIDES.length - 1, Math.round(event.nativeEvent.contentOffset.x / width)));
          setCurrentIndex(index);
        }}
        scrollEventThrottle={16}
        style={styles.pager}
        accessibilityRole="adjustable"
        accessibilityLabel={`Prezentare NutriAI, pagina ${currentIndex + 1} din ${SLIDES.length}`}
      >
        {SLIDES.map((slide) => {
          const IconComp = slide.icon;
          return (
            <View
              key={slide.id}
              style={[
                styles.slide,
                { width, paddingHorizontal: compactWidth ? 20 : 32 },
                compactHeight && styles.slideCompact,
              ]}
            >
              <Animated.View
                entering={FadeInDown.duration(600).delay(150)}
                style={[styles.iconWrap, compactHeight && styles.iconWrapCompact]}
              >
                <LinearGradient
                  colors={[`${slide.color}33`, 'rgba(0,0,0,0)']}
                  style={[styles.iconGrad, compactHeight && styles.iconGradCompact]}
                >
                  <IconComp size={compactHeight ? 48 : 64} color={slide.color} strokeWidth={2} />
                </LinearGradient>
              </Animated.View>

              <Animated.View entering={FadeInUp.duration(600).delay(250)} style={styles.contentWrap}>
                <View style={[styles.badge, { backgroundColor: `${slide.color}20`, borderColor: `${slide.color}40` }]}>
                  <Text style={[styles.badgeText, { color: slide.color }]}>{slide.badge}</Text>
                </View>
                <Text
                  style={[
                    styles.title,
                    { color: colors.textPrimary },
                    (compactHeight || compactWidth) && styles.titleCompact,
                  ]}
                >
                  {slide.title}
                </Text>
                <Text
                  style={[
                    styles.description,
                    { color: colors.textSecondary },
                    compactHeight && styles.descriptionCompact,
                  ]}
                >
                  {slide.description}
                </Text>
              </Animated.View>
            </View>
          );
        })}
      </ScrollView>

      <View
        style={[
          styles.footer,
          {
            paddingHorizontal: compactWidth ? 20 : 32,
            paddingBottom: Math.max(insets.bottom, compactHeight ? 16 : 28),
          },
        ]}
      >
        <View style={styles.dots} accessibilityElementsHidden>
          {SLIDES.map((_, index) => (
            <View
              key={index}
              style={[
                styles.dot,
                {
                  backgroundColor: index === currentIndex ? SLIDES[currentIndex].color : colors.textTertiary,
                  width: index === currentIndex ? 28 : 8,
                },
              ]}
            />
          ))}
        </View>

        <Pressable
          style={({ pressed }) => [styles.btn, { shadowColor: SLIDES[currentIndex].color, opacity: pressed ? 0.78 : 1 }]}
          onPress={nextSlide}
          accessibilityRole="button"
          accessibilityLabel={currentIndex === SLIDES.length - 1 ? 'Începe să folosești NutriAI' : 'Continuă la pagina următoare'}
        >
          <LinearGradient
            colors={[
              SLIDES[currentIndex].color,
              SLIDES[currentIndex].color === '#CCFF00' ? '#99cc00' : '#0088ff',
            ]}
            style={[styles.btnGrad, compactWidth && styles.btnGradCompact]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <Text style={[styles.btnText, { color: SLIDES[currentIndex].color === '#CCFF00' ? '#000' : '#FFF' }]}>
              {currentIndex === SLIDES.length - 1 ? 'Începe' : 'Continuă'}
            </Text>
            {currentIndex === SLIDES.length - 1 ? (
              <Check size={20} color={SLIDES[currentIndex].color === '#CCFF00' ? '#000' : '#FFF'} strokeWidth={3} />
            ) : (
              <ArrowRight size={20} color={SLIDES[currentIndex].color === '#CCFF00' ? '#000' : '#FFF'} strokeWidth={3} />
            )}
          </LinearGradient>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  pager: { flex: 1 },
  glowTop: { position: 'absolute', top: -100, right: -100, width: 350, height: 350, borderRadius: 175, opacity: 0.12 },
  glowBottom: { position: 'absolute', bottom: -100, left: -100, width: 300, height: 300, borderRadius: 150, opacity: 0.08 },
  slide: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  slideCompact: { justifyContent: 'space-evenly' },
  iconWrap: { marginBottom: 48, shadowOffset: { width: 0, height: 16 }, shadowOpacity: 0.4, shadowRadius: 32, elevation: 20 },
  iconWrapCompact: { marginBottom: 18 },
  iconGrad: { width: 140, height: 140, borderRadius: 40, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  iconGradCompact: { width: 104, height: 104, borderRadius: 30 },
  contentWrap: { alignItems: 'center', maxWidth: 560 },
  badge: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20, borderWidth: 1, marginBottom: 20 },
  badgeText: { fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  title: { fontSize: 32, fontWeight: '900', textAlign: 'center', marginBottom: 16, letterSpacing: -0.5 },
  titleCompact: { fontSize: 27, lineHeight: 33 },
  description: { fontSize: 16, lineHeight: 26, textAlign: 'center', fontWeight: '400', maxWidth: 460 },
  descriptionCompact: { fontSize: 14, lineHeight: 21 },
  footer: { paddingTop: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 16 },
  dots: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  dot: { height: 8, borderRadius: 4 },
  btn: { borderRadius: 20, overflow: 'hidden', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 16, elevation: 12 },
  btnGrad: { minHeight: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 28, paddingVertical: 16, gap: 10 },
  btnGradCompact: { paddingHorizontal: 18 },
  btnText: { fontSize: 17, fontWeight: '900', letterSpacing: 0.3 },
});
