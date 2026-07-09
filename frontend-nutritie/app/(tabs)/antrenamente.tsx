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
              <Text style={styles.headerSub}>ANTRENAMENTE & QUESTURI</Text>
              <Text style={styles.headerTitle}>Sala ta NutriAI</Text>
            </View>

            <View style={styles.streakBadge}>
              <LinearGradient colors={colors.accentGradient} style={styles.streakGrad}>
                <Zap size={14} color={Colors.background} />
                <Text style={styles.streakText}>{streak} Zile</Text>
              </LinearGradient>
            </View>
          </View>

          {/* Card nivel și XP */}
          <View style={styles.xpCard}>
            <View style={styles.xpHeaderRow}>
              <View style={styles.levelBadge}>
                <Award size={16} color={Colors.accent} />
                <Text style={styles.levelText}>
                  Nivel {detaliiNivel.nivel} — {detaliiNivel.titlu}
                </Text>
              </View>
              <Text style={styles.xpTotalText}>{xpTotal} XP total</Text>
            </View>

            <View style={styles.progressBarWrap}>
              <View
                style={[
                  styles.progressBarFill,
                  { width: `${detaliiNivel.procentNivel}%` },
                ]}
              />
            </View>

            <View style={styles.xpProgressLabels}>
              <Text style={styles.xpSubText}>
                Progres Nivel {detaliiNivel.nivel}
              </Text>
              <Text style={styles.xpSubText}>
                {detaliiNivel.xpCurentInNivel} / {detaliiNivel.xpNecesarUrmatorulNivel} XP
              </Text>
            </View>
          </View>
        </View>

        {/* Card Rezumat Astăzi */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryStatsRow}>
            <View style={styles.statBox}>
              <Flame size={20} color={Colors.accent} />
              <Text style={styles.statVal}>{totalCaloriiArse}</Text>
              <Text style={styles.statLabel}>kcal arse azi</Text>
            </View>

            <View style={styles.statDivider} />

            <View style={styles.statBox}>
              <Dumbbell size={20} color={Colors.accentSecondary} />
              <Text style={styles.statVal}>{numarAntrenamente}</Text>
              <Text style={styles.statLabel}>sesiuni azi</Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.addCustomBtn}
            activeOpacity={0.88}
            onPress={() => bottomSheetRef.current?.open()}
          >
            <Plus size={18} color={Colors.background} />
            <Text style={styles.addCustomBtnText}>Înregistrează antrenament rapid</Text>
          </TouchableOpacity>
        </View>

        {/* Secțiunea Obiectivele Zilei (Quests) */}
        <View style={styles.sectionWrap}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>OBIECTIVELE ZILEI</Text>
            {toateQuesturileCompletate && (
              <TouchableOpacity
                onPress={revendicaRecompensaZilnica}
                style={styles.bonusBtn}
              >
                <Sparkles size={14} color={Colors.accent} />
                <Text style={styles.bonusBtnText}>Bonus complet</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.questList}>
            {questuriAzi.map((quest) => (
              <View
                key={quest.id}
                style={[
                  styles.questCard,
                  quest.completat && styles.questCardDone,
                ]}
              >
                <View style={styles.questIconCol}>
                  {quest.completat ? (
                    <CheckCircle2 size={22} color={Colors.accent} />
                  ) : (
                    <View style={styles.questCircleEmpty} />
                  )}
                </View>

                <View style={styles.questContent}>
                  <Text
                    style={[
                      styles.questDesc,
                      quest.completat && styles.questDescDone,
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
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.questProgressText}>
                    {quest.progres} / {quest.tinta} completat
                  </Text>
                </View>

                <View style={styles.questXpBadge}>
                  <Text style={styles.questXpText}>+{quest.xp} XP</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* Istoric Antrenamente de azi (dacă există) */}
        {antrenamente.length > 0 && (
          <View style={styles.sectionWrap}>
            <Text style={styles.sectionTitle}>SESIUNI ÎNREGISTRATE AZI</Text>
            {antrenamente.map((item) => (
              <View key={item.id} style={styles.historyCard}>
                <View style={styles.historyIconWrap}>
                  <Dumbbell size={18} color={Colors.accent} />
                </View>
                <View style={styles.historyInfo}>
                  <Text style={styles.historyName}>{item.nume}</Text>
                  <Text style={styles.historyMeta}>
                    {item.durata_min} min • arse ~{item.calorii_arse} kcal
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => handleStergere(item)}
                  style={styles.deleteBtn}
                >
                  <Trash2 size={18} color={Colors.danger} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* Selector Categorii & Căutare Exerciții */}
        <View style={styles.sectionWrap}>
          <Text style={styles.sectionTitle}>CATALOG EXERCIȚII ({exercitiiFiltrate.length})</Text>

          {/* Search Bar */}
          <View style={styles.searchWrap}>
            <Search size={18} color={Colors.textTertiary} />
            <TextInput
              style={styles.searchInput}
              placeholder="Caută exercițiu sau grupă (ex: piept, flotări)..."
              placeholderTextColor={Colors.textTertiary}
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
                selectedCategorie === 'toate' && styles.chipActive,
              ]}
            >
              <Text
                style={[
                  styles.chipText,
                  selectedCategorie === 'toate' && styles.chipTextActive,
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
                  selectedCategorie === cat.id && styles.chipActive,
                ]}
              >
                <Text
                  style={[
                    styles.chipText,
                    selectedCategorie === cat.id && styles.chipTextActive,
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
                style={styles.exCard}
                activeOpacity={0.78}
                onPress={() => router.push(`/exercitiu/${ex.id}` as any)}
              >
                <View style={styles.exIconCircle}>
                  <Dumbbell size={18} color={Colors.accent} />
                </View>

                <View style={styles.exContent}>
                  <View style={styles.exHeaderRow}>
                    <Text style={styles.exName} numberOfLines={1}>
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

                  <Text style={styles.exMuscles} numberOfLines={1}>
                    Mușchi: {ex.grupe.join(', ')}
                  </Text>
                </View>

                <ChevronRight size={18} color={Colors.textTertiary} />
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
    color: Colors.accent,
    letterSpacing: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.textPrimary,
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
    color: Colors.background,
  },
  xpCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
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
    color: Colors.textPrimary,
  },
  xpTotalText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.accentSecondary,
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
    backgroundColor: Colors.accent,
    borderRadius: 4,
  },
  xpProgressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  xpSubText: {
    fontSize: 11,
    color: Colors.textTertiary,
  },
  summaryCard: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: `${Colors.accent}33`,
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
    color: Colors.textPrimary,
    marginTop: 4,
  },
  statLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  statDivider: {
    width: 1,
    height: 36,
    backgroundColor: Colors.border,
  },
  addCustomBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.accent,
    borderRadius: Radius.md,
    paddingVertical: 12,
  },
  addCustomBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.background,
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
    color: Colors.textTertiary,
    letterSpacing: 0.8,
  },
  bonusBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: `${Colors.accent}20`,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  bonusBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.accent,
  },
  questList: {
    gap: Spacing.sm,
  },
  questCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.md,
  },
  questCardDone: {
    borderColor: `${Colors.accent}44`,
    backgroundColor: `${Colors.accent}0A`,
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
    borderColor: Colors.textTertiary,
  },
  questContent: {
    flex: 1,
  },
  questDesc: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 6,
  },
  questDescDone: {
    textDecorationLine: 'line-through',
    color: Colors.textSecondary,
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
    backgroundColor: Colors.accentSecondary,
    borderRadius: 2,
  },
  questProgressText: {
    fontSize: 11,
    color: Colors.textTertiary,
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
    color: Colors.accent,
  },
  historyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.sm,
  },
  historyIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: `${Colors.accent}20`,
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
    color: Colors.textPrimary,
  },
  historyMeta: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  deleteBtn: {
    padding: Spacing.sm,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    color: Colors.textPrimary,
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
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  chipTextActive: {
    color: Colors.background,
  },
  exList: {
    gap: Spacing.sm,
  },
  exCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
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
    color: Colors.textPrimary,
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
    color: Colors.textSecondary,
    marginTop: 3,
  },
});
