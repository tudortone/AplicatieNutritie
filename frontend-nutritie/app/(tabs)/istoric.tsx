
import React, { useCallback, useState, useRef } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  RefreshControl, 
  Platform, 
  TouchableOpacity, 
  Alert 
} from 'react-native';
import { useFocusRefresh } from '../../hooks/useFocusRefresh';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInUp, FadeInDown, Layout } from 'react-native-reanimated';
import { Flame, Activity, Clock, Trash2, Pencil, PlusCircle } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useMeseAzi } from '../../hooks/useMeseAzi';
import { useZileCuMese } from '../../hooks/useZileCuMese';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../context/ThemeContext';
import { supabase } from '../../supabase';
import { Masa, TipMasa, AlimentDetaliat } from '../../types';
import { SkeletonLoader } from '../../components/SkeletonLoader';
import { MacroRing } from '../../components/MacroRing';
import { AddMealBottomSheet, AddMealBottomSheetRef } from '../../components/AddMealBottomSheet';
import { MonthCalendar } from '../../components/MonthCalendar';
import { MealDetailsModal } from '../../components/MealDetailsModal';
import { MasaCard } from '../../components/MasaCard';
import KeyboardAwareScreen, { CONTENT_BOTTOM_PADDING } from '@/components/ui/KeyboardAwareScreen';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';

