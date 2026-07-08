import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Dimensions,
  ScrollView
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { Camera, Bot, TrendingUp, ArrowRight, Check } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { useAppStore } from '../hooks/useAppStore';

const { width } = Dimensions.get('window');

const SLIDES = [
  {
    id: '1',
    icon: Camera,
    title: 'Scanează Farfuria cu AI',
    description: 'Fă o poză mâncării tale și inteligența artificială va identifica instant ingredientele, estimând cu precizie caloriile și macronutrienții.',
    badge: 'RECUNOAȘTERE VIZUALĂ',
    color: '#CCFF00',
  },
  {
    id: '2',
    icon: Bot,
    title: 'Asistent NutriAI Personal',
    description: 'Bucură-te de consiliere nutrițională 24/7. Poți vorbi vocal sau prin chat cu asistentul tău pentru rețete, ajustări și recomandări de diete.',
    badge: 'VOCE & CHAT INTERACTIV',
    color: '#00e5ff',
  },
  {
    id: '3',
    icon: TrendingUp,
    title: 'Evoluție & Hidratare',
    description: 'Urmărește graficele săptămânale, monitorizează consumul zilnic de apă și păstrează o listă cu alimentele tale favorite pentru acces ultra-rapid.',
    badge: 'PROGRES MĂSURABIL',
    color: '#ff007f',
  },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { setOnboardingDone } = useAppStore();
  const [currentIndex, setCurrentIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  const finalizaOnboarding = () => {
    setOnboardingDone(true);
    router.replace('/(tabs)');
  };

  const NextSlide = () => {
    if (currentIndex < SLIDES.length - 1) {
      const next = currentIndex + 1;
      scrollRef.current?.scrollTo({ x: next * width, animated: true });
      setCurrentIndex(next);
    } else {
      finalizaOnboarding();
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.glowTop, { backgroundColor: SLIDES[currentIndex].color }]} />
      <View style={[styles.glowBottom, { backgroundColor: colors.accentSecondary }]} />

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => {
          const index = Math.round(e.nativeEvent.contentOffset.x / width);
          setCurrentIndex(index);
        }}
        scrollEventThrottle={16}
        style={{ flex: 1 }}
      >
        {SLIDES.map((slide, idx) => {
          const IconComp = slide.icon;
          return (
            <View key={slide.id} style={[styles.slide, { width }]}>
              <Animated.View entering={FadeInDown.duration(600).delay(200)} style={styles.iconWrap}>
                <LinearGradient
                  colors={[slide.color + '33', 'rgba(0,0,0,0)']}
                  style={styles.iconGrad}
                >
                  <IconComp size={64} color={slide.color} strokeWidth={2} />
                </LinearGradient>
              </Animated.View>

              <Animated.View entering={FadeInUp.duration(600).delay(300)} style={styles.contentWrap}>
                <View style={[styles.badge, { backgroundColor: slide.color + '20', borderColor: slide.color + '40' }]}>
                  <Text style={[styles.badgeText, { color: slide.color }]}>{slide.badge}</Text>
                </View>

                <Text style={[styles.title, { color: colors.textPrimary }]}>{slide.title}</Text>
                <Text style={[styles.description, { color: colors.textSecondary }]}>{slide.description}</Text>
              </Animated.View>
            </View>
          );
        })}
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.dots}>
          {SLIDES.map((_, idx) => (
            <View
              key={idx}
              style={[
                styles.dot,
                {
                  backgroundColor: idx === currentIndex ? SLIDES[currentIndex].color : colors.textTertiary,
                  width: idx === currentIndex ? 28 : 8,
                },
              ]}
            />
          ))}
        </View>

        <TouchableOpacity
          style={[styles.btn, { shadowColor: SLIDES[currentIndex].color }]}
          onPress={NextSlide}
          activeOpacity={0.85}
        >
          <LinearGradient
            colors={[SLIDES[currentIndex].color, SLIDES[currentIndex].color === '#CCFF00' ? '#99cc00' : '#0088ff']}
            style={styles.btnGrad}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <Text style={[styles.btnText, { color: SLIDES[currentIndex].color === '#CCFF00' ? '#000' : '#FFF' }]}>
              {currentIndex === SLIDES.length - 1 ? 'Începe Acum!' : 'Continuă'}
            </Text>
            {currentIndex === SLIDES.length - 1 ? (
              <Check size={20} color={SLIDES[currentIndex].color === '#CCFF00' ? '#000' : '#FFF'} strokeWidth={3} />
            ) : (
              <ArrowRight size={20} color={SLIDES[currentIndex].color === '#CCFF00' ? '#000' : '#FFF'} strokeWidth={3} />
            )}
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  glowTop: { position: 'absolute', top: -100, right: -100, width: 350, height: 350, borderRadius: 175, opacity: 0.12 },
  glowBottom: { position: 'absolute', bottom: -100, left: -100, width: 300, height: 300, borderRadius: 150, opacity: 0.08 },
  slide: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
  iconWrap: { marginBottom: 48, shadowOffset: { width: 0, height: 16 }, shadowOpacity: 0.4, shadowRadius: 32, elevation: 20 },
  iconGrad: { width: 140, height: 140, borderRadius: 40, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  contentWrap: { alignItems: 'center' },
  badge: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20, borderWidth: 1, marginBottom: 20 },
  badgeText: { fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  title: { fontSize: 32, fontWeight: '900', textAlign: 'center', marginBottom: 16, letterSpacing: -0.5 },
  description: { fontSize: 16, lineHeight: 26, textAlign: 'center', fontWeight: '400', maxWidth: '90%' },
  footer: { paddingHorizontal: 32, paddingBottom: 50, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dots: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  dot: { height: 8, borderRadius: 4 },
  btn: { borderRadius: 20, overflow: 'hidden', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 16, elevation: 12 },
  btnGrad: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 28, paddingVertical: 18, gap: 10 },
  btnText: { fontSize: 17, fontWeight: '900', letterSpacing: 0.3 },
});
