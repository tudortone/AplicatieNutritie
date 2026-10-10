import React, { useCallback, useEffect, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { AlertTriangle, Camera, CheckCircle2, LoaderCircle } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useReducedMotion } from '../../hooks/useReducedMotion';
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

export function HomePhotoAnalysisIndicator() {
  const auth = useSafeAuth();
  const session = auth?.session ?? null;
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const { t } = useTranslation();
  const router = useRouter();
  const [visibleJob, setVisibleJob] = useState<VisiblePhotoJob | null>(null);
  const scanRotation = useSharedValue(0);
  const scanStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${scanRotation.value}deg` }] }));

  useEffect(() => {
    if (reduceMotion) {
      scanRotation.value = 0;
      cancelAnimation(scanRotation);
      return;
    }
    scanRotation.value = withRepeat(withTiming(360, { duration: 1800 }), -1, false);
    return () => cancelAnimation(scanRotation);
  }, [reduceMotion, scanRotation]);

  useFocusEffect(useCallback(() => {
    if (!session?.access_token || !session.user.id) {
      setVisibleJob(null);
      return undefined;
    }
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let requestInFlight = false;

    const refresh = async () => {
      if (requestInFlight) return;
      requestInFlight = true;
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
      } finally {
        requestInFlight = false;
      }
    };

    void refresh();
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || !active) return;
      if (timer) clearTimeout(timer);
      timer = null;
      void refresh();
    });
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
      appStateSubscription.remove();
    };
  }, [session?.access_token, session?.user.id]));

  if (!visibleJob) return null;

  const isRunning = RUNNING.has(visibleJob.job.status);
  const isCompleted = COMPLETED.has(visibleJob.job.status);
  const state = isRunning ? 'processing' : isCompleted ? 'completed' : 'failed';
  const color = isRunning ? colors.accent : isCompleted ? colors.success : colors.danger;
  const Icon = isRunning ? LoaderCircle : isCompleted ? CheckCircle2 : AlertTriangle;

  return (
    <View
      testID={`photo-job-status-${state}`}
      style={[styles.indicator, { backgroundColor: colors.cardBg, borderColor: color + '66' }]}
      accessibilityRole="summary"
      accessibilityLiveRegion="polite"
    >
      <View testID={`home-photo-analysis-${state}`} style={styles.indicatorContents}>
        <View style={[styles.icon, { backgroundColor: color + '1F' }]}>
          {isRunning && !reduceMotion ? (
            <Animated.View testID="photo-job-scanning-ring" style={[styles.scanRing, { borderColor: color + '35', borderTopColor: color }, scanStyle]}>
              <Camera size={13} color={color} />
            </Animated.View>
          ) : (
            <Icon size={21} color={color} />
          )}
        </View>
        <View style={styles.copy}>
          <Text numberOfLines={1} style={[styles.title, { color: colors.textPrimary }]}>
            {t(`photoJob.${state === 'processing' ? 'backgroundTitle' : `${state}Title`}`)}
          </Text>
          <Text numberOfLines={1} style={[styles.body, { color: colors.textSecondary }]}>
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
        </Pressable>
      </View>
    </View>
  );
}

/** Backwards-compatible export for existing focused component tests. */
export const PhotoJobStatusCard = HomePhotoAnalysisIndicator;

const styles = StyleSheet.create({
  indicator: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'flex-start',
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 6,
    marginTop: 8,
    marginBottom: 10,
  },
  indicatorContents: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  icon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  scanRing: { width: 27, height: 27, borderRadius: 14, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, minWidth: 0 },
  title: { fontSize: 12, lineHeight: 15, fontWeight: '800' },
  body: { marginTop: 1, fontSize: 10, lineHeight: 13 },
  action: { width: 38, height: 38, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
