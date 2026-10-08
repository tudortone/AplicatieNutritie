
import React, { useCallback, useState, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useFocusRefresh } from '../../hooks/useFocusRefresh';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Flame, Activity, PlusCircle, ChevronRight, Eye, EyeOff, Utensils, Calendar, AlertCircle, Trash2 } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useMeseAzi, type CategorieMasaGrupata } from '../../hooks/useMeseAzi';
import { totaluriPentruAfisare } from '../../lib/nutritionTotals';
import { useCurrentDayKey } from '../../hooks/useCurrentDayKey';
import { useZileCuMese } from '../../hooks/useZileCuMese';
import { localDayKey } from '../../lib/dateUtils';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../context/ThemeContext';
import { Spacing, Radius } from '../../constants/theme';
import type { ThemeColors } from '../../constants/theme';
import { supabase } from '../../supabase';
import { Masa, TipMasa } from '../../types';
import { SkeletonLoader } from '../../components/SkeletonLoader';
import { MacroRing } from '../../components/MacroRing';
import { AddMealBottomSheet, AddMealBottomSheetRef } from '../../components/AddMealBottomSheet';
import { MonthCalendar } from '../../components/MonthCalendar';
import { MealDetailsSheet, MealDetailsSheetRef } from '../../components/MealDetailsModal';
import { CategorieDetailSheet, CategorieDetailSheetRef } from '../../components/jurnal/CategorieDetailSheet';
import { MasaCard } from '../../components/MasaCard';
import { EmptyState } from '../../components/ui/EmptyState';
import { actualizeazaMasaCuPoza, CATEGORIE_ICONA, getMealCategoryLabel } from '../../lib/mealUtils';
import { marcheazaMeseModificate } from '../../lib/freshnessMese';
import KeyboardAwareScreen from '@/components/ui/KeyboardAwareScreen';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { FlowIcon } from '../../components/ui/FlowIcon';
import { ConfirmSheet } from '../../components/ui/ConfirmSheet';
import { useNotificationBanner } from '../../context/NotificationBannerContext';
import { NutrientFocusCard } from '../../components/jurnal/NutrientFocusCard';


// BUG-029: lista jurnalului e aplatizată pentru FlashList — fiecare item e un
// antet de categorie, o masă sau butonul „+ adaugă încă o masă”. FlashList
// virtualizează itemele, deci nu mai montează toate mesele zilei odată.
type ItemJurnal =
  | { tip: 'header'; cheie: string; cat: CategorieMasaGrupata; primul: boolean }
  | { tip: 'masa'; cheie: string; masa: Masa }
  | { tip: 'empty'; cheie: string; cat: CategorieMasaGrupata; primul: boolean }
  | { tip: 'addMore'; cheie: string; cat: CategorieMasaGrupata };

// REMED-025: accent semantic per categorie — mic dejun → accent, prânz →
// accentSecondary, gustare → accentTertiary, cină → success.
function accentCategorie(colors: ThemeColors, cat: CategorieMasaGrupata): string {
  switch (cat.id) {
    case 'mic_dejun': return colors.accent;
    case 'pranz': return colors.accentSecondary;
    case 'gustare': return colors.accentTertiary;
    case 'cina': return colors.success;
    default: return colors.accent;
  }
}

/** Iconița lucide a categoriei, colorată cu accentul ei semantic. */
function CategorieIcona({ cat, color, size = 22 }: { cat: CategorieMasaGrupata; color: string; size?: number }) {
  const iconName = CATEGORIE_ICONA[cat.id];
  return <FlowIcon name={iconName} size={size} color={color} />;
}

