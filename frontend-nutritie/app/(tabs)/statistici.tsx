import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, Platform, TouchableOpacity } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useFocusRefresh } from '../../hooks/useFocusRefresh';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeInUp, useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { Flame, Activity, TrendingUp, Award, Scale, TrendingDown, Sparkles, Plus, Target } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../context/ThemeContext';
import { supabase } from '../../supabase';
import { localDayKey } from '../../lib/dateUtils';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Masa } from '../../types';
import { AddWeightModal } from '../../components/AddWeightModal';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';

interface ZiStatistica {
  data: string;
  ziNume: string;
  calorii: number;
  proteine: number;
  carbs: number;
  grasimi: number;
  esteAzi: boolean;
}

const AnimatedTrendArrow = ({ isLoss, color }: { isLoss: boolean; color: string }) => {
  const translateY = useSharedValue(0);

  useEffect(() => {
    translateY.value = withRepeat(
      withSequence(
        withTiming(isLoss ? 3 : -3, { duration: 600 }),
        withTiming(0, { duration: 600 })
      ),
      -1,
      true
    );
  }, [isLoss, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View style={[animatedStyle, { flexDirection: 'row', alignItems: 'center' }]}>
      {isLoss ? (
        <TrendingDown size={22} color={color} strokeWidth={2.5} />
      ) : (
        <TrendingUp size={22} color={color} strokeWidth={2.5} />
      )}
    </Animated.View>
  );
};

export default function StatisticiScreen() {
  const { colors } = useTheme();
  const { scrollPaddingTop, scrollPaddingBottom } = useResponsiveLayout();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'calorii' | 'greutate'>('calorii');
  const [caloriiTinta, setCaloriiTinta] = useState(2000);
  const [zile, setZile] = useState<ZiStatistica[]>([]);
  const [medieCalorii, setMedieCalorii] = useState(0);
  const [medieProteine, setMedieProteine] = useState(0);
  const [zileInTinta, setZileInTinta] = useState(0);

  // Weight Tab States
  const [greutateCurenta, setGreutateCurenta] = useState(75.0);
  const [greutateTinta, setGreutateTinta] = useState(70.0);
  const [istoricGreutate, setIstoricGreutate] = useState<{ data: string; ziNume: string; greutate: number }[]>([]);
  const [zileChart, setZileChart] = useState<'7' | '30'>('7');
  const [modalGreutateVisible, setModalGreutateVisible] = useState(false);
  const [modalInitialTab, setModalInitialTab] = useState<'curenta' | 'tinta'>('curenta');

  const fetchStatistici = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      // 1. Află calorii țintă
      const userMeta = user.user_metadata || {};
      let cTinta = userMeta.caloriiTinta;
      if (!cTinta) {
        const st = await AsyncStorage.getItem('caloriiTinta');
        cTinta = st ? parseInt(st) : 2000;
      }
      setCaloriiTinta(Number(cTinta));

      // 2. Extrage mesele din ultimele 7 zile
      const acum7Zile = new Date();
      acum7Zile.setDate(acum7Zile.getDate() - 6);
      acum7Zile.setHours(0, 0, 0, 0);

      // B-22: inchidem intervalul si cu limita superioara (azi, sfarsit de zi),
      // ca interogarea sa fie un interval real, nu doar o margine inferioara.
      const sfarsitAzi = new Date();
      sfarsitAzi.setHours(23, 59, 59, 999);

      const { data, error } = await supabase
        .from('mese')
        .select('*')
        .eq('user_id', user.id)
        // Aduce datele din ultimele 7 zile. Supabase va face query bazat pe UTC,
        // dar filtrarea funcționează deoarece toISOString() ține cont de timpul local.
        .gte('created_at', acum7Zile.toISOString())
        .lte('created_at', sfarsitAzi.toISOString())
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Eroare statistici Supabase:', error.message);
      } else if (data) {
        const mese = data as Masa[];

        // 3. Grupează pe zile
        const mapZile: { [key: string]: ZiStatistica } = {};
        const zileleSaptamanii = ['Dum', 'Lun', 'Mar', 'Mie', 'Joi', 'Vin', 'Sâm'];

        for (let i = 0; i < 7; i++) {
          const d = new Date(acum7Zile);
          d.setDate(d.getDate() + i);
          const iso = localDayKey(d);
          const esteAzi = localDayKey(new Date()) === iso;
          
          mapZile[iso] = {
            data: iso,
            ziNume: esteAzi ? 'Azi' : zileleSaptamanii[d.getDay()],
            calorii: 0,
            proteine: 0,
            carbs: 0,
            grasimi: 0,
            esteAzi,
          };
        }

        mese.forEach((m) => {
          // Folosim new Date() pentru a obține data locală din timestamp-ul UTC din Supabase
          const zi = localDayKey(new Date(m.created_at));
          if (mapZile[zi]) {
            mapZile[zi].calorii += m.calorii || 0;
            mapZile[zi].proteine += m.proteine || 0;
            mapZile[zi].carbs += m.carbohidrati || 0;
            mapZile[zi].grasimi += m.grasimi || 0;
          }
        });

        const arrayZile = Object.values(mapZile);
        setZile(arrayZile);

        // Calculează medii
        let totCal = 0;
        let totProt = 0;
        let inTinta = 0;
        arrayZile.forEach((z) => {
          totCal += z.calorii;
          totProt += z.proteine;
          if (z.calorii > 0 && Math.abs(z.calorii - Number(cTinta)) <= Number(cTinta) * 0.15) {
            inTinta++;
          }
        });

        setMedieCalorii(Math.round(totCal / 7));
        setMedieProteine(Math.round(totProt / 7));
        setZileInTinta(inTinta);
      }

      // 4. Încarcă greutatea curentă și istoricul din AsyncStorage
      const storedGreutate = await AsyncStorage.getItem('greutate');
      const Wc = storedGreutate ? parseFloat(storedGreutate) : 75.0;
      setGreutateCurenta(Wc);
      
      const storedTinta = await AsyncStorage.getItem('greutateTinta');
      setGreutateTinta(storedTinta ? parseFloat(storedTinta) : 70.0);

      const storedIstoric = userMeta.greutate_istoric || await AsyncStorage.getItem('greutate_istoric');
      if (storedIstoric) {
        try {
          const parsed = typeof storedIstoric === 'string' ? JSON.parse(storedIstoric) : storedIstoric;
          setIstoricGreutate(parsed);
        } catch {}
      } else {
        const d = new Date();
        const dataStr = localDayKey(d);
        const ziNume = d.toLocaleDateString('ro-RO', { weekday: 'short' }).slice(0, 3);
        const initData = [{ data: dataStr, ziNume, greutate: Wc }];
        setIstoricGreutate(initData);
        await AsyncStorage.setItem('greutate_istoric', JSON.stringify(initData));
        if (user) {
          await supabase.auth.updateUser({ data: { greutate_istoric: initData } });
        }
      }
    } catch (e) {
      console.error('Eroare neașteptată în statistici:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  const salveazaGreutate = async (nouaValoare: number) => {
    await AsyncStorage.setItem('greutate', nouaValoare.toString());
    setGreutateCurenta(nouaValoare);

    const aziStr = localDayKey(new Date());
    const ziNume = new Date().toLocaleDateString('ro-RO', { weekday: 'short' }).slice(0, 3);
    const restIstoric = istoricGreutate.filter(i => i.data !== aziStr);
    const nouIstoric = [...restIstoric, { data: aziStr, ziNume, greutate: nouaValoare }].sort((a, b) => a.data.localeCompare(b.data));

    setIstoricGreutate(nouIstoric);
    await AsyncStorage.setItem('greutate_istoric', JSON.stringify(nouIstoric));

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.auth.updateUser({ data: { greutate: nouaValoare, greutate_istoric: nouIstoric } });
    }

    setModalGreutateVisible(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const salveazaGreutateTinta = async (nouaValoare: number) => {
    await AsyncStorage.setItem('greutateTinta', nouaValoare.toString());
    setGreutateTinta(nouaValoare);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.auth.updateUser({ data: { greutateTinta: nouaValoare } });
    }
    setModalGreutateVisible(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const calculPredicieAI = () => {
    const diferenta = greutateCurenta - greutateTinta;
    if (Math.abs(diferenta) < 0.2) return { text: "Felicitări! Ai atins deja sau ești extrem de aproape de greutatea țintă!", dataEst: "Azi", saptamani: 0 };
    
    const deficit = caloriiTinta > medieCalorii && medieCalorii > 0 ? (caloriiTinta - medieCalorii) : 450;
    const kgPerSaptamana = Math.max(0.2, (deficit * 7) / 7700);
    const saptamaniNecesare = Math.max(1, Math.round(Math.abs(diferenta) / kgPerSaptamana));
    const zileNecesare = saptamaniNecesare * 7;
    
    const d = new Date();
    d.setDate(d.getDate() + zileNecesare);
    const dataEst = d.toLocaleDateString('ro-RO', { day: 'numeric', month: 'long', year: 'numeric' });
    
    return {
      text: `Menținând deficitul tău caloric mediu (estimat la ~${Math.round(deficit)} kcal/zi), ritmul tău de slăbire este de ~${kgPerSaptamana.toFixed(1)} kg/săptămână.`,
      dataEst,
      saptamani: saptamaniNecesare
    };
  };

  useFocusRefresh(
    useCallback(() => {
      fetchStatistici();
    }, [fetchStatistici]),
    5000,
    [fetchStatistici]
  );

  const maxCalorii = Math.max(...zile.map((z) => z.calorii), caloriiTinta, 2500);

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Se calculează statisticile...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.glowTop, { backgroundColor: colors.accentSecondary }]} />
      <View style={[styles.glowBottom, { backgroundColor: colors.accent }]} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingTop: scrollPaddingTop, paddingBottom: scrollPaddingBottom }]}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={fetchStatistici} tintColor={colors.accent} colors={[colors.accent]} />
        }
      >
        <Animated.View entering={FadeInDown.duration(500)} style={styles.header}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Evoluția Ta</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {activeTab === 'calorii' ? 'Analiza detaliată a aportului pe ultimele 7 zile' : 'Monitorizarea greutății și predicție AI'}
          </Text>

          {/* Segmented Control Switcher */}
          <View style={[styles.tabSwitcher, { borderColor: colors.cardBorder, backgroundColor: colors.surfaceBg }]}>
            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'calorii' && { backgroundColor: colors.accent }]}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setActiveTab('calorii'); }}
              accessibilityRole="button"
              accessibilityState={{ selected: activeTab === 'calorii' }}
              accessibilityLabel="Fila aport caloric"
            >
              <Text style={[styles.tabText, { color: activeTab === 'calorii' ? colors.background : colors.textSecondary, fontWeight: activeTab === 'calorii' ? '800' : '600' }]}>
                📊 Aport Caloric
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'greutate' && { backgroundColor: colors.accentSecondary }]}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setActiveTab('greutate'); }}
              accessibilityRole="button"
              accessibilityState={{ selected: activeTab === 'greutate' }}
              accessibilityLabel="Fila evoluție greutate"
            >
              <Text style={[styles.tabText, { color: activeTab === 'greutate' ? colors.background : colors.textSecondary, fontWeight: activeTab === 'greutate' ? '800' : '600' }]}>
                ⚖️ Evoluție Greutate
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>

        {activeTab === 'greutate' ? (
          <>
            {/* Weight Summary Row */}
            <Animated.View entering={FadeInDown.duration(600).delay(100)} style={styles.summaryRow}>
              <TouchableOpacity
                style={[styles.summaryBox, { borderColor: colors.cardBorder, backgroundColor: colors.surfaceBg }]}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setModalInitialTab('curenta'); setModalGreutateVisible(true); }}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={`Greutatea curentă, ${greutateCurenta} kg. Modifică`}
              >
                <LinearGradient colors={[colors.accentSecondary + '15', 'rgba(0,0,0,0)']} style={styles.summaryGrad}>
                  <Scale size={20} color={colors.accentSecondary} />
                  <Text style={[styles.summaryVal, { color: colors.textPrimary }]}>{greutateCurenta} kg</Text>
                  <Text style={[styles.summaryLbl, { color: colors.textSecondary }]}>Curentă</Text>
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.summaryBox, { borderColor: colors.cardBorder, backgroundColor: colors.surfaceBg }]}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setModalInitialTab('tinta'); setModalGreutateVisible(true); }}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={`Greutatea țintă, ${greutateTinta} kg. Modifică`}
              >
                <LinearGradient colors={[colors.accent + '15', 'rgba(0,0,0,0)']} style={styles.summaryGrad}>
                  <Target size={20} color={colors.accent} />
                  <Text style={[styles.summaryVal, { color: colors.textPrimary }]}>{greutateTinta} kg</Text>
                  <Text style={[styles.summaryLbl, { color: colors.textSecondary }]}>Țintă</Text>
                </LinearGradient>
              </TouchableOpacity>

              <View style={[styles.summaryBox, { borderColor: colors.cardBorder, backgroundColor: colors.surfaceBg }]}>
                <LinearGradient colors={[colors.warning + '15', 'rgba(0,0,0,0)']} style={styles.summaryGrad}>
                  <AnimatedTrendArrow isLoss={greutateCurenta >= greutateTinta} color={colors.warning} />
                  <Text style={[styles.summaryVal, { color: colors.textPrimary }]}>
                    {Math.abs(Math.round((greutateCurenta - greutateTinta) * 10) / 10)} kg
                  </Text>
                  <Text style={[styles.summaryLbl, { color: colors.textSecondary }]}>
                    {greutateCurenta >= greutateTinta ? 'Rămas de slăbit' : 'Rămas de pus'}
                  </Text>
                </LinearGradient>
              </View>
            </Animated.View>

            {/* Record Weight CTA */}
            <Animated.View entering={FadeInDown.duration(600).delay(150)} style={{ marginBottom: 20 }}>
              <TouchableOpacity
                style={[styles.recordBtn, { borderColor: colors.accentSecondary + '50' }]}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setModalInitialTab('curenta'); setModalGreutateVisible(true); }}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Modifică greutatea curentă sau țintă"
              >
                <LinearGradient colors={[colors.accentSecondary + '20', 'rgba(0,0,0,0)']} style={styles.recordGrad}>
                  <View style={[styles.recordIcon, { backgroundColor: colors.accentSecondary }]}>
                    <Plus size={20} color={colors.background} strokeWidth={3} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.recordTitle, { color: colors.textPrimary }]}>⚖️ Modifică Greutatea Curentă sau Țintă</Text>
                    <Text style={[styles.recordSub, { color: colors.textSecondary }]}>Adaugă greutatea curentă sau modifică obiectivul tău de {greutateTinta} kg</Text>
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            </Animated.View>

            {/* Weight Evolution Chart */}
            <Animated.View entering={FadeInDown.duration(700).delay(200)} style={[styles.chartCard, { borderColor: colors.cardBorder }]}>
              <BlurView intensity={20} tint="dark" style={styles.chartBlur}>
                <LinearGradient colors={[colors.cardBg, 'rgba(0,0,0,0)']} style={styles.chartGrad}>
                  <View style={styles.chartHeader}>
                    <View>
                      <Text style={[styles.chartTitle, { color: colors.textPrimary }]}>⚖️ Grafic Greutate</Text>
                      <Text style={[styles.chartTargetLbl, { color: colors.textSecondary }]}>Istoric pe ultimele {zileChart} zile</Text>
                    </View>
                    <View style={[styles.chartSwitcher, { backgroundColor: colors.surfaceBg, borderColor: colors.cardBorder }]}>
                      <TouchableOpacity
                        style={[styles.chartSwitchBtn, zileChart === '7' && { backgroundColor: colors.accentSecondary }]}
                        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setZileChart('7'); }}
                        accessibilityRole="button"
                        accessibilityState={{ selected: zileChart === '7' }}
                        accessibilityLabel="Afișează ultimele 7 zile de greutate"
                      >
                        <Text style={[styles.chartSwitchText, { color: zileChart === '7' ? colors.background : colors.textSecondary }]}>7Z</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.chartSwitchBtn, zileChart === '30' && { backgroundColor: colors.accentSecondary }]}
                        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setZileChart('30'); }}
                        accessibilityRole="button"
                        accessibilityState={{ selected: zileChart === '30' }}
                        accessibilityLabel="Afișează ultimele 30 de zile de greutate"
                      >
                        <Text style={[styles.chartSwitchText, { color: zileChart === '30' ? colors.background : colors.textSecondary }]}>30Z</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  <View style={styles.chartArea}>
                    {(() => {
                      const displayData = zileChart === '7' ? istoricGreutate.slice(-7) : istoricGreutate.slice(-30);
                      const required = zileChart === '7' ? 7 : 30;
                      const paddedData: any[] = [...displayData];
                      while (paddedData.length < required) {
                        paddedData.unshift({ data: `pad-${paddedData.length}`, ziNume: '', greutate: 0, isPadding: true });
                      }
                      
                      const validData = paddedData.filter(p => !p.isPadding);
                      const minW = validData.length > 0 ? Math.min(...validData.map(a => a.greutate)) - 1 : 0;
                      const maxW = validData.length > 0 ? Math.max(...validData.map(a => a.greutate)) + 1 : 100;
                      const range = maxW - minW || 5;

                      return paddedData.map((zi, index, arr) => {
                        if (zi.isPadding) {
                          return <View key={zi.data + index} style={{ flex: 1 }} />;
                        }
                        
                        const inaltimeBara = Math.max(((zi.greutate - minW) / range) * 150, 15);
                        const esteCurenta = index === arr.length - 1;

                        return (
                          <Animated.View key={zi.data + index} entering={FadeInUp.duration(500).delay(index * (zileChart === '30' ? 10 : 40))} style={styles.barContainer}>
                            <Text style={[styles.barValue, { color: esteCurenta ? colors.accentSecondary : colors.textPrimary, fontSize: zileChart === '30' ? 8 : 10 }]}>
                              {zi.greutate}
                            </Text>
                            
                            <View style={styles.barTrack}>
                              <LinearGradient
                                colors={esteCurenta ? colors.accentSecondaryGradient : [colors.accentSecondary + '80', colors.accentSecondary + '30']}
                                start={{ x: 0, y: 1 }}
                                end={{ x: 0, y: 0 }}
                                style={[
                                  styles.barFill,
                                  { height: inaltimeBara }
                                ]}
                              />
                            </View>

                            <Text style={[styles.barLabel, { color: esteCurenta ? colors.accentSecondary : colors.textSecondary, fontWeight: esteCurenta ? '900' : '600', fontSize: zileChart === '30' ? 9 : 11 }]}>
                              {zi.ziNume}
                            </Text>
                          </Animated.View>
                        );
                      });
                    })()}
                  </View>
                </LinearGradient>
              </BlurView>
            </Animated.View>

            {/* AI Prediction Card */}
            <Animated.View entering={FadeInUp.duration(600).delay(250)} style={[styles.predictCard, { borderColor: colors.accent + '40' }]}>
              <BlurView intensity={20} tint="dark" style={styles.predictBlur}>
                <LinearGradient colors={[colors.accent + '15', 'rgba(0,0,0,0)']} style={styles.predictGrad}>
                  <View style={styles.predictHeader}>
                    <View style={[styles.predictIconBg, { backgroundColor: colors.accent + '25' }]}>
                      <Sparkles size={20} color={colors.accent} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.predictTitle, { color: colors.textPrimary }]}>🤖 Predicție NutriAI</Text>
                      <Text style={[styles.predictSub, { color: colors.textSecondary }]}>Algoritm bazat pe ritmul și deficitul tău caloric</Text>
                    </View>
                  </View>

                  {(() => {
                    const predictie = calculPredicieAI();
                    return (
                      <>
                        <View style={[styles.predictBox, { backgroundColor: 'rgba(0,0,0,0.2)', borderColor: 'rgba(255,255,255,0.04)' }]}>
                          <Text style={[styles.predictDate, { color: colors.accent }]}>🎯 {predictie.dataEst}</Text>
                          <Text style={[styles.predictWeeks, { color: colors.textSecondary }]}>În aproximativ {predictie.saptamani} săptămâni</Text>
                        </View>
                        <Text style={[styles.predictText, { color: colors.textSecondary }]}>
                          {predictie.text}
                        </Text>
                      </>
                    );
                  })()}
                </LinearGradient>
              </BlurView>
            </Animated.View>
          </>
        ) : (
          <>
            {/* Weekly Summary Cards */}
        <Animated.View entering={FadeInDown.duration(600).delay(100)} style={styles.summaryRow}>
          <View style={[styles.summaryBox, { borderColor: colors.cardBorder, backgroundColor: colors.surfaceBg }]}>
            <LinearGradient colors={[colors.accent + '15', 'rgba(0,0,0,0)']} style={styles.summaryGrad}>
              <Flame size={20} color={colors.accent} />
              <Text style={[styles.summaryVal, { color: colors.textPrimary }]}>{medieCalorii}</Text>
              <Text style={[styles.summaryLbl, { color: colors.textSecondary }]}>Medie kcal / zi</Text>
            </LinearGradient>
          </View>

          <View style={[styles.summaryBox, { borderColor: colors.cardBorder, backgroundColor: colors.surfaceBg }]}>
            <LinearGradient colors={[colors.accentSecondary + '15', 'rgba(0,0,0,0)']} style={styles.summaryGrad}>
              <Activity size={20} color={colors.accentSecondary} />
              <Text style={[styles.summaryVal, { color: colors.textPrimary }]}>{medieProteine}g</Text>
              <Text style={[styles.summaryLbl, { color: colors.textSecondary }]}>Medie proteine</Text>
            </LinearGradient>
          </View>

          <View style={[styles.summaryBox, { borderColor: colors.cardBorder, backgroundColor: colors.surfaceBg }]}>
            <LinearGradient colors={[colors.warning + '15', 'rgba(0,0,0,0)']} style={styles.summaryGrad}>
              <Award size={20} color={colors.warning} />
              <Text style={[styles.summaryVal, { color: colors.textPrimary }]}>{zileInTinta}/7</Text>
              <Text style={[styles.summaryLbl, { color: colors.textSecondary }]}>Zile în țintă</Text>
            </LinearGradient>
          </View>
        </Animated.View>

        {/* Custom Interactive Bar Chart */}
        <Animated.View entering={FadeInDown.duration(700).delay(200)} style={[styles.chartCard, { borderColor: colors.cardBorder }]}>
          <BlurView intensity={20} tint="dark" style={styles.chartBlur}>
            <LinearGradient colors={[colors.cardBg, 'rgba(0,0,0,0)']} style={styles.chartGrad}>
              <View style={styles.chartHeader}>
                <Text style={[styles.chartTitle, { color: colors.textPrimary }]}>📊 Consum Calorii</Text>
                <Text style={[styles.chartTargetLbl, { color: colors.textSecondary }]}>Țintă: {caloriiTinta} kcal</Text>
              </View>

              <View style={styles.chartArea}>
                {zile.map((zi, index) => {
                  const inaltimeBara = Math.max((zi.calorii / maxCalorii) * 160, zi.calorii > 0 ? 12 : 4);
                  const depasit = zi.calorii > caloriiTinta * 1.05;
                  const culoriBara: readonly [string, string, ...string[]] = depasit ? ['#f43f5e', '#fb7185'] : colors.accentGradient;

                  return (
                    <Animated.View key={zi.data} entering={FadeInUp.duration(500).delay(index * 60)} style={styles.barContainer}>
                      <Text style={[styles.barValue, { color: zi.calorii > 0 ? colors.textPrimary : colors.textTertiary }]}>
                        {zi.calorii > 0 ? zi.calorii : '—'}
                      </Text>
                      
                      <View style={styles.barTrack}>
                        <LinearGradient
                          colors={culoriBara}
                          start={{ x: 0, y: 1 }}
                          end={{ x: 0, y: 0 }}
                          style={[
                            styles.barFill,
                            { height: inaltimeBara, opacity: zi.calorii === 0 ? 0.2 : 1 }
                          ]}
                        />
                      </View>

                      <Text style={[styles.barLabel, { color: zi.esteAzi ? colors.accent : colors.textSecondary, fontWeight: zi.esteAzi ? '900' : '600' }]}>
                        {zi.ziNume}
                      </Text>
                    </Animated.View>
                  );
                })}
              </View>
            </LinearGradient>
          </BlurView>
        </Animated.View>

        {/* Info card */}
        <Animated.View entering={FadeInUp.duration(600).delay(300)} style={[styles.infoCard, { borderColor: colors.cardBorder }]}>
          <BlurView intensity={15} tint="dark" style={styles.infoBlur}>
            <LinearGradient colors={['rgba(255,255,255,0.03)', 'rgba(0,0,0,0)']} style={styles.infoGrad}>
              <Text style={[styles.infoTitle, { color: colors.textPrimary }]}>✨ Despre consistență</Text>
              <Text style={[styles.infoText, { color: colors.textSecondary }]}>
                O zi peste sau sub ținta calorică nu afectează rezultatele pe termen lung. Ceea ce contează cel mai mult este media săptămânală și aportul adecvat de proteine!
              </Text>
            </LinearGradient>
          </BlurView>
        </Animated.View>
          </>
        )}
      </ScrollView>

      <AddWeightModal
        visible={modalGreutateVisible}
        onClose={() => setModalGreutateVisible(false)}
        onSave={salveazaGreutate}
        greutateCurenta={greutateCurenta}
        greutateTinta={greutateTinta}
        onSaveTinta={salveazaGreutateTinta}
        initialTab={modalInitialTab}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  glowTop: { position: 'absolute', top: -150, right: -100, width: 350, height: 350, borderRadius: 175, opacity: 0.05 },
  glowBottom: { position: 'absolute', bottom: -100, left: -80, width: 300, height: 300, borderRadius: 150, opacity: 0.05 },

  scroll: { paddingHorizontal: 20 },

  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, fontSize: 15, fontWeight: '500' },

  header: { marginBottom: 24 },
  title: { fontSize: 36, fontWeight: '900', letterSpacing: -0.5 },
  subtitle: { fontSize: 15, marginTop: 4, fontWeight: '500' },

  summaryRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  summaryBox: { flex: 1, borderRadius: 20, overflow: 'hidden', borderWidth: 1 },
  summaryGrad: { paddingVertical: 16, paddingHorizontal: 8, alignItems: 'center', gap: 6 },
  summaryVal: { fontSize: 20, fontWeight: '900' },
  summaryLbl: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', textAlign: 'center' },

  chartCard: { borderRadius: 28, overflow: 'hidden', borderWidth: 1, marginBottom: 24 },
  chartBlur: { overflow: 'hidden' },
  chartGrad: { padding: 22 },
  chartHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  chartTitle: { fontSize: 18, fontWeight: '800' },
  chartTargetLbl: { fontSize: 13, fontWeight: '600' },

  chartArea: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', height: 200, paddingTop: 10 },
  barContainer: { flex: 1, alignItems: 'center', gap: 6 },
  barValue: { fontSize: 10, fontWeight: '700' },
  barTrack: { width: 22, height: 160, justifyContent: 'flex-end', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 11, overflow: 'hidden' },
  barFill: { width: '100%', borderRadius: 11 },
  barLabel: { fontSize: 12, marginTop: 4 },

  infoCard: { borderRadius: 24, overflow: 'hidden', borderWidth: 1 },
  infoBlur: { overflow: 'hidden' },
  infoGrad: { padding: 20 },
  infoTitle: { fontSize: 16, fontWeight: '800', marginBottom: 8 },
  infoText: { fontSize: 14, lineHeight: 22 },

  // New Tab & Weight Styles
  tabSwitcher: { flexDirection: 'row', borderRadius: 18, borderWidth: 1, padding: 4, marginTop: 16 },
  tabBtn: { flex: 1, paddingVertical: 10, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  tabText: { fontSize: 13 },
  
  recordBtn: { borderRadius: 24, borderWidth: 1, overflow: 'hidden' },
  recordGrad: { flexDirection: 'row', alignItems: 'center', padding: 18, gap: 14 },
  recordIcon: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  recordTitle: { fontSize: 16, fontWeight: '800' },
  recordSub: { fontSize: 12, fontWeight: '500', marginTop: 2 },
  
  chartSwitcher: { flexDirection: 'row', borderRadius: 12, borderWidth: 1, padding: 2 },
  chartSwitchBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  chartSwitchText: { fontSize: 12, fontWeight: '800' },

  predictCard: { borderRadius: 28, overflow: 'hidden', borderWidth: 1, marginBottom: 24 },
  predictBlur: { overflow: 'hidden' },
  predictGrad: { padding: 22 },
  predictHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  predictIconBg: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  predictTitle: { fontSize: 17, fontWeight: '800' },
  predictSub: { fontSize: 12, fontWeight: '500', marginTop: 2 },
  predictBox: { padding: 16, borderRadius: 18, borderWidth: 1, alignItems: 'center', marginBottom: 14 },
  predictDate: { fontSize: 22, fontWeight: '900', letterSpacing: -0.5 },
  predictWeeks: { fontSize: 13, fontWeight: '600', marginTop: 2 },
  predictText: { fontSize: 13, lineHeight: 20, fontWeight: '400' },
});
