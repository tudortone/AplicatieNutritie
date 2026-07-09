import React, { useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  FlatList,
  Platform,
  ScrollView,
  TextInput,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Dumbbell,
  Flame,
  Plus,
  Trash2,
  Trophy,
  Zap,
  Award,
  Search,
  CheckCircle2,
  ChevronRight,
  Clock,
  Sparkles,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { Colors, Radius, Spacing } from '../../constants/theme';
import { useTheme } from '../../context/ThemeContext';
import { useAntrenamente, Antrenament } from '../../hooks/useAntrenamente';
import { useGamificare } from '../../hooks/useGamificare';
import { useNotify } from '../../hooks/useNotify';
import { EXERCITII, CATEGORII, Categorie, Exercitiu } from '../../constants/exercitii';
import { AddWorkoutBottomSheet, AddWorkoutBottomSheetRef } from '../../components/AddWorkoutBottomSheet';

export default function AntrenamenteScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const notify = useNotify();

  const {
    antrenamente,
    totalCaloriiArse,
    numarAntrenamente,
    stergeAntrenament,
    refresh: refreshAntr,
  } = useAntrenamente();

  const {
    xpTotal,
    nivel,
    streak,
    questuriAzi,
    detaliiNivel,
    toateQuesturileCompletate,
    revendicaRecompensaZilnica,
    refreshGamificare,
  } = useGamificare();

  const bottomSheetRef = useRef<AddWorkoutBottomSheetRef>(null);

  const [selectedCategorie, setSelectedCategorie] = useState<Categorie | 'toate'>('toate');
  const [searchQuery, setSearchQuery] = useState('');

  useFocusEffect(
    useCallback(() => {
      refreshAntr();
      refreshGamificare();
    }, [refreshAntr, refreshGamificare])
  );

  const handleStergere = (item: Antrenament) => {
    Alert.alert(
      'Șterge antrenamentul',
      `Ești sigur că vrei să ștergi "${item.nume}" (-${item.calorii_arse} kcal)?`,
      [
        { text: 'Anulează', style: 'cancel' },
        {
          text: 'Șterge',
          style: 'destructive',
          onPress: async () => {
            try {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              await stergeAntrenament(item.id);
              notify.info('Șters', `Antrenamentul ${item.nume} a fost șters.`);
            } catch {}
          },
        },
      ]
    );
  };

  // Exerciții filtrate
  const exercitiiFiltrate = EXERCITII.filter((ex) => {
    if (selectedCategorie !== 'toate' && ex.categorie !== selectedCategorie) {
      return false;
    }
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase().trim();
      const matchNume = ex.nume.toLowerCase().includes(q);
      const matchGrupa = ex.grupe.some((g) => g.toLowerCase().includes(q));
      if (!matchNume && !matchGrupa) return false;
    }
    return true;
  });

  const getDificultatePillColor = (dif: string) => {
    switch (dif) {
      case 'usor':
        return Colors.success;
      case 'mediu':
        return Colors.warning;
      case 'greu':
        return Colors.danger;
      default:
        return Colors.accent;
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Header gamificat */}
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <View>
              <Text style={[styles.headerSub, { color: colors.accent }]}>ANTRENAMENTE & QUESTURI</Text>
              <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Sala ta NutriAI</Text>
            </View>

            <View style={styles.streakBadge}>
              <LinearGradient colors={colors.accentGradient} style={styles.streakGrad}>
                <Zap size={14} color={colors.background} />
                <Text style={[styles.streakText, { color: colors.background }]}>{streak} Zile</Text>
              </LinearGradient>
            </View>
          </View>

          {/* Card nivel și XP */}
          <View style={[styles.xpCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.xpHeaderRow}>
              <View style={styles.levelBadge}>
                <Award size={16} color={colors.accent} />
                <Text style={[styles.levelText, { color: colors.textPrimary }]}>
                  Nivel {detaliiNivel.nivel} — {detaliiNivel.titlu}
                </Text>
              </View>
              <Text style={[styles.xpTotalText, { color: colors.accentSecondary }]}>{xpTotal} XP total</Text>
            </View>

            <View style={styles.progressBarWrap}>
              <View
                style={[
                  styles.progressBarFill,
                  { width: `${detaliiNivel.procentNivel}%`, backgroundColor: colors.accent },
                ]}
              />
            </View>

            <View style={styles.xpProgressLabels}>
              <Text style={[styles.xpSubText, { color: colors.textTertiary }]}>
                Progres Nivel {detaliiNivel.nivel}
              </Text>
              <Text style={[styles.xpSubText, { color: colors.textTertiary }]}>
                {detaliiNivel.xpCurentInNivel} / {detaliiNivel.xpNecesarUrmatorulNivel} XP
              </Text>
            </View>
          </View>
        </View>

        {/* Card Rezumat Astăzi */}
        <View style={[styles.summaryCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.accent + '33' }]}>
            <View style={styles.summaryStatsRow}>
              <View style={styles.statBox}>
                <Flame size={20} color={colors.accent} />
                <Text style={[styles.statVal, { color: colors.textPrimary }]}>{totalCaloriiArse}</Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>kcal arse azi</Text>
            </View>

            <View style={[styles.statDivider, { backgroundColor: colors.border }]} />

            <View style={styles.statBox}>
              <Dumbbell size={20} color={colors.accentSecondary} />
              <Text style={[styles.statVal, { color: colors.textPrimary }]}>{numarAntrenamente}</Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>sesiuni azi</Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.addCustomBtn, { backgroundColor: colors.accent }]}
            activeOpacity={0.88}
            onPress={() => bottomSheetRef.current?.open()}
          >
            <Plus size={18} color={colors.background} />
            <Text style={[styles.addCustomBtnText, { color: colors.background }]}>Înregistrează antrenament rapid</Text>
          </TouchableOpacity>
        </View>

        {/* Secțiunea Obiectivele Zilei (Quests) */}
        <View style={styles.sectionWrap}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, { color: colors.textTertiary }]}>OBIECTIVELE ZILEI</Text>
            {toateQuesturileCompletate && (
              <TouchableOpacity
                onPress={revendicaRecompensaZilnica}
                style={[styles.bonusBtn, { backgroundColor: colors.accent + '20' }]}
              >
                <Sparkles size={14} color={colors.accent} />
                <Text style={[styles.bonusBtnText, { color: colors.accent }]}>Bonus complet</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.questList}>
            {questuriAzi.map((quest) => (
              <View
                key={quest.id}
                style={[
                  styles.questCard,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                  quest.completat && [styles.questCardDone, { borderColor: colors.accent + '44', backgroundColor: colors.accent + '0A' }],
                ]}
              >
                <View style={styles.questIconCol}>
                  {quest.completat ? (
                    <CheckCircle2 size={22} color={colors.accent} />
                  ) : (
                    <View style={[styles.questCircleEmpty, { borderColor: colors.textTertiary }]} />
                  )}
                </View>

                <View style={styles.questContent}>
                  <Text
                    style={[
                      styles.questDesc,
                      { color: colors.textPrimary },
                      quest.completat && [styles.questDescDone, { color: colors.textSecondary }],
                    ]}
                  >
                    {quest.descriere}
                  </Text>
                  <View style={styles.questBarWrap}>
                      <View
                        style={[
                          styles.questBarFill,
                          {
                            width: `${Math.min(
                              100,
                              (quest.progres / quest.tinta) * 100
                            )}%`,
                            backgroundColor: colors.accentSecondary,
                          },
                        ]}
                      />
                  </View>
                  <Text style={[styles.questProgressText, { color: colors.textTertiary }]}>
                    {quest.progres} / {quest.tinta} completat
                  </Text>
                </View>

                <View style={styles.questXpBadge}>
                  <Text style={[styles.questXpText, { color: colors.accent }]}>+{quest.xp} XP</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* Istoric Antrenamente de azi (dacă există) */}
        {antrenamente.length > 0 && (
          <View style={styles.sectionWrap}>
            <Text style={[styles.sectionTitle, { color: colors.textTertiary }]}>SESIUNI ÎNREGISTRATE AZI</Text>
            {antrenamente.map((item) => (
              <View key={item.id} style={[styles.historyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={[styles.historyIconWrap, { backgroundColor: colors.accent + '20' }]}>
                  <Dumbbell size={18} color={colors.accent} />
                </View>
                <View style={styles.historyInfo}>
                  <Text style={[styles.historyName, { color: colors.textPrimary }]}>{item.nume}</Text>
                  <Text style={[styles.historyMeta, { color: colors.textSecondary }]}>
                    {item.durata_min} min • arse ~{item.calorii_arse} kcal
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => handleStergere(item)}
                  style={styles.deleteBtn}
                >
                  <Trash2 size={18} color={colors.danger} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* Selector Categorii & Căutare Exerciții */}
        <View style={styles.sectionWrap}>
          <Text style={[styles.sectionTitle, { color: colors.textTertiary }]}>CATALOG EXERCIȚII ({exercitiiFiltrate.length})</Text>

          {/* Search Bar */}
          <View style={[styles.searchWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Search size={18} color={colors.textTertiary} />
            <TextInput
              style={[styles.searchInput, { color: colors.textPrimary }]}
              placeholder="Caută exercițiu sau grupă (ex: piept, flotări)..."
              placeholderTextColor={colors.textTertiary}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>

          {/* Categorii Chips horizontal */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipsScroll}
          >
            <TouchableOpacity
                onPress={() => setSelectedCategorie('toate')}
                style={[
                  styles.chip,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                  selectedCategorie === 'toate' && [styles.chipActive, { backgroundColor: colors.accent, borderColor: colors.accent }],
                ]}
              >
                <Text
                  style={[
                    styles.chipText,
                    { color: colors.textSecondary },
                    selectedCategorie === 'toate' && [styles.chipTextActive, { color: colors.background }],
                  ]}
                >
                  Toate
                </Text>
            </TouchableOpacity>

              {CATEGORII.map((cat) => (
                <TouchableOpacity
                  key={cat.id}
                  onPress={() => setSelectedCategorie(cat.id)}
                  style={[
                    styles.chip,
                    { backgroundColor: colors.surface, borderColor: colors.border },
                    selectedCategorie === cat.id && [styles.chipActive, { backgroundColor: colors.accent, borderColor: colors.accent }],
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: colors.textSecondary },
                      selectedCategorie === cat.id && [styles.chipTextActive, { color: colors.background }],
                    ]}
                  >
                    {cat.nume}
                  </Text>
                </TouchableOpacity>
              ))}
          </ScrollView>

          {/* Grid/Lista de Exerciții */}
          <View style={styles.exList}>
            {exercitiiFiltrate.map((ex) => (
              <TouchableOpacity
                key={ex.id}
                style={[styles.exCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                activeOpacity={0.78}
                onPress={() => router.push(`/exercitiu/${ex.id}` as any)}
              >
                <View style={styles.exIconCircle}>
                  <Dumbbell size={18} color={colors.accent} />
                </View>

                <View style={styles.exContent}>
                  <View style={styles.exHeaderRow}>
                    <Text style={[styles.exName, { color: colors.textPrimary }]} numberOfLines={1}>
                      {ex.nume}
                    </Text>
                    <View
                      style={[
                        styles.difPill,
                        { backgroundColor: `${getDificultatePillColor(ex.dificultate)}20` },
                      ]}
                    >
                      <Text
                        style={[
                          styles.difText,
                          { color: getDificultatePillColor(ex.dificultate) },
                        ]}
                      >
                        {ex.dificultate}
                      </Text>
                    </View>
                  </View>

                  <Text style={[styles.exMuscles, { color: colors.textSecondary }]} numberOfLines={1}>
                    Mușchi: {ex.grupe.join(', ')}
                  </Text>
                </View>

                <ChevronRight size={18} color={colors.textTertiary} />
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>

      <AddWorkoutBottomSheet ref={bottomSheetRef} onSuccess={refreshAntr} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Platform.OS === 'ios' ? 54 : 36,
    paddingBottom: 110,
  },
  header: {
    marginBottom: Spacing.lg,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  headerSub: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
  },
  streakBadge: {
    borderRadius: Radius.pill,
    overflow: 'hidden',
  },
  streakGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 6,
  },
  streakText: {
    fontSize: 13,
    fontWeight: '800',
  },
  xpCard: {
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
  },
  xpHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  levelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  levelText: {
    fontSize: 14,
    fontWeight: '700',
  },
  xpTotalText: {
    fontSize: 12,
    fontWeight: '600',
  },
  progressBarWrap: {
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
    marginBottom: 6,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  xpProgressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  xpSubText: {
    fontSize: 11,
  },
  summaryCard: {
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    marginBottom: Spacing.xl,
  },
  summaryStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  statBox: {
    alignItems: 'center',
    flex: 1,
  },
  statVal: {
    fontSize: 22,
    fontWeight: '800',
    marginTop: 4,
  },
  statLabel: {
    fontSize: 12,
  },
  statDivider: {
    width: 1,
    height: 36,
  },
  addCustomBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: Radius.md,
    paddingVertical: 12,
  },
  addCustomBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  sectionWrap: {
    marginBottom: Spacing.xl,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  bonusBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  bonusBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  questList: {
    gap: Spacing.sm,
  },
  questCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    gap: Spacing.md,
  },
  questCardDone: {
  },
  questIconCol: {
    width: 26,
    alignItems: 'center',
  },
  questCircleEmpty: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
  },
  questContent: {
    flex: 1,
  },
  questDesc: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
  },
  questDescDone: {
    textDecorationLine: 'line-through',
  },
  questBarWrap: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 4,
  },
  questBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  questProgressText: {
    fontSize: 11,
  },
  questXpBadge: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.sm,
  },
  questXpText: {
    fontSize: 12,
    fontWeight: '700',
  },
  historyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    marginBottom: Spacing.sm,
  },
  historyIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  historyInfo: {
    flex: 1,
  },
  historyName: {
    fontSize: 14,
    fontWeight: '700',
  },
  historyMeta: {
    fontSize: 12,
    marginTop: 2,
  },
  deleteBtn: {
    padding: Spacing.sm,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 14,
  },
  chipsScroll: {
    gap: Spacing.sm,
    paddingBottom: Spacing.md,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  chipActive: {
    borderWidth: 1,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  chipTextActive: {
  },
  exList: {
    gap: Spacing.sm,
  },
  exCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    gap: Spacing.md,
  },
  exIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  exContent: {
    flex: 1,
  },
  exHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  exName: {
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
    marginRight: 8,
  },
  difPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.sm,
  },
  difText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  exMuscles: {
    fontSize: 12,
    marginTop: 3,
  },
});
