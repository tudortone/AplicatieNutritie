import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Platform, TextInput, type StyleProp, type ViewStyle } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { Easing, FadeInDown, useAnimatedProps, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { Scan, Flame, Activity, Camera, Zap, PlusCircle, Scale, Footprints, Dumbbell, Bell, RotateCcw, X, AlertCircle } from 'lucide-react-native';
import Svg, { Circle } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { useNotificationBannerData } from '../../context/NotificationBannerContext';
import { useTranslation } from 'react-i18next';
import { useFocusRefresh } from '../../hooks/useFocusRefresh';
import { useMeseAzi } from '../../hooks/useMeseAzi';
import { useCurrentDayKey } from '../../hooks/useCurrentDayKey';
import { useTheme } from '../../context/ThemeContext';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useApa } from '../../hooks/useApa';
import { AddMealBottomSheet, AddMealBottomSheetRef } from '../../components/AddMealBottomSheet';
import { useHealthSync } from '../../hooks/useHealthSync';
import { useAntrenamente } from '../../hooks/useAntrenamente';
import { getCalorieState } from '../../lib/calorieState';
import { SkeletonLoader } from '../../components/SkeletonLoader';
import { BodyMap } from '../../components/fitness/BodyMap';
import { computeDailyMuscleIntensity, normalizeMuscleLoadToIntensity } from '../../lib/fitnessEngine';
import { useExercitii } from '../../hooks/useExercitii';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import { FlowIcon } from '../../components/ui/FlowIcon';
import { useGamificareData } from '../../context/GamificareContext';
import { StreakBottomSheet, StreakBottomSheetRef } from '../../components/gamification/StreakBottomSheet';
import { PressableScale } from '../../components/ui/PressableScale';
import { AddWeightModal } from '../../components/AddWeightModal';
import { supabase } from '../../supabase';
import { localDayKey } from '../../lib/dateUtils';
import { TARGETURI_PENDING_KEY } from '../../lib/sincronizeazaTargeturi';
import { anatomyMapSize, singleAnatomyMapWidth } from '../../lib/anatomyLayout';
import { FlowCreditsPill } from '../../components/FlowCreditsPill';
import { WaterIntakeCard } from '../../components/home/WaterIntakeCard';
import { PhotoJobStatusCard } from '../../components/photo/PhotoJobStatusCard';
import { calculateDailyWaterTargetMl, glassesToMilliliters } from '../../lib/hydration';

const AnimatedRingCircle = Animated.createAnimatedComponent(Circle);

// PERF-004: pe Android folosim un View simplu (gradientul din card poarta
// aspectul) in loc de blur live — cele 4 BlurView mereu montate pe Home au cost
// de compositing pe dispozitive mid/low-end. Pe iOS pastram BlurView (ieftin acolo).
function CardBackdrop({ style, children }: { style?: StyleProp<ViewStyle>; children?: React.ReactNode }) {
  if (Platform.OS === 'ios') {
    return <BlurView intensity={20} tint="dark" style={style}>{children}</BlurView>;
  }
  return <View style={style}>{children}</View>;
}

