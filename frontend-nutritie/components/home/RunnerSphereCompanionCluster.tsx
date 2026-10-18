import React, { useCallback, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { recoverPhotoJob, clearActivePhotoJob, type PhotoJob, type ActivePhotoJobPointer } from '../../lib/photoJobs';
import { RunnerSphere, type RunnerSphereState } from './RunnerSphere';
import { PixelCompanion } from './PixelCompanion';

interface RunnerSphereCompanionClusterProps {
  streak?: number;
  onCompanionPress?: () => void;
}

const RUNNING = new Set(['queued', 'running', 'processing']);
const COMPLETED = new Set(['succeeded', 'completed']);

function useSafeAuth() {
  try {
    return useAuth();
  } catch {
    return null;
  }
}

export function RunnerSphereCompanionCluster({
  streak = 0,
  onCompanionPress,
}: RunnerSphereCompanionClusterProps) {
  const router = useRouter();
  const auth = useSafeAuth();
  const session = auth?.session ?? null;

  const [activeJob, setActiveJob] = useState<{
    job: PhotoJob;
    pointer: ActivePhotoJobPointer;
  } | null>(null);

  // Poll / synchronize real server photo job state
  useFocusEffect(
    useCallback(() => {
      if (!session?.access_token || !session.user.id) {
        setActiveJob(null);
        return undefined;
      }

      let active = true;
      let timer: ReturnType<typeof setTimeout> | null = null;
      let inFlight = false;

      const poll = async () => {
        if (inFlight) return;
        inFlight = true;
        try {
          const recovered = await recoverPhotoJob({
            token: session.access_token,
            userId: session.user.id,
          });
          if (!active) return;
          // Expire stale terminal jobs (>10 min) so Home sphere doesn't show old red error or green checkmark
          if (recovered && (COMPLETED.has(recovered.job.status) || recovered.job.status === 'failed')) {
            const isStale = Date.now() - (recovered.pointer.savedAt || 0) > 10 * 60 * 1000;
            if (isStale) {
              void clearActivePhotoJob(session.user.id, recovered.pointer.jobId);
              setActiveJob(null);
              return;
            }
          }
          setActiveJob(recovered);
          if (recovered && RUNNING.has(recovered.job.status)) {
            timer = setTimeout(poll, 4000);
          }
        } catch {
          if (active) timer = setTimeout(poll, 8000);
        } finally {
          inFlight = false;
        }
      };

      void poll();

      const appStateSub = AppState?.addEventListener
        ? AppState.addEventListener('change', (state) => {
            if (state !== 'active' || !active) return;
            if (timer) clearTimeout(timer);
            timer = null;
            void poll();
          })
        : null;

      return () => {
        active = false;
        if (timer) clearTimeout(timer);
        appStateSub?.remove?.();
      };
    }, [session?.access_token, session?.user.id])
  );

  // Derive sphere state from real backend job (safely guarded against stale status)
  let sphereState: RunnerSphereState = 'idle';
  if (activeJob) {
    const isStale = Date.now() - (activeJob.pointer.savedAt || 0) > 10 * 60 * 1000;
    if (!isStale) {
      if (RUNNING.has(activeJob.job.status)) {
        sphereState = 'processing';
      } else if (COMPLETED.has(activeJob.job.status)) {
        sphereState = 'completed';
      } else if (activeJob.job.status === 'failed') {
        sphereState = 'failed';
      }
    }
  }

  const handleSpherePress = () => {
    // If tapping failed sphere, reset failed pointer and clear from storage
    if (sphereState === 'failed' && activeJob && session?.user?.id) {
      void clearActivePhotoJob(session.user.id, activeJob.pointer.jobId);
      setActiveJob(null);
    }
    // Navigate to camera where active result, progress stages, or camera capture is rendered
    router.push('/camera');
  };

  return (
    <View style={styles.clusterContainer} testID="runner-sphere-companion-cluster">
      {/* 1. Left: 44dp Kinetic Runner Sphere with Photo AI State Machine */}
      <RunnerSphere
        state={sphereState}
        onPress={handleSpherePress}
        size={44}
      />

      {/* 2. Right: 32dp Handcrafted Micro Pixel-Art Sprout Companion */}
      <PixelCompanion
        streak={streak}
        onPress={onCompanionPress}
        size={32}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  clusterContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
});
