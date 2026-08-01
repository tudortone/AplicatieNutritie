import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import LootBoxModal from './LootBoxModal';
import {
  EMPTY_REWARD_STATE,
  STREAK_FOR_BOX,
  daysToNextBox,
  syncProgress,
  type DailySnapshot,
  type Quest,
  type RewardState,
} from '../../lib/questsEngine';
import { useTheme } from '../../context/ThemeContext';

/**
 * Card cu questurile zilei + progresul spre loot box.
 *
 * Componenta e "pură" din punct de vedere al datelor: primește un `snapshot`
 * cu activitatea de azi (seturi, volum, minute…) și recalculează totul de acolo.
 * Așa, dacă utilizatorul șterge un set, progresul scade corect — spre deosebire
 * de un contor care doar crește.
 */

export type DailyQuestsCardProps = {
  snapshot: DailySnapshot;
  /** Ascunde progresul spre loot box (ex. când cardul e afișat în alt context). */
  compact?: boolean;
};

function formatValue(value: number, unit: string): string {
  if (unit === 'kg' && value >= 1000) {
    return `${(value / 1000).toFixed(1)}t`;
  }
  return String(Math.round(value));
}

export default function DailyQuestsCard({ snapshot, compact }: DailyQuestsCardProps) {
  const { colors } = useTheme();
  const [quests, setQuests] = useState<Quest[]>([]);
  const [reward, setReward] = useState<RewardState>(EMPTY_REWARD_STATE);
  const [xpToday, setXpToday] = useState(0);
  const [boxOpen, setBoxOpen] = useState(false);

  const refresh = useCallback(async () => {
    const result = await syncProgress(snapshot);
    setQuests(result.quests);
    setReward(result.reward);
    setXpToday(result.xpToday);
  }, [snapshot]);

  useEffect(() => {
    let alive = true;
    syncProgress(snapshot).then((result) => {
      if (!alive) return;
      setQuests(result.quests);
      setReward(result.reward);
      setXpToday(result.xpToday);
    });
    return () => {
      alive = false;
    };
  }, [snapshot]);

  const doneCount = quests.filter((q) => q.done).length;
  const inCycle = reward.streak % STREAK_FOR_BOX;

  return (
    <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Questuri zilnice</Text>
        <Text style={[styles.counter, { color: colors.accent }]}>
          {doneCount}/{quests.length} · {xpToday} XP
        </Text>
      </View>

      {quests.map((q) => (
        <View key={q.id} style={styles.quest}>
          <Text style={styles.questIcon}>{q.icon}</Text>
          <View style={styles.questBody}>
            <View style={styles.questTop}>
              <Text
                style={[
                  styles.questTitle,
                  { color: q.done ? colors.success : colors.textPrimary },
                ]}
              >
                {q.done ? '✓ ' : ''}
                {q.title}
              </Text>
              <Text style={[styles.questProgress, { color: colors.textTertiary }]}>
                {formatValue(q.progress, q.unit)}/{formatValue(q.target, q.unit)} {q.unit}
              </Text>
            </View>
            <View style={[styles.track, { backgroundColor: colors.surfaceBg }]}>
              <View
                style={[
                  styles.fill,
                  {
                    width: `${Math.round(q.ratio * 100)}%`,
                    backgroundColor: q.done ? colors.success : colors.accent,
                  },
                ]}
              />
            </View>
          </View>
          <Text style={[styles.xp, { color: colors.textTertiary }]}>+{q.xp}</Text>
        </View>
      ))}

      {!compact && (
        <View style={[styles.streakBox, { borderColor: colors.cardBorder }]}>
          <View style={styles.streakRow}>
            <Text style={[styles.streakLabel, { color: colors.textSecondary }]}>
              🔥 Streak: {reward.streak} {reward.streak === 1 ? 'zi' : 'zile'}
            </Text>
            <Text style={[styles.streakLabel, { color: colors.textTertiary }]}>
              Record: {reward.bestStreak}
            </Text>
          </View>

          {/* 7 pastile = 7 zile până la loot box */}
          <View style={styles.pips}>
            {Array.from({ length: STREAK_FOR_BOX }).map((_, i) => (
              <View
                key={i}
                style={[
                  styles.pip,
                  {
                    backgroundColor: i < inCycle ? colors.accent : colors.surfaceBg,
                  },
                ]}
              />
            ))}
          </View>

          {reward.pendingBoxes > 0 ? (
            <Pressable
              style={[styles.boxBtn, { backgroundColor: colors.accent }]}
              onPress={() => setBoxOpen(true)}
            >
              <Text style={styles.boxBtnText}>
                🎁 Deschide loot box
                {reward.pendingBoxes > 1 ? ` (${reward.pendingBoxes})` : ''}
              </Text>
            </Pressable>
          ) : (
            <Text style={[styles.streakHint, { color: colors.textTertiary }]}>
              Încă {daysToNextBox(reward.streak)}{' '}
              {daysToNextBox(reward.streak) === 1 ? 'zi' : 'zile'} cu antrenament până la loot box
            </Text>
          )}

          {reward.inventory.length > 0 && (
            <View style={styles.inventory}>
              {reward.inventory.slice(0, 8).map((it) => (
                <View key={it.id} style={[styles.invItem, { backgroundColor: it.colors[0] }]}>
                  <Text style={styles.invIcon}>{it.icon}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      <LootBoxModal
        visible={boxOpen}
        onClose={() => {
          setBoxOpen(false);
          refresh();
        }}
        onOpened={(_item, next) => setReward(next)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 16, fontWeight: '800' },
  counter: { fontSize: 13, fontWeight: '700' },
  quest: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  questIcon: { fontSize: 20, width: 26, textAlign: 'center' },
  questBody: { flex: 1, gap: 6 },
  questTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  questTitle: { fontSize: 14, fontWeight: '700', flexShrink: 1 },
  questProgress: { fontSize: 12, marginLeft: 8 },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  xp: { fontSize: 12, fontWeight: '700', width: 34, textAlign: 'right' },
  streakBox: { borderTopWidth: 1, paddingTop: 12, gap: 10 },
  streakRow: { flexDirection: 'row', justifyContent: 'space-between' },
  streakLabel: { fontSize: 13, fontWeight: '700' },
  pips: { flexDirection: 'row', gap: 6 },
  pip: { flex: 1, height: 8, borderRadius: 4 },
  streakHint: { fontSize: 12 },
  boxBtn: { paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  boxBtnText: { color: '#0B0F14', fontWeight: '800', fontSize: 14 },
  inventory: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  invItem: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  invIcon: { fontSize: 15 },
});