function RingProgress({ procent, color, bgColor, radius = 52, strokeWidth = 11 }: { procent: number; color: string; bgColor: string; radius?: number; strokeWidth?: number }) {
  const circumference = 2 * Math.PI * radius;
  const fill = Math.min(Math.max(procent, 0), 100);
  const progress = useSharedValue(0);
  const rotation = useSharedValue(0);
  const prevFill = useRef(fill);
  const reduceMotion = useReducedMotion();

  // Când se adaugă o masă, inelul se rotește până la noul nivel (spring) și dă un mic wiggle.
  useEffect(() => {
    if (reduceMotion) {
      progress.value = fill / 100;
      rotation.value = 0;
      prevFill.current = fill;
      return;
    }
    progress.value = withSpring(fill / 100, { damping: 16, stiffness: 120, mass: 0.7 });
    if (fill > prevFill.current) {
      rotation.value = withSequence(
        withTiming(2.5, { duration: 90, easing: Easing.out(Easing.quad) }),
        withTiming(-2.5, { duration: 150 }),
        withTiming(1.5, { duration: 130 }),
        withTiming(0, { duration: 170 }),
      );
    }
    prevFill.current = fill;
  }, [fill, progress, rotation, reduceMotion]);

  const animatedProps = useAnimatedProps(() => ({
    // Reanimated 4 + Fabric arunca "Loss of precision" pe valori fractionare
    // transmise prin useAnimatedProps; rotunjim la intreg — imperceptibil pe inel.
    strokeDashoffset: Math.round(circumference * (1 - progress.value)),
  }));
  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    <View style={{ width: (radius + strokeWidth) * 2, height: (radius + strokeWidth) * 2, justifyContent: 'center', alignItems: 'center' }}>
      <Animated.View style={[StyleSheet.absoluteFill, ringStyle, { alignItems: 'center', justifyContent: 'center' }]}>
        <Svg width={(radius + strokeWidth) * 2} height={(radius + strokeWidth) * 2}>
          <Circle
            cx={radius + strokeWidth}
            cy={radius + strokeWidth}
            r={radius}
            stroke={bgColor}
            strokeWidth={strokeWidth}
            fill="none"
          />
          <AnimatedRingCircle
            cx={radius + strokeWidth}
            cy={radius + strokeWidth}
            r={radius}
            stroke={color}
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={circumference}
            animatedProps={animatedProps}
            strokeLinecap="round"
            rotation="-90"
            origin={`${radius + strokeWidth}, ${radius + strokeWidth}`}
          />
        </Svg>
      </Animated.View>
      <View style={{ position: 'absolute', alignItems: 'center' }}>
        <Text style={{ fontSize: 20, fontWeight: '900', color: color }}>{Math.round(fill)}%</Text>
      </View>
    </View>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const { unreadCount } = useNotificationBannerData();
  const { streak } = useGamificareData();
  const addMealSheetRef = useRef<AddMealBottomSheetRef>(null);
  const streakSheetRef = useRef<StreakBottomSheetRef>(null);
  const [dataSelectata, setDataSelectata] = useState<Date>(() => new Date());
  const [weightModalVisible, setWeightModalVisible] = useState(false);
  const [greutateTinta, setGreutateTinta] = useState(70);
  const [stepGoalEdit, setStepGoalEdit] = useState(false);
  const [stepGoalInput, setStepGoalInput] = useState('');

  // HOME-TOUCH-001 / REMED-029: foaia Adaugă masă se montează DOAR la prima deschidere
  // pentru a preveni interceptarea atingerilor pe Home de către containerul/backdrop-ul
  // BottomSheet-ului nemontat complet.
  const [mealSheetMounted, setMealSheetMounted] = useState(false);
  const [mealSheetOpenNonce, setMealSheetOpenNonce] = useState(0);
  const deschideAddMeal = React.useCallback(() => {
    setMealSheetOpenNonce((n) => n + 1);
    setMealSheetMounted(true);
  }, []);
  useEffect(() => {
    if (!mealSheetMounted) return;
    addMealSheetRef.current?.open();
  }, [mealSheetMounted, mealSheetOpenNonce]);

  // BUG-001: cursorul zilei nu mai e inghetat la mount. Cand ziua locala se
  // schimba (miezul noptii, background peste miezul noptii, restart), sarim la
  // azi, iar useMeseAzi re-fetch-este automat pentru ca `dateKey` s-a schimbat.
  const currentDayKey = useCurrentDayKey();
  useEffect(() => {
    setDataSelectata(new Date());
  }, [currentDayKey]);

  const { 
    totalCalorii, 
    totalProteine, 
    totalGrasimi, 
    totalCarbohidrati,
    caloriiTinta, 
    proteineTinta, 
    carbiTinta,
    grasimiTinta,
    greutateIntrodusaKg,
    user,
    loading,
    eroareFetch,
    refresh,
    optimisticAddMeal,
  } = useMeseAzi(dataSelectata);
  const { t, i18n } = useTranslation();
  const { pahare, loading: waterLoading, adaugaPahar, scadePahar } = useApa();
  const { steps, activeCalories, stepGoal, isEnabled, isAvailable, setNewStepGoal, toggleSync, refreshSteps, addManualSteps } = useHealthSync();
  const { totalCaloriiArse, antrenamente, refresh: refreshAntrenamente } = useAntrenamente();
  const { exercitii } = useExercitii();
  const [viewSideHome, setViewSideHome] = useState<'front' | 'back'>('front');
  const [isTipVisible, setIsTipVisible] = useState(true);
  const { topInset, scrollPaddingBottom, scrollPaddingTop, screenWidth, horizontalPadding, contentMaxWidth, isCompact, isTablet } = useResponsiveLayout();
  const ringRadius = isCompact ? 44 : isTablet ? 60 : 52;
  const ringStroke = isCompact ? 10 : isTablet ? 13 : 11;
  const homeBodyWidth = singleAnatomyMapWidth(screenWidth, 184);
  const homeBodyHeight = anatomyMapSize(viewSideHome, homeBodyWidth).height;

  React.useEffect(() => {
    const checkTipClosed = async () => {
      try {
        const todayStr = new Date().toDateString();
        const closedDate = await AsyncStorage.getItem('nutriai_tip_closed_date');
        if (closedDate === todayStr) {
          setIsTipVisible(false);
        }
      } catch {}
    };
    checkTipClosed();
  }, []);

  const handleCloseTip = async () => {
    setIsTipVisible(false);
    try {
      const todayStr = new Date().toDateString();
      await AsyncStorage.setItem('nutriai_tip_closed_date', todayStr);
    } catch {}
  };

  // BUG-004: greutatea țintă se citește local + metadata (fără a naviga la Profil).
  useEffect(() => {
    let activ = true;
    (async () => {
      try {
        const storedTinta = await AsyncStorage.getItem('greutateTinta');
        let val: number | null = null;
        if (storedTinta) {
          const parsed = parseFloat(storedTinta);
          if (Number.isFinite(parsed) && parsed > 0) val = parsed;
        }
        if (val === null && user?.user_metadata) {
          const metaVal = (user.user_metadata as Record<string, unknown>).greutateTinta;
          if (typeof metaVal === 'number' && Number.isFinite(metaVal) && metaVal > 0) val = metaVal;
        }
        if (activ && val !== null) setGreutateTinta(val);
      } catch {}
    })();
    return () => { activ = false; };
  }, [user]);

  // BUG-004: salvare greutate curentă — oglindește statistici.tsx, dar deschide
  // modalul pe Home; refresh() împrospătează cardul fără navigare.
  const salveazaGreutate = async (nouaValoare: number) => {
    try {
      const aziStr = localDayKey(new Date());
      const ziNume = new Date().toLocaleDateString(i18n.language || 'ro', { weekday: 'short' }).slice(0, 3);
      const storedIstoric = await AsyncStorage.getItem('greutate_istoric');
      let istoric: { data: string; ziNume: string; greutate: number }[] = [];
      if (storedIstoric) {
        try { istoric = JSON.parse(storedIstoric); } catch {}
      }
      const restIstoric = istoric.filter((i) => i.data !== aziStr);
      const nouIstoric = [...restIstoric, { data: aziStr, ziNume, greutate: nouaValoare }].sort((a, b) => a.data.localeCompare(b.data));

      // Persistăm întâi (AsyncStorage + Supabase); doar pe succes actualizăm UI.
      await AsyncStorage.setItem('greutate', nouaValoare.toString());
      await AsyncStorage.setItem('greutate_istoric', JSON.stringify(nouIstoric));

      const { data: { user: userCurent } } = await supabase.auth.getUser();
      if (userCurent) {
        await supabase.auth.updateUser({ data: { greutate: nouaValoare, greutate_istoric: nouIstoric } });
      }
      // Serverul a confirmat -> nicio modificare locală în așteptare (BUG-035).
      await AsyncStorage.removeItem(TARGETURI_PENDING_KEY);

      setWeightModalVisible(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      refresh(true);
    } catch (e) {
      // BUG-035: server indisponibil -> marcăm targeturi locale nesincronizate,
      // ca useMeseAzi să citească valoarea locală (nu metadata stale).
      await AsyncStorage.setItem(TARGETURI_PENDING_KEY, '1').catch(() => {});
      console.error('Eroare la salvarea greutății:', e);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const salveazaGreutateTinta = async (nouaValoare: number) => {
    try {
      await AsyncStorage.setItem('greutateTinta', nouaValoare.toString());

      const { data: { user: userCurent } } = await supabase.auth.getUser();
      if (userCurent) {
        await supabase.auth.updateUser({ data: { greutateTinta: nouaValoare } });
      }
      await AsyncStorage.removeItem(TARGETURI_PENDING_KEY);

      setGreutateTinta(nouaValoare);
      setWeightModalVisible(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      await AsyncStorage.setItem(TARGETURI_PENDING_KEY, '1').catch(() => {});
      console.error('Eroare la salvarea greutății țintă:', e);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  // BUG-005: editarea obiectivului de pași apelează setNewStepGoal (existent).
  const handleSaveStepGoal = async () => {
    const parsed = parseInt(stepGoalInput.replace(/[^\d]/g, ''), 10);
    if (!Number.isFinite(parsed) || parsed < 500 || parsed > 100000) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    await setNewStepGoal(parsed);
    setStepGoalEdit(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const dailyIntensityHome = React.useMemo(() => {
    const hasServerLoad = (antrenamente ?? []).some(
      (w) => w.muscle_load && Object.keys(w.muscle_load).length > 0
    );

    if (hasServerLoad) {
      // Folosește DOAR muscle_load din server (nu dubla cu computeDailyMuscleIntensity)
      const map: Record<string, number> = {};
      for (const w of antrenamente ?? []) {
        if (w.muscle_load) {
          for (const [k, v] of Object.entries(w.muscle_load)) {
            map[k] = (map[k] ?? 0) + v;
          }
        }
      }
      return normalizeMuscleLoadToIntensity(map);
    }

    // Fallback: calculează din sesiuni
    const sesiuniAzi = (antrenamente || []).flatMap((w) =>
      (w.exercitii || []).map((ex) => ({
        exercitiuId: ex.exercitiuId,
        serii: Array.isArray(ex.seturi) ? ex.seturi.length : 1,
        volumKg: Array.isArray(ex.seturi)
          ? ex.seturi.reduce((acc, st) => acc + (st.repetari || 0) * (st.greutate || 0), 0)
          : 0,
        durataSec: (ex.durataMin || 0) * 60,
      }))
    );
    return computeDailyMuscleIntensity(sesiuniAzi, exercitii);
  }, [antrenamente, exercitii]);

  // Throttle: max 1 refresh la 5 sec la tab-switch (evită 5 apeluri Supabase simultane)
  useFocusRefresh(
    () => {
      refresh(true);
      refreshSteps();
      refreshAntrenamente();
    },
    5000,
    [refresh, refreshSteps, refreshAntrenamente],
  );

  const caloriiConsumate = totalCalorii;
  const proteineConsumate = totalProteine;
  const trackerCalories = isEnabled ? activeCalories : 0;
  // Caloriile din tracker (pași) și cele din antrenamente sunt complementare:
  // tracker-ul măsoară mișcarea generală, antrenamentele sunt sesiuni dedicate.
  // Le adunăm pentru totalul ars. Dacă observi suprapuneri, dezactivează una din surse.
  const caloriiArseTotal = trackerCalories + totalCaloriiArse;
  const caloriiRamase = caloriiTinta - caloriiConsumate + caloriiArseTotal;

  // FIT-001: bugetul net (țintă + arse) este definiția unică folosită de headline,
  // inel și stare. Fără asta, headline-ul arăta „mai am X kcal” în timp ce inelul
  // afișa depășire pe aceeași valoare consumată — două adevăruri contradictorii.
  const bugetCaloricNet = caloriiTinta + caloriiArseTotal;

  // Guard împotriva împărțirii la zero (NaN)
  const safeCaloriiTinta = bugetCaloricNet > 0 ? bugetCaloricNet : 1;
  const safeProteineTinta = proteineTinta > 0 ? proteineTinta : 1;
  const procentCalorii = Math.min((caloriiConsumate / safeCaloriiTinta) * 100, 100);
  const procentProteine = Math.min((proteineConsumate / safeProteineTinta) * 100, 100);
  const waterTargetMl = calculateDailyWaterTargetMl(greutateIntrodusaKg);
  const waterConsumedMl = glassesToMilliliters(pahare);

  const calState = getCalorieState(caloriiConsumate, bugetCaloricNet, colors.accent, colors.accentSecondary, t);

  const userName = user?.email ? user.email.split('@')[0] : t('home.friend');
  const capitalizedName = userName.charAt(0).toUpperCase() + userName.slice(1);

  const getSalut = () => {
    const ora = new Date().getHours();
    if (ora >= 5 && ora < 12) return t('home.greetingMorning');
    if (ora >= 12 && ora < 18) return t('home.greetingDay');
    if (ora >= 18 && ora < 23) return t('home.greetingEvening');
    return t('home.greetingNight');
  };
  const getGreetingIcon = () => {
    const ora = new Date().getHours();
    if (ora >= 5 && ora < 18) return 'sun';
    return 'moon';
  };

  const sfatAles = React.useMemo(() => {
    const sfaturi = [
      t('home.dailyTip1'),
      t('home.dailyTip2'),
      t('home.dailyTip3'),
      t('home.dailyTip4'),
      t('home.dailyTip5'),
      t('home.dailyTip6'),
      t('home.dailyTip7'),
      t('home.dailyTip8'),
      t('home.dailyTip9'),
      t('home.dailyTip10'),
    ];
    return sfaturi[new Date().getDate() % sfaturi.length];
  }, [t]);

  if (loading) {
    return (
      <View style={[s.container, { backgroundColor: colors.background, paddingHorizontal: 20, paddingTop: topInset }]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 }}>
          <View>
            <SkeletonLoader width={140} height={20} borderRadius={8} style={{ marginBottom: 8 }} />
            <SkeletonLoader width={200} height={28} borderRadius={10} />
          </View>
          <SkeletonLoader width={80} height={32} borderRadius={16} />
        </View>
        <SkeletonLoader width="100%" height={260} borderRadius={28} style={{ marginBottom: 20 }} />
        <SkeletonLoader width="100%" height={100} borderRadius={24} style={{ marginBottom: 20 }} />
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <SkeletonLoader width="48%" height={120} borderRadius={24} />
          <SkeletonLoader width="48%" height={120} borderRadius={24} />
        </View>
      </View>
    );
  }

  return (
    <Animated.View entering={reduceMotion ? undefined : FadeInDown.duration(400)} style={[s.container, { backgroundColor: colors.background }]}>
      <View pointerEvents="none" style={[s.glowTop, { backgroundColor: colors.accent }]} />
      <View pointerEvents="none" style={[s.glowBottom, { backgroundColor: colors.accentSecondary }]} />

      <ScrollView 
        showsVerticalScrollIndicator={false} 
        contentContainerStyle={[s.scroll, { paddingTop: scrollPaddingTop, paddingBottom: scrollPaddingBottom, paddingHorizontal: horizontalPadding }]}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={() => refresh(false, true)} tintColor={colors.accent} colors={[colors.accent]} />
        }
      >
        {/* BUG-062: Home distinge eroare de rețea de o zi goală legitimă. Fără
            acest banner, un fetch eșuat arăta ca și cum utilizatorul n-ar avea
            mese — totalurile zero fiind indistincte de o zi fără mese. */}
        {eroareFetch ? (
          <View
            style={[s.eroareBanner, { backgroundColor: colors.dangerBg, borderColor: colors.dangerBorder }]}
            accessibilityRole="alert"
          >
            <AlertCircle size={18} color={colors.danger} style={{ marginRight: 8 }} />
            <Text style={[s.eroareText, { color: colors.danger }]} maxFontSizeMultiplier={1.3}>
              {t('alerts.mesaje.conexiuneServerEsueaza')}
            </Text>
            <TouchableOpacity
              onPress={() => refresh(false, true)}
              style={s.eroareBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={t('chat.retry')}
            >
              <Text style={[s.eroareBtnText, { color: colors.accent }]} maxFontSizeMultiplier={1.3}>
                {t('chat.retry')}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Header */}
        <Animated.View style={s.header}>
          <View style={s.headerLeft}>
            <View style={s.greetingRow}>
              <Text style={[s.greeting, { color: colors.textPrimary }]} numberOfLines={1} ellipsizeMode="tail">{getSalut()}, {capitalizedName}!</Text>
              <FlowIcon name={getGreetingIcon()} size={20} color={colors.accent} />
            </View>
            <View style={s.greetingSubRow}>
              <Text style={[s.greetingSub, { color: colors.textSecondary }]} numberOfLines={1} ellipsizeMode="tail" maxFontSizeMultiplier={1.3}>{t('home.greetingSubtitle')}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 }}>
                <FlowIcon name={calState.iconName} size={14} color={calState.ringColor} />
                <Text style={[s.caloriiInline, { color: calState.ringColor }]} numberOfLines={1} ellipsizeMode="tail" maxFontSizeMultiplier={1.3}>{calState.mesaj}</Text>
              </View>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <FlowCreditsPill />
            <TouchableOpacity
              onPress={() => router.push('/notificari' as any)}
              accessibilityRole="button"
              accessibilityLabel={unreadCount > 0 ? t('home.notificationsUnreadA11y', { count: unreadCount }) : t('home.notificationsA11y')}
              hitSlop={6}
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: 'rgba(255,255,255,0.06)',
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.1)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Bell size={18} color={colors.textPrimary} />
              {unreadCount > 0 ? (
                <View
                  style={{
                    position: 'absolute',
                    top: -2,
                    right: -2,
                    minWidth: 16,
                    height: 16,
                    borderRadius: 8,
                    backgroundColor: colors.danger,
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingHorizontal: 4,
                  }}
                >
                  <Text style={{ fontSize: 9, fontWeight: '800', color: colors.textOnAccent }}>
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </Text>
                </View>
              ) : null}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => streakSheetRef.current?.open()}
              accessibilityRole="button"
              accessibilityLabel={t('home.streakDaysA11y', { count: streak })}
              style={s.streakBadge}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <LinearGradient colors={colors.accentGradient} style={s.streakGrad}>
                <Flame size={14} color={colors.background} fill={colors.background} />
                <Text style={[s.streakText, { color: colors.background }]} maxFontSizeMultiplier={1.3}>{t('home.streakDays', { count: streak })}</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* Main calorie ring card */}
        <Animated.View style={[s.ringCard, { maxWidth: contentMaxWidth, borderColor: colors.cardBorder }]}>
          <CardBackdrop style={s.ringCardBlur}>
            <LinearGradient colors={[colors.accent + '10', 'rgba(0,0,0,0)']} style={[s.ringCardGrad, { padding: isCompact ? 16 : 24 }]}>
              <View style={s.ringCardTop}>
                <View style={s.ringCardInfo}>
                  <Text style={[s.ringCardTitle, { color: caloriiRamase < 0 ? colors.danger : colors.textSecondary }]} maxFontSizeMultiplier={1.3}>
                    {caloriiRamase < 0 ? t('home.caloriesOver') : t('home.caloriesRemaining')}
                  </Text>
                  <View style={s.ringCardValueRow}>
                    <Text
                      style={[s.ringCardValue, { color: caloriiRamase < 0 ? colors.danger : colors.textPrimary }]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.72}
                      maxFontSizeMultiplier={1.3}
                    >
                      {caloriiRamase < 0 ? Math.abs(caloriiRamase) : caloriiRamase}
                    </Text>
                    <Text style={[s.ringCardUnit, { color: caloriiRamase < 0 ? colors.danger : colors.accent }]}>kcal</Text>
                  </View>
                  <View style={s.ringCardSubRow}>
                    <Text style={[s.ringCardSubLabel, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.3}>{t('home.consumed')} </Text>
                    <Text style={[s.ringCardSubValue, { color: colors.textPrimary }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} maxFontSizeMultiplier={1.3}>{caloriiConsumate} kcal</Text>
                    <Text style={[s.ringCardSubSep, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.3}>  •  {t('home.target')} </Text>
                    <Text style={[s.ringCardSubValue, { color: colors.textPrimary }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} maxFontSizeMultiplier={1.3}>{caloriiTinta} kcal</Text>
                  </View>
                  {totalCaloriiArse > 0 && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
                      <Dumbbell size={14} color={colors.warning} />
                      <Text style={{ fontSize: 13, fontWeight: '800', color: colors.warning }} maxFontSizeMultiplier={1.3}>
                        {t('home.burnedSportInline', { calories: totalCaloriiArse })}
                      </Text>
                    </View>
                  )}
                </View>
                <RingProgress 
                  procent={procentCalorii} 
                  color={calState.ringColor} 
                  bgColor="rgba(255,255,255,0.06)" 
                  radius={ringRadius}
                  strokeWidth={ringStroke}
                />
              </View>

              <View style={s.macroRow}>
                <View style={s.macroItem}>
                  <View style={[s.macroIconBg, { backgroundColor: (proteineConsumate > (proteineTinta || 150) ? colors.danger : colors.accentSecondary) + '25' }]}>
                    <Activity size={14} color={proteineConsumate > (proteineTinta || 150) ? colors.danger : colors.accentSecondary} />
                  </View>
                  <View style={s.macroValueRow}>
                    <Text
                      style={[s.macroValue, { color: proteineConsumate > (proteineTinta || 150) ? colors.danger : colors.textPrimary }]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.65}
                    >
                      {proteineConsumate}
                    </Text>
                    <Text style={[s.macroUnit, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.3} numberOfLines={1}>/ {proteineTinta || 150}g</Text>
                  </View>
                  <Text style={[s.macroLabel, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.3}>{t('nutrition.protein')}</Text>
                  <View style={s.macroBarBg}>
                    <LinearGradient
                      colors={proteineConsumate > (proteineTinta || 150) ? [colors.danger, colors.danger + 'CC'] : colors.accentSecondaryGradient}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={[s.macroBarFill, { width: `${procentProteine}%` }]}
                    />
                  </View>
                </View>

                <View style={s.macroDivider} />

                <View style={s.macroItem}>
                  <View style={[s.macroIconBg, { backgroundColor: (totalCarbohidrati > (carbiTinta || 250) ? colors.danger : colors.accentTertiary) + '25' }]}>
                    <Zap size={14} color={totalCarbohidrati > (carbiTinta || 250) ? colors.danger : colors.accentTertiary} />
                  </View>
                  <View style={s.macroValueRow}>
                    <Text
                      style={[s.macroValue, { color: totalCarbohidrati > (carbiTinta || 250) ? colors.danger : colors.textPrimary }]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.65}
                    >
                      {totalCarbohidrati}
                    </Text>
                    <Text style={[s.macroUnit, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.3} numberOfLines={1}>/ {carbiTinta || 250}g</Text>
                  </View>
                  <Text style={[s.macroLabel, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.3}>{t('nutrition.carbs')}</Text>
                  <View style={s.macroBarBg}>
                    <LinearGradient
                      colors={totalCarbohidrati > (carbiTinta || 250) ? [colors.danger, colors.danger + 'CC'] : [colors.accentTertiary, colors.accentTertiary + 'AA']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={[s.macroBarFill, { width: `${Math.min((totalCarbohidrati / (carbiTinta || 250)) * 100, 100)}%` }]}
                    />
                  </View>
                </View>

                <View style={s.macroDivider} />

                <View style={s.macroItem}>
                  <View style={[s.macroIconBg, { backgroundColor: (totalGrasimi > (grasimiTinta || 70) ? colors.danger : colors.warning) + '25' }]}>
                    <Flame size={14} color={totalGrasimi > (grasimiTinta || 70) ? colors.danger : colors.warning} />
                  </View>
                  <View style={s.macroValueRow}>
                    <Text
                      style={[s.macroValue, { color: totalGrasimi > (grasimiTinta || 70) ? colors.danger : colors.textPrimary }]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.65}
                    >
                      {totalGrasimi}
                    </Text>
                    <Text style={[s.macroUnit, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.3} numberOfLines={1}>/ {grasimiTinta || 70}g</Text>
                  </View>
                  <Text style={[s.macroLabel, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.3}>{t('nutrition.fats')}</Text>
                  <View style={s.macroBarBg}>
                    <LinearGradient
                      colors={totalGrasimi > (grasimiTinta || 70) ? [colors.danger, colors.danger + 'CC'] : [colors.warning, colors.warning + 'AA']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={[s.macroBarFill, { width: `${Math.min((totalGrasimi / (grasimiTinta || 70)) * 100, 100)}%` }]}
                    />
                  </View>
                </View>
              </View>
            </LinearGradient>
          </CardBackdrop>
        </Animated.View>

        <PhotoJobStatusCard />

        {/* Camera scan CTA (Principal) */}
        <Animated.View>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={t('home.scanAiA11y')}
            style={[s.scanCTA, { shadowColor: colors.accent }]}
            onPress={() => router.push('/camera')}
            haptic
            hapticStyle="medium"
          >
            <LinearGradient colors={colors.accentGradient} style={s.scanCTAGrad}>
              <View style={s.scanCTAIcon}>
                <Camera size={28} color={colors.background} strokeWidth={2.5} />
              </View>
              <View style={s.scanCTAText}>
                <Text style={[s.scanCTATitle, { color: colors.background }]}>{t('home.scanAiTitle')}</Text>
                <Text style={s.scanCTASub} maxFontSizeMultiplier={1.3}>{t('home.scanAiSubtitle')}</Text>
              </View>
              <View style={s.scanCTAArrow}>
                <Scan size={20} color={colors.background} />
              </View>
            </LinearGradient>
          </PressableScale>
        </Animated.View>

        {/* Rând acțiuni secundare (B1) - Cod de Bare + Manual */}
        <Animated.View style={{ width: '100%', maxWidth: 680, alignSelf: 'center', flexDirection: 'row', gap: 12, marginBottom: 16 }}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={t('home.barcodeA11y')}
            style={[s.secActionCard, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}
            onPress={() => router.push('/scanner-barcode' as any)}
          >
            <Scan size={18} color={colors.accent} />
            <Text style={[s.secActionText, { color: colors.textPrimary }]} maxFontSizeMultiplier={1.3}>{t('home.barcode')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={t('home.addManualA11y')}
            style={[s.secActionCard, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}
            onPress={deschideAddMeal}
          >
            <PlusCircle size={18} color={colors.accentSecondary} />
            <Text style={[s.secActionText, { color: colors.textPrimary }]} maxFontSizeMultiplier={1.3}>{t('home.addManual')}</Text>
          </TouchableOpacity>
        </Animated.View>

        {/* Mini-Card separat: Greutate & Progres (B2) */}
        <Animated.View style={{ width: '100%', maxWidth: 680, alignSelf: 'center' }}>
          <TouchableOpacity
            onPress={() => setWeightModalVisible(true)}
            accessibilityRole="button"
            accessibilityLabel={t('home.weightProgressA11y')}
            style={[s.weightCard, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}
          >
            <View style={s.weightIconWrap}>
              <Scale size={20} color={colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.weightLabel, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.3}>{t('home.weightProgress')}</Text>
              <Text style={[s.weightValue, { color: colors.textPrimary, fontSize: greutateIntrodusaKg ? 20 : 14 }]} maxFontSizeMultiplier={1.3}>
                {greutateIntrodusaKg ? `${greutateIntrodusaKg} kg` : t('home.tapToAdd')}
              </Text>
            </View>
            <Text style={[s.weightLink, { color: colors.accent }]} maxFontSizeMultiplier={1.3}>{t('home.edit')}</Text>
          </TouchableOpacity>
        </Animated.View>

        <WaterIntakeCard
          consumedMl={waterConsumedMl}
          targetMl={waterTargetMl}
          loading={waterLoading}
          onAddGlass={adaugaPahar}
          onRemoveGlass={scadePahar}
          onAddWeight={() => setWeightModalVisible(true)}
        />

        {/* Pași Card — BUG-005: copy corect despre sursă (doar senzorul telefonului,
            fără integrare Garmin/Fitbit), obiectiv editabil prin setNewStepGoal,
            permisiunea cerută la primul toggle explicit, nu la boot. */}
        <Animated.View style={[s.healthCard, { borderColor: isEnabled ? colors.accent + '40' : 'rgba(255,255,255,0.08)' }]}>
          <CardBackdrop style={s.healthBlur}>
            <LinearGradient colors={[isEnabled ? colors.accent + '15' : 'rgba(255,255,255,0.03)', 'rgba(0,0,0,0)']} style={s.healthGrad}>
              <View style={s.healthHeader}>
                <View style={s.healthTitleRow}>
                  <View style={[s.healthIconBg, { backgroundColor: isEnabled ? colors.accent + '25' : 'rgba(255,255,255,0.08)' }]}>
                    <Footprints size={20} color={isEnabled ? colors.accent : colors.textSecondary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.healthTitle, { color: colors.textPrimary }]} maxFontSizeMultiplier={1.3}>{t('home.stepsTitle')}</Text>
                    <Text style={[s.healthSub, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.3}>
                      {isEnabled && isAvailable
                        ? t('home.stepsSource', { calories: activeCalories })
                        : t('home.stepsSourceOffline')}
                    </Text>
                  </View>
                </View>
              </View>

              {isEnabled && isAvailable ? (
                <>
                  <View style={s.healthProgressBg}>
                    <LinearGradient
                      colors={colors.accentGradient}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={[s.healthProgressFill, { width: `${Math.min((steps / (stepGoal > 0 ? stepGoal : 1)) * 100, 100)}%` }]}
                    />
                  </View>
                  <View style={s.healthFooter}>
                    {stepGoalEdit ? (
                      <View style={s.goalEditRow}>
                        <TextInput
                          style={[s.goalInput, { color: colors.textPrimary, borderColor: colors.cardBorder }]}
                          value={stepGoalInput}
                          onChangeText={setStepGoalInput}
                          keyboardType="number-pad"
                          maxLength={5}
                          selectTextOnFocus
                          autoFocus
                          placeholder={String(stepGoal)}
                          placeholderTextColor={colors.textTertiary}
                        />
                        <TouchableOpacity
                          onPress={handleSaveStepGoal}
                          style={[s.goalBtn, { backgroundColor: colors.accent }]}
                          accessibilityRole="button"
                          accessibilityLabel={t('home.stepsSaveGoalA11y')}
                        >
                          <Text style={[s.goalBtnText, { color: colors.background }]}>OK</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => setStepGoalEdit(false)}
                          style={[s.goalBtn, { backgroundColor: colors.surfaceBg, borderColor: colors.cardBorder }]}
                          accessibilityRole="button"
                          accessibilityLabel={t('home.stepsCancelGoalA11y')}
                          hitSlop={8}
                        >
                          <X size={16} color={colors.textSecondary} />
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <TouchableOpacity
                        onPress={() => { setStepGoalInput(String(stepGoal)); setStepGoalEdit(true); }}
                        accessibilityRole="button"
                        accessibilityLabel={t('home.stepsEditGoalA11y')}
                        hitSlop={8}
                      >
                        <Text style={[s.healthCount, { color: colors.textPrimary }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} maxFontSizeMultiplier={1.3}>
                          <Text style={{ fontSize: 22, fontWeight: '900', color: colors.accent }}>{steps.toLocaleString()}</Text> / {stepGoal.toLocaleString()} {t('home.stepsUnit')}
                        </Text>
                      </TouchableOpacity>
                    )}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Flame size={14} color={colors.warning} />
                      <Text style={[s.healthCalories, { color: colors.warning }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} maxFontSizeMultiplier={1.3}>{t('home.stepsKcalBurned', { calories: activeCalories })}</Text>
                    </View>
                  </View>
                  <View style={[s.manualAddRow, { borderColor: colors.cardBorder }]}>
                    <Text style={[s.manualAddHint, { color: colors.textTertiary }]} maxFontSizeMultiplier={1.3}>{t('home.stepsAddManual')}</Text>
                    <TouchableOpacity onPress={() => addManualSteps(500)} style={[s.manualAddBtn, { borderColor: colors.accent + '55' }]} accessibilityRole="button" accessibilityLabel={t('home.stepsAdd500A11y')} hitSlop={6}>
                      <Text style={[s.manualAddBtnText, { color: colors.accent }]} maxFontSizeMultiplier={1.3}>+500</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => addManualSteps(1000)} style={[s.manualAddBtn, { borderColor: colors.accent + '55' }]} accessibilityRole="button" accessibilityLabel={t('home.stepsAdd1000A11y')} hitSlop={6}>
                      <Text style={[s.manualAddBtnText, { color: colors.accent }]} maxFontSizeMultiplier={1.3}>+1000</Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <View style={s.healthOfflineBox}>
                  <Text style={[s.healthOfflineText, { color: colors.textTertiary }]} maxFontSizeMultiplier={1.3}>
                    {isEnabled
                      ? t('home.stepsOfflineHelp')
                      : t('home.stepsInactiveHelp')}
                  </Text>
                  <TouchableOpacity
                    onPress={() => toggleSync(true)}
                    style={[s.connectBtn, { backgroundColor: colors.accent }]}
                    accessibilityRole="button"
                    accessibilityLabel={t('home.stepsActivateA11y')}
                  >
                    <Text style={[s.connectBtnText, { color: colors.background }]} maxFontSizeMultiplier={1.3}>{t('home.stepsActivate')}</Text>
                  </TouchableOpacity>
                  <View style={[s.manualAddRow, { borderColor: colors.cardBorder, marginTop: 10 }]}>
                    <Text style={[s.manualAddHint, { color: colors.textTertiary }]} maxFontSizeMultiplier={1.3}>{t('home.stepsAddManual')}</Text>
                    <TouchableOpacity onPress={() => addManualSteps(500)} style={[s.manualAddBtn, { borderColor: colors.accent + '55' }]} accessibilityRole="button" accessibilityLabel={t('home.stepsAdd500A11y')} hitSlop={6}>
                      <Text style={[s.manualAddBtnText, { color: colors.accent }]} maxFontSizeMultiplier={1.3}>+500</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => addManualSteps(1000)} style={[s.manualAddBtn, { borderColor: colors.accent + '55' }]} accessibilityRole="button" accessibilityLabel={t('home.stepsAdd1000A11y')} hitSlop={6}>
                      <Text style={[s.manualAddBtnText, { color: colors.accent }]} maxFontSizeMultiplier={1.3}>+1000</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </LinearGradient>
          </CardBackdrop>
        </Animated.View>

        {/* HARTĂ MUSCULARĂ LIVE Card pe ecranul Acasă (Secțiunea 4.4) */}
        <Animated.View style={{ width: '100%', maxWidth: 680, alignSelf: 'center' }}>
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => router.push('/(tabs)/antrenamente' as any)}
            accessibilityRole="button"
            accessibilityLabel={t('home.liveMuscleMapA11y')}
            style={[s.liveHeatmapCard, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}
          >
            <View style={s.liveHeatmapHeader}>
              <View style={s.liveHeatmapTitleRow}>
                <View style={[s.liveHeatmapDot, { backgroundColor: colors.danger }]} />
                <Text style={[s.liveHeatmapTitle, { color: colors.textPrimary }]} maxFontSizeMultiplier={1.3}>{t('home.liveMuscleMap')}</Text>
              </View>
              <TouchableOpacity
                onPress={(event) => {
                  event.stopPropagation();
                  setViewSideHome(v => v === 'front' ? 'back' : 'front');
                }}
                style={[s.liveHeatmapToggle, { backgroundColor: colors.surfaceBg, borderColor: colors.cardBorder }]}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={viewSideHome === 'front' ? t('home.showBackA11y') : t('home.showFrontA11y')}
              >
                <RotateCcw size={12} color={colors.accent} />
                <Text style={[s.liveHeatmapToggleText, { color: colors.accent }]} maxFontSizeMultiplier={1.3}>
                  {viewSideHome === 'front' ? t('home.front') : t('home.back')}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={[s.liveHeatmapBodyWrap, { height: homeBodyHeight + 16 }]}>
                <BodyMap
                  view={viewSideHome}
                  intensity={dailyIntensityHome}
                  width={homeBodyWidth}
                />
            </View>

            <View style={s.liveHeatmapFooter}>
              <Dumbbell size={14} color={colors.accentSecondary} />
              <Text style={[s.liveHeatmapFooterText, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.3}>
                {antrenamente && antrenamente.length > 0
                  ? t('home.workoutsToday', { count: antrenamente.length })
                  : t('home.noWorkoutsToday')}
              </Text>
            </View>
          </TouchableOpacity>
        </Animated.View>

        {/* Tips card */}
        {isTipVisible && (
          <Animated.View style={[s.tipsCard, { borderColor: colors.accentSecondary + '25' }]}>
            <CardBackdrop style={s.tipsBlur}>
              <LinearGradient colors={[colors.accentSecondary + '14', 'rgba(0,0,0,0)']} style={s.tipsGrad}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <Text style={[s.tipsTitle, { color: colors.textPrimary, marginBottom: 0 }]} maxFontSizeMultiplier={1.3}>{t('home.tipOfTheDay')}</Text>
                  <TouchableOpacity
                    onPress={handleCloseTip}
                    style={{ padding: 4 }}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    accessibilityRole="button"
                    accessibilityLabel={t('home.closeTipA11y')}
                  >
                    <X size={18} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>
                <Text style={[s.tipsText, { color: colors.textTertiary }]} maxFontSizeMultiplier={1.3}>{sfatAles}</Text>
              </LinearGradient>
            </CardBackdrop>
          </Animated.View>
        )}

      </ScrollView>

      {/* Reusable Gorhom Bottom Sheet for adding meals - lazy mounted (REMED-029/HOME-TOUCH-001) */}
      {mealSheetMounted ? (
        <AddMealBottomSheet ref={addMealSheetRef} onSuccess={refresh} onMasaCreata={optimisticAddMeal} />
      ) : null}
      <StreakBottomSheet ref={streakSheetRef} />
      {/* BUG-004: greutatea se editează direct pe Home, fără navigare la Profil */}
      <AddWeightModal
        visible={weightModalVisible}
        onClose={() => setWeightModalVisible(false)}
        onSave={salveazaGreutate}
        greutateCurenta={greutateIntrodusaKg}
        greutateTinta={greutateTinta}
        onSaveTinta={salveazaGreutateTinta}
      />
    </Animated.View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  glowTop: { position: 'absolute', top: -200, right: -100, width: 400, height: 400, borderRadius: 200, opacity: 0.04 },
  glowBottom: { position: 'absolute', bottom: -150, left: -100, width: 350, height: 350, borderRadius: 175, opacity: 0.06 },
  scroll: { paddingHorizontal: 20 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, fontSize: 15, fontWeight: '500' },

  // BUG-062: banner vizibil când fetch-ul jurnalului eșuează pe Home — fără el,
  // o zi cu eroare de rețea arăta ca o zi legitimă fără mese (eșec silențios).
  eroareBanner: { width: '100%', maxWidth: 680, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 16 },
  eroareText: { flex: 1, fontSize: 13, fontWeight: '600' },
  eroareBtn: { marginLeft: 8, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  eroareBtnText: { fontSize: 13, fontWeight: '800' },

  // Header
  header: { width: '100%', maxWidth: 680, alignSelf: 'center', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 },
  headerLeft: { flex: 1, paddingRight: 12 },
  greetingRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'nowrap', gap: 6 },
  greeting: { fontSize: 22, fontWeight: '900', letterSpacing: -0.3, flexShrink: 1 },
  greetingEmoji: { fontSize: 22 },
  greetingSubRow: { flexDirection: 'row', alignItems: 'center', marginTop: 5, flexWrap: 'wrap' },
  greetingSub: { fontSize: 13, fontWeight: '500' },
  caloriiInline: { fontSize: 13, fontWeight: '800' },
  streakBadge: { borderRadius: 20, overflow: 'hidden' },
  streakGrad: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, gap: 6 },
  streakText: { fontWeight: '800', fontSize: 13 },

  // Ring Card
  ringCard: { width: '100%', maxWidth: 680, alignSelf: 'center', borderRadius: 32, overflow: 'hidden', borderWidth: 1, marginBottom: 20 },
  ringCardBlur: { overflow: 'hidden' },
  ringCardGrad: { padding: 24 },
  ringCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  ringCardInfo: { flex: 1, minWidth: 0, paddingRight: 12 },
  ringCardTitle: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 6 },
  ringCardValueRow: { flexDirection: 'row', flexWrap: 'nowrap', alignItems: 'flex-end', gap: 6, minWidth: 0, marginBottom: 10 },
  ringCardValue: { flexShrink: 1, minWidth: 0, fontSize: 56, fontWeight: '900', letterSpacing: -2, lineHeight: 60, includeFontPadding: false },
  ringCardUnit: { fontSize: 18, fontWeight: '800', marginBottom: 8 },
  ringCardSubRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  ringCardSubLabel: { fontSize: 12, fontWeight: '500' },
  ringCardSubValue: { fontSize: 12, fontWeight: '800' },
  ringCardSubSep: { fontSize: 12, fontWeight: '500' },
  progressBarBg: { width: '100%', height: 8, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden', marginBottom: 8 },
  progressBarFill: { height: '100%', borderRadius: 4 },
  progressBarLabel: { fontSize: 12, fontWeight: '600', marginBottom: 28 },

  // Macro Row
  macroRow: { flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 20, padding: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)' },
  macroItem: { flex: 1, alignItems: 'center', minWidth: 0 },
  macroIconBg: { width: 32, height: 32, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  macroValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 2, marginBottom: 3 },
  macroValue: { fontSize: 16, fontWeight: '900', includeFontPadding: false },
  macroUnit: { fontSize: 11, fontWeight: '700' },
  macroLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  macroBarBg: { width: '80%', height: 4, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' },
  macroBarFill: { height: '100%', borderRadius: 2 },
  macroDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginHorizontal: 4 },

  // Scan CTA
  scanCTA: { width: '100%', maxWidth: 680, alignSelf: 'center', borderRadius: 24, overflow: 'hidden', marginBottom: 20, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 20, elevation: 12 },
  scanCTAGrad: { flexDirection: 'row', alignItems: 'center', padding: 20, gap: 16 },
  scanCTAIcon: { width: 56, height: 56, borderRadius: 18, backgroundColor: 'rgba(9,12,14,0.15)', justifyContent: 'center', alignItems: 'center' },
  scanCTAText: { flex: 1 },
  scanCTATitle: { fontSize: 17, fontWeight: '900', letterSpacing: -0.3 },
  scanCTASub: { fontSize: 13, color: 'rgba(9,12,14,0.6)', fontWeight: '500', marginTop: 2 },
  scanCTAArrow: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(9,12,14,0.15)', justifyContent: 'center', alignItems: 'center' },

  // Manual CTA
  manualCTA: { width: '100%', maxWidth: 680, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 20, borderWidth: 1, marginBottom: 20, gap: 14 },
  manualCTAIcon: { width: 46, height: 46, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  manualCTAText: { flex: 1 },
  manualCTATitle: { fontSize: 16, fontWeight: '800' },
  manualCTASub: { fontSize: 12, fontWeight: '500', marginTop: 2 },
  manualCTAArrow: { fontSize: 18, fontWeight: '800' },

  // Tips Card
  tipsCard: { width: '100%', maxWidth: 680, alignSelf: 'center', borderRadius: 24, overflow: 'hidden', borderWidth: 1 },
  tipsBlur: { overflow: 'hidden' },
  tipsGrad: { padding: 24 },
  tipsTitle: { fontSize: 16, fontWeight: '800', marginBottom: 10 },
  tipsText: { fontSize: 14, lineHeight: 22, fontWeight: '400' },

  // Health Card
  healthCard: { width: '100%', maxWidth: 680, alignSelf: 'center', borderRadius: 24, overflow: 'hidden', borderWidth: 1, marginBottom: 20 },
  healthBlur: { overflow: 'hidden' },
  healthGrad: { padding: 20 },
  healthHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  healthTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  healthIconBg: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  healthTitle: { fontSize: 16, fontWeight: '800' },
  syncBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  syncBadgeText: { fontSize: 11, fontWeight: '800' },
  healthSub: { fontSize: 12, fontWeight: '500', marginTop: 2 },
  healthRefreshBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1 },
  healthRefreshText: { fontSize: 12, fontWeight: '800' },
  closeCardBtn: { paddingHorizontal: 8, paddingVertical: 4, justifyContent: 'center', alignItems: 'center' },
  healthProgressBg: { width: '100%', height: 10, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 5, overflow: 'hidden', marginBottom: 12 },
  healthProgressFill: { height: '100%', borderRadius: 5 },
  healthFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  healthCount: { fontSize: 14, fontWeight: '700' },
  healthCalories: { fontSize: 13, fontWeight: '800' },
  healthOfflineBox: { backgroundColor: 'rgba(0,0,0,0.2)', padding: 12, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.03)' },
  healthOfflineText: { fontSize: 13, lineHeight: 18, textAlign: 'center' },
  manualAddRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, paddingTop: 10, borderTopWidth: 1 },
  manualAddHint: { fontSize: 12, fontWeight: '600', flex: 1 },
  manualAddBtn: { minWidth: 56, height: 34, borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, justifyContent: 'center', alignItems: 'center' },
  manualAddBtnText: { fontSize: 13, fontWeight: '900' },
  goalEditRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  goalInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, minWidth: 84, fontSize: 15, fontWeight: '800' },
  goalBtn: { minWidth: 44, height: 44, borderRadius: 10, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 12, borderWidth: 1 },
  goalBtnText: { fontSize: 14, fontWeight: '900' },
  connectBtn: { marginTop: 10, alignSelf: 'center', borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10 },
  connectBtnText: { fontSize: 13, fontWeight: '900' },

  secActionCard: { flex: 1, height: 48, borderRadius: 16, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  secActionText: { fontSize: 14, fontWeight: '800' },

  weightCard: { width: '100%', maxWidth: 680, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 20, borderWidth: 1, marginBottom: 20 },
  weightIconWrap: { width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.05)', justifyContent: 'center', alignItems: 'center' },
  weightLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  weightValue: { fontSize: 20, fontWeight: '900', marginTop: 2 },
  weightLink: { fontSize: 13, fontWeight: '800' },

  liveHeatmapCard: { width: '100%', maxWidth: 680, alignSelf: 'center', borderRadius: 24, borderWidth: 1, padding: 16, marginBottom: 20 },
  liveHeatmapHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 12 },
  liveHeatmapTitleRow: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveHeatmapDot: { width: 8, height: 8, borderRadius: 4 },
  liveHeatmapTitle: { flexShrink: 1, fontSize: 13, fontWeight: '900', letterSpacing: 0.6 },
  liveHeatmapToggle: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, minHeight: 44, borderRadius: 10, borderWidth: 1 },
  liveHeatmapToggleText: { fontSize: 11, fontWeight: '800' },
  liveHeatmapBodyWrap: { height: 245, alignItems: 'center', justifyContent: 'center' },
  liveHeatmapFooter: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' },
  liveHeatmapFooterText: { fontSize: 12, fontWeight: '600' },
});