export default function HistoryScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [dataSelectata, setDataSelectata] = useState(new Date());
  const [selectedMasaDetail, setSelectedMasaDetail] = useState<Masa | null>(null);
  const mealSheetRef = useRef<AddMealBottomSheetRef>(null);
  const { topInset, scrollPaddingTop, scrollPaddingBottom } = useResponsiveLayout();

  const {
    mese,
    categoriiMeseList,
    totalCalorii,
    totalProteine,
    caloriiTinta,
    loading,
    refresh
  } = useMeseAzi(dataSelectata);
  const { zileCuMese, refreshZileCuMese } = useZileCuMese();

  const esteAzi = new Date().toDateString() === dataSelectata.toDateString();
  const esteIeri = (() => {
    const ieri = new Date();
    ieri.setDate(ieri.getDate() - 1);
    return ieri.toDateString() === dataSelectata.toDateString();
  })();

  const formatDataTitlu = () => {
    if (esteAzi) return "Astăzi";
    if (esteIeri) return "Ieri";
    return dataSelectata.toLocaleDateString('ro-RO', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  useFocusRefresh(
    () => {
      refresh(true);
      refreshZileCuMese();
    },
    5000,
    [refresh, refreshZileCuMese],
  );

  const onRefresh = useCallback(async () => {
    await Promise.all([refresh(false, true), refreshZileCuMese()]);
  }, [refresh, refreshZileCuMese]);

  // 1. Ștergere masă cu confirmare
  const handleDelete = (masa: Masa) => {
    Alert.alert(
      t('alerts.titluri.stergereMasa'),
      t('alerts.mesaje.confirmareStergere', { nume: masa.nume }),
      [
        { text: t('alerts.butoane.anuleaza'), style: "cancel" },
        {
          text: t('alerts.butoane.sterge'),
          style: "destructive",
          onPress: async () => {
            try {
              const { error } = await supabase.from('mese').delete().eq('id', masa.id).eq('user_id', masa.user_id);
              if (error) {
                console.error("[Istoric] Stergere masa esuata:", error.message);
                // FIX UI: utilizatorul vedea mesajul brut de la Postgres.
                Alert.alert(t('alerts.titluri.nuAmPututStergeMasa'), t('alerts.mesaje.incearcaDinNou'));
              } else {
                refresh();
              }
            } catch {
              Alert.alert(t('alerts.titluri.eroare'), t('alerts.mesaje.problemaConexiune'));
            }
          }
        }
      ]
    );
  };

  // 2. Deschidere Bottom Sheet pentru editare masă
  const openEditModal = useCallback((masa: Masa) => {
    mealSheetRef.current?.open(masa);
  }, []);

  const renderGroupedSections = () => {
    if (!categoriiMeseList) return null;

    return (
      <View style={{ gap: 24, marginTop: 8 }}>
        {categoriiMeseList.map((cat, catIndex) => {
          const hasMeals = cat.mese && cat.mese.length > 0;
          if (!hasMeals) return null;

          return (
            <Animated.View
              key={cat.id}
              entering={FadeInDown.duration(500).delay(catIndex * 80)}
              style={styles.sectionContainer}
            >
              {/* Header Categorie */}
              <View style={[styles.sectionHeader, { borderColor: colors.cardBorder, backgroundColor: colors.surfaceBg }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                  <Text style={{ fontSize: 26 }}>{cat.icon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.sectionTitleText, { color: colors.textPrimary }]} numberOfLines={1} ellipsizeMode="tail">{cat.label}</Text>
                    <Text style={[styles.sectionSubtitleText, { color: colors.textSecondary }]}>
                      {hasMeals ? `${cat.mese.length} ${cat.mese.length === 1 ? 'masă înregistrată' : 'mese înregistrate'}` : 'Nicio masă adăugată'}
                    </Text>
                  </View>
                </View>

                {hasMeals ? (
                  <View style={styles.sectionMacrosSummary}>
                    <Text style={[styles.sectionTotalCal, { color: colors.accent }]}>{cat.totalCalorii} kcal</Text>
                    <Text style={[styles.sectionTotalMacros, { color: colors.textTertiary }]}>
                      P:{cat.totalProteine}g • C:{cat.totalCarbohidrati}g • G:{cat.totalGrasimi}g
                    </Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[styles.discreteAddBtn, { borderColor: colors.accent + '40', backgroundColor: colors.accent + '15' }]}
                    onPress={() => {
                      try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
                      mealSheetRef.current?.open(null, cat.id);
                    }}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel={`Adaugă ${cat.label}`}
                  >
                    <PlusCircle size={15} color={colors.accent} />
                    <Text style={[styles.discreteAddBtnText, { color: colors.accent }]}>Adaugă {cat.label}</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Lista mese din categorie sau buton adăugare suplimentar */}
              {hasMeals ? (
                <View style={{ marginTop: 12 }}>
                  {cat.mese.map((m) => (
                    <MasaCard
                      key={m.id}
                      masa={m}
                      onPress={setSelectedMasaDetail}
                      onEdit={openEditModal}
                      onDelete={handleDelete}
                    />
                  ))}

                  <TouchableOpacity
                    style={[styles.addMoreCategoryBtn, { borderColor: colors.cardBorder }]}
                    onPress={() => {
                      try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
                      mealSheetRef.current?.open(null, cat.id);
                    }}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={`Adaugă încă o masă la ${cat.label}`}
                  >
                    <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '700' }}>
                      + Adaugă încă o masă la {cat.label}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </Animated.View>
          );
        })}
      </View>
    );
  };

  const renderHeader = () => (
    <>
      <Animated.View entering={FadeInDown.duration(500)} style={styles.header}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Jurnalul tău</Text>
          <TouchableOpacity
            style={[styles.addBtnHeader, { backgroundColor: colors.accent + '20', borderColor: colors.accent + '40' }]}
            onPress={() => mealSheetRef.current?.open()}
            accessibilityRole="button"
            accessibilityLabel="Adaugă o masă"
          >
            <PlusCircle size={18} color={colors.accent} />
            <Text style={[styles.addBtnHeaderText, { color: colors.accent }]}>Adaugă</Text>
          </TouchableOpacity>
        </View>
        
        {/* Calendar Lunar Interactiv */}
        <MonthCalendar 
          selectedDate={dataSelectata}
          onSelectDate={setDataSelectata}
          markedDates={zileCuMese}
        />

        {/* Selected Day Banner */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: colors.accent + '15', borderRadius: 14, borderWidth: 1, borderColor: colors.accent + '40', marginBottom: 16 }}>
          <Text style={{ color: colors.textPrimary, fontWeight: '800', fontSize: 15 }}>
            📅 {formatDataTitlu()}
          </Text>
          {!esteAzi && (
            <TouchableOpacity onPress={() => setDataSelectata(new Date())} style={{ backgroundColor: colors.accent, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 }} accessibilityRole="button" accessibilityLabel="Revino la ziua de azi">
              <Text style={{ color: '#000', fontWeight: '800', fontSize: 12 }}>Revino la azi</Text>
            </TouchableOpacity>
          )}
        </View>
      </Animated.View>

      {/* Daily summary & MacroRing */}
      <Animated.View entering={FadeInDown.duration(600).delay(100)} style={[styles.summaryCard, { borderColor: colors.cardBorder }]}>
        <BlurView intensity={20} tint="dark" style={styles.summaryBlur}>
          <LinearGradient colors={[colors.accent + '12', 'rgba(0,0,0,0)']} style={styles.summaryGrad}>
            <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>REZUMAT CALORIC & MACRO</Text>
            
            <View style={{ alignItems: 'center', marginVertical: 12 }}>
              <MacroRing consumat={totalCalorii} tinta={caloriiTinta || 2000} size={150} strokeWidth={14} />
            </View>

            <View style={[styles.summaryRow, { marginTop: 16 }]}>
              <View style={styles.summaryItem}>
                <Flame size={20} color={colors.accent} />
                <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>{totalCalorii}</Text>
                <Text style={[styles.summaryUnit, { color: colors.textSecondary }]}>kcal</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <Activity size={20} color={colors.accentSecondary} />
                <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>{totalProteine}g</Text>
                <Text style={[styles.summaryUnit, { color: colors.textSecondary }]}>proteine</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <Text style={styles.summaryEmoji}>🍽️</Text>
                <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>{mese.length}</Text>
                <Text style={[styles.summaryUnit, { color: colors.textSecondary }]}>mese</Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.addMealBtn, { backgroundColor: colors.accent }]}
              activeOpacity={0.85}
              onPress={() => {
                try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
                mealSheetRef.current?.open();
              }}
              accessibilityRole="button"
              accessibilityLabel="Adaugă masă"
            >
              <Text style={[styles.addMealBtnText, { color: colors.background }]}>Adaugă masă</Text>
            </TouchableOpacity>
          </LinearGradient>
        </BlurView>
      </Animated.View>
    </>
  );

  // Skeleton Loader pe perioada încărcării
  if (loading) {
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
      <View style={[styles.glowTop, { backgroundColor: colors.accentTertiary }]} />
      <View style={[styles.glowBottom, { backgroundColor: colors.accent }]} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingTop: scrollPaddingTop, paddingBottom: scrollPaddingBottom }]}
        refreshControl={
          <RefreshControl refreshing={false} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.accent]} />
        }
      >
        {renderHeader()}
        {renderGroupedSections()}
      </ScrollView>

      {/* Reusable Gorhom Bottom Sheet pentru Adăugare / Editare masă */}
      <AddMealBottomSheet ref={mealSheetRef} onSuccess={refresh} />

      <MealDetailsModal
        visible={!!selectedMasaDetail}
        masa={selectedMasaDetail}
        onClose={() => setSelectedMasaDetail(null)}
        onEdit={(m) => {
          setSelectedMasaDetail(null);
          openEditModal(m);
        }}
        onDelete={(m) => {
          setSelectedMasaDetail(null);
          handleDelete(m);
        }}
      />
    </KeyboardAwareScreen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  glowTop: { position: 'absolute', top: -150, right: -100, width: 350, height: 350, borderRadius: 175, opacity: 0.04 },
  glowBottom: { position: 'absolute', bottom: -100, left: -80, width: 300, height: 300, borderRadius: 150, opacity: 0.04 },

  scroll: { paddingHorizontal: 20 },

  header: { marginBottom: 20 },
  title: { fontSize: 36, fontWeight: '900', letterSpacing: -0.5 },
  addBtnHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, borderWidth: 1 },
  addBtnHeaderText: { fontSize: 13, fontWeight: '800' },

  // Summary card
  summaryCard: { borderRadius: 28, overflow: 'hidden', borderWidth: 1, marginBottom: 24 },
  summaryBlur: { overflow: 'hidden' },
  summaryGrad: { padding: 24 },
  summaryLabel: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 16 },
  summaryRow: { flexDirection: 'row', alignItems: 'center' },
  summaryItem: { flex: 1, alignItems: 'center', gap: 6 },
  summaryValue: { fontSize: 26, fontWeight: '900' },
  summaryUnit: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  summaryDivider: { width: 1, height: 60, backgroundColor: 'rgba(255,255,255,0.06)' },
  summaryEmoji: { fontSize: 20 },
  addMealBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, paddingVertical: 14, marginTop: 20 },
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
  cardStatLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
});
