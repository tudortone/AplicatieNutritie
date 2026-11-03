import React, { useCallback, useState } from 'react';
import {
  AppState,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { ChevronRight, Sparkles, Zap } from 'lucide-react-native';
import { useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { recoverPhotoJob } from '../../lib/photoJobs';
import {
  getCompanionStage,
  getLimitBeaconStatus,
  type CompanionStageInfo,
  type BeaconStatusInfo,
} from '../../lib/flowCompanion';

const COMPANION_AVATAR = require('../../assets/images/flow-companion-avatar.jpg');
const RUNNING = new Set(['queued', 'running', 'processing']);

export interface FlowCompanionCardProps {
  streak: number;
  caloriiConsumate: number;
  caloriiTinta: number;
  userId?: string | null;
  onPress: () => void;
}

function useSafeAuth() {
  try {
    return useAuth();
  } catch {
    return null;
  }
}

export function FlowCompanionCard({
  streak = 0,
  caloriiConsumate = 0,
  caloriiTinta = 2000,
  userId,
  onPress,
}: FlowCompanionCardProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const auth = useSafeAuth();
  const session = auth?.session ?? null;
  const activeUserId = userId || session?.user?.id || null;

  const [companionName, setCompanionName] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Sync companion custom name & background photo job analysis state
  useFocusEffect(
    useCallback(() => {
      let isMounted = true;
      const companionKey = activeUserId
        ? `@getflow:companion_name_${activeUserId}`
        : '@getflow:companion_name_guest';

      AsyncStorage.getItem(companionKey)
        .then((val) => {
          if (isMounted) setCompanionName(val?.trim() || null);
        })
        .catch(() => {});

      if (!session?.access_token || !session.user.id) {
        setIsAnalyzing(false);
        return undefined;
      }

      let timer: ReturnType<typeof setTimeout> | null = null;
      let inFlight = false;

      const checkActiveJob = async () => {
        if (inFlight) return;
        inFlight = true;
        try {
          const recovered = await recoverPhotoJob({
            token: session.access_token,
            userId: session.user.id,
          });
          if (!isMounted) return;
          const running = Boolean(recovered && RUNNING.has(recovered.job.status));
          setIsAnalyzing(running);
          if (running) {
            timer = setTimeout(checkActiveJob, 3500);
          }
        } catch {
          if (isMounted) setIsAnalyzing(false);
        } finally {
          inFlight = false;
        }
      };

      void checkActiveJob();

      const appStateSub = AppState?.addEventListener
        ? AppState.addEventListener('change', (state) => {
            if (state !== 'active' || !isMounted) return;
            if (timer) clearTimeout(timer);
            void checkActiveJob();
          })
        : null;

      return () => {
        isMounted = false;
        if (timer) clearTimeout(timer);
        appStateSub?.remove?.();
      };
    }, [activeUserId, session?.access_token, session?.user?.id])
  );

  const stage: CompanionStageInfo = getCompanionStage(streak);
  const beacon: BeaconStatusInfo = getLimitBeaconStatus(caloriiConsumate, caloriiTinta);

  const stageName = t(stage.nameKey, stage.defaultName);
  const beaconLabel = t(beacon.labelKey, beacon.defaultLabel);
  const displayName = companionName?.trim() || t('flowCompanion.defaultName', 'Sprout');

  const handlePress = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    onPress();
  };

  const getCompanionSpeech = (): string => {
    if (isAnalyzing) {
      return t('flowCompanion.analyzingFoodSpeech', '⚡ Analizez mâncarea ta... Revino în câteva secunde!');
    }
    if (beacon.status === 'exceeded') {
      return t('flowCompanion.speechExceeded', 'Ținta calorică a fost atinsă. Hidratează-te și odihnește-te!');
    }
    if (beacon.status === 'near_limit') {
      return t('flowCompanion.speechNearLimit', 'Ai consumat peste 85% din buget. Alege o masă ușoară!');
    }
    return t('flowCompanion.speechOptimal', 'Totul este în grafic. Ai energie liberă pentru azi!');
  };

  return (
    <TouchableOpacity
      testID="home-flow-companion-card"
      onPress={handlePress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`${displayName}, ${stageName}, ${beaconLabel}. ${getCompanionSpeech()}`}
      style={[
        styles.card,
        {
          backgroundColor: colors.cardBg,
          borderColor: isAnalyzing ? colors.accent : colors.cardBorder,
        },
      ]}
    >
      {/* 1. Left: Cyber Mascot Avatar with glowing ring */}
      <View
        style={[
          styles.avatarWrap,
          {
            borderColor: isAnalyzing ? colors.accent : beacon.color + '88',
            shadowColor: isAnalyzing ? colors.accent : beacon.color,
          },
        ]}
      >
        <Image
          source={COMPANION_AVATAR}
          style={styles.avatarImg}
          resizeMode="cover"
        />
        {isAnalyzing ? (
          <View style={[styles.analyzingPulseBadge, { backgroundColor: colors.accent }]}>
            <Zap size={10} color={colors.background} strokeWidth={3} />
          </View>
        ) : null}
      </View>

      {/* 2. Middle: Companion Identity & Dynamic Speech */}
      <View style={styles.contentWrap}>
        <View style={styles.topRow}>
          <Text style={[styles.companionName, { color: colors.textPrimary }]} numberOfLines={1}>
            {displayName}
          </Text>

          <View style={[styles.stageBadge, { backgroundColor: colors.accent + '15', borderColor: colors.accent + '33' }]}>
            <Sparkles size={10} color={colors.accent} />
            <Text style={[styles.stageText, { color: colors.accent }]}>
              {stageName}
            </Text>
          </View>
        </View>

        <Text
          style={[
            styles.speechText,
            {
              color: isAnalyzing ? colors.accent : colors.textSecondary,
              fontWeight: isAnalyzing ? '700' : '500',
            },
          ]}
          numberOfLines={2}
        >
          {getCompanionSpeech()}
        </Text>
      </View>

      {/* 3. Right: Limit Beacon Status Pill + Chevron */}
      <View style={styles.rightWrap}>
        <View
          style={[
            styles.beaconPill,
            {
              backgroundColor: beacon.color + '18',
              borderColor: beacon.color + '44',
            },
          ]}
        >
          <View style={[styles.beaconDot, { backgroundColor: beacon.color }]} />
          <Text style={[styles.beaconText, { color: beacon.color }]} numberOfLines={1}>
            {beaconLabel}
          </Text>
        </View>
        <ChevronRight size={16} color={colors.textSecondary} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 14,
    gap: 12,
  },
  avatarWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1.5,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 4,
    position: 'relative',
  },
  avatarImg: {
    width: '100%',
    height: '100%',
  },
  analyzingPulseBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#090C0E',
  },
  contentWrap: {
    flex: 1,
    justifyContent: 'center',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 3,
  },
  companionName: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  stageBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 1.5,
    borderRadius: 8,
    borderWidth: 1,
  },
  stageText: {
    fontSize: 10,
    fontWeight: '700',
  },
  speechText: {
    fontSize: 12,
    lineHeight: 16,
  },
  rightWrap: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 6,
  },
  beaconPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
  },
  beaconDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  beaconText: {
    fontSize: 11,
    fontWeight: '700',
  },
});
