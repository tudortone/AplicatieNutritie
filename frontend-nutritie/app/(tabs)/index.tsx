import React, { useCallback, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform, RefreshControl } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Scan, Flame, Activity, Camera, Zap, PlusCircle, Scale, Droplet, Footprints, Dumbbell } from 'lucide-react-native';
import Svg, { Circle } from 'react-native-svg';
import { useMeseAzi } from '../../hooks/useMeseAzi';
import { useTheme } from '../../context/ThemeContext';
import { useApa } from '../../hooks/useApa';
import { AddMealBottomSheet, AddMealBottomSheetRef } from '../../components/AddMealBottomSheet';
import { useHealthSync } from '../../hooks/useHealthSync';
import { useAntrenamente } from '../../hooks/useAntrenamente';
import { getCalorieState } from '../../lib/calorieState';
import { SkeletonLoader } from '../../components/SkeletonLoader';

function RingProgress({ procent, color, bgColor }: { procent: number; color: string; bgColor: string }) {
  const radius = 55;
  const strokeWidth = 12;
  const circumference = 2 * Math.PI * radius;
  const fill = Math.min(Math.max(procent, 0), 100);
  const strokeDashoffset = circumference - (circumference * fill) / 100;

  return (
    <View style={{ width: (radius + strokeWidth) * 2, height: (radius + strokeWidth) * 2, justifyContent: 'center', alignItems: 'center' }}>
      <Svg width={(radius + strokeWidth) * 2} height={(radius + strokeWidth) * 2}>
        <Circle
          cx={radius + strokeWidth}
          cy={radius + strokeWidth}
          r={radius}
          stroke={bgColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={radius + strokeWidth}
          cy={radius + strokeWidth}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          rotation="-90"
          origin={`${radius + strokeWidth}, ${radius + strokeWidth}`}
        />
      </Svg>
      <View style={{ position: 'absolute', alignItems: 'center' }}>
        <Text style={{ fontSize: 20, fontWeight: '900', color: color }}>{Math.round(fill)}%</Text>
      </View>
    </View>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const addMealSheetRef = useRef<AddMealBottomSheetRef>(null);

  const { 
    totalCalorii, 
    totalProteine, 
    totalGrasimi, 
    totalCarbohidrati, 
    numarMese, 
    caloriiTinta, 
    proteineTinta, 
    carbiTinta,
    grasimiTinta,
    greutate,
    user,
    loading, 
    refresh 
  } = useMeseAzi();
  const { pahare, tinta: tintaPahare, adaugaPahar, scadePahar } = useApa();
  const { steps, activeCalories, stepGoal, isEnabled, platformName, providerInfo, refreshSteps } = useHealthSync();
  const { totalCaloriiArse, refresh: refreshAntrenamente } = useAntrenamente();
  const [ascundeCardHealth, setAscundeCardHealth] = useState(false);

  useFocusEffect(
    useCallback(() => {
      refresh();
      refreshSteps();
      refreshAntrenamente();
      AsyncStorage.getItem('ascundeCardHealth').then((val) => {
        if (val === 'true') setAscundeCardHealth(true);
        else setAscundeCardHealth(false);
      });
    }, [refresh, refreshSteps, refreshAntrenamente])
  );

  const caloriiConsumate = totalCalorii;
  const proteineConsumate = totalProteine;
  const caloriiRamase = caloriiTinta - caloriiConsumate + (isEnabled ? activeCalories : 0) + totalCaloriiArse;
  const procentCalorii = Math.min((caloriiConsumate / caloriiTinta) * 100, 100);
  const procentProteine = Math.min((proteineConsumate / proteineTinta) * 100, 100);

  const calState = getCalorieState(caloriiConsumate, caloriiTinta, colors.accent, colors.accentSecondary);

  const userName = user?.email ? user.email.split('@')[0] : 'Prieten';
  const capitalizedName = userName.charAt(0).toUpperCase() + userName.slice(1);

  const getSalut = () => {
    const ora = new Date().getHours();
    if (ora >= 5 && ora < 12) return "Bună dimineața";
    if (ora >= 12 && ora < 18) return "Bună ziua";
    if (ora >= 18 && ora < 23) return "Bună seara";
    return "Noapte bună";
  };
  const getEmoji = () => {
    const ora = new Date().getHours();
    if (ora >= 5 && ora < 12) return "☀️";
    if (ora >= 12 && ora < 18) return "🌤️";
    if (ora >= 18 && ora < 23) return "🌙";
    return "🌟";
  };

  const sfaturiZilnice = [
    "💡 Hidratarea este cheia metabolizării eficiente a nutrienților. Bea un pahar cu apă cu 30 de minute înainte de fiecare masă.",
    "💡 Proteinele ajută la sațietate pe termen lung și menținerea masei musculare în deficit caloric.",
    "💡 Nu uita de fibre! Încearcă să incluzi cel puțin o porție de legume proaspete sau frunze verzi la prânz și cină.",
    "💡 Grăsimile sănătoase din avocado, nuci sau ulei de măsline sunt esențiale pentru absorbția vitaminelor A, D, E și K.",
    "💡 Somnul de 7-8 ore este vital pentru reglarea hormonilor foamei (grelina și leptina). Odihnește-te bine!",
    "💡 Carbohidrații complecși (ovăz, cartof dulce, orez brun) îți oferă energie constantă fără vârfuri de insulină.",
    "💡 Nu te stresa dacă într-o zi depășești ușor ținta. Consecvența pe termen lung este mult mai importantă decât perfecțiunea zilnică.",
    "💡 Consumă alimente bogate în magneziu și zinc pentru o recuperare musculară optimă după antrenamente.",
    "💡 Mănâncă încet și mestecă bine mâncarea — creierul are nevoie de aproximativ 20 de minute pentru a înregistra sațietatea.",
    "💡 Planifică-ți mesele principale în avans pentru a evita deciziile impulsive când apare senzația de foame."
  ];
  const sfatAles = sfaturiZilnice[new Date().getDate() % sfaturiZilnice.length];

  if (loading) {
    return (
      <View style={[s.container, { backgroundColor: colors.background, paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 60 : 40 }]}>
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
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <View style={[s.glowTop, { backgroundColor: colors.accent }]} />
      <View style={[s.glowBottom, { backgroundColor: colors.accentSecondary }]} />

      <ScrollView 
        showsVerticalScrollIndicator={false} 
        contentContainerStyle={s.scroll}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={refresh} tintColor={colors.accent} colors={[colors.accent]} />
        }
      >
        {/* Header */}
        <Animated.View entering={FadeInDown.duration(500)} style={s.header}>
          <View style={s.headerLeft}>
            <View style={s.greetingRow}>
              <Text style={[s.greeting, { color: colors.textPrimary }]}>{getSalut()}, {capitalizedName}!</Text>
              <Text style={s.greetingEmoji}>{getEmoji()}</Text>
            </View>
            <View style={s.greetingSubRow}>
              <Text style={[s.greetingSub, { color: colors.textSecondary }]}>Urmărește-ți nutriția de astăzi</Text>
              <Text style={[s.caloriiInline, { color: calState.ringColor }]}>  {calState.emoji} {calState.mesaj}</Text>
            </View>
          </View>
          <View style={s.streakBadge}>
            <LinearGradient colors={colors.accentGradient} style={s.streakGrad}>
              <Flame size={14} color={colors.background} />
              <Text style={[s.streakText, { color: colors.background }]}>{numarMese} mese</Text>
            </LinearGradient>
          </View>
        </Animated.View>

        {/* Main calorie ring card */}
        <Animated.View entering={FadeInDown.duration(700).delay(100)} style={[s.ringCard, { borderColor: colors.cardBorder }]}>
          <BlurView intensity={20} tint="dark" style={s.ringCardBlur}>
            <LinearGradient colors={[colors.accent + '10', 'rgba(0,0,0,0)']} style={s.ringCardGrad}>
              <View style={s.ringCardTop}>
                <View style={s.ringCardInfo}>
                  <Text style={[s.ringCardTitle, { color: colors.textSecondary }]}>CALORII RĂMASE</Text>
                  <View style={s.ringCardValueRow}>
                    <Text style={[s.ringCardValue, { color: colors.textPrimary }]}>{Math.max(caloriiRamase, 0)}</Text>
                    <Text style={[s.ringCardUnit, { color: colors.accent }]}>kcal</Text>
                  </View>
                  <View style={s.ringCardSubRow}>
                    <Text style={[s.ringCardSubLabel, { color: colors.textSecondary }]}>Consumat: </Text>
                    <Text style={[s.ringCardSubValue, { color: colors.textPrimary }]}>{caloriiConsumate} kcal</Text>
                    <Text style={[s.ringCardSubSep, { color: colors.textSecondary }]}>  •  Țintă: </Text>
                    <Text style={[s.ringCardSubValue, { color: colors.textPrimary }]}>{caloriiTinta} kcal</Text>
                  </View>
                  {totalCaloriiArse > 0 && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
                      <Dumbbell size={14} color={colors.warning} />
                      <Text style={{ fontSize: 13, fontWeight: '800', color: colors.warning }}>
                        Ars prin sport: +{totalCaloriiArse} kcal
                      </Text>
                    </View>
                  )}
                </View>
                <RingProgress 
                  procent={procentCalorii} 
                  color={calState.ringColor} 
                  bgColor="rgba(255,255,255,0.06)" 
                />
              </View>

              <View style={s.macroRow}>
                <View style={s.macroItem}>
                  <View style={[s.macroIconBg, { backgroundColor: (proteineConsumate > (proteineTinta || 150) ? colors.danger : colors.accentSecondary) + '25' }]}>
                    <Activity size={14} color={proteineConsumate > (proteineTinta || 150) ? colors.danger : colors.accentSecondary} />
                  </View>
                  <View style={s.macroValueRow}>
                    <Text style={[s.macroValue, { color: proteineConsumate > (proteineTinta || 150) ? colors.danger : colors.textPrimary }]}>{proteineConsumate}</Text>
                    <Text style={[s.macroUnit, { color: colors.textSecondary }]}>/ {proteineTinta || 150}g</Text>
                  </View>
                  <Text style={[s.macroLabel, { color: colors.textSecondary }]}>Proteine</Text>
                  <View style={s.macroBarBg}>
                    <LinearGradient
                      colors={proteineConsumate > (proteineTinta || 150) ? [colors.danger, '#f43f5e'] : colors.accentSecondaryGradient}
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
                    <Text style={[s.macroValue, { color: totalCarbohidrati > (carbiTinta || 250) ? colors.danger : colors.textPrimary }]}>{totalCarbohidrati}</Text>
                    <Text style={[s.macroUnit, { color: colors.textSecondary }]}>/ {carbiTinta || 250}g</Text>
                  </View>
                  <Text style={[s.macroLabel, { color: colors.textSecondary }]}>Carbi</Text>
                  <View style={s.macroBarBg}>
                    <LinearGradient
                      colors={totalCarbohidrati > (carbiTinta || 250) ? [colors.danger, '#f43f5e'] : [colors.accentTertiary, colors.accentTertiary + 'AA']}
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
                    <Text style={[s.macroValue, { color: totalGrasimi > (grasimiTinta || 70) ? colors.danger : colors.textPrimary }]}>{totalGrasimi}</Text>
                    <Text style={[s.macroUnit, { color: colors.textSecondary }]}>/ {grasimiTinta || 70}g</Text>
                  </View>
                  <Text style={[s.macroLabel, { color: colors.textSecondary }]}>Grăsimi</Text>
                  <View style={s.macroBarBg}>
                    <LinearGradient
                      colors={totalGrasimi > (grasimiTinta || 70) ? [colors.danger, '#f43f5e'] : [colors.warning, colors.warning + 'AA']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={[s.macroBarFill, { width: `${Math.min((totalGrasimi / (grasimiTinta || 70)) * 100, 100)}%` }]}
                    />
                  </View>
                </View>
              </View>
            </LinearGradient>
          </BlurView>
        </Animated.View>

        {/* Camera scan CTA (Principal) */}
        <Animated.View entering={FadeInDown.duration(700).delay(250)}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Scanează Mâncarea cu camera foto sau din galerie"
            style={[s.scanCTA, { shadowColor: colors.accent }]}
            onPress={() => router.push('/camera')}
            activeOpacity={0.85}
          >
            <LinearGradient colors={colors.accentGradient} style={s.scanCTAGrad}>
              <View style={s.scanCTAIcon}>
                <Camera size={28} color={colors.background} strokeWidth={2.5} />
              </View>
              <View style={s.scanCTAText}>
                <Text style={[s.scanCTATitle, { color: colors.background }]}>Scanează Mâncarea cu AI</Text>
                <Text style={s.scanCTASub}>Analiză foto instantă a caloriilor</Text>
              </View>
              <View style={s.scanCTAArrow}>
                <Scan size={20} color={colors.background} />
              </View>
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>

        {/* Rând acțiuni secundare (B1) - Cod de Bare + Manual */}
        <Animated.View entering={FadeInDown.duration(700).delay(280)} style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Scanează cod de bare produs"
            style={[s.secActionCard, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}
            onPress={() => router.push('/scanner-barcode' as any)}
          >
            <Scan size={18} color={colors.accent} />
            <Text style={[s.secActionText, { color: colors.textPrimary }]}>Cod de Bare</Text>
          </TouchableOpacity>

          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Adaugă o masă manual"
            style={[s.secActionCard, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}
            onPress={() => addMealSheetRef.current?.open()}
          >
            <PlusCircle size={18} color={colors.accentSecondary} />
            <Text style={[s.secActionText, { color: colors.textPrimary }]}>Adaugă Manual</Text>
          </TouchableOpacity>
        </Animated.View>

        {/* Mini-Card separat: Greutate & Progres (B2) */}
        <Animated.View entering={FadeInDown.duration(700).delay(310)}>
          <TouchableOpacity
            onPress={() => router.push('/profil')}
            style={[s.weightCard, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}
          >
            <View style={s.weightIconWrap}>
              <Scale size={20} color={colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.weightLabel, { color: colors.textSecondary }]}>GREUTATE & PROGRES</Text>
              <Text style={[s.weightValue, { color: colors.textPrimary }]}>
                {greutate || 75} kg
              </Text>
            </View>
            <Text style={[s.weightLink, { color: colors.accent }]}>Editează &rarr;</Text>
          </TouchableOpacity>
        </Animated.View>

        {/* Water Hydration Card */}
        <Animated.View entering={FadeInDown.duration(700).delay(320)} style={[s.waterCard, { borderColor: '#00e5ff33' }]}>
          <BlurView intensity={20} tint="dark" style={s.waterBlur}>
            <LinearGradient colors={['#00e5ff15', 'rgba(0,0,0,0)']} style={s.waterGrad}>
              <View style={s.waterHeader}>
                <View style={s.waterTitleRow}>
                  <View style={[s.waterIconBg, { backgroundColor: '#00e5ff25' }]}>
                    <Droplet size={20} color="#00e5ff" fill="#00e5ff" />
                  </View>
                  <View>
                    <Text style={[s.waterTitle, { color: colors.textPrimary }]}>Hidratare & Apă</Text>
                    <Text style={[s.waterSub, { color: colors.textSecondary }]}>Obiectiv: {tintaPahare} pahare ({tintaPahare * 250} ml)</Text>
                  </View>
                </View>
                
                <View style={s.waterControls}>
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="Scade un pahar de apă"
                    style={[s.waterBtn, { backgroundColor: colors.surfaceBg, borderColor: colors.cardBorder }]}
                    onPress={scadePahar}
                  >
                    <Text style={[s.waterBtnText, { color: colors.textPrimary }]}>−</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="Adaugă un pahar de apă"
                    style={[s.waterBtnAdd, { shadowColor: '#00e5ff' }]}
                    onPress={adaugaPahar}
                  >
                    <LinearGradient colors={['#00e5ff', '#0088ff']} style={s.waterBtnAddGrad}>
                      <Text style={[s.waterBtnAddText, { color: '#000' }]}>+</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={s.waterProgressBg}>
                <LinearGradient 
                  colors={['#00e5ff', '#0088ff']} 
                  start={{ x: 0, y: 0 }} 
                  end={{ x: 1, y: 0 }} 
                  style={[s.waterProgressFill, { width: `${Math.min((pahare / tintaPahare) * 100, 100)}%` }]} 
                />
              </View>

              <View style={s.waterFooter}>
                <Text style={[s.waterCount, { color: colors.textPrimary }]}>
                  <Text style={{ fontSize: 22, fontWeight: '900', color: '#00e5ff' }}>{pahare}</Text> / {tintaPahare} pahare băute azi
                </Text>
                <Text style={[s.waterMl, { color: colors.textTertiary }]}>{pahare * 250} ml</Text>
              </View>
            </LinearGradient>
          </BlurView>
        </Animated.View>

        {/* Apple HealthKit / Google Fit & Pași Card */}
        {!ascundeCardHealth && (
          <Animated.View entering={FadeInDown.duration(700).delay(335)} style={[s.healthCard, { borderColor: isEnabled ? colors.accent + '40' : 'rgba(255,255,255,0.08)' }]}>
            <TouchableOpacity 
              activeOpacity={0.8}
              onPress={() => {
                router.push('/(tabs)/profil');
              }}
            >
              <BlurView intensity={20} tint="dark" style={s.healthBlur}>
                <LinearGradient colors={[isEnabled ? colors.accent + '15' : 'rgba(255,255,255,0.03)', 'rgba(0,0,0,0)']} style={s.healthGrad}>
                  <View style={s.healthHeader}>
                    <View style={s.healthTitleRow}>
                      <View style={[s.healthIconBg, { backgroundColor: isEnabled ? colors.accent + '25' : 'rgba(255,255,255,0.08)' }]}>
                        <Footprints size={20} color={isEnabled ? colors.accent : colors.textSecondary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <Text style={[s.healthTitle, { color: colors.textPrimary }]}>{providerInfo?.icon || '📱'} {platformName} & Pași</Text>
                        </View>
                        <Text style={[s.healthSub, { color: colors.textSecondary }]}>
                          {isEnabled ? `Ajustare calorică automată: +${activeCalories} kcal • Apasă pentru setări →` : 'Apasă oriunde pe card pentru a conecta în Profil →'}
                        </Text>
                      </View>
                    </View>

                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <TouchableOpacity 
                        style={s.closeCardBtn}
                        onPress={async (e) => {
                          e.stopPropagation();
                          setAscundeCardHealth(true);
                          await AsyncStorage.setItem('ascundeCardHealth', 'true');
                        }}
                      >
                        <Text style={{ fontSize: 16, color: colors.textTertiary, fontWeight: '800' }}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  {isEnabled ? (
                    <>
                      <View style={s.healthProgressBg}>
                        <LinearGradient 
                          colors={colors.accentGradient} 
                          start={{ x: 0, y: 0 }} 
                          end={{ x: 1, y: 0 }} 
                          style={[s.healthProgressFill, { width: `${Math.min((steps / stepGoal) * 100, 100)}%` }]} 
                        />
                      </View>
                      <View style={s.healthFooter}>
                        <Text style={[s.healthCount, { color: colors.textPrimary }]}>
                          <Text style={{ fontSize: 22, fontWeight: '900', color: colors.accent }}>{steps.toLocaleString()}</Text> / {stepGoal.toLocaleString()} pași
                        </Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <Flame size={14} color={colors.warning} />
                          <Text style={[s.healthCalories, { color: colors.warning }]}>+{activeCalories} kcal arse</Text>
                        </View>
                      </View>
                    </>
                  ) : (
                    <View style={s.healthOfflineBox}>
                      <Text style={[s.healthOfflineText, { color: colors.textTertiary }]}>
                        Sincronizează brățara sau telefonul pentru a adăuga caloriile arse din mișcare direct în balanța ta de dietă!
                      </Text>
                    </View>
                  )}
                </LinearGradient>
              </BlurView>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* Tips card */}
        <Animated.View entering={FadeInDown.duration(700).delay(350)} style={[s.tipsCard, { borderColor: colors.accentSecondary + '25' }]}>
          <BlurView intensity={20} tint="dark" style={s.tipsBlur}>
            <LinearGradient colors={[colors.accentSecondary + '14', 'rgba(0,0,0,0)']} style={s.tipsGrad}>
              <Text style={[s.tipsTitle, { color: colors.textPrimary }]}>✨ Sfat NutriAI al Zilei</Text>
              <Text style={[s.tipsText, { color: colors.textTertiary }]}>{sfatAles}</Text>
            </LinearGradient>
          </BlurView>
        </Animated.View>

      </ScrollView>

      {/* Reusable Gorhom Bottom Sheet for adding meals */}
      <AddMealBottomSheet ref={addMealSheetRef} onSuccess={refresh} />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  glowTop: { position: 'absolute', top: -200, right: -100, width: 400, height: 400, borderRadius: 200, opacity: 0.04 },
  glowBottom: { position: 'absolute', bottom: -150, left: -100, width: 350, height: 350, borderRadius: 175, opacity: 0.06 },
  scroll: { paddingTop: Platform.OS === 'ios' ? 56 : 36, paddingHorizontal: 20, paddingBottom: Platform.OS === 'ios' ? 160 : 50 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, fontSize: 15, fontWeight: '500' },

  // Header
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 },
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
  ringCard: { borderRadius: 32, overflow: 'hidden', borderWidth: 1, marginBottom: 20 },
  ringCardBlur: { overflow: 'hidden' },
  ringCardGrad: { padding: 24 },
  ringCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  ringCardInfo: { flex: 1, paddingRight: 12 },
  ringCardTitle: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 6 },
  ringCardValueRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, marginBottom: 10 },
  ringCardValue: { fontSize: 56, fontWeight: '900', letterSpacing: -2, lineHeight: 60 },
  ringCardUnit: { fontSize: 18, fontWeight: '800', marginBottom: 8 },
  ringCardSubRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  ringCardSubLabel: { fontSize: 12, fontWeight: '500' },
  ringCardSubValue: { fontSize: 12, fontWeight: '800' },
  ringCardSubSep: { fontSize: 12, fontWeight: '500' },
  // Legacy (kept for safety)
  ringCardSub: { fontSize: 14, fontWeight: '500', marginBottom: 24 },
  progressBarBg: { width: '100%', height: 8, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden', marginBottom: 8 },
  progressBarFill: { height: '100%', borderRadius: 4 },
  progressBarLabel: { fontSize: 12, fontWeight: '600', marginBottom: 28 },

  // Macro Row
  macroRow: { flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 20, padding: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)' },
  macroItem: { flex: 1, alignItems: 'center' },
  macroIconBg: { width: 32, height: 32, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  macroValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 2, marginBottom: 3 },
  macroValue: { fontSize: 16, fontWeight: '900' },
  macroUnit: { fontSize: 11, fontWeight: '700' },
  macroLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  macroBarBg: { width: '80%', height: 4, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' },
  macroBarFill: { height: '100%', borderRadius: 2 },
  macroDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginHorizontal: 4 },

  // Scan CTA
  scanCTA: { borderRadius: 24, overflow: 'hidden', marginBottom: 20, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 20, elevation: 12 },
  scanCTAGrad: { flexDirection: 'row', alignItems: 'center', padding: 20, gap: 16 },
  scanCTAIcon: { width: 56, height: 56, borderRadius: 18, backgroundColor: 'rgba(9,12,14,0.15)', justifyContent: 'center', alignItems: 'center' },
  scanCTAText: { flex: 1 },
  scanCTATitle: { fontSize: 17, fontWeight: '900', letterSpacing: -0.3 },
  scanCTASub: { fontSize: 13, color: 'rgba(9,12,14,0.6)', fontWeight: '500', marginTop: 2 },
  scanCTAArrow: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(9,12,14,0.15)', justifyContent: 'center', alignItems: 'center' },

  // Manual CTA
  manualCTA: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 20, borderWidth: 1, marginBottom: 20, gap: 14 },
  manualCTAIcon: { width: 46, height: 46, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  manualCTAText: { flex: 1 },
  manualCTATitle: { fontSize: 16, fontWeight: '800' },
  manualCTASub: { fontSize: 12, fontWeight: '500', marginTop: 2 },
  manualCTAArrow: { fontSize: 18, fontWeight: '800' },

  // Water Card
  waterCard: { borderRadius: 24, overflow: 'hidden', borderWidth: 1, marginBottom: 20 },
  waterBlur: { overflow: 'hidden' },
  waterGrad: { padding: 20 },
  waterHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  waterTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  waterIconBg: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  waterTitle: { fontSize: 16, fontWeight: '800' },
  waterSub: { fontSize: 12, fontWeight: '500', marginTop: 2 },
  waterControls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  waterBtn: { width: 38, height: 38, borderRadius: 12, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  waterBtnText: { fontSize: 20, fontWeight: '800', lineHeight: 22 },
  waterBtnAdd: { width: 42, height: 42, borderRadius: 14, overflow: 'hidden', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 },
  waterBtnAddGrad: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' },
  waterBtnAddText: { fontSize: 24, fontWeight: '900', lineHeight: 26 },
  waterProgressBg: { width: '100%', height: 10, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 5, overflow: 'hidden', marginBottom: 12 },
  waterProgressFill: { height: '100%', borderRadius: 5 },
  waterFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  waterCount: { fontSize: 14, fontWeight: '700' },
  waterMl: { fontSize: 13, fontWeight: '800' },

  // Tips Card
  tipsCard: { borderRadius: 24, overflow: 'hidden', borderWidth: 1 },
  tipsBlur: { overflow: 'hidden' },
  tipsGrad: { padding: 24 },
  tipsTitle: { fontSize: 16, fontWeight: '800', marginBottom: 10 },
  tipsText: { fontSize: 14, lineHeight: 22, fontWeight: '400' },

  // Health Card
  healthCard: { borderRadius: 24, overflow: 'hidden', borderWidth: 1, marginBottom: 20 },
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

  secActionCard: { flex: 1, height: 48, borderRadius: 16, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  secActionText: { fontSize: 14, fontWeight: '800' },

  weightCard: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 20, borderWidth: 1, marginBottom: 20 },
  weightIconWrap: { width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.05)', justifyContent: 'center', alignItems: 'center' },
  weightLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  weightValue: { fontSize: 20, fontWeight: '900', marginTop: 2 },
  weightLink: { fontSize: 13, fontWeight: '800' },
});