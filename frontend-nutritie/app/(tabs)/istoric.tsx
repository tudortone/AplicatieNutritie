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
import { useFocusEffect } from 'expo-router';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInUp, FadeInDown, Layout } from 'react-native-reanimated';
import { Flame, Activity, Clock, Trash2, Pencil, PlusCircle } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useMeseAzi } from '../../hooks/useMeseAzi';
import { useTheme } from '../../context/ThemeContext';
import { supabase } from '../../supabase';
import { Masa } from '../../types';
import { FlashList } from '@shopify/flash-list';
import { SkeletonLoader } from '../../components/SkeletonLoader';
import { MacroRing } from '../../components/MacroRing';
import { AddMealBottomSheet, AddMealBottomSheetRef } from '../../components/AddMealBottomSheet';
import { MonthCalendar } from '../../components/MonthCalendar';

export default function HistoryScreen() {
  const { colors } = useTheme();
  const [dataSelectata, setDataSelectata] = useState(new Date());
  const mealSheetRef = useRef<AddMealBottomSheetRef>(null);

  const { 
    mese, 
    zileCuMese,
    totalCalorii, 
    totalProteine, 
    caloriiTinta,
    loading, 
    refresh 
  } = useMeseAzi(dataSelectata);


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

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const onRefresh = useCallback(async () => {
    await refresh();
  }, [refresh]);

  // 1. Ștergere masă cu confirmare
  const handleDelete = (masa: Masa) => {
    Alert.alert(
      "Ștergere masă",
      `Ești sigur că vrei să ștergi "${masa.nume}" din jurnal?`,
      [
        { text: "Anulează", style: "cancel" },
        {
          text: "Șterge",
          style: "destructive",
          onPress: async () => {
            try {
              const { error } = await supabase.from('mese').delete().eq('id', masa.id);
              if (error) {
                Alert.alert("Eroare", `Nu s-a putut șterge masa: ${error.message}`);
              } else {
                refresh();
              }
            } catch {
              Alert.alert("Eroare", "A apărut o problemă la conexiune.");
            }
          }
        }
      ]
    );
  };

  // 2. Deschidere Bottom Sheet pentru editare masă
  const openEditModal = (masa: Masa) => {
    mealSheetRef.current?.open(masa);
  };

  const renderMasaItem = ({ item: masa, index }: { item: Masa; index: number }) => (
    <Animated.View
      entering={FadeInUp.duration(400).delay((index % 10) * 50).springify()}
      layout={Layout.springify()}
    >
      <BlurView intensity={20} tint="dark" style={[styles.card, { borderColor: colors.cardBorder }]}>
        <LinearGradient colors={[colors.cardBg, 'rgba(0,0,0,0)']} style={styles.cardGrad}>
          <View style={styles.cardHeader}>
            <View style={styles.cardTitleRow}>
              <Text style={[styles.cardName, { color: colors.textPrimary }]}>{masa.nume}</Text>
              <View style={styles.timeBadgeContainer}>
                <View style={styles.timeBadge}>
                  <Clock size={12} color={colors.textSecondary} />
                  <Text style={[styles.timeText, { color: colors.textSecondary }]}>{new Date(masa.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                </View>
              </View>
            </View>

            {/* Butoane Editare & Ștergere */}
            <View style={styles.actionButtons}>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: colors.accentSecondary + '20', borderColor: colors.accentSecondary + '40' }]}
                onPress={() => openEditModal(masa)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Pencil size={15} color={colors.accentSecondary} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: colors.danger + '20', borderColor: colors.danger + '40' }]}
                onPress={() => handleDelete(masa)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Trash2 size={15} color={colors.danger} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.cardStats}>
            <View style={styles.cardStatItem}>
              <LinearGradient colors={[colors.accent + '25', 'rgba(0,0,0,0)']} style={styles.cardStatBg}>
                <Text style={[styles.cardStatValue, { color: colors.accent }]}>{masa.calorii || 0}</Text>
                <Text style={[styles.cardStatLabel, { color: colors.textSecondary }]}>kcal</Text>
              </LinearGradient>
            </View>
            <View style={styles.cardStatItem}>
              <LinearGradient colors={[colors.accentSecondary + '25', 'rgba(0,0,0,0)']} style={styles.cardStatBg}>
                <Text style={[styles.cardStatValue, { color: colors.accentSecondary }]}>{masa.proteine || 0}g</Text>
                <Text style={[styles.cardStatLabel, { color: colors.textSecondary }]}>proteine</Text>
              </LinearGradient>
            </View>
            <View style={styles.cardStatItem}>
              <LinearGradient colors={[colors.accentTertiary + '1A', 'rgba(0,0,0,0)']} style={styles.cardStatBg}>
                <Text style={[styles.cardStatValue, { color: colors.accentTertiary }]}>{masa.carbohidrati != null ? masa.carbohidrati : '—'}{masa.carbohidrati != null ? 'g' : ''}</Text>
                <Text style={[styles.cardStatLabel, { color: colors.textSecondary }]}>carbs</Text>
              </LinearGradient>
            </View>
            <View style={styles.cardStatItem}>
              <LinearGradient colors={[colors.warning + '1A', 'rgba(0,0,0,0)']} style={styles.cardStatBg}>
                <Text style={[styles.cardStatValue, { color: colors.warning }]}>{masa.grasimi != null ? masa.grasimi : '—'}{masa.grasimi != null ? 'g' : ''}</Text>
                <Text style={[styles.cardStatLabel, { color: colors.textSecondary }]}>grăsimi</Text>
              </LinearGradient>
            </View>
          </View>
        </LinearGradient>
      </BlurView>
    </Animated.View>
  );

  const renderHeader = () => (
    <>
      <Animated.View entering={FadeInDown.duration(500)} style={styles.header}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Jurnalul tău</Text>
          <TouchableOpacity 
            style={[styles.addBtnHeader, { backgroundColor: colors.accent + '20', borderColor: colors.accent + '40' }]}
            onPress={() => mealSheetRef.current?.open()}
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
            <TouchableOpacity onPress={() => setDataSelectata(new Date())} style={{ backgroundColor: colors.accent, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 }}>
              <Text style={{ color: '#000', fontWeight: '800', fontSize: 12 }}>Revino la azi</Text>
            </TouchableOpacity>
          )}
        </View>
      </Animated.View>

      {/* 3.3 Daily summary & MacroRing personalizat */}
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
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                mealSheetRef.current?.open();
              }}
            >
              <Text style={[styles.addMealBtnText, { color: colors.background }]}>Adaugă masă</Text>
            </TouchableOpacity>
          </LinearGradient>
        </BlurView>
      </Animated.View>
    </>
  );

  const renderEmpty = () => (
    <Animated.View entering={FadeInUp.duration(600).delay(200)} style={styles.emptyState}>
      <View style={styles.emptyIcon}>
        <LinearGradient colors={[colors.accent + '1A', 'rgba(0,0,0,0)']} style={[styles.emptyIconGrad, { borderColor: colors.accent + '1A' }]}>
          <Text style={{ fontSize: 48 }}>🍽️</Text>
        </LinearGradient>
      </View>
      <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>Nicio masă azi.</Text>
      <Text style={[styles.emptySub, { color: colors.textSecondary }]}>Apasă + ca să adaugi prima masă.</Text>
      <TouchableOpacity 
        style={[styles.emptyAddBtn, { backgroundColor: colors.accent }]}
        activeOpacity={0.85}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          mealSheetRef.current?.open();
        }}
      >
        <Text style={styles.emptyAddBtnText}>+ Adaugă Masă Acum</Text>
      </TouchableOpacity>
    </Animated.View>
  );

  // 3.2 Skeleton Loader în loc de ActivityIndicator
  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 60 : 40 }]}>
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
        {[1, 2, 3].map((i) => (
          <SkeletonLoader key={i} width="100%" height={110} borderRadius={24} style={{ marginBottom: 16 }} />
        ))}
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.glowTop, { backgroundColor: colors.accentTertiary }]} />
      <View style={[styles.glowBottom, { backgroundColor: colors.accent }]} />

      <View style={{ flex: 1 }}>
        <FlashList
          data={mese}
          renderItem={renderMasaItem}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={renderHeader}
          ListEmptyComponent={renderEmpty}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scroll}
          refreshControl={
            <RefreshControl refreshing={false} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.accent]} />
          }
        />
      </View>

      {/* Reusable Gorhom Bottom Sheet pentru Adăugare / Editare masă */}
      <AddMealBottomSheet ref={mealSheetRef} onSuccess={refresh} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  glowTop: { position: 'absolute', top: -150, right: -100, width: 350, height: 350, borderRadius: 175, opacity: 0.04 },
  glowBottom: { position: 'absolute', bottom: -100, left: -80, width: 300, height: 300, borderRadius: 150, opacity: 0.04 },

  scroll: { paddingTop: Platform.OS === 'ios' ? 48 : 28, paddingHorizontal: 20, paddingBottom: Math.max(Platform.OS === 'ios' ? 160 : 110, 110) },

  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, fontSize: 15, fontWeight: '500' },

  header: { marginBottom: 20 },
  title: { fontSize: 36, fontWeight: '900', letterSpacing: -0.5 },
  addBtnHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, borderWidth: 1 },
  addBtnHeaderText: { fontSize: 13, fontWeight: '800' },

  // Date Nav Bar
  dateNavContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 18, borderWidth: 1, marginTop: 14, paddingVertical: 10, paddingHorizontal: 14 },
  dateNavBtn: { width: 42, height: 42, borderRadius: 12, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)' },
  dateNavArrow: { fontSize: 20, fontWeight: '800' },
  dateNavCenter: { alignItems: 'center', flex: 1 },
  dateNavTitle: { fontSize: 16, fontWeight: '800', textTransform: 'capitalize' },
  dateNavReset: { fontSize: 11, fontWeight: '700', marginTop: 2 },

  // Calendar
  calendarContainer: { marginTop: 14, marginBottom: 8 },
  calendarScroll: { gap: 10, paddingVertical: 4 },
  calendarDayCard: { width: 56, height: 72, borderRadius: 16, borderWidth: 1, justifyContent: 'center', alignItems: 'center', padding: 6, position: 'relative' },
  calendarDayName: { fontSize: 11, fontWeight: '700', marginBottom: 4 },
  calendarDayNum: { fontSize: 18, fontWeight: '800' },
  todayDot: { width: 6, height: 6, borderRadius: 3, position: 'absolute', bottom: 6 },

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

  // Empty state
  emptyState: { alignItems: 'center', marginTop: 40, paddingHorizontal: 32 },
  emptyIcon: { marginBottom: 24, borderRadius: 40, overflow: 'hidden' },
  emptyIconGrad: { width: 100, height: 100, borderRadius: 40, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },
  emptyTitle: { fontSize: 22, fontWeight: '900', marginBottom: 10 },
  emptySub: { fontSize: 15, textAlign: 'center', lineHeight: 22, marginBottom: 20 },
  emptyAddBtn: { paddingHorizontal: 24, paddingVertical: 14, borderRadius: 18 },
  emptyAddBtnText: { color: '#000', fontWeight: '900', fontSize: 16 },

  // Meal card
  card: { borderRadius: 24, overflow: 'hidden', marginBottom: 16, borderWidth: 1 },
  cardGrad: { padding: 20 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  cardTitleRow: { flex: 1, marginRight: 12 },
  cardName: { fontSize: 18, fontWeight: '800', letterSpacing: -0.3, marginBottom: 6 },
  timeBadgeContainer: { flexDirection: 'row' },
  timeBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.05)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  timeText: { fontSize: 12, fontWeight: '600', marginLeft: 4 },

  actionButtons: { flexDirection: 'row', gap: 8 },
  actionBtn: { width: 34, height: 34, borderRadius: 10, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },

  cardStats: { flexDirection: 'row', gap: 8 },
  cardStatItem: { flex: 1, borderRadius: 14, overflow: 'hidden' },
  cardStatBg: { paddingVertical: 12, paddingHorizontal: 4, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)', borderRadius: 14 },
  cardStatValue: { fontSize: 16, fontWeight: '900', marginBottom: 2 },
  cardStatLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
});
