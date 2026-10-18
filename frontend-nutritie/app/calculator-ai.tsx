import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown, FadeInUp, ZoomIn } from 'react-native-reanimated';
import {
  Sparkles,
  ArrowLeft,
  Check,
  Flame,
  Activity,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Minus,
  Dumbbell,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { API_URL } from '@/constants/config';
import { API_PREFIX } from '@/lib/api';
import { supabase } from '../supabase';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useNotificationBannerActions } from '../context/NotificationBannerContext';
import KeyboardAwareScreen from '../components/ui/KeyboardAwareScreen';
import {
  calculeazaProfilLocal,
  type SexBiologic,
  type NivelActivitate,
  type ObiectivNutritional,
  type RezultatCalculProfil,
} from '../lib/calculNutritional';
import { salveazaTargeturiPending } from '../lib/sincronizeazaTargeturi';
import { marcheazaMeseModificate } from '../lib/freshnessMese';

interface OptionItem<T> {
  value: T;
  label: string;
  sublabel?: string;
  icon?: React.ReactNode;
}

interface SelectionGroupProps<T extends string> {
  label: string;
  options: OptionItem<T>[];
  current: T;
  onChange: (val: T) => void;
}

function SelectionGroup<T extends string>({
  label,
  options,
  current,
  onChange,
}: SelectionGroupProps<T>) {
  const { colors } = useTheme();
  return (
    <View style={styles.inputGroup}>
      <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
      <View style={styles.optionsRow}>
        {options.map((opt) => {
          const isSelected = current === opt.value;
          return (
            <TouchableOpacity
              key={opt.value}
              activeOpacity={0.8}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={`${opt.label}${opt.sublabel ? ` - ${opt.sublabel}` : ''}`}
              style={[
                styles.optionBtn,
                {
                  backgroundColor: isSelected ? colors.accent + '22' : 'rgba(255,255,255,0.04)',
                  borderColor: isSelected ? colors.accent : colors.cardBorder,
                },
              ]}
              onPress={() => {
                try {
                  Haptics.selectionAsync();
                } catch {}
                onChange(opt.value);
              }}
            >
              <View style={styles.optionContent}>
                {opt.icon && <View style={styles.optionIconWrap}>{opt.icon}</View>}
                <View style={styles.optionTextWrap}>
                  <Text
                    style={[
                      styles.optionLabel,
                      {
                        color: isSelected ? colors.accent : colors.textPrimary,
                        fontWeight: isSelected ? '800' : '600',
                      },
                    ]}
                  >
                    {opt.label}
                  </Text>
                  {opt.sublabel && (
                    <Text
                      style={[
                        styles.optionSublabel,
                        { color: isSelected ? colors.accent + 'CC' : colors.textTertiary },
                      ]}
                      numberOfLines={1}
                    >
                      {opt.sublabel}
                    </Text>
                  )}
                </View>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export default function CalculatorAIScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const { session } = useAuth();
  const { t } = useTranslation();
  const { showBanner } = useNotificationBannerActions();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    varsta: '',
    greutate: '',
    inaltime: '',
    sex: 'Masculin' as SexBiologic,
    activitate: 'Sedentar' as NivelActivitate,
    obiectiv: 'Slăbire' as ObiectivNutritional,
  });

  const [calculatedResult, setCalculatedResult] = useState<RezultatCalculProfil | null>(null);

  // Prefill intelligent din profilul existent sau AsyncStorage
  useEffect(() => {
    let isMounted = true;
    const prefill = async () => {
      try {
        const stored = await AsyncStorage.multiGet([
          'varsta',
          'greutate',
          'inaltime',
          'sex',
          'nivel_activitate',
          'obiectiv',
        ]);
        const map: Record<string, string> = {};
        for (const [k, v] of stored) {
          if (v) map[k] = v;
        }

        const userMeta = (session?.user?.user_metadata || {}) as Record<string, any>;
        const vAge = map.varsta || (userMeta.varsta ? String(userMeta.varsta) : '');
        const vWeight = map.greutate || (userMeta.greutate ? String(userMeta.greutate) : '');
        const vHeight = map.inaltime || (userMeta.inaltime ? String(userMeta.inaltime) : '');

        let vSex: SexBiologic = 'Masculin';
        const rawSex = (map.sex || userMeta.sex || '').toLowerCase();
        if (rawSex.includes('fem')) vSex = 'Feminin';

        let vAct: NivelActivitate = 'Sedentar';
        const rawAct = (map.nivel_activitate || userMeta.activitate || '').toLowerCase();
        if (rawAct.includes('moderat')) vAct = 'Moderat';
        else if (rawAct.includes('activ') || rawAct.includes('intens')) vAct = 'Foarte Activ';

        let vGoal: ObiectivNutritional = 'Slăbire';
        const rawGoal = (map.obiectiv || userMeta.obiectiv || '').toLowerCase();
        if (rawGoal.includes('mentinere') || rawGoal.includes('maintain')) vGoal = 'Menținere';
        else if (rawGoal.includes('masa') || rawGoal.includes('gain') || rawGoal.includes('muscul'))
          vGoal = 'Masă Musculară';

        if (isMounted) {
          setForm((f) => ({
            varsta: f.varsta || vAge,
            greutate: f.greutate || vWeight,
            inaltime: f.inaltime || vHeight,
            sex: f.sex || vSex,
            activitate: f.activitate || vAct,
            obiectiv: f.obiectiv || vGoal,
          }));
        }
      } catch (err) {
        console.warn('[CalculatorAI] Prefill error:', err);
      }
    };
    prefill();
    return () => {
      isMounted = false;
    };
  }, [session?.user]);

  const updateForm = (key: keyof typeof form, value: any) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  const calculeaza = async () => {
    const v = parseInt(form.varsta, 10);
    const g = parseFloat(form.greutate);
    const i = parseFloat(form.inaltime);

    if (!form.varsta || !form.greutate || !form.inaltime || isNaN(v) || isNaN(g) || isNaN(i)) {
      showBanner({
        title: t('calculatorAi.validationIncomplete', 'Date incomplete'),
        message: t('calculatorAi.validationIncomplete', 'Te rog să completezi vârsta, greutatea și înălțimea.'),
        type: 'warning',
      });
      return;
    }

    if (v < 18 || v > 100) {
      showBanner({
        title: t('common.error', 'Eroare'),
        message: t('calculatorAi.validationAge', 'Vârsta trebuie să fie între 18 și 100 de ani.'),
        type: 'warning',
      });
      return;
    }

    if (g < 30 || g > 300) {
      showBanner({
        title: t('common.error', 'Eroare'),
        message: t('calculatorAi.validationWeight', 'Greutatea trebuie să fie între 30 și 300 kg.'),
        type: 'warning',
      });
      return;
    }

    if (i < 100 || i > 250) {
      showBanner({
        title: t('common.error', 'Eroare'),
        message: t('calculatorAi.validationHeight', 'Înălțimea trebuie să fie între 100 și 250 cm.'),
        type: 'warning',
      });
      return;
    }

    setLoading(true);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}

    // Calcul local instant (Mifflin-St Jeor), 100% în paritate cu backend-ul
    const localPlan = calculeazaProfilLocal({
      varsta: v,
      greutate: g,
      inaltime: i,
      sex: form.sex,
      activitate: form.activitate,
      obiectiv: form.obiectiv,
    });

    let finalPlan = localPlan;

    // Sincronizare opțională server dacă există rețea și sesiune activă
    if (session?.access_token) {
      try {
        const resp = await fetch(`${API_URL}${API_PREFIX}/calculeaza-profil`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify(form),
        });
        if (resp.ok) {
          const date = await resp.json();
          if (date && typeof date.caloriiTinta === 'number') {
            finalPlan = {
              bmr: localPlan?.bmr ?? 1700,
              tdee: localPlan?.tdee ?? 2300,
              caloriiTinta: date.caloriiTinta,
              proteineTinta: date.proteineTinta,
              carbiTinta: date.carbiTinta,
              grasimiTinta: date.grasimiTinta,
              ajustare: localPlan?.ajustare ?? 0,
              limitatLaMinim: localPlan?.limitatLaMinim ?? false,
            };
          }
        }
      } catch {
        // Fallback transparent la calculul local determinist
      }
    }

    setLoading(false);
    if (finalPlan) {
      setCalculatedResult(finalPlan);
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {}
    }
  };

  const salveazaTinte = async () => {
    if (!calculatedResult || !session?.user?.id) return;
    setSaving(true);
    const userId = session.user.id;
    const { caloriiTinta, proteineTinta, carbiTinta, grasimiTinta } = calculatedResult;
    const greutateNum = parseFloat(form.greutate);
    const inaltimeNum = parseFloat(form.inaltime);
    const varstaNum = parseInt(form.varsta, 10);

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    } catch {}

    try {
      // 1. AsyncStorage multiSet pentru toate cheile locale
      await AsyncStorage.multiSet([
        ['caloriiTinta', String(caloriiTinta)],
        ['proteineTinta', String(proteineTinta)],
        ['carbiTinta', String(carbiTinta)],
        ['grasimiTinta', String(grasimiTinta)],
        ['greutate', String(greutateNum)],
        ['greutateTinta', String(greutateNum)],
        ['inaltime', String(inaltimeNum)],
        ['varsta', String(varstaNum)],
        ['sex', form.sex],
        ['nivel_activitate', form.activitate],
        ['obiectiv', form.obiectiv],
      ]);

      // 2. Scoped pending targets (garanție de consistență la nivel de cont per REV-003)
      await salveazaTargeturiPending(userId, {
        caloriiTinta,
        proteineTinta,
        carbiTinta,
        grasimiTinta,
        greutate: greutateNum,
        greutateTinta: greutateNum,
      });

      // 3. Supabase Auth user metadata update
      try {
        await supabase.auth.updateUser({
          data: {
            caloriiTinta,
            proteineTinta,
            carbiTinta,
            grasimiTinta,
            greutate: greutateNum,
            greutateTinta: greutateNum,
            varsta: varstaNum,
            inaltime: inaltimeNum,
          },
        });
      } catch (err) {
        console.warn('[CalculatorAI] updateUser metadata error:', err);
      }

      // 4. Supabase DB profil table upsert (persistență durabilă cross-device)
      try {
        await supabase.from('profil').upsert(
          {
            user_id: userId,
            calorii_tinta: caloriiTinta,
            proteine_tinta: proteineTinta,
            carbi_tinta: carbiTinta,
            grasimi_tinta: grasimiTinta,
            greutate: greutateNum,
            inaltime: inaltimeNum,
            varsta: varstaNum,
            sex: form.sex === 'Masculin' ? 'masculin' : 'feminin',
            activitate:
              form.activitate === 'Sedentar'
                ? 'sedentar'
                : form.activitate === 'Moderat'
                ? 'moderat'
                : 'intens',
            obiectiv:
              form.obiectiv === 'Slăbire'
                ? 'slabire'
                : form.obiectiv === 'Menținere'
                ? 'mentinere'
                : 'masa',
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' }
        );
      } catch (err) {
        console.warn('[CalculatorAI] DB profil upsert error:', err);
      }

      // 5. Invalidation channel: semnalizează deterministic useMeseAzi pe toate tab-urile active (Home, Jurnal, Chat)
      marcheazaMeseModificate(userId);

      // 6. Banner de succes și feedback
      showBanner({
        title: t('calculatorAi.savedSuccessTitle', 'Profil Actualizat'),
        message: `${caloriiTinta} kcal • ${proteineTinta}g P • ${carbiTinta}g C • ${grasimiTinta}g G`,
        type: 'success',
        duration: 4000,
      });

      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {}

      // 7. Navigare înapoi sigură
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/(tabs)');
      }
    } catch (e: any) {
      showBanner({
        title: t('common.error', 'Eroare'),
        message: e?.message || 'Eroare la salvarea țintelor.',
        type: 'warning',
      });
    } finally {
      setSaving(false);
    }
  };

  const sexOptions: OptionItem<SexBiologic>[] = [
    { value: 'Masculin', label: t('calculatorAi.male', 'Masculin') },
    { value: 'Feminin', label: t('calculatorAi.female', 'Feminin') },
  ];

  const activitateOptions: OptionItem<NivelActivitate>[] = [
    {
      value: 'Sedentar',
      label: t('calculatorAi.sedentary', 'Sedentar'),
      sublabel: t('calculatorAi.sedentaryDesc', 'Birou / puțină mișcare • x1.2'),
      icon: <Activity size={16} color={colors.accent} />,
    },
    {
      value: 'Moderat',
      label: t('calculatorAi.moderate', 'Moderat'),
      sublabel: t('calculatorAi.moderateDesc', '3-5 antrenamente / săpt • x1.55'),
      icon: <Flame size={16} color={colors.accent} />,
    },
    {
      value: 'Foarte Activ',
      label: t('calculatorAi.veryActive', 'Foarte Activ'),
      sublabel: t('calculatorAi.veryActiveDesc', 'Muncă fizică / 6-7 antrenamente • x1.725'),
      icon: <Dumbbell size={16} color={colors.accent} />,
    },
  ];

  const obiectivOptions: OptionItem<ObiectivNutritional>[] = [
    {
      value: 'Slăbire',
      label: t('calculatorAi.loseWeight', 'Slăbire'),
      sublabel: t('calculatorAi.loseWeightDesc', 'Deficit caloric (-550 kcal)'),
      icon: <TrendingDown size={16} color={colors.accent} />,
    },
    {
      value: 'Menținere',
      label: t('calculatorAi.maintain', 'Menținere'),
      sublabel: t('calculatorAi.maintainDesc', 'Echilibru caloric (0 kcal)'),
      icon: <Minus size={16} color={colors.accent} />,
    },
    {
      value: 'Masă Musculară',
      label: t('calculatorAi.gainMuscle', 'Masă Musculară'),
      sublabel: t('calculatorAi.gainMuscleDesc', 'Surplus caloric (+550 kcal)'),
      icon: <TrendingUp size={16} color={colors.accent} />,
    },
  ];

  return (
    <KeyboardAwareScreen style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.glowTop, { backgroundColor: colors.accent }]} />
      <View style={[styles.glowBottom, { backgroundColor: colors.accentSecondary }]} />

      <Animated.View
        entering={FadeInUp.duration(400)}
        style={[styles.header, { paddingTop: insets.top + 12 }]}
      >
        <TouchableOpacity
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
          accessibilityRole="button"
          accessibilityLabel={t('common.back', 'Înapoi')}
          hitSlop={12}
          style={styles.backBtn}
        >
          <BlurView intensity={20} tint="dark" style={styles.backBtnBlur}>
            <ArrowLeft color="#fff" size={22} />
          </BlurView>
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>
          {t('calculatorAi.title', 'Asistent Profil')}
        </Text>
      </Animated.View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* AI Badge header */}
        <Animated.View
          entering={ZoomIn.duration(500).delay(100)}
          style={[styles.aiBadge, { borderColor: colors.accent + '33' }]}
        >
          <LinearGradient
            colors={[colors.accent + '26', 'rgba(0,0,0,0)']}
            style={styles.aiBadgeGrad}
          >
            <Sparkles size={22} color={colors.accent} />
            <Text style={styles.aiBadgeText}>
              {t(
                'calculatorAi.badge',
                'Algoritm de nutriție cu inteligență artificială. Introdu datele tale pentru a calcula țintele nutriționale optime.'
              )}
            </Text>
          </LinearGradient>
        </Animated.View>

        {/* Results Card Preview (apare după calcul) */}
        {calculatedResult && (
          <Animated.View
            entering={FadeInDown.duration(400)}
            testID="calculator-ai-results-card"
            style={[styles.resultsCard, { borderColor: colors.accent + '55' }]}
          >
            <BlurView intensity={30} tint="dark" style={styles.resultsBlur}>
              <View style={styles.resultsHeader}>
                <View style={styles.resultsHeaderTag}>
                  <Sparkles size={16} color={colors.accent} />
                  <Text style={[styles.resultsHeaderTagText, { color: colors.accent }]}>
                    {t('calculatorAi.resultsTitle', 'Ținte Recomandate')}
                  </Text>
                </View>
                <View
                  style={[
                    styles.goalPill,
                    {
                      backgroundColor:
                        form.obiectiv === 'Slăbire'
                          ? colors.accent + '20'
                          : form.obiectiv === 'Masă Musculară'
                          ? colors.warning + '20'
                          : colors.surfaceBg,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.goalPillText,
                      {
                        color:
                          form.obiectiv === 'Slăbire'
                            ? colors.accent
                            : form.obiectiv === 'Masă Musculară'
                            ? colors.warning
                            : colors.textSecondary,
                      },
                    ]}
                  >
                    {form.obiectiv} (
                    {calculatedResult.ajustare > 0 ? `+${calculatedResult.ajustare}` : calculatedResult.ajustare} kcal)
                  </Text>
                </View>
              </View>

              {/* Hero Calories Display */}
              <View style={styles.heroCaloriesRow}>
                <Text
                  testID="calculator-ai-calories-value"
                  style={[styles.heroCaloriesValue, { color: colors.textPrimary }]}
                >
                  {calculatedResult.caloriiTinta.toLocaleString()}
                </Text>
                <Text style={[styles.heroCaloriesUnit, { color: colors.textSecondary }]}>
                  {t('calculatorAi.caloriesUnit', 'kcal / zi')}
                </Text>
              </View>

              {/* Macro split 3 cards */}
              <View style={styles.macroSplitRow}>
                <View
                  style={[
                    styles.macroCard,
                    { backgroundColor: 'rgba(255,255,255,0.04)', borderColor: colors.cardBorder },
                  ]}
                >
                  <Text style={[styles.macroCardLabel, { color: colors.accent }]}>
                    {t('calculatorAi.protein', 'Proteine')}
                  </Text>
                  <Text
                    testID="calculator-ai-protein-value"
                    style={[styles.macroCardVal, { color: colors.textPrimary }]}
                  >
                    {calculatedResult.proteineTinta}g
                  </Text>
                  <Text style={[styles.macroCardSub, { color: colors.textTertiary }]}>30% • 4 kcal/g</Text>
                </View>

                <View
                  style={[
                    styles.macroCard,
                    { backgroundColor: 'rgba(255,255,255,0.04)', borderColor: colors.cardBorder },
                  ]}
                >
                  <Text style={[styles.macroCardLabel, { color: colors.accentSecondary || '#00E5FF' }]}>
                    {t('calculatorAi.carbs', 'Carbohidrați')}
                  </Text>
                  <Text
                    testID="calculator-ai-carbs-value"
                    style={[styles.macroCardVal, { color: colors.textPrimary }]}
                  >
                    {calculatedResult.carbiTinta}g
                  </Text>
                  <Text style={[styles.macroCardSub, { color: colors.textTertiary }]}>40% • 4 kcal/g</Text>
                </View>

                <View
                  style={[
                    styles.macroCard,
                    { backgroundColor: 'rgba(255,255,255,0.04)', borderColor: colors.cardBorder },
                  ]}
                >
                  <Text style={[styles.macroCardLabel, { color: colors.accentTertiary || '#FFB800' }]}>
                    {t('calculatorAi.fats', 'Grăsimi')}
                  </Text>
                  <Text
                    testID="calculator-ai-fats-value"
                    style={[styles.macroCardVal, { color: colors.textPrimary }]}
                  >
                    {calculatedResult.grasimiTinta}g
                  </Text>
                  <Text style={[styles.macroCardSub, { color: colors.textTertiary }]}>30% • 9 kcal/g</Text>
                </View>
              </View>

              {/* Metabolic details footer */}
              <View style={[styles.metabolicRow, { borderColor: colors.cardBorder }]}>
                <View style={styles.metabolicItem}>
                  <Text style={[styles.metabolicLabel, { color: colors.textTertiary }]}>
                    {t('calculatorAi.bmr', 'Metabolism Bazal (BMR)')}
                  </Text>
                  <Text style={[styles.metabolicValue, { color: colors.textPrimary }]}>
                    {calculatedResult.bmr} kcal
                  </Text>
                </View>
                <View style={[styles.metabolicDivider, { backgroundColor: colors.cardBorder }]} />
                <View style={styles.metabolicItem}>
                  <Text style={[styles.metabolicLabel, { color: colors.textTertiary }]}>
                    {t('calculatorAi.tdee', 'Consum Total (TDEE)')}
                  </Text>
                  <Text style={[styles.metabolicValue, { color: colors.textPrimary }]}>
                    {calculatedResult.tdee} kcal
                  </Text>
                </View>
              </View>

              {/* Actions: Save & Apply OR Adjust */}
              <View style={styles.resultActionsRow}>
                <TouchableOpacity
                  testID="calculator-ai-save-btn"
                  style={[styles.saveBtn, { shadowColor: colors.accent }]}
                  onPress={salveazaTinte}
                  disabled={saving}
                  accessibilityRole="button"
                  accessibilityLabel={t('calculatorAi.saveAndApply', 'Salvează și Aplică Țintele')}
                >
                  <LinearGradient colors={colors.accentGradient} style={styles.saveBtnGrad}>
                    {saving ? (
                      <ActivityIndicator color={colors.background} />
                    ) : (
                      <>
                        <Check size={20} color={colors.background} strokeWidth={2.5} />
                        <Text style={[styles.saveBtnText, { color: colors.background }]}>
                          {t('calculatorAi.saveAndApply', 'Salvează și Aplică Țintele')}
                        </Text>
                      </>
                    )}
                  </LinearGradient>
                </TouchableOpacity>

                <TouchableOpacity
                  testID="calculator-ai-modify-btn"
                  style={[styles.modifyBtn, { borderColor: colors.cardBorder }]}
                  onPress={() => setCalculatedResult(null)}
                  disabled={saving}
                  accessibilityRole="button"
                  accessibilityLabel={t('calculatorAi.modifyInputs', 'Modifică Datele')}
                >
                  <RefreshCw size={16} color={colors.textSecondary} />
                  <Text style={[styles.modifyBtnText, { color: colors.textSecondary }]}>
                    {t('calculatorAi.modifyInputs', 'Modifică Datele')}
                  </Text>
                </TouchableOpacity>
              </View>
            </BlurView>
          </Animated.View>
        )}

        {/* Form Container */}
        {(!calculatedResult || loading) && (
          <Animated.View
            entering={FadeInUp.duration(500).delay(200)}
            style={[styles.formContainer, { borderColor: colors.cardBorder }]}
          >
            <BlurView intensity={25} tint="dark" style={styles.formBlur}>
              {/* Row 1: Vârstă */}
              <View style={styles.inputGroup}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>
                  {t('calculatorAi.age', 'Vârstă')} ({t('calculatorAi.ageUnit', 'ani')})
                </Text>
                <TextInput
                  testID="calculator-ai-age-input"
                  style={[
                    styles.input,
                    {
                      color: colors.textPrimary,
                      backgroundColor: 'rgba(255,255,255,0.04)',
                      borderColor: colors.cardBorder,
                    },
                  ]}
                  placeholder={t('calculatorAi.agePlaceholder', 'Ex: 25')}
                  placeholderTextColor={colors.textSecondary}
                  keyboardType="numeric"
                  maxLength={3}
                  value={form.varsta}
                  onChangeText={(val) => updateForm('varsta', val.replace(/[^0-9]/g, ''))}
                  accessibilityLabel={t('calculatorAi.age', 'Vârstă')}
                />
              </View>

              {/* Row 2: Greutate & Înălțime */}
              <View style={styles.rowInputs}>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={[styles.label, { color: colors.textSecondary }]}>
                    {t('calculatorAi.weight', 'Greutate')} ({t('calculatorAi.weightUnit', 'kg')})
                  </Text>
                  <TextInput
                    testID="calculator-ai-weight-input"
                    style={[
                      styles.input,
                      {
                        color: colors.textPrimary,
                        backgroundColor: 'rgba(255,255,255,0.04)',
                        borderColor: colors.cardBorder,
                      },
                    ]}
                    placeholder={t('calculatorAi.weightPlaceholder', 'Ex: 75')}
                    placeholderTextColor={colors.textSecondary}
                    keyboardType="numeric"
                    maxLength={5}
                    value={form.greutate}
                    onChangeText={(val) => updateForm('greutate', val.replace(/[^0-9.]/g, ''))}
                    accessibilityLabel={t('calculatorAi.weight', 'Greutate')}
                  />
                </View>
                <View style={{ width: 14 }} />
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={[styles.label, { color: colors.textSecondary }]}>
                    {t('calculatorAi.height', 'Înălțime')} ({t('calculatorAi.heightUnit', 'cm')})
                  </Text>
                  <TextInput
                    testID="calculator-ai-height-input"
                    style={[
                      styles.input,
                      {
                        color: colors.textPrimary,
                        backgroundColor: 'rgba(255,255,255,0.04)',
                        borderColor: colors.cardBorder,
                      },
                    ]}
                    placeholder={t('calculatorAi.heightPlaceholder', 'Ex: 180')}
                    placeholderTextColor={colors.textSecondary}
                    keyboardType="numeric"
                    maxLength={3}
                    value={form.inaltime}
                    onChangeText={(val) => updateForm('inaltime', val.replace(/[^0-9]/g, ''))}
                    accessibilityLabel={t('calculatorAi.height', 'Înălțime')}
                  />
                </View>
              </View>

              {/* Sex Biologic */}
              <SelectionGroup<SexBiologic>
                label={t('calculatorAi.gender', 'Sex biologic')}
                options={sexOptions}
                current={form.sex}
                onChange={(val) => updateForm('sex', val)}
              />

              {/* Nivel Activitate */}
              <SelectionGroup<NivelActivitate>
                label={t('calculatorAi.activityLevel', 'Nivel Activitate Fizică')}
                options={activitateOptions}
                current={form.activitate}
                onChange={(val) => updateForm('activitate', val)}
              />

              {/* Obiectiv */}
              <SelectionGroup<ObiectivNutritional>
                label={t('calculatorAi.goal', 'Obiectiv')}
                options={obiectivOptions}
                current={form.obiectiv}
                onChange={(val) => updateForm('obiectiv', val)}
              />
            </BlurView>
          </Animated.View>
        )}

        {/* Calculate Button (dacă rezultatul nu e calculat încă) */}
        {!calculatedResult && (
          <Animated.View entering={FadeInUp.duration(500).delay(300)}>
            <TouchableOpacity
              testID="calculator-ai-calculate-btn"
              style={[styles.submitBtn, { shadowColor: colors.accent }]}
              onPress={calculeaza}
              disabled={loading}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={t('calculatorAi.calculateBtn', 'Calculează cu AI')}
            >
              <LinearGradient
                colors={loading ? ['#333', '#222'] : colors.accentGradient}
                style={styles.submitGrad}
              >
                {loading ? (
                  <View style={styles.loadingRow}>
                    <ActivityIndicator color={colors.background} />
                    <Text style={[styles.submitText, { color: colors.background, marginLeft: 10 }]}>
                      {t('calculatorAi.calculating', 'Se calculează...')}
                    </Text>
                  </View>
                ) : (
                  <>
                    <Text style={[styles.submitText, { color: colors.background }]}>
                      {t('calculatorAi.calculateBtn', 'Calculează cu AI')}
                    </Text>
                    <Sparkles size={18} color={colors.background} />
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>
        )}
      </ScrollView>
    </KeyboardAwareScreen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  glowTop: {
    position: 'absolute',
    top: -150,
    right: -100,
    width: 350,
    height: 350,
    borderRadius: 175,
    opacity: 0.05,
  },
  glowBottom: {
    position: 'absolute',
    bottom: -100,
    left: -80,
    width: 300,
    height: 300,
    borderRadius: 150,
    opacity: 0.05,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  backBtn: { borderRadius: 14, overflow: 'hidden', marginRight: 16 },
  backBtnBlur: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 14,
  },
  title: { fontSize: 24, fontWeight: '900', letterSpacing: -0.5 },

  scroll: { paddingHorizontal: 20 },

  aiBadge: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    marginBottom: 20,
  },
  aiBadgeGrad: {
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  aiBadgeText: { color: '#D1D5DB', fontSize: 13, flex: 1, lineHeight: 19 },

  // Results Card
  resultsCard: {
    borderRadius: 26,
    overflow: 'hidden',
    borderWidth: 1.5,
    marginBottom: 24,
  },
  resultsBlur: { padding: 22 },
  resultsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  resultsHeaderTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  resultsHeaderTagText: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  goalPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  goalPillText: {
    fontSize: 12,
    fontWeight: '700',
  },

  heroCaloriesRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginBottom: 20,
  },
  heroCaloriesValue: {
    fontSize: 42,
    fontWeight: '900',
    letterSpacing: -1,
  },
  heroCaloriesUnit: {
    fontSize: 16,
    fontWeight: '700',
  },

  macroSplitRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 18,
  },
  macroCard: {
    flex: 1,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
  },
  macroCardLabel: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  macroCardVal: {
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 2,
  },
  macroCardSub: {
    fontSize: 10,
    fontWeight: '600',
  },

  metabolicRow: {
    flexDirection: 'row',
    paddingTop: 14,
    borderTopWidth: 1,
    marginBottom: 20,
  },
  metabolicItem: {
    flex: 1,
  },
  metabolicDivider: {
    width: 1,
    marginHorizontal: 12,
  },
  metabolicLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 3,
  },
  metabolicValue: {
    fontSize: 15,
    fontWeight: '800',
  },

  resultActionsRow: {
    gap: 10,
  },
  saveBtn: {
    borderRadius: 18,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
  },
  saveBtnGrad: {
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  saveBtnText: {
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  modifyBtn: {
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  modifyBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },

  // Form container
  formContainer: {
    borderRadius: 26,
    overflow: 'hidden',
    borderWidth: 1,
    marginBottom: 24,
  },
  formBlur: { padding: 20 },

  inputGroup: { marginBottom: 18 },
  label: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  rowInputs: { flexDirection: 'row' },
  input: {
    borderWidth: 1,
    borderRadius: 16,
    fontSize: 16,
    fontWeight: '700',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },

  optionsRow: {
    gap: 8,
  },
  optionBtn: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  optionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  optionIconWrap: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionTextWrap: {
    flex: 1,
  },
  optionLabel: {
    fontSize: 14,
  },
  optionSublabel: {
    fontSize: 11,
    marginTop: 2,
  },

  submitBtn: {
    borderRadius: 18,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
    marginBottom: 20,
  },
  submitGrad: {
    paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  submitText: {
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
