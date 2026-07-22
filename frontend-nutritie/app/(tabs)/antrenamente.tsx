import React, { useRef, useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Modal,
  Platform,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useFocusRefresh } from '../../hooks/useFocusRefresh';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import {
  Dumbbell,
  Flame,
  Plus,
  Trash2,
  Zap,
  Award,
  Search,
  CheckCircle2,
  ChevronRight,
  Sparkles,
  Eye,
  X,
  Star,
  Clock,
  Activity,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { Radius, Spacing } from '../../constants/theme';
import { useTheme } from '../../context/ThemeContext';
import { useAntrenamente, Antrenament } from '../../hooks/useAntrenamente';
import { useGamificare } from '../../hooks/useGamificare';
import { useNotify } from '../../hooks/useNotify';
import { EXERCITII, CATEGORII, Categorie } from '../../constants/exercitii';
import { WorkoutTimerBar } from '../../components/fitness/WorkoutTimerBar';
import { ConfirmSheet } from '../../components/ui/ConfirmSheet';
import { BodyHeatmap } from '../../components/fitness/BodyHeatmap';
import { normalizeMuscleLoadToIntensity } from '../../lib/fitnessEngine';

import { MuscleBody, MuscleView } from '../../components/fitness/MuscleBody';
import MuscleMapFront from '../../components/MuscleMapFront';
import MuscleMapBack from '../../components/MuscleMapBack';
import RankProgressBar from '../../components/fitness/RankProgressBar';
import { useDailyReset } from '../../hooks/useDailyReset';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';

const MODERN_COLORS = {
  bg: '#071218',
  surface: '#0D2028',
  border: 'rgba(0,191,255,0.15)',
  cyan: '#00BFFF',
  cyanSoft: 'rgba(0,191,255,0.1)',
  textPrimary: '#FFFFFF',
  textSecondary: '#A0B4C0',
  textTertiary: '#647A88',
  gold: '#FFD700',
  danger: '#FF4D4D',
};

const RANKS_INFO = [
  { tier: 'F', title: 'Novice Lifter', minKg: 0, maxKg: 1000, stars: 0 },
  { tier: 'E', title: 'Iron Rookie', minKg: 1000, maxKg: 5000, stars: 1 },
  { tier: 'D', title: 'Gym Challenger', minKg: 5000, maxKg: 15000, stars: 2 },
  { tier: 'C', title: 'Bronze Warrior', minKg: 15000, maxKg: 35000, stars: 2 },
  { tier: 'B', title: 'Silver Gladiator', minKg: 35000, maxKg: 75000, stars: 3 },
  { tier: 'A', title: 'Elite Gold Lifter', minKg: 75000, maxKg: 150000, stars: 4 },
  { tier: 'S', title: 'Master Beast', minKg: 150000, maxKg: 300000, stars: 5 },
  { tier: 'SS', title: 'GOD OF IRON', minKg: 300000, maxKg: 10000000, stars: 5 },
];

function getRankData(kg: number) {
  for (let i = RANKS_INFO.length - 1; i >= 0; i--) {
    if (kg >= RANKS_INFO[i].minKg) {
      const current = RANKS_INFO[i];
      const next = RANKS_INFO[Math.min(i + 1, RANKS_INFO.length - 1)];
      const rankLabel = `Rank ${current.tier} • ${current.title}`;
      const nextRankLabel = current.tier === 'SS' ? 'APEX TITAN' : `Rank ${next.tier} (${next.title})`;
      return {
        rankLabel,
        nextRankLabel,
        nextRankKg: next.minKg || 1000,
        stars: current.stars,
        tier: current.tier,
        title: current.title,
      };
    }
  }
  return {
    rankLabel: 'Rank F • Novice Lifter',
    nextRankLabel: 'Rank E (Iron Rookie)',
    nextRankKg: 1000,
    stars: 0,
    tier: 'F',
    title: 'Novice Lifter',
  };
}

const ClashRoyaleResetBanner = () => {
  const [timeLeft, setTimeLeft] = useState('');
  const [progressPct, setProgressPct] = useState(0);

  useEffect(() => {
    const updateTimer = () => {
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
      const diff = tomorrow.getTime() - now.getTime();
      const totalDayMs = tomorrow.getTime() - startOfDay.getTime();
      const elapsedMs = now.getTime() - startOfDay.getTime();

      const h = Math.floor((diff / (1000 * 60 * 60)) % 24).toString().padStart(2, '0');
      const m = Math.floor((diff / 1000 / 60) % 60).toString().padStart(2, '0');
      const s = Math.floor((diff / 1000) % 60).toString().padStart(2, '0');
      setTimeLeft(`${h}h ${m}m ${s}s`);

      const pct = Math.min(100, Math.max(0, (elapsedMs / totalDayMs) * 100));
      setProgressPct(pct);
    };

    updateTimer();
    const timer = setInterval(updateTimer, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <View style={styles.clashBannerCard}>
      <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFillObject} />
      <LinearGradient
        colors={['rgba(255, 215, 0, 0.12)', 'rgba(0, 191, 255, 0.08)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={styles.clashBannerHeader}>
        <View style={styles.clashIconWrap}>
          <Clock size={16} color={MODERN_COLORS.gold} />
        </View>
        <Text style={styles.clashBannerTitle}>RESET ZILNIC STATISTICI & QUEST-URI</Text>
      </View>
      <Text style={styles.clashCountdownText}>⏳ Se resetează în: {timeLeft}</Text>
      <View style={styles.clashBarWrap}>
        <LinearGradient
          colors={[MODERN_COLORS.gold, MODERN_COLORS.cyan]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.clashBarFill, { width: `${progressPct}%` }]}
        />
      </View>
    </View>
  );
};

export default function AntrenamenteScreen() {
  const router = useRouter();
  const notify = useNotify();
  const { scrollPaddingTop, scrollPaddingBottom } = useResponsiveLayout();

  const {
    antrenamente,
    totalCaloriiArse,
    numarAntrenamente,
    stergeAntrenament,
    adaugaAntrenament,
    refresh: refreshAntr,
  } = useAntrenamente();

  const [selectedWorkoutHeatmap, setSelectedWorkoutHeatmap] = useState<Antrenament | null>(null);
  const [toDelete, setToDelete] = useState<Antrenament | null>(null);
  const [muscleView, setMuscleView] = useState<MuscleView>('anterior');

  const [viewMode, setViewMode] = useState<'front' | 'back'>('front');
  const [activeMuscles, setActiveMuscles] = useState<string[]>([]);

  const aggregatedMuscleLoad = useMemo(() => {
    const map: Record<string, number> = {};
    for (const w of antrenamente) {
      if (w.muscle_load) {
        for (const [key, val] of Object.entries(w.muscle_load)) {
          map[key] = (map[key] || 0) + val;
        }
      }
    }
    return map;
  }, [antrenamente]);

  const aggregatedIntensityMap = useMemo(() => {
    return normalizeMuscleLoadToIntensity(aggregatedMuscleLoad);
  }, [aggregatedMuscleLoad]);

  const activeMusclesList = useMemo(() => {
    const intensityKeys = Object.keys(aggregatedIntensityMap).filter(k => ((aggregatedIntensityMap as Record<string, number>)[k] ?? 0) > 0);
    if (intensityKeys.length > 0) return intensityKeys;
    return Object.keys(aggregatedMuscleLoad).filter(k => (aggregatedMuscleLoad[k] ?? 0) > 0);
  }, [aggregatedIntensityMap, aggregatedMuscleLoad]);

  const totalVolumeKg = useMemo(
    () => antrenamente.reduce((sum, w) => sum + (w.external_volume_kg ?? w.volum_total ?? 0), 0),
    [antrenamente]
  );

  const totalDurataMin = useMemo(
    () => antrenamente.reduce((sum, w) => sum + (w.durata_min ?? 0), 0),
    [antrenamente]
  );

  const {
    streak,
    questuriAzi: contextQuests,
    setQuesturiAzi,
    toateQuesturileCompletate,
    revendicaRecompensaZilnica,
    adaugaProgres,
    refreshGamificare,
  } = useGamificare();

  const daily = useDailyReset({
    questuriAzi: contextQuests,
    setQuesturiAzi,
  });

  const [expandedExId, setExpandedExId] = useState<string | null>(null);
  const [inlineSets, setInlineSets] = useState<number>(1);
  const [inlineReps, setInlineReps] = useState<number>(10);
  const [inlineWeight, setInlineWeight] = useState<number>(0);

  const [selectedCategorie, setSelectedCategorie] = useState<Categorie | 'toate'>('toate');
  const [searchQuery, setSearchQuery] = useState('');

  const handleInlineLog = async (ex: any) => {
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const kcalEst = Math.round((ex.met || 4) * 75 * ((inlineSets * inlineReps * 3) / 3600) * 10) / 10 || 45;
      const volEst = inlineSets * inlineReps * inlineWeight;

      await adaugaAntrenament({
        nume: ex.nume,
        tip: ex.categorie || 'general',
        durata_min: Math.max(10, inlineSets * 3),
        calorii_arse: Math.max(20, Math.round(kcalEst)),
        exercitii: [
          {
            exercitiuId: ex.id,
            nume: ex.nume,
            seturi: Array.from({ length: inlineSets }, (_, i) => ({
              serie: i + 1,
              repetari: inlineReps,
              greutate: inlineWeight,
            })),
            durataMin: inlineSets * 3,
            kcal: Math.max(20, Math.round(kcalEst)),
          },
        ],
        volum_total: volEst,
      });

      try {
        await adaugaProgres('antrenamente', 1);
        await adaugaProgres('minute_miscare', inlineSets * 3);
        await adaugaProgres('calorii_arse', Math.max(20, Math.round(kcalEst)));
      } catch {}

      notify.reward('Exercițiu salvat!', `+100 XP • ${volEst} kg volum`);
      setExpandedExId(null);
      refreshAntr();
    } catch {
      notify.error('Eroare', 'Nu s-a putut salva exercițiul.');
    }
  };

  useFocusRefresh(
    useCallback(() => {
      refreshAntr();
      refreshGamificare();
    }, [refreshAntr, refreshGamificare]),
    5000,
    [refreshAntr, refreshGamificare]
  );

  const handleStergere = (item: Antrenament) => {
    setToDelete(item);
  };

  const exercitiiFiltrate = useMemo(() => {
    return EXERCITII.filter((ex) => {
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
  }, [selectedCategorie, searchQuery]);

  const rankData = useMemo(() => getRankData(totalVolumeKg), [totalVolumeKg]);

  const finalizateCount = useMemo(
    () => daily.questuriAzi.filter((q: any) => q.completat).length,
    [daily.questuriAzi]
  );

  const firstUncompletedIndex = useMemo(() => {
    const idx = daily.questuriAzi.findIndex((q: any) => !q.completat);
    return idx === -1 ? 0 : idx;
  }, [daily.questuriAzi]);

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingTop: scrollPaddingTop, paddingBottom: scrollPaddingBottom }]}
      >
        {/* 1. HEADER COMPACT (cu Glassmorphism subtil) */}
        <View style={styles.headerContainer}>
          <BlurView intensity={25} tint="dark" style={StyleSheet.absoluteFillObject} />
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.headerSub}>NUTRIAI FITNESS</Text>
              <Text style={styles.headerTitle}>Sport</Text>
            </View>

            <View style={styles.headerActions}>
              <TouchableOpacity
                onPress={() => router.push('/jurnal-antrenamente' as any)}
                style={styles.jurnalBtn}
              >
                <Text style={styles.jurnalBtnText}>📖 Jurnal</Text>
              </TouchableOpacity>

              <View style={styles.streakBadge}>
                <LinearGradient
                  colors={[MODERN_COLORS.cyan, '#0080FF']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.streakGrad}
                >
                  <Zap size={14} color="#FFFFFF" />
                  <Text style={styles.streakText}>{streak} Zile</Text>
                </LinearGradient>
              </View>
            </View>
          </View>

          <ClashRoyaleResetBanner />

          <WorkoutTimerBar
            onLogWorkout={async (durataMin) => {
              try {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                await adaugaAntrenament({
                  nume: `Antrenament rapid (${durataMin} min)`,
                  tip: 'general',
                  durata_min: durataMin,
                  calorii_arse: Math.round(durataMin * 7.5),
                  volum_total: 0,
                });
                try {
                  await adaugaProgres('antrenamente', 1);
                  await adaugaProgres('minute_miscare', durataMin);
                  await adaugaProgres('calorii_arse', Math.round(durataMin * 7.5));
                } catch {}
                notify.reward('Antrenament înregistrat!', `+100 XP • ${durataMin} min mișcare`);
                refreshAntr();
              } catch {
                notify.error('Eroare', 'Nu s-a putut salva antrenamentul.');
              }
            }}
          />
        </View>

        {/* 2. TODAY SNAPSHOT (Centrat, estetic & ordonat) */}
        <View style={styles.snapshotSection}>
          <View style={styles.snapshotGrid}>
            <View style={styles.snapshotCard}>
              <View style={styles.snapshotIconRow}>
                <Flame size={20} color={MODERN_COLORS.cyan} />
                <Text style={styles.snapshotValue}>{totalCaloriiArse}</Text>
              </View>
              <Text style={styles.snapshotLabel}>kcal arse</Text>
            </View>

            <View style={styles.snapshotCard}>
              <View style={styles.snapshotIconRow}>
                <Dumbbell size={20} color={MODERN_COLORS.cyan} />
                <Text style={styles.snapshotValue}>{totalVolumeKg}</Text>
              </View>
              <Text style={styles.snapshotLabel}>kg mutați</Text>
            </View>

            <View style={styles.snapshotCard}>
              <View style={styles.snapshotIconRow}>
                <Activity size={20} color={MODERN_COLORS.cyan} />
                <Text style={styles.snapshotValue}>{numarAntrenamente}</Text>
              </View>
              <Text style={styles.snapshotLabel}>sesiuni</Text>
            </View>

            <View style={styles.snapshotCard}>
              <View style={styles.snapshotIconRow}>
                <Clock size={20} color={MODERN_COLORS.cyan} />
                <Text style={styles.snapshotValue}>{totalDurataMin}</Text>
              </View>
              <Text style={styles.snapshotLabel}>minute</Text>
            </View>
          </View>
        </View>

        {/* 3. MUSCLE LIVE SECTION */}
        <View style={styles.sectionCard}>
          <View style={styles.muscleHeaderRow}>
            <Text style={styles.sectionTitle}>ACTIVARE MUSCULARĂ LIVE</Text>
            <View style={styles.viewToggleWrap}>
              <TouchableOpacity
                style={[styles.toggleBtn, viewMode === 'front' && styles.toggleBtnActive]}
                onPress={() => {
                  setViewMode('front');
                  setMuscleView('anterior');
                }}
              >
                <Text style={[styles.toggleBtnText, viewMode === 'front' && styles.toggleBtnTextActive]}>
                  Față
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toggleBtn, viewMode === 'back' && styles.toggleBtnActive]}
                onPress={() => {
                  setViewMode('back');
                  setMuscleView('posterior');
                }}
              >
                <Text style={[styles.toggleBtnText, viewMode === 'back' && styles.toggleBtnTextActive]}>
                  Spate
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={[styles.muscleBodyWrap, { height: 400, width: '100%', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' }]}>
            {viewMode === 'front' ? (
              <MuscleMapFront side="front" intensity={aggregatedIntensityMap} activeMuscles={activeMusclesList} style={{ width: '100%', height: '100%' }} />
            ) : (
              <MuscleMapBack side="back" intensity={aggregatedIntensityMap} activeMuscles={activeMusclesList} style={{ width: '100%', height: '100%' }} />
            )}
          </View>

          <View style={styles.muscleLegendRow}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#505050' }]} />
              <Text style={styles.legendText}>Inactiv</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#00BFFF' }]} />
              <Text style={styles.legendText}>Ușor</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#FFD700' }]} />
              <Text style={styles.legendText}>Mediu</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#FF8C00' }]} />
              <Text style={styles.legendText}>Intens</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#FF0000' }]} />
              <Text style={styles.legendText}>Magmă</Text>
            </View>
          </View>
        </View>

        {/* 4. RANK SECTION (complet centrată & ordonată cu width 100% corect) */}
        <View style={[styles.sectionCard, styles.rankCardCentered]}>
          <Text style={[styles.sectionTitle, { textAlign: 'center', marginBottom: Spacing.sm }]}>
            TONAJ & MASTERY RANK
          </Text>
          
          <View style={styles.rankCenterInfo}>
            <Text style={styles.rankBadgeText}>🏆 {rankData.rankLabel}</Text>
            <Text style={styles.rankTotalKgText}>{totalVolumeKg.toLocaleString('ro-RO')} kg mutați în total</Text>
            
            <View style={styles.starsRowCentered}>
              {[1, 2, 3, 4, 5].map((starIdx) => (
                <Star
                  key={starIdx}
                  size={18}
                  color={starIdx <= rankData.stars ? MODERN_COLORS.gold : '#334D5C'}
                  fill={starIdx <= rankData.stars ? MODERN_COLORS.gold : 'transparent'}
                />
              ))}
            </View>
          </View>

          <View style={styles.rankBarContainer}>
            <RankProgressBar
              currentKg={totalVolumeKg}
              nextRankKg={rankData.nextRankKg}
              rankLabel={rankData.rankLabel}
              nextRankLabel={rankData.nextRankLabel}
            />
          </View>
        </View>

        {/* 5. DAILY QUESTS */}
        <View style={styles.sectionCard}>
          <View style={styles.questsHeaderRow}>
            <View>
              <Text style={styles.sectionTitle}>OBIECTIVELE ZILEI</Text>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={styles.questsCountText}>
                {finalizateCount}/{daily.questuriAzi.length} finalizate
              </Text>
              {toateQuesturileCompletate && (
                <TouchableOpacity
                  onPress={revendicaRecompensaZilnica}
                  style={styles.bonusBtn}
                >
                  <Sparkles size={14} color={MODERN_COLORS.cyan} />
                  <Text style={styles.bonusBtnText}>Bonus</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          <View style={styles.questsList}>
            {daily.questuriAzi.map((questItem: any, index: number) => {
              const quest = questItem as any;
              const isExpanded = index === firstUncompletedIndex && !quest.completat;

              if (isExpanded) {
                return (
                  <View key={quest.id} style={styles.questCardExpanded}>
                    <View style={styles.questExpandedTop}>
                      <View style={styles.questIconCol}>
                        <View style={styles.questCircleEmpty} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.questDescText}>{quest.descriere}</Text>
                        <View style={styles.questBarWrap}>
                          <View
                            style={[
                              styles.questBarFill,
                              {
                                width: `${Math.min(
                                  100,
                                  (quest.progres / Math.max(1, quest.tinta || 1)) * 100
                                )}%`,
                              },
                            ]}
                          />
                        </View>
                        <Text style={styles.questProgressSub}>
                          {quest.progres} / {quest.tinta || 1} completat
                        </Text>
                      </View>
                      <View style={styles.questXpBadge}>
                        <Text style={styles.questXpText}>+{quest.xp || 0} XP</Text>
                      </View>
                    </View>
                  </View>
                );
              }

              return (
                <View
                  key={quest.id}
                  style={[styles.questCardCompact, quest.completat && styles.questCardDone]}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                    {quest.completat ? (
                      <CheckCircle2 size={18} color={MODERN_COLORS.cyan} />
                    ) : (
                      <View style={styles.questCircleEmptySmall} />
                    )}
                    <Text
                      style={[
                        styles.questCompactTitle,
                        quest.completat && styles.questCompactTitleDone,
                      ]}
                      numberOfLines={1}
                    >
                      {quest.descriere}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Text style={styles.questCompactProgress}>
                      {quest.progres}/{quest.tinta || 1}
                    </Text>
                    <Text style={[styles.questXpText, { fontSize: 12 }]}>+{quest.xp || 0} XP</Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        {/* 6. SESSIONS TODAY */}
        {antrenamente.length > 0 && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>SESIUNI ÎNREGISTRATE AZI</Text>
            <View style={{ gap: Spacing.sm, marginTop: Spacing.sm }}>
              {antrenamente.map((item) => {
                const volumKg = item.external_volume_kg ?? item.volum_total ?? 0;
                const rankLbl = item.rank_label || 'Activ';
                return (
                  <View key={item.id} style={styles.sessionRowCard}>
                    <View style={styles.sessionRowTop}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                        <View style={styles.sessionIconBox}>
                          <Dumbbell size={16} color={MODERN_COLORS.cyan} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.sessionName} numberOfLines={1}>{item.nume}</Text>
                          <Text style={styles.sessionMeta}>
                            {item.durata_min} min • ~{item.calorii_arse} kcal
                          </Text>
                        </View>
                      </View>

                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <TouchableOpacity
                          onPress={() => setSelectedWorkoutHeatmap(item)}
                          style={styles.actionIconButton}
                        >
                          <Eye size={16} color={MODERN_COLORS.cyan} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => handleStergere(item)}
                          style={[styles.actionIconButton, { backgroundColor: 'rgba(255,77,77,0.1)' }]}
                        >
                          <Trash2 size={16} color={MODERN_COLORS.danger} />
                        </TouchableOpacity>
                      </View>
                    </View>

                    <View style={styles.sessionRowBottom}>
                      <View>
                        <Text style={styles.sessionStatLabel}>KG MIȘCATE</Text>
                        <Text style={styles.sessionStatVal}>{volumKg} kg</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={styles.sessionStatLabel}>MASTERY</Text>
                        <Text style={styles.sessionStatRank}>🏆 {rankLbl}</Text>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* 7. CATALOG EXERCIȚII & ÎNREGISTRARE ANTRENAMENT INLINE */}
        <View style={styles.sectionCard}>
          <View style={styles.catalogHeaderRow}>
            <Text style={styles.sectionTitle}>CATALOG EXERCIȚII ({exercitiiFiltrate.length})</Text>
            <Text style={{ fontSize: 11, color: MODERN_COLORS.cyan, fontWeight: '700' }}>✨ Apasă un exercițiu pentru a nota</Text>
          </View>

          <View style={styles.searchContainer}>
            <Search size={18} color={MODERN_COLORS.textTertiary} />
            <TextInput
              style={styles.searchInput}
              placeholder="Caută exercițiu sau grupă..."
              placeholderTextColor={MODERN_COLORS.textTertiary}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipsScroll}
          >
            <TouchableOpacity
              onPress={() => setSelectedCategorie('toate')}
              style={[styles.chip, selectedCategorie === 'toate' && styles.chipActive]}
            >
              <Text style={[styles.chipText, selectedCategorie === 'toate' && styles.chipTextActive]}>
                Toate
              </Text>
            </TouchableOpacity>

            {CATEGORII.map((cat) => (
              <TouchableOpacity
                key={cat.id}
                onPress={() => setSelectedCategorie(cat.id)}
                style={[styles.chip, selectedCategorie === cat.id && styles.chipActive]}
              >
                <Text style={[styles.chipText, selectedCategorie === cat.id && styles.chipTextActive]}>
                  {cat.nume}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <View style={styles.exList}>
            {exercitiiFiltrate.map((ex) => {
              const isExpanded = expandedExId === ex.id;
              return (
                <View key={ex.id} style={[styles.exCardWrap, isExpanded && styles.exCardWrapExpanded]}>
                  <TouchableOpacity
                    style={styles.exCard}
                    activeOpacity={0.8}
                    onPress={() => {
                      if (isExpanded) {
                        setExpandedExId(null);
                      } else {
                        try { Haptics.selectionAsync(); } catch {}
                        setExpandedExId(ex.id);
                        setInlineSets(1);
                        setInlineReps(ex.repetariDefault || 10);
                        setInlineWeight(0);
                      }
                    }}
                  >
                    <View style={styles.exIconCircle}>
                      <Dumbbell size={16} color={MODERN_COLORS.cyan} />
                    </View>

                    <View style={styles.exContent}>
                      <Text style={styles.exName} numberOfLines={1}>
                        {ex.nume}
                      </Text>
                      <Text style={styles.exMuscles} numberOfLines={1}>
                        {ex.grupe.join(', ')} • {ex.dificultate}
                      </Text>
                    </View>

                    <View style={styles.exQuickBadge}>
                      <Text style={styles.exQuickBadgeText}>{isExpanded ? '✕ Închide' : '+ Notează'}</Text>
                    </View>
                  </TouchableOpacity>

                  {isExpanded && (
                    <View style={styles.inlineEditorBox}>
                      <View style={styles.inlineSteppersRow}>
                        {/* Serii */}
                        <View style={styles.stepperCol}>
                          <Text style={styles.stepperLabel}>Serii</Text>
                          <View style={styles.stepperControls}>
                            <TouchableOpacity
                              style={styles.stepperBtn}
                              onPress={() => {
                                try { Haptics.selectionAsync(); } catch {}
                                setInlineSets((s) => Math.max(1, s - 1));
                              }}
                            >
                              <Text style={styles.stepperBtnText}>-</Text>
                            </TouchableOpacity>
                            <TextInput
                              style={styles.stepperInputText}
                              keyboardType="number-pad"
                              value={String(inlineSets)}
                              onChangeText={(txt) => {
                                const val = parseInt(txt.replace(/[^0-9]/g, ''), 10);
                                setInlineSets(isNaN(val) ? 1 : Math.max(1, Math.min(50, val)));
                              }}
                              selectTextOnFocus
                            />
                            <TouchableOpacity
                              style={styles.stepperBtn}
                              onPress={() => {
                                try { Haptics.selectionAsync(); } catch {}
                                setInlineSets((s) => Math.min(50, s + 1));
                              }}
                            >
                              <Text style={styles.stepperBtnText}>+</Text>
                            </TouchableOpacity>
                          </View>
                        </View>

                        {/* Repetari */}
                        <View style={styles.stepperCol}>
                          <Text style={styles.stepperLabel}>Repetări</Text>
                          <View style={styles.stepperControls}>
                            <TouchableOpacity
                              style={styles.stepperBtn}
                              onPress={() => {
                                try { Haptics.selectionAsync(); } catch {}
                                setInlineReps((r) => Math.max(1, r - 1));
                              }}
                            >
                              <Text style={styles.stepperBtnText}>-</Text>
                            </TouchableOpacity>
                            <TextInput
                              style={styles.stepperInputText}
                              keyboardType="number-pad"
                              value={String(inlineReps)}
                              onChangeText={(txt) => {
                                const val = parseInt(txt.replace(/[^0-9]/g, ''), 10);
                                setInlineReps(isNaN(val) ? 1 : Math.max(1, Math.min(100, val)));
                              }}
                              selectTextOnFocus
                            />
                            <TouchableOpacity
                              style={styles.stepperBtn}
                              onPress={() => {
                                try { Haptics.selectionAsync(); } catch {}
                                setInlineReps((r) => Math.min(100, r + 1));
                              }}
                            >
                              <Text style={styles.stepperBtnText}>+</Text>
                            </TouchableOpacity>
                          </View>
                        </View>

                        {/* Greutate */}
                        <View style={styles.stepperCol}>
                          <Text style={styles.stepperLabel}>Greutate (kg)</Text>
                          <View style={styles.stepperControls}>
                            <TouchableOpacity
                              style={styles.stepperBtn}
                              onPress={() => {
                                try { Haptics.selectionAsync(); } catch {}
                                setInlineWeight((w) => Math.max(0, Number((w - 2.5).toFixed(1))));
                              }}
                            >
                              <Text style={styles.stepperBtnText}>-</Text>
                            </TouchableOpacity>
                            <TextInput
                              style={styles.stepperInputText}
                              keyboardType="decimal-pad"
                              value={String(inlineWeight)}
                              onChangeText={(txt) => {
                                const clean = txt.replace(/[^0-9.]/g, '');
                                const val = parseFloat(clean);
                                setInlineWeight(isNaN(val) ? 0 : Math.max(0, Math.min(600, val)));
                              }}
                              selectTextOnFocus
                            />
                            <TouchableOpacity
                              style={styles.stepperBtn}
                              onPress={() => {
                                try { Haptics.selectionAsync(); } catch {}
                                setInlineWeight((w) => Math.min(600, Number((w + 2.5).toFixed(1))));
                              }}
                            >
                              <Text style={styles.stepperBtnText}>+</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      </View>

                      <View style={styles.inlineEstRow}>
                        <Text style={styles.inlineEstText}>
                          🔥 ~{Math.round((ex.met || 4) * 75 * ((inlineSets * inlineReps * 3) / 3600) * 10) / 10 || 45} kcal arse
                        </Text>
                        <Text style={styles.inlineEstText}>
                          🏋️ Volum: {inlineSets * inlineReps * inlineWeight} kg
                        </Text>
                      </View>

                      <View style={styles.inlineActionsRow}>
                        <TouchableOpacity
                          style={styles.inlineSaveBtn}
                          onPress={() => handleInlineLog(ex)}
                        >
                          <LinearGradient
                            colors={['#00BFFF', '#0080FF']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.inlineSaveGrad}
                          >
                            <CheckCircle2 size={16} color="#071218" strokeWidth={2.5} />
                            <Text style={styles.inlineSaveBtnText}>✅ Salvează Sesiune</Text>
                          </LinearGradient>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.inlineDetailBtn}
                          onPress={() => router.push(`/exercitiu/${ex.id}` as any)}
                        >
                          <Eye size={16} color={MODERN_COLORS.cyan} />
                          <Text style={styles.inlineDetailBtnText}>Detalii 3D</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        </View>
      </ScrollView>

      {selectedWorkoutHeatmap && (
        <Modal
          visible={!!selectedWorkoutHeatmap}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setSelectedWorkoutHeatmap(null)}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>{selectedWorkoutHeatmap.nume}</Text>
                <Text style={styles.modalSub}>
                  {selectedWorkoutHeatmap.external_volume_kg || selectedWorkoutHeatmap.volum_total || 0} kg volum • {selectedWorkoutHeatmap.rank_label || 'Activ'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setSelectedWorkoutHeatmap(null)}
                hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
              >
                <X size={24} color={MODERN_COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
              <BodyHeatmap muscleLoad={selectedWorkoutHeatmap.muscle_load || {}} />
            </ScrollView>
          </View>
        </Modal>
      )}

      <ConfirmSheet
        visible={!!toDelete}
        title="Șterge antrenamentul"
        message={toDelete ? `Ești sigur că vrei să ștergi "${toDelete.nume}" (-${toDelete.calorii_arse} kcal)?` : ''}
        confirmLabel="Șterge"
        cancelLabel="Anulează"
        destructive={true}
        onCancel={() => setToDelete(null)}
        onConfirm={async () => {
          if (!toDelete) return;
          const item = toDelete;
          setToDelete(null);
          try {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            await stergeAntrenament(item.id);
            notify.info('Șters', `Antrenamentul ${item.nume} a fost șters.`);
          } catch (error) {
            notify.error('Eroare', 'Nu s-a putut șterge antrenamentul.');
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: MODERN_COLORS.bg,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    // paddingTop și paddingBottom sunt injectate dinamic prin useResponsiveLayout
  },
  headerContainer: {
    borderRadius: Radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: MODERN_COLORS.border,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    backgroundColor: 'rgba(13, 32, 40, 0.65)',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  headerSub: {
    fontSize: 10,
    fontWeight: '800',
    color: MODERN_COLORS.cyan,
    letterSpacing: 1.2,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: MODERN_COLORS.textPrimary,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  jurnalBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    backgroundColor: MODERN_COLORS.surface,
    borderWidth: 1,
    borderColor: MODERN_COLORS.border,
  },
  jurnalBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: MODERN_COLORS.textPrimary,
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
    color: '#FFFFFF',
  },
  snapshotSection: {
    marginBottom: Spacing.lg,
  },
  snapshotGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: Spacing.sm,
  },
  snapshotCard: {
    flex: 1,
    backgroundColor: MODERN_COLORS.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: MODERN_COLORS.border,
    paddingVertical: 14,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  snapshotIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  snapshotValue: {
    fontSize: 15,
    fontWeight: '800',
    color: MODERN_COLORS.textPrimary,
  },
  snapshotLabel: {
    fontSize: 10,
    color: MODERN_COLORS.textSecondary,
    marginTop: 4,
    fontWeight: '600',
    textAlign: 'center',
  },
  quickAddBtn: {
    backgroundColor: MODERN_COLORS.cyan,
    borderRadius: Radius.md,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  quickAddBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#071218',
  },
  sectionCard: {
    backgroundColor: MODERN_COLORS.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: MODERN_COLORS.border,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  rankCardCentered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankCenterInfo: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  rankBadgeText: {
    fontSize: 18,
    fontWeight: '900',
    color: MODERN_COLORS.textPrimary,
    textAlign: 'center',
  },
  rankTotalKgText: {
    fontSize: 13,
    color: MODERN_COLORS.cyan,
    fontWeight: '700',
    marginTop: 4,
    textAlign: 'center',
  },
  starsRowCentered: {
    flexDirection: 'row',
    gap: 4,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  rankBarContainer: {
    width: '100%',
    alignSelf: 'stretch',
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: MODERN_COLORS.textTertiary,
    letterSpacing: 1,
  },
  muscleHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  viewToggleWrap: {
    flexDirection: 'row',
    backgroundColor: '#071218',
    borderRadius: Radius.pill,
    padding: 3,
    borderWidth: 1,
    borderColor: MODERN_COLORS.border,
  },
  toggleBtn: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  toggleBtnActive: {
    backgroundColor: MODERN_COLORS.cyan,
  },
  toggleBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: MODERN_COLORS.textSecondary,
  },
  toggleBtnTextActive: {
    color: '#071218',
  },
  muscleBodyWrap: {
    alignItems: 'center',
    marginVertical: Spacing.sm,
  },
  muscleLegendRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 11,
    color: MODERN_COLORS.textSecondary,
    fontWeight: '600',
  },
  questsHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.sm,
  },
  questsCountText: {
    fontSize: 12,
    fontWeight: '700',
    color: MODERN_COLORS.cyan,
  },
  bonusBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: MODERN_COLORS.cyanSoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  bonusBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: MODERN_COLORS.cyan,
  },
  questsList: {
    gap: 8,
  },
  questCardExpanded: {
    backgroundColor: '#071218',
    borderRadius: Radius.md,
    padding: Spacing.sm,
    borderWidth: 1,
    borderColor: MODERN_COLORS.cyan,
  },
  questExpandedTop: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  questIconCol: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  questCircleEmpty: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: MODERN_COLORS.textTertiary,
  },
  questDescText: {
    fontSize: 14,
    fontWeight: '700',
    color: MODERN_COLORS.textPrimary,
  },
  questBarWrap: {
    height: 6,
    backgroundColor: '#122B36',
    borderRadius: Radius.pill,
    marginTop: 6,
    marginBottom: 4,
    overflow: 'hidden',
  },
  questBarFill: {
    height: '100%',
    backgroundColor: MODERN_COLORS.cyan,
  },
  questProgressSub: {
    fontSize: 11,
    color: MODERN_COLORS.textSecondary,
  },
  questXpBadge: {
    backgroundColor: MODERN_COLORS.cyanSoft,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  questXpText: {
    fontSize: 13,
    fontWeight: '800',
    color: MODERN_COLORS.cyan,
  },
  questCardCompact: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#071218',
    borderRadius: Radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: MODERN_COLORS.border,
  },
  questCardDone: {
    borderColor: 'rgba(0, 191, 255, 0.3)',
    backgroundColor: 'rgba(0, 191, 255, 0.05)',
  },
  questCircleEmptySmall: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: MODERN_COLORS.textTertiary,
  },
  questCompactTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: MODERN_COLORS.textPrimary,
  },
  questCompactTitleDone: {
    color: MODERN_COLORS.textSecondary,
    textDecorationLine: 'line-through',
  },
  questCompactProgress: {
    fontSize: 12,
    color: MODERN_COLORS.textSecondary,
    fontWeight: '600',
  },
  sessionRowCard: {
    backgroundColor: '#071218',
    borderRadius: Radius.md,
    padding: Spacing.sm,
    borderWidth: 1,
    borderColor: MODERN_COLORS.border,
  },
  sessionRowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sessionIconBox: {
    width: 32,
    height: 32,
    borderRadius: Radius.sm,
    backgroundColor: MODERN_COLORS.cyanSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sessionName: {
    fontSize: 14,
    fontWeight: '700',
    color: MODERN_COLORS.textPrimary,
  },
  sessionMeta: {
    fontSize: 11,
    color: MODERN_COLORS.textSecondary,
  },
  actionIconButton: {
    padding: 8,
    borderRadius: Radius.sm,
    backgroundColor: MODERN_COLORS.cyanSoft,
  },
  sessionRowBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  sessionStatLabel: {
    fontSize: 10,
    color: MODERN_COLORS.textTertiary,
    fontWeight: '700',
  },
  sessionStatVal: {
    fontSize: 13,
    fontWeight: '800',
    color: MODERN_COLORS.cyan,
  },
  sessionStatRank: {
    fontSize: 13,
    fontWeight: '800',
    color: MODERN_COLORS.textPrimary,
  },
  catalogHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  headerLogBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: MODERN_COLORS.cyan,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: Radius.pill,
  },
  headerLogBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#071218',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#071218',
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.sm,
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: MODERN_COLORS.border,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    fontSize: 14,
    color: MODERN_COLORS.textPrimary,
  },
  chipsScroll: {
    gap: 8,
    paddingBottom: Spacing.sm,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    backgroundColor: '#071218',
    borderWidth: 1,
    borderColor: MODERN_COLORS.border,
  },
  chipActive: {
    backgroundColor: MODERN_COLORS.cyan,
    borderColor: MODERN_COLORS.cyan,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    color: MODERN_COLORS.textSecondary,
  },
  chipTextActive: {
    color: '#071218',
    fontWeight: '800',
  },
  exList: {
    gap: 8,
    marginTop: Spacing.xs,
  },
  exCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#071218',
    borderRadius: Radius.md,
    padding: 12,
    borderWidth: 1,
    borderColor: MODERN_COLORS.border,
  },
  exIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: MODERN_COLORS.cyanSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  exContent: {
    flex: 1,
  },
  exName: {
    fontSize: 14,
    fontWeight: '700',
    color: MODERN_COLORS.textPrimary,
  },
  exMuscles: {
    fontSize: 11,
    color: MODERN_COLORS.textSecondary,
    marginTop: 2,
  },
  modalContent: {
    flex: 1,
    backgroundColor: MODERN_COLORS.bg,
    padding: Spacing.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: MODERN_COLORS.textPrimary,
  },
  modalSub: {
    fontSize: 13,
    color: MODERN_COLORS.cyan,
  },
  clashBannerCard: {
    width: '100%',
    borderRadius: Radius.lg,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: MODERN_COLORS.gold,
    padding: Spacing.md,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  clashBannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  clashIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 215, 0, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clashBannerTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: MODERN_COLORS.gold,
    letterSpacing: 0.8,
  },
  clashCountdownText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 10,
  },
  clashBarWrap: {
    width: '100%',
    height: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  clashBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  exCardWrap: {
    backgroundColor: '#071218',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: MODERN_COLORS.border,
    overflow: 'hidden',
  },
  exCardWrapExpanded: {
    borderColor: MODERN_COLORS.cyan,
    backgroundColor: '#0A1A22',
  },
  exQuickBadge: {
    backgroundColor: MODERN_COLORS.cyanSoft,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(0,191,255,0.25)',
  },
  exQuickBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: MODERN_COLORS.cyan,
  },
  inlineEditorBox: {
    padding: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    backgroundColor: 'rgba(0, 191, 255, 0.03)',
  },
  inlineSteppersRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 12,
  },
  stepperCol: {
    flex: 1,
    alignItems: 'center',
  },
  stepperLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: MODERN_COLORS.textSecondary,
    marginBottom: 6,
  },
  stepperControls: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#071218',
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: MODERN_COLORS.border,
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  stepperBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 6,
  },
  stepperBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: MODERN_COLORS.textPrimary,
  },
  stepperValText: {
    minWidth: 32,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '800',
    color: MODERN_COLORS.cyan,
  },
  stepperInputText: {
    minWidth: 44,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '800',
    color: MODERN_COLORS.cyan,
    backgroundColor: 'rgba(0,191,255,0.1)',
    borderRadius: 6,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: 'rgba(0,191,255,0.3)',
  },
  inlineEstRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: Radius.sm,
    paddingVertical: 8,
    marginBottom: 12,
  },
  inlineEstText: {
    fontSize: 12,
    fontWeight: '700',
    color: MODERN_COLORS.textPrimary,
  },
  inlineActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  inlineSaveBtn: {
    flex: 2,
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  inlineSaveGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 6,
  },
  inlineSaveBtnText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#071218',
  },
  inlineDetailBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: '#071218',
    borderWidth: 1,
    borderColor: MODERN_COLORS.cyan,
    borderRadius: Radius.md,
    paddingVertical: 12,
  },
  inlineDetailBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: MODERN_COLORS.cyan,
  },
});
