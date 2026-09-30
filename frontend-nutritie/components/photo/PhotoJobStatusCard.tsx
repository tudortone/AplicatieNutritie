import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { AlertTriangle, Camera, CheckCircle2, LoaderCircle } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { recoverPhotoJob, type ActivePhotoJobPointer, type PhotoJob } from '../../lib/photoJobs';

type VisiblePhotoJob = {
  job: PhotoJob;
  pointer: ActivePhotoJobPointer;
};

const RUNNING = new Set(['queued', 'running', 'processing']);
const COMPLETED = new Set(['succeeded', 'completed']);

function useSafeAuth() {
  try {
    return useAuth();
  } catch {
    return null;
  }
}

export function PhotoJobStatusCard() {
  const auth = useSafeAuth();
  const session = auth?.session ?? null;
  const { colors } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const [visibleJob, setVisibleJob] = useState<VisiblePhotoJob | null>(null);

  useFocusEffect(useCallback(() => {
    if (!session?.access_token || !session.user.id) {
      setVisibleJob(null);
      return undefined;
    }
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const refresh = async () => {
      try {
        const recovered = await recoverPhotoJob({
          token: session.access_token,
          userId: session.user.id,
        });
        if (!active) return;
        setVisibleJob(recovered);
        if (recovered && RUNNING.has(recovered.job.status)) {
          timer = setTimeout(refresh, 5000);
        }
      } catch {
        if (active) timer = setTimeout(refresh, 8000);
      }
    };

    void refresh();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [session?.access_token, session?.user.id]));

  if (!visibleJob) return null;

  const isRunning = RUNNING.has(visibleJob.job.status);
  const isCompleted = COMPLETED.has(visibleJob.job.status);
  const state = isRunning ? 'processing' : isCompleted ? 'completed' : 'failed';
  const color = isRunning ? colors.accentSecondary : isCompleted ? colors.accent : colors.danger;
  const Icon = isRunning ? LoaderCircle : isCompleted ? CheckCircle2 : AlertTriangle;

  return (
    <View
      testID={`photo-job-status-${state}`}
      style={[styles.card, { backgroundColor: colors.cardBg, borderColor: color + '66' }]}
      accessibilityRole="summary"
      accessibilityLiveRegion="polite"
    >
      <View style={[styles.icon, { backgroundColor: color + '1F' }]}>
        {isRunning ? (
          <ActivityIndicator testID="photo-job-spinner" color={color} />
        ) : (
          <Icon size={21} color={color} />
        )}
      </View>
      <View style={styles.copy}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>
          {t(`photoJob.${state === 'processing' ? 'backgroundTitle' : `${state}Title`}`)}
        </Text>
        <Text style={[styles.body, { color: colors.textSecondary }]}>
          {t(`photoJob.${state === 'processing' ? 'backgroundBody' : `${state}Body`}`)}
        </Text>
      </View>
      <Pressable
        testID="photo-job-open"
        onPress={() => router.push('/camera')}
        style={[styles.action, { borderColor: color + '66' }]}
        accessibilityRole="button"
        accessibilityLabel={t(isCompleted ? 'photoJob.openResult' : isRunning ? 'photoJob.viewStatus' : 'photoJob.retry')}
      >
        <Camera size={17} color={color} />
        <Text style={[styles.actionText, { color }]}>
          {t(isCompleted ? 'photoJob.open' : isRunning ? 'photoJob.view' : 'photoJob.retry')}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
    minHeight: 86,
    borderRadius: 18,
    borderWidth: 1,
    padding: 13,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  icon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, minWidth: 0 },
  title: { fontSize: 14, lineHeight: 18, fontWeight: '800' },
  body: { marginTop: 2, fontSize: 12, lineHeight: 17 },
  action: { minHeight: 44, borderRadius: 13, borderWidth: 1, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center', gap: 2 },
  actionText: { fontSize: 11, lineHeight: 14, fontWeight: '800' },
});
