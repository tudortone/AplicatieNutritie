import React, { useEffect, useRef, useState } from 'react';
import {
  useWindowDimensions,
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { Camera, Bot, TrendingUp, ArrowRight, Check, Cake, Ruler, Scale, Target } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { useAppStore } from '../hooks/useAppStore';
import { useAuth } from '../context/AuthContext';

type Slide = {
  id: string;
  icon: typeof Camera;
  title: string;
  description: string;
  badge: string;
  color: string;
  /** slide-ul de setup personal (date + calorii) */
  setup?: boolean;
};

const SLIDES: Slide[] = [
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
  {
    id: '4',
    icon: Target,
    title: 'Ținta ta zilnică',
    description: '',
    badge: 'SETUP PERSONALIZAT',
    color: '#CCFF00',
    setup: true,
  },
];

const ACTIVITATE_OPTIONS = [
  { id: 'sedentar', label: 'Sedentar', factor: 1.2, emoji: '🪑' },
  { id: 'usor', label: 'Ușor activ', factor: 1.375, emoji: '🚶' },
  { id: 'moderat', label: 'Moderat', factor: 1.55, emoji: '🏃' },
  { id: 'intens', label: 'Intens', factor: 1.725, emoji: '🏋️' },
] as const;

const OBIECTIV_OPTIONS = [
  { id: 'slabire', label: 'Slăbire', emoji: '📉', mult: 0.85 },
  { id: 'mentinere', label: 'Menținere', emoji: '⚖️', mult: 1 },
  { id: 'castig', label: 'Câștig', emoji: '📈', mult: 1.1 },
] as const;

type Sex = 'male' | 'female';
type ActivitateId = (typeof ACTIVITATE_OPTIONS)[number]['id'];
type ObiectivId = (typeof OBIECTIV_OPTIONS)[number]['id'];

/** Mifflin-St Jeor + factor de activitate + obiectiv → kcal recomandate/zi. */
function calculeazaKcal(kg: number, cm: number, ani: number, sex: Sex, activitate: ActivitateId, obiectiv: ObiectivId): number {
  if (!(kg > 0) || !(cm > 0) || !(ani > 0)) return 0;
  const bmr = 10 * kg + 6.25 * cm - 5 * ani + (sex === 'male' ? 5 : -161);
  const factor = ACTIVITATE_OPTIONS.find((a) => a.id === activitate)?.factor ?? 1.375;
  const mult = OBIECTIV_OPTIONS.find((o) => o.id === obiectiv)?.mult ?? 1;
  return Math.max(1200, Math.round((bmr * factor * mult) / 10) * 10);
}

export default function OnboardingScreen() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const { session } = useAuth();
  const { setOnboardingDone } = useAppStore();
  const [currentIndex, setCurrentIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const compactHeight = height < 700;
  const compactWidth = width < 360;

  // ─── Setup personal (slide 4) ───
  const [sex, setSex] = useState<Sex>('male');
  const [varsta, setVarsta] = useState('');
  const [inaltime, setInaltime] = useState('');
  const [greutate, setGreutate] = useState('');
  const [activitate, setActivitate] = useState<ActivitateId>('moderat');
  const [obiectiv, setObiectiv] = useState<ObiectivId>('mentinere');
  const [setupHint, setSetupHint] = useState(false);

  const ani = parseFloat(varsta);
  const cm = parseFloat(inaltime);
  const kg = parseFloat(greutate);
  const setupValid =
    Number.isFinite(ani) && ani >= 10 && ani <= 100 &&
    Number.isFinite(cm) && cm >= 100 && cm <= 250 &&
    Number.isFinite(kg) && kg >= 30 && kg <= 250;
  const kcalRecomandate = calculeazaKcal(kg, cm, ani, sex, activitate, obiectiv);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ x: currentIndex * width, animated: false });
    });
    return () => cancelAnimationFrame(frame);
  }, [width, currentIndex]);

  const finalizaOnboarding = async () => {
    if (!setupValid) {
      setSetupHint(true);
      return;
    }
    try {
      await AsyncStorage.multiSet([
        ['greutate', String(kg)],
        ['caloriiTinta', String(kcalRecomandate)],
        ['sex', sex],
        ['varsta', String(ani)],
        ['inaltime', String(cm)],
        ['nivel_activitate', activitate],
        ['obiectiv', obiectiv],
      ]);
    } catch {
      // dacă stocarea locală eșuează, continuăm oricum — datele se pot seta și în Profil
    }
    setOnboardingDone(true);
    router.replace(session ? '/(tabs)' : '/auth');
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

  const isLast = currentIndex === SLIDES.length - 1;

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
          if (slide.setup) {
            return (
              <View key={slide.id} style={[styles.slide, { width, paddingHorizontal: compactWidth ? 20 : 32 }]}>
                <ScrollView
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={styles.setupScroll}
                  keyboardShouldPersistTaps="handled"
                >
                  <Animated.View entering={FadeInDown.duration(600).delay(150)} style={[styles.setupCard, compactHeight && styles.setupCardCompact]}>
                    <View style={[styles.badge, { backgroundColor: `${slide.color}20`, borderColor: `${slide.color}40` }]}>
                      <Text style={[styles.badgeText, { color: slide.color }]}>{slide.badge}</Text>
                    </View>
                    <Text style={[styles.title, { color: colors.textPrimary }, (compactHeight || compactWidth) && styles.titleCompact]}>
                      Câte calorii ai voie?
                    </Text>
                    <Text style={[styles.description, { color: colors.textSecondary }, compactHeight && styles.descriptionCompact]}>
                      Completează datele tale și îți calculăm ținta zilnică de calorii.
                    </Text>

                    {/* Sex */}
                    <View style={styles.pillRow}>
                      {(['male', 'female'] as Sex[]).map((s) => (
                        <Pressable
                          key={s}
                          onPress={() => { setSex(s); setSetupHint(false); }}
                          style={({ pressed }) => [
                            styles.pill,
                            styles.pillHalf,
                            { borderColor: sex === s ? colors.accent : colors.cardBorder, backgroundColor: sex === s ? `${colors.accent}22` : colors.surfaceBg, opacity: pressed ? 0.7 : 1 },
                          ]}
                          accessibilityRole="button"
                          accessibilityLabel={s === 'male' ? 'Bărbat' : 'Femeie'}
                        >
                          <Text style={[styles.pillText, { color: sex === s ? colors.accent : colors.textSecondary }]}>
                            {s === 'male' ? '👨 Bărbat' : '👩 Femeie'}
                          </Text>
                        </Pressable>
                      ))}
                    </View>

                    {/* Vârstă / Înălțime / Greutate */}
                    <View style={styles.fieldRow}>
                      <View style={styles.field}>
                        <View style={styles.fieldLabelRow}>
                          <Cake size={12} color={colors.textTertiary} />
                          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Vârstă</Text>
                        </View>
                        <TextInput
                          value={varsta}
                          onChangeText={(t) => { setVarsta(t.replace(/[^0-9]/g, '')); setSetupHint(false); }}
                          keyboardType="number-pad"
                          placeholder="25"
                          placeholderTextColor={colors.textTertiary}
                          style={[styles.input, { backgroundColor: colors.surfaceBg, borderColor: colors.cardBorder, color: colors.textPrimary }]}
                          maxLength={3}
                        />
                      </View>
                      <View style={styles.field}>
                        <View style={styles.fieldLabelRow}>
                          <Ruler size={12} color={colors.textTertiary} />
                          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Înălțime</Text>
                        </View>
                        <TextInput
                          value={inaltime}
                          onChangeText={(t) => { setInaltime(t.replace(/[^0-9]/g, '')); setSetupHint(false); }}
                          keyboardType="number-pad"
                          placeholder="175"
                          placeholderTextColor={colors.textTertiary}
                          style={[styles.input, { backgroundColor: colors.surfaceBg, borderColor: colors.cardBorder, color: colors.textPrimary }]}
                          maxLength={3}
                        />
                      </View>
                      <View style={styles.field}>
                        <View style={styles.fieldLabelRow}>
                          <Scale size={12} color={colors.textTertiary} />
                          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Greutate</Text>
                        </View>
                        <TextInput
                          value={greutate}
                          onChangeText={(t) => { setGreutate(t.replace(/[^0-9]/g, '')); setSetupHint(false); }}
                          keyboardType="number-pad"
                          placeholder="75"
                          placeholderTextColor={colors.textTertiary}
                          style={[styles.input, { backgroundColor: colors.surfaceBg, borderColor: colors.cardBorder, color: colors.textPrimary }]}
                          maxLength={3}
                        />
                      </View>
                    </View>

                    {/* Activitate */}
                    <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Nivel de activitate</Text>
                    <View style={styles.pillRow}>
                      {ACTIVITATE_OPTIONS.map((a) => (
                        <Pressable
                          key={a.id}
                          onPress={() => { setActivitate(a.id); setSetupHint(false); }}
                          style={({ pressed }) => [
                            styles.pill,
                            { borderColor: activitate === a.id ? colors.accent : colors.cardBorder, backgroundColor: activitate === a.id ? `${colors.accent}22` : colors.surfaceBg, opacity: pressed ? 0.7 : 1 },
                          ]}
                          accessibilityRole="button"
                          accessibilityLabel={a.label}
                        >
                          <Text style={[styles.pillText, { color: activitate === a.id ? colors.accent : colors.textSecondary }]}>
                            {a.emoji} {a.label}
                          </Text>
                        </Pressable>
                      ))}
                    </View>

                    {/* Obiectiv */}
                    <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Obiectiv</Text>
                    <View style={styles.pillRow}>
                      {OBIECTIV_OPTIONS.map((o) => (
                        <Pressable
                          key={o.id}
                          onPress={() => { setObiectiv(o.id); setSetupHint(false); }}
                          style={({ pressed }) => [
                            styles.pill,
                            { borderColor: obiectiv === o.id ? colors.accent : colors.cardBorder, backgroundColor: obiectiv === o.id ? `${colors.accent}22` : colors.surfaceBg, opacity: pressed ? 0.7 : 1 },
                          ]}
                          accessibilityRole="button"
                          accessibilityLabel={o.label}
                        >
                          <Text style={[styles.pillText, { color: obiectiv === o.id ? colors.accent : colors.textSecondary }]}>
                            {o.emoji} {o.label}
                          </Text>
                        </Pressable>
                      ))}
                    </View>

                    {/* Rezultat */}
                    <LinearGradient
                      colors={[`${slide.color}18`, 'rgba(0,0,0,0)']}
                      style={[styles.resultCard, { borderColor: `${slide.color}44` }]}
                    >
                      <Text style={[styles.resultLabel, { color: colors.textSecondary }]}>
                        {setupValid ? 'Ținta ta recomandată' : 'Recomandare'}
                      </Text>
                      <Text style={[styles.resultValue, { color: slide.color }]}>
                        {setupValid ? `≈ ${kcalRecomandate} kcal/zi` : '— kcal/zi'}
                      </Text>
                      <Text style={[styles.resultHint, { color: colors.textTertiary }]}>
                        {setupValid
                          ? 'Bazată pe datele tale și pe obiectivul ales'
                          : 'Completează vârsta, înălțimea și greutatea'}
                      </Text>
                    </LinearGradient>

                    {setupHint ? (
                      <Text style={[styles.hint, { color: colors.danger }]}>
                        Completează toate datele (vârstă 10–100, înălțime 100–250 cm, greutate 30–250 kg) ca să continuăm.
                      </Text>
                    ) : null}
                  </Animated.View>
                </ScrollView>
              </View>
            );
          }

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
          style={({ pressed }) => [
            styles.btn,
            { shadowColor: SLIDES[currentIndex].color, opacity: pressed ? 0.78 : 1 },
            isLast && !setupValid && styles.btnDisabled,
          ]}
          onPress={nextSlide}
          disabled={isLast && !setupValid}
          accessibilityRole="button"
          accessibilityLabel={isLast ? 'Începe să folosești NutriAI' : 'Continuă la pagina următoare'}
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
              {isLast ? 'Începe' : 'Continuă'}
            </Text>
            {isLast ? (
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
  btnDisabled: { opacity: 0.4 },
  btnGrad: { minHeight: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 28, paddingVertical: 16, gap: 10 },
  btnGradCompact: { paddingHorizontal: 18 },
  btnText: { fontSize: 17, fontWeight: '900', letterSpacing: 0.3 },

  // ─── Slide 4: setup personal ───
  setupScroll: { flexGrow: 1, justifyContent: 'center' },
  setupCard: { alignItems: 'center', maxWidth: 560, width: '100%', alignSelf: 'center' },
  setupCardCompact: { justifyContent: 'center' },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 10, width: '100%' },
  pill: { minHeight: 40, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  pillHalf: { flex: 1 },
  pillText: { fontSize: 13, fontWeight: '800' },
  fieldRow: { flexDirection: 'row', gap: 8, marginTop: 12, width: '100%' },
  field: { flex: 1 },
  fieldLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 5 },
  fieldLabel: { fontSize: 12, fontWeight: '700', marginTop: 12 },
  input: { borderRadius: 12, borderWidth: 1, paddingVertical: 10, paddingHorizontal: 12, fontSize: 15, fontWeight: '800', textAlign: 'center' },
  resultCard: { marginTop: 16, borderRadius: 18, borderWidth: 1, paddingVertical: 14, paddingHorizontal: 20, alignItems: 'center', width: '100%' },
  resultLabel: { fontSize: 12, fontWeight: '700' },
  resultValue: { fontSize: 28, fontWeight: '900', marginTop: 4, letterSpacing: -0.5 },
  resultHint: { fontSize: 11, marginTop: 4, textAlign: 'center' },
  hint: { fontSize: 12, fontWeight: '600', textAlign: 'center', marginTop: 12 },
});