export default function HistoryScreen() {
  const { colors } = useTheme();
  const { t, i18n } = useTranslation();
  const { showBanner } = useNotificationBanner();
  const [dataSelectata, setDataSelectata] = useState(new Date());
  const [afisarePoze, setAfisarePoze] = useState(true);
  const [mealToDelete, setMealToDelete] = useState<Masa | null>(null);
  const [isDeletingMeal, setIsDeletingMeal] = useState(false);
  const mealSheetRef = useRef<AddMealBottomSheetRef>(null);
  const categorieSheetRef = useRef<CategorieDetailSheetRef>(null);
  const mealDetailSheetRef = useRef<MealDetailsSheetRef>(null);
  const { insets, topInset, horizontalPadding, scrollPaddingTop, scrollPaddingBottom, isVeryCompact } = useResponsiveLayout();
  const reduceMotion = useReducedMotion();

  // REMED-029: foaia „adăugare/editare masă" se montează DOAR la prima deschidere
  // (argumentele așteaptă în ref). Reduce costul de montare al jurnalului; după
  // prima deschidere rămâne montată, ca până acum.
  // BUG-043: nonce monoton în loc de boolean — `setMealSheetMounted(true)` când e
  // deja `true` nu declanșează re-render (bailout React), deci effect-ul nu mai
  // rula la a doua deschidere și sheet-ul se deschidea doar o singură dată.
  const [mealSheetMounted, setMealSheetMounted] = useState(false);
  const [mealSheetOpenNonce, setMealSheetOpenNonce] = useState(0);
  const mealSheetArgsRef = useRef<{ masa: Masa | null; tip?: TipMasa }>({ masa: null });
  const deschideAddMeal = useCallback((masa?: Masa | null, tip?: TipMasa) => {
    mealSheetArgsRef.current = { masa: masa ?? null, tip };
    setMealSheetOpenNonce((n) => n + 1);
    setMealSheetMounted(true);
  }, []);
  useEffect(() => {
    if (!mealSheetMounted) return;
    const { masa, tip } = mealSheetArgsRef.current;
    mealSheetRef.current?.open(masa, tip);
  }, [mealSheetMounted, mealSheetOpenNonce]);

  // BUG-001: cand ziua locala se schimba, avansam la noua zi DOAR daca utilizatorul
  // vizualiza fosta „azi" (ziua care tocmai a devenit ieri). Daca naviga in istoric
  // pe o data mai veche, selectia ramane — calendarul nu e deranjat.
  const currentDayKey = useCurrentDayKey();
  const prevDayKeyRef = useRef(currentDayKey);
  useEffect(() => {
    if (prevDayKeyRef.current !== currentDayKey) {
      setDataSelectata((prev) => {
        if (localDayKey(prev) === prevDayKeyRef.current) return new Date();
        return prev;
      });
      prevDayKeyRef.current = currentDayKey;
    }
  }, [currentDayKey]);

  // Comutator „afișare poze” pentru jurnal (journall-only, persistă în AsyncStorage).
  useEffect(() => {
    AsyncStorage.getItem('jurnal_poze_activate')
      .then((v) => {
        if (v !== null) setAfisarePoze(v === '1');
      })
      .catch(() => {});
  }, []);

  const toggleAfisarePoze = () => {
    const val = !afisarePoze;
    setAfisarePoze(val);
    AsyncStorage.setItem('jurnal_poze_activate', val ? '1' : '0').catch(() => {});
  };

  const {
    mese,
    categoriiMeseList,
    totalCalorii,
    totalProteine,
    caloriiTinta,
    loading,
    eroareFetch,
    refresh,
    optimisticDeleteMeal,
    optimisticAddMeal
  } = useMeseAzi(dataSelectata);
  const { zileCuMese, refreshZileCuMese } = useZileCuMese();

  const esteAzi = new Date().toDateString() === dataSelectata.toDateString();
  const esteIeri = (() => {
    const ieri = new Date();
    ieri.setDate(ieri.getDate() - 1);
    return ieri.toDateString() === dataSelectata.toDateString();
  })();

  const formatDataTitlu = () => {
    if (esteAzi) return t('jurnal.today');
    if (esteIeri) return t('jurnal.yesterday');
    const localeTag = i18n.language === 'en' ? 'en-US' : i18n.language === 'de' ? 'de-DE' : i18n.language === 'fr' ? 'fr-FR' : 'ro-RO';
    return dataSelectata.toLocaleDateString(localeTag, { day: 'numeric', month: 'long', year: 'numeric' });
  };

  useFocusRefresh(
    () => {
      refresh(true);
      refreshZileCuMese();
    },
    5000,
    [refresh, refreshZileCuMese, t],
  );

  const onRefresh = useCallback(async () => {
    await Promise.all([refresh(false, true), refreshZileCuMese()]);
  }, [refresh, refreshZileCuMese]);

  // 1. Ștergere masă cu confirmare GetFlow și UI optimist (U-09)
  const handleDelete = useCallback((masa: Masa) => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
    setMealToDelete(masa);
  }, []);

  const confirmDeleteMeal = useCallback(async () => {
    if (!mealToDelete) return;
    const masa = mealToDelete;
    setIsDeletingMeal(true);

    const masaSalvata = masa;
    optimisticDeleteMeal(masa.id);

    const rollback = () => {
      optimisticAddMeal(masaSalvata);
      refresh();
    };

    try {
      const { error } = await supabase.from('mese').delete().eq('id', masa.id).eq('user_id', masa.user_id);
      if (error) {
        console.error('[Istoric] Stergere masa esuata:', error.message);
        rollback();
        showBanner({
          title: t('alerts.titluri.nuAmPututStergeMasa'),
          message: t('alerts.mesaje.incearcaDinNou'),
          type: 'error',
        });
      } else {
        if (masa.user_id) {
          marcheazaMeseModificate(masa.user_id);
        }
        await Promise.all([refresh(false, true), refreshZileCuMese()]);
        showBanner({
          title: t('jurnal.mealDeletedSuccess', { defaultValue: 'Masa a fost ștearsă din jurnal' }),
          type: 'success',
        });
      }
    } catch {
      rollback();
      showBanner({
        title: t('alerts.titluri.eroare'),
        message: t('alerts.mesaje.problemaConexiune'),
        type: 'error',
      });
    } finally {
      setIsDeletingMeal(false);
      setMealToDelete(null);
    }
  }, [mealToDelete, optimisticDeleteMeal, optimisticAddMeal, refresh, refreshZileCuMese, showBanner, t]);


  // 2. Deschidere Bottom Sheet pentru editare masă (mount amânat — REMED-029)
  const openEditModal = useCallback((masa: Masa) => {
    deschideAddMeal(masa);
  }, [deschideAddMeal]);

  // Detaliu masă — foaie Gorhom mereu montată, deschisă prin ref (fără flicker Modal).
  const openMasaDetail = useCallback((masa: Masa, alimentIdx?: number) => {
    mealDetailSheetRef.current?.open(masa, alimentIdx);
  }, []);

  // 3. Actualizare masă (editare ingredient din detaliu) + reconciliere verificată
  const handleUpdateMasa = useCallback(
    async (updated: Masa): Promise<boolean> => {
      const payload = {
        alimente: updated.alimente ?? [],
        calorii: updated.calorii,
        proteine: updated.proteine,
        carbohidrati: updated.carbohidrati,
        grasimi: updated.grasimi,
        fibre: updated.fibre ?? 0,
      };
      try {
        const { error, data } = await actualizeazaMasaCuPoza(supabase, updated.id, payload);
        if (error) {
          console.error('[Istoric] Actualizare masa esuata:', error.message);
          showBanner({
            title: t('alerts.titluri.eroareSalvare'),
            message: t('alerts.mesaje.eroareSalvareDinamica', { eroare: error.message }),
            type: 'error',
          });
          return false;
        }

        // Verifică dacă rândul chiar a fost actualizat (evită succes fals pe 0 rânduri)
        if (data && Array.isArray(data) && data.length === 0) {
          console.error('[Istoric] Actualizare masa: 0 randuri actualizate');
          showBanner({
            title: t('alerts.titluri.eroareSalvare'),
            message: t('alerts.mesaje.eroareSalvareDinamica', { eroare: 'Inregistrarea nu a fost gasita.' }),
            type: 'error',
          });
          return false;
        }

        if (updated.user_id) {
          marcheazaMeseModificate(updated.user_id);
        }
        // Reconciliere canonică: împrospătează datele jurnalului și calendarului
        await Promise.all([
          refresh(false, true),
          refreshZileCuMese(),
        ]);
        return true;
      } catch (err: any) {
        console.error('[Istoric] Eroare conexiune la actualizare masa:', err);
        showBanner({
          title: t('alerts.titluri.eroareSalvare'),
          message: t('alerts.mesaje.problemaConexiune'),
          type: 'error',
        });
        return false;
      }
    },
    [refresh, refreshZileCuMese, showBanner, t],
  );

  // BUG-029: listă aplatizată pentru FlashList — doar categoriile cu mese, în
  // ordinea afișării (antet, mese, „+ adaugă încă o masă”). Antetul și cardul
  // de rezumat păstrează animația de intrare (montează o singură dată).
  const listaJurnal = useMemo<ItemJurnal[]>(() => {
    if (!categoriiMeseList) return [];
    // REMED-025: EmptyState (ListEmptyComponent) apare DOAR când TOATE cele 4
    // categorii sunt goale. Cu mese într-o singură categorie, lista e construită
    // iar categoriile goale își păstrează antetul + butonul „Adaugă".
    const areMese = categoriiMeseList.some((cat) => cat.mese && cat.mese.length > 0);
    if (!areMese) return [];
    const items: ItemJurnal[] = [];
    let primul = true;
    for (const cat of categoriiMeseList) {
      if (cat.mese && cat.mese.length > 0) {
        items.push({ tip: 'header', cheie: `h-${cat.id}`, cat, primul });
        for (const m of cat.mese) items.push({ tip: 'masa', cheie: `m-${m.id}`, masa: m });
        items.push({ tip: 'addMore', cheie: `a-${cat.id}`, cat });
      } else {
        // BUG-029: categoria goală rămâne vizibilă cu butonul ei „Adaugă" — fără
        // regresie de UX pe o zi fără mese; doar aria de mese e virtualizată.
        items.push({ tip: 'empty', cheie: `e-${cat.id}`, cat, primul });
      }
      primul = false;
    }
    return items;
  }, [categoriiMeseList]);

  // PERF-005: fără entering per categorie — animațiile în cascadă re-porneau la
  // fiecare re-render al listei; FlashList nu animă itemele, doar antetul.
  // Atingerea antetului deschide CategorieDetailSheet (drill-down cu poze/detaliu).
  const renderSectionHeader = useCallback((cat: CategorieMasaGrupata, primul: boolean) => {
    const accent = accentCategorie(colors, cat);
    const afisatCategorie = totaluriPentruAfisare({
      calorii: cat.totalCalorii,
      proteine: cat.totalProteine,
      grasimi: cat.totalGrasimi,
      carbohidrati: cat.totalCarbohidrati,
      fibre: cat.totalFibre,
    });
    const label = getMealCategoryLabel(cat.id, t);
    return (
      <View style={[styles.sectionContainer, { marginTop: primul ? Spacing.sm : Spacing.xl, marginBottom: Spacing.md }]}>
        <TouchableOpacity
          style={[styles.sectionHeader, { borderColor: colors.cardBorder, backgroundColor: colors.surfaceBg }]}
          onPress={() => {
            try {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            } catch {}
            categorieSheetRef.current?.open(cat);
          }}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={t('jurnal.viewCategoryDetails', { label })}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md, flex: 1 }}>
            <CategorieIcona cat={cat} color={accent} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.sectionTitleText, { color: colors.textPrimary }]} numberOfLines={1} ellipsizeMode="tail">{label}</Text>
              <Text style={[styles.sectionSubtitleText, { color: colors.textSecondary }]}>
                {cat.mese.length === 1 ? t('jurnal.mealLogged') : t('jurnal.mealsLogged', { count: cat.mese.length })}
              </Text>
            </View>
          </View>
          <View style={styles.sectionMacrosSummary}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.xs }}>
              <Text style={[styles.sectionTotalCal, { color: accent }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{afisatCategorie.calorii} kcal</Text>
              <ChevronRight size={16} color={colors.textTertiary} />
            </View>
            <Text style={[styles.sectionTotalMacros, { color: colors.textTertiary }]}>
              P:{afisatCategorie.proteine}g • C:{afisatCategorie.carbohidrati}g • G:{afisatCategorie.grasimi}g • F:{afisatCategorie.fibre}g
            </Text>
          </View>
        </TouchableOpacity>
      </View>
    );
  }, [colors, t]);

  const renderCategorieGoala = useCallback((cat: CategorieMasaGrupata, primul: boolean) => {
    const accent = accentCategorie(colors, cat);
    const label = getMealCategoryLabel(cat.id, t);
    return (
      <View style={[styles.sectionContainer, { marginTop: primul ? Spacing.sm : Spacing.xl, marginBottom: Spacing.md }]}>
        <View style={[styles.sectionHeader, { borderColor: colors.cardBorder, backgroundColor: colors.surfaceBg }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md, flex: 1 }}>
            <CategorieIcona cat={cat} color={accent} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.sectionTitleText, { color: colors.textPrimary }]} numberOfLines={1} ellipsizeMode="tail">{label}</Text>
              <Text style={[styles.sectionSubtitleText, { color: colors.textSecondary }]}>{t('jurnal.noMealsAdded')}</Text>
            </View>
          </View>
          <TouchableOpacity
            style={[styles.discreteAddBtn, { borderColor: accent + '40', backgroundColor: accent + '15' }]}
            onPress={() => {
              try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
              deschideAddMeal(null, cat.id);
            }}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={t('jurnal.addCategory', { categorie: label, label })}
          >
            <PlusCircle size={15} color={accent} />
            <Text style={[styles.discreteAddBtnText, { color: accent }]}>{t('jurnal.addCategory', { categorie: label, label })}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }, [colors, deschideAddMeal, t]);

  const renderAddMore = useCallback((cat: CategorieMasaGrupata) => {
    const label = getMealCategoryLabel(cat.id, t);
    return (
      <View style={{ marginBottom: Spacing.sm }}>
        <TouchableOpacity
          style={[styles.addMoreCategoryBtn, { borderColor: colors.cardBorder }]}
          onPress={() => {
            try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
            deschideAddMeal(null, cat.id);
          }}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={t('jurnal.addAnotherTo', { categorie: label, label })}
        >
          <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '700' }}>
            + {t('jurnal.addAnotherTo', { categorie: label, label })}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }, [colors, deschideAddMeal, t]);

  const redareItem = useCallback((item: ItemJurnal) => {
    if (item.tip === 'header') return renderSectionHeader(item.cat, item.primul);
    if (item.tip === 'masa') {
      return (
        <MasaCard
          masa={item.masa}
          afisarePoze={afisarePoze}
          onPress={openMasaDetail}
          onEdit={openEditModal}
          onDelete={handleDelete}
        />
      );
    }
    if (item.tip === 'empty') return renderCategorieGoala(item.cat, item.primul);
    return renderAddMore(item.cat);
  }, [afisarePoze, openMasaDetail, openEditModal, handleDelete, renderSectionHeader, renderCategorieGoala, renderAddMore]);

  const keyExtractor = useCallback((item: ItemJurnal) => item.cheie, []);

  const renderHeader = () => (
    <>
      <Animated.View entering={reduceMotion ? undefined : FadeInDown.duration(500)} style={styles.header}>
        <View style={[styles.headerRow, { maxWidth: '100%' }]}>
          <Text
            maxFontSizeMultiplier={1.3}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.82}
            style={[styles.title, isVeryCompact && styles.titleCompact, { color: colors.textPrimary }]}
          >
            {t('jurnal.yourJournal')}
          </Text>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={[styles.addBtnHeader, styles.visibilityBtnHeader, { backgroundColor: 'rgba(255,255,255,0.05)', borderColor: colors.cardBorder }]}
              onPress={toggleAfisarePoze}
              accessibilityRole="button"
              accessibilityLabel={afisarePoze ? t('jurnal.hidePhotos') : t('jurnal.showPhotos')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              {afisarePoze ? <Eye size={18} color={colors.accent} /> : <EyeOff size={18} color={colors.textSecondary} />}
            </TouchableOpacity>
          </View>
        </View>
        
        {/* Calendar Lunar Interactiv */}
        <MonthCalendar 
          selectedDate={dataSelectata}
          onSelectDate={setDataSelectata}
          markedDates={zileCuMese}
        />

        {/* Selected Day Banner */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, backgroundColor: colors.accent + '15', borderRadius: Radius.md, borderWidth: 1, borderColor: colors.accent + '40', marginBottom: Spacing.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
            <Calendar size={16} color={colors.accent} />
            <Text style={{ color: colors.textPrimary, fontWeight: '800', fontSize: 15 }}>
              {formatDataTitlu()}
            </Text>
          </View>
          {!esteAzi && (
            <TouchableOpacity
              onPress={() => setDataSelectata(new Date())}
              hitSlop={{ top: 6, bottom: 6 }}
              style={{ backgroundColor: colors.accent, paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs, borderRadius: Radius.sm, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
              accessibilityRole="button"
              accessibilityLabel={t('jurnal.backToTodayA11y')}
            >
              <Text style={{ color: colors.textOnAccent, fontWeight: '800', fontSize: 12 }}>{t('jurnal.backToToday')}</Text>
            </TouchableOpacity>
          )}
        </View>
      </Animated.View>

      {/* Daily summary & MacroRing */}
      <Animated.View entering={reduceMotion ? undefined : FadeInDown.duration(600).delay(100)} style={[styles.summaryCard, { borderColor: colors.cardBorder }]}>
        <BlurView intensity={20} tint="dark" style={styles.summaryBlur}>
          <LinearGradient colors={[colors.accent + '12', 'rgba(0,0,0,0)']} style={styles.summaryGrad}>
            <Text maxFontSizeMultiplier={1.3} style={[styles.summaryLabel, { color: colors.textSecondary }]}>{t('jurnal.caloricSummary')}</Text>

            <View style={{ alignItems: 'center', marginVertical: Spacing.md }}>
              <MacroRing consumat={totalCalorii} tinta={caloriiTinta || 2000} size={150} strokeWidth={14} />
            </View>

            <View style={[styles.summaryRow, { marginTop: Spacing.lg }]}>
              <View style={styles.summaryItem}>
                <Flame size={20} color={colors.accent} />
                <Text style={[styles.summaryValue, { color: colors.textPrimary }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>{totalCalorii}</Text>
                <Text style={[styles.summaryUnit, { color: colors.textSecondary }]}>kcal</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <Activity size={20} color={colors.accentSecondary} />
                <Text style={[styles.summaryValue, { color: colors.textPrimary }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>{totalProteine}g</Text>
                <Text style={[styles.summaryUnit, { color: colors.textSecondary }]}>{t('jurnal.macroProtein')}</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <Utensils size={20} color={colors.accentTertiary} />
                <Text style={[styles.summaryValue, { color: colors.textPrimary }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>{mese.length}</Text>
                <Text style={[styles.summaryUnit, { color: colors.textSecondary }]}>{t('jurnal.mealsUnit')}</Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.addMealBtn, { backgroundColor: colors.accent }]}
              activeOpacity={0.85}
              onPress={() => {
                try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
                deschideAddMeal();
              }}
              accessibilityRole="button"
              accessibilityLabel={t('jurnal.addMeal')}
            >
              <Text maxFontSizeMultiplier={1.3} style={[styles.addMealBtnText, { color: colors.background }]}>{t('jurnal.addMeal')}</Text>
            </TouchableOpacity>
          </LinearGradient>
        </BlurView>
      </Animated.View>

      {/* Nutrient Focus / Health-Aware Journal */}
      <NutrientFocusCard mese={mese} />
    </>
  );

  // BUG-062: banner vizibil când fetch-ul jurnalului a eșuat — fără el, lista
  // goală ar părea că utilizatorul nu are mese (eșec silențios). Retry -> refresh.
  const eroareBanner = eroareFetch ? (
    <View
      style={[styles.eroareBanner, { backgroundColor: colors.dangerBg, borderColor: colors.dangerBorder }]}
      accessibilityRole="alert"
    >
      <AlertCircle size={18} color={colors.danger} style={{ marginRight: 8 }} />
      <Text style={[styles.eroareText, { color: colors.danger }]} maxFontSizeMultiplier={1.3}>
        {t('alerts.mesaje.problemaConexiune')}
      </Text>
      <TouchableOpacity
        onPress={() => refresh(false, true)}
        style={styles.eroareBtn}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel={t('chat.retry')}
      >
        <Text style={[styles.eroareBtnText, { color: colors.accent }]} maxFontSizeMultiplier={1.3}>
          {t('chat.retry')}
        </Text>
      </TouchableOpacity>
    </View>
  ) : null;

  // Track initial mount so we only display full-screen skeleton on cold boot
  const hasMountedOnceRef = useRef(false);
  useEffect(() => {
    if (!loading) {
      hasMountedOnceRef.current = true;
    }
  }, [loading]);

  // Skeleton Loader DOAR pe perioada încărcării inițiale (cold start)
  if (loading && !hasMountedOnceRef.current) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, paddingHorizontal: 20, paddingTop: topInset }]}>
        <View style={{ marginBottom: 20 }}>
          <SkeletonLoader width={180} height={36} borderRadius={8} style={{ marginBottom: 16 }} />
          <SkeletonLoader width="100%" height={54} borderRadius={18} style={{ marginBottom: 16 }} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
            {[1, 2, 3, 4, 5, 6, 7].map((i) => (
              <SkeletonLoader key={i} width={56} height={72} borderRadius={16} />
            ))}
          </ScrollView>
        </View>
        <SkeletonLoader width="100%" height={260} borderRadius={28} style={{ marginBottom: 24 }} />
        {[1, 2, 3, 4].map((i) => (
          <SkeletonLoader key={i} width="100%" height={110} borderRadius={24} style={{ marginBottom: 16 }} />
        ))}
      </View>
    );
  }

  return (
    <KeyboardAwareScreen style={[styles.container, { backgroundColor: colors.background }]}>
      <View pointerEvents="none" style={[styles.glowTop, { backgroundColor: colors.accentTertiary }]} />
      <View pointerEvents="none" style={[styles.glowBottom, { backgroundColor: colors.accent }]} />

      {/* JOURNAL-LAYOUT-001 / NAV-LAYOUT-001: paddingBottom pe wrapper-ul extern
          comprima ecranul și lăsa o zonă moartă deasupra barei de tab-uri.
          Mutăm spațierea inferioară în ListFooterComponent pe FlashList pentru ca
          lista să deruleze complet sub tab bar-ul translucid și ultimul element
          să fie 100% vizibil și accesibil. */}
      <View testID="journal-content-safe-area" style={{ flex: 1, width: '100%', maxWidth: 680, alignSelf: 'center', paddingLeft: horizontalPadding + insets.left, paddingRight: horizontalPadding + insets.right, paddingTop: scrollPaddingTop }}>
        <FlashList
          data={listaJurnal}
          keyExtractor={keyExtractor}
          renderItem={({ item }) => redareItem(item)}
          onRefresh={onRefresh}
          refreshing={false}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={<>{eroareBanner}{renderHeader()}</>}
          ListFooterComponent={<View style={{ height: scrollPaddingBottom }} />}
          ListEmptyComponent={
            eroareFetch ? (
              eroareBanner
            ) : loading ? (
              <View testID="journal-inline-loading" style={{ paddingVertical: 20, paddingHorizontal: 4 }}>
                {[1, 2, 3].map((i) => (
                  <SkeletonLoader key={i} width="100%" height={96} borderRadius={20} style={{ marginBottom: 12 }} />
                ))}
              </View>
            ) : (
              <EmptyState
                icon="utensils"
                title={t('jurnal.empty.title')}
                subtitle={t('jurnal.empty.subtitle')}
              />
            )
          }
        />
      </View>

      {/* Reusable Gorhom Bottom Sheet pentru Adăugare / Editare masă */}
      {/* S10: adăugare optimistă DOAR în ziua curentă — masa nouă are created_at = acum,
          deci aparține zilei de azi; pe alte zile ar apărea și ar dispărea la reconciliere. */}
      {/* REMED-029: montat doar după prima deschidere; argumentele așteaptă în
          mealSheetArgsRef și sunt consumate de effect-ul deschideAddMeal. */}
      {mealSheetMounted ? (
        <AddMealBottomSheet ref={mealSheetRef} onSuccess={refresh} onMasaCreata={esteAzi ? optimisticAddMeal : undefined} />
      ) : null}

      <MealDetailsSheet
        ref={mealDetailSheetRef}
        onUpdateMasa={handleUpdateMasa}
        onEdit={(m) => {
          mealDetailSheetRef.current?.close();
          openEditModal(m);
        }}
        onDelete={(m) => {
          mealDetailSheetRef.current?.close();
          handleDelete(m);
        }}
      />

      {/* Drill-down pe categorie: poze + ingrediente + detalii nutriționale */}
      <CategorieDetailSheet
        ref={categorieSheetRef}
        afisarePoze={afisarePoze}
        onPressMasa={openMasaDetail}
        onEditMasa={openEditModal}
        onDeleteMasa={handleDelete}
        onAddMasa={(tip) => deschideAddMeal(null, tip)}
        // F-12: lista vie, ca sheet-ul sa nu mai afiseze un instantaneu invechit
        // dupa stergerea/editarea unei mese din interiorul lui.
        categoriiLive={categoriiMeseList}
      />

      <ConfirmSheet
        visible={mealToDelete !== null}
        title={t('jurnal.confirmDeleteMealTitle')}
        message={mealToDelete ? t('jurnal.confirmDeleteMealMessage', { nume: mealToDelete.nume }) : ''}
        icon={<Trash2 size={24} color={colors.danger} />}
        destructive
        loading={isDeletingMeal}
        buttonLayout="horizontal"
        confirmLabel={t('alerts.butoane.sterge')}
        cancelLabel={t('alerts.butoane.anuleaza')}
        onCancel={() => {
          if (!isDeletingMeal) setMealToDelete(null);
        }}
        onConfirm={confirmDeleteMeal}
      />
    </KeyboardAwareScreen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  glowTop: { position: 'absolute', top: -150, right: -100, width: 350, height: 350, borderRadius: 175, opacity: 0.04 },
  glowBottom: { position: 'absolute', bottom: -100, left: -80, width: 300, height: 300, borderRadius: 150, opacity: 0.04 },

  header: { marginBottom: 20 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minWidth: 0 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexShrink: 0 },
  title: { flex: 1, minWidth: 0, marginRight: Spacing.sm, fontSize: 36, fontWeight: '900', letterSpacing: -0.5 },
  titleCompact: { fontSize: 30 },
  addBtnHeader: { flexDirection: 'row', alignItems: 'center', flexShrink: 1, gap: 6, paddingHorizontal: 14, paddingVertical: 8, minHeight: 44, borderRadius: 16, borderWidth: 1 },
  addBtnHeaderCompact: { paddingHorizontal: 10 },
  visibilityBtnHeader: { flexShrink: 0, paddingHorizontal: 12 },
  addBtnHeaderText: { fontSize: 13, fontWeight: '800' },

  // BUG-062: banner eroare la fetch-ul jurnalului (cu retry)
  eroareBanner: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 16 },
  eroareText: { flex: 1, fontSize: 13, fontWeight: '600' },
  eroareBtn: { marginLeft: 8, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  eroareBtnText: { fontSize: 13, fontWeight: '800' },

  // Summary card
  summaryCard: { width: '100%', maxWidth: 680, alignSelf: 'center', borderRadius: 28, overflow: 'hidden', borderWidth: 1, marginBottom: 24 },
  summaryBlur: { overflow: 'hidden' },
  summaryGrad: { padding: 24 },
  summaryLabel: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 16 },
  summaryRow: { flexDirection: 'row', alignItems: 'center' },
  summaryItem: { flex: 1, alignItems: 'center', gap: 6, minWidth: 0 },
  summaryValue: { fontSize: 26, fontWeight: '900', includeFontPadding: false, textAlign: 'center' },
  summaryUnit: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  summaryDivider: { width: 1, height: 60, backgroundColor: 'rgba(255,255,255,0.06)' },
  addMealBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, borderRadius: Radius.md, paddingVertical: Spacing.lg, marginTop: Spacing.xl },
  addMealBtnText: { fontSize: 15, fontWeight: '800' },

  // Grouped Sections
  sectionContainer: { marginBottom: 8 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderRadius: 20, borderWidth: 1 },
  sectionTitleText: { fontSize: 18, fontWeight: '800' },
  sectionSubtitleText: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  sectionMacrosSummary: { alignItems: 'flex-end' },
  sectionTotalCal: { fontSize: 16, fontWeight: '900' },
  sectionTotalMacros: { fontSize: 11, fontWeight: '600', marginTop: 2 },
  discreteAddBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1 },
  discreteAddBtnText: { fontSize: 12, fontWeight: '800' },
  addMoreCategoryBtn: { paddingVertical: 10, alignItems: 'center', justifyContent: 'center', borderRadius: 14, borderWidth: 1, borderStyle: 'dashed', marginTop: 4 },

  // Meal card & sub-items
  card: { borderRadius: 24, overflow: 'hidden', marginBottom: 16, borderWidth: 1 },
  cardGrad: { padding: 20 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  cardTitleRow: { flex: 1, marginRight: 12 },
  cardName: { fontSize: 18, fontWeight: '800', letterSpacing: -0.3, marginBottom: 6 },
  timeBadgeContainer: { flexDirection: 'row' },
  timeBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.05)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  timeText: { fontSize: 12, fontWeight: '600', marginLeft: 4 },

  actionButtons: { flexDirection: 'row', gap: 8 },
  actionBtn: { width: 34, height: 34, borderRadius: 10, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },

  subItemsContainer: { borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 6, marginBottom: 12 },
  subItemRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  subItemDot: { width: 6, height: 6, borderRadius: 3 },
  subItemName: { fontSize: 13, fontWeight: '700', flex: 1 },
  subItemGram: { fontSize: 12, fontWeight: '600' },
  subItemCal: { fontSize: 13, fontWeight: '800' },

  cardStats: { flexDirection: 'row', gap: 8 },
  cardStatItem: { flex: 1, borderRadius: 14, overflow: 'hidden' },
  cardStatBg: { paddingVertical: 12, paddingHorizontal: 4, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)', borderRadius: 14 },
  cardStatValue: { fontSize: 16, fontWeight: '900', marginBottom: 2 },
  cardStatLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
});
