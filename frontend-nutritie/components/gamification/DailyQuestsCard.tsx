import React, { useCallback, useEffect, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import {
  EMPTY_REWARD_STATE,
  syncProgress,
  type DailySnapshot,
  type Quest,
  type RewardState,
} from '../../lib/questsEngine';
import { useTheme } from '../../context/ThemeContext';

export type DailyQuestsCardProps = {
  snapshot: DailySnapshot;
  compact?: boolean;
};

function formatValue(value: number, unit: string): string {
  if (unit === 'kg' && value >= 1000) return `${(value / 1000).toFixed(1)}t`;
  return String(Math.round(value));
}

function localDayKey(date = new Date()): string {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function msUntilMidnight(now = new Date()): number {
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  return Math.max(0, next.getTime() - now.getTime());
}

function formatCountdown(milliseconds: number): string {
  const total = Math.max(0, Math.floor(milliseconds / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// PERF-008: countdown-ul „Reset în HH:MM:SS" trăiește într-un component separat,
// cu intervalul propriu de 1s — astfel cardul (lista de questuri) nu se re-randează
// la fiecare secundă, doar această etichetă mică.
function CountdownLabel() {
  const { colors } = useTheme();
  const [remainingMs, setRemainingMs] = useState(() => msUntilMidnight());

  useEffect(() => {
    const tick = () => setRemainingMs(msUntilMidnight(new Date()));
    const interval = setInterval(tick, 1000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') tick();
    });
    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, []);

  return (
    <Text style={[styles.resetText, { color: colors.textTertiary }]}>Reset în {formatCountdown(remainingMs)}</Text>
  );
}

export default function DailyQuestsCard({ snapshot, compact }: DailyQuestsCardProps) {
  const { colors } = useTheme();
  const [quests, setQuests] = useState<Quest[]>([]);
  const [reward, setReward] = useState<RewardState>(EMPTY_REWARD_STATE);
  const [xpToday, setXpToday] = useState(0);
  const [activeDay, setActiveDay] = useState(() => localDayKey());

  const refresh = useCallback(async () => {
    const result = await syncProgress(snapshot, new Date());
    setQuests(result.quests);
    setReward(result.reward);
    setXpToday(result.xpToday);
  }, [snapshot]);

  useEffect(() => {
    let alive = true;
    refresh().catch((error) => console.warn('[Questuri] Sincronizare eșuată:', error));

    // PERF-008: tick-ul de 1s (countdown) a fost mutat în <CountdownLabel>, ca să nu
    // mai declanșeze re-render complet al cardului la fiecare secundă. Aici rămâne
    // doar verificarea rară a rulării zilei (o dată pe minut + la reluarea aplicației).
    const checkDay = () => {
      if (!alive) return;
      const nextDay = localDayKey(new Date());
      if (nextDay !== activeDay) {
        setActiveDay(nextDay);
        // syncProgress vede cheia zilei noi și generează automat alte questuri,
        // cu claimed și xpToday resetate.
        refresh().catch((error) => console.warn('[Questuri] Reset zilnic eșuat:', error));
      }
    };

    const interval = setInterval(checkDay, 60000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') checkDay();
    });
    return () => {
      alive = false;
      clearInterval(interval);
      subscription.remove();
    };
  }, [activeDay, refresh]);

  const doneCount = quests.filter((q) => q.done).length;

  return (
    <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Questuri zilnice</Text>
          <CountdownLabel />
        </View>
        <Text style={[styles.counter, { color: colors.accent }]}>
          {doneCount}/{quests.length} · {xpToday} XP
        </Text>
      </View>

      {quests.length === 0 ? (
        <Text style={[styles.loading, { color: colors.textSecondary }]}>Se generează questurile zilei…</Text>
      ) : quests.map((q) => (
        <View key={q.id} style={styles.quest}>
          <Text style={styles.questIcon}>{q.icon}</Text>
          <View style={styles.questBody}>
            <View style={styles.questTop}>
              <Text style={[styles.questTitle, { color: q.done ? colors.success : colors.textPrimary }]}>
                {q.done ? '✓ ' : ''}{q.title}
              </Text>
              <Text style={[styles.questProgress, { color: colors.textTertiary }]}>
                {formatValue(q.progress, q.unit)}/{formatValue(q.target, q.unit)} {q.unit}
              </Text>
            </View>
            <View style={[styles.track, { backgroundColor: colors.surfaceBg }]}>
              <View
                style={[
                  styles.fill,
                  { width: `${Math.round(q.ratio * 100)}%`, backgroundColor: q.done ? colors.success : colors.accent },
                ]}
              />
            </View>
          </View>
          <Text style={[styles.xp, { color: colors.textTertiary }]}>+{q.xp}</Text>
        </View>
      ))}

      {!compact ? (
        <View style={[styles.streakBox, { borderColor: colors.cardBorder }]}>
          <View style={styles.streakRow}>
            <Text style={[styles.streakLabel, { color: colors.textSecondary }]}>🔥 Serie: {reward.streak} zile</Text>
            <Text style={[styles.streakLabel, { color: colors.textTertiary }]}>Record: {reward.bestStreak}</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, borderWidth: 1, padding: 16, gap: 14 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  headerCopy: { flex: 1 },
  title: { fontSize: 17, fontWeight: '900' },
  resetText: { fontSize: 11, fontWeight: '700', marginTop: 3 },
  counter: { fontSize: 13, fontWeight: '800' },
  loading: { fontSize: 13, paddingVertical: 12, textAlign: 'center' },
  quest: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  questIcon: { fontSize: 20, width: 26, textAlign: 'center' },
  questBody: { flex: 1, gap: 6 },
  questTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  questTitle: { fontSize: 14, fontWeight: '700', flex: 1 },
  questProgress: { fontSize: 11 },
  track: { height: 7, borderRadius: 4, overflow: 'hidden' },
  fill: { height: 7, borderRadius: 4 },
  xp: { fontSize: 12, fontWeight: '800', width: 34, textAlign: 'right' },
  streakBox: { borderTopWidth: 1, paddingTop: 14, gap: 12 },
  streakRow: { flexDirection: 'row', justifyContent: 'space-between' },
  streakLabel: { fontSize: 13, fontWeight: '700' },
});
