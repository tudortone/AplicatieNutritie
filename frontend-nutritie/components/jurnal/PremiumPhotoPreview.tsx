import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  type GestureResponderEvent,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Crown, Sparkles, Camera, ChevronRight } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';

export interface PremiumPhotoPreviewProps {
  onPressPaywall?: () => void;
  variant?: 'card' | 'modal';
  testID?: string;
}

export const PremiumPhotoPreview: React.FC<PremiumPhotoPreviewProps> = ({
  onPressPaywall,
  variant = 'card',
  testID = 'premium-photo-preview',
}) => {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();

  const handlePress = (e?: GestureResponderEvent) => {
    if (e && typeof e.stopPropagation === 'function') {
      e.stopPropagation();
    }
    if (onPressPaywall) {
      onPressPaywall();
    } else {
      router.push('/paywall' as never);
    }
  };

  const isModal = variant === 'modal';

  return (
    <View
      testID={testID}
      style={[
        styles.container,
        isModal ? styles.containerModal : styles.containerCard,
        {
          borderColor: 'rgba(255, 212, 90, 0.24)',
          backgroundColor: 'rgba(255, 255, 255, 0.02)',
        },
      ]}
      accessibilityRole="summary"
      accessibilityLabel={t('jurnal.premiumPhotoPreviewTitle')}
    >
      {/* Background Gradient */}
      <LinearGradient
        colors={[
          'rgba(255, 212, 90, 0.09)',
          'rgba(168, 85, 247, 0.05)',
          'rgba(9, 12, 14, 0.94)',
        ]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Top Gold Accent Glow Line */}
      <LinearGradient
        colors={['transparent', 'rgba(255, 212, 90, 0.45)', 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.topGlowLine}
      />

      {/* Header Badge */}
      <View style={styles.badgeWrapper}>
        <View
          style={[
            styles.badge,
            {
              backgroundColor: 'rgba(255, 212, 90, 0.12)',
              borderColor: 'rgba(255, 212, 90, 0.28)',
            },
          ]}
        >
          <Crown size={12} color={colors.gold || '#FFD45A'} />
          <Text
            style={[styles.badgeText, { color: colors.gold || '#FFD45A' }]}
            numberOfLines={1}
          >
            {t('jurnal.premiumPhotoBadge')}
          </Text>
        </View>
      </View>

      {/* Decorative Visual Meal Timeline Demonstration (safe vector mock without user photo) */}
      <View
        style={[styles.timelineTrack, isModal && styles.timelineTrackModal]}
        accessibilityElementsHidden
        importantForAccessibility="no"
      >
        {/* Step 1: Morning entry */}
        <View style={styles.timelineItem}>
          <View style={styles.timelineCard}>
            <Camera size={13} color="rgba(255, 255, 255, 0.65)" />
            <Text style={styles.timelineCardTime}>08:30</Text>
            <View style={[styles.timelineDot, { backgroundColor: '#CCFF00' }]} />
          </View>
        </View>

        <View style={styles.timelineConnector} />

        {/* Step 2: Featured Lunch entry */}
        <View style={styles.timelineItem}>
          <View
            style={[
              styles.timelineCard,
              styles.timelineCardActive,
              {
                borderColor: 'rgba(255, 212, 90, 0.45)',
                backgroundColor: 'rgba(255, 212, 90, 0.10)',
              },
            ]}
          >
            <Sparkles size={14} color={colors.gold || '#FFD45A'} />
            <Text
              style={[
                styles.timelineCardTime,
                { color: colors.gold || '#FFD45A', fontWeight: '800' },
              ]}
            >
              13:15
            </Text>
            <View
              style={[
                styles.timelineDot,
                { backgroundColor: colors.gold || '#FFD45A' },
              ]}
            />
          </View>
        </View>

        <View style={styles.timelineConnector} />

        {/* Step 3: Evening entry */}
        <View style={styles.timelineItem}>
          <View style={styles.timelineCard}>
            <Camera size={13} color="rgba(255, 255, 255, 0.65)" />
            <Text style={styles.timelineCardTime}>19:45</Text>
            <View style={[styles.timelineDot, { backgroundColor: '#A855F7' }]} />
          </View>
        </View>
      </View>

      {/* Benefit Typography */}
      <View style={styles.textContainer}>
        <Text
          style={[styles.title, { color: colors.textPrimary }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.85}
        >
          {t('jurnal.premiumPhotoPreviewTitle')}
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {t('jurnal.premiumPhotoPreviewLine1')}
        </Text>
        {isModal ? (
          <Text
            style={[
              styles.subtitle,
              { color: colors.textTertiary || colors.textSecondary, marginTop: 4 },
            ]}
          >
            {t('jurnal.premiumPhotoPreviewLine2')}
          </Text>
        ) : null}
      </View>

      {/* CTA Button - Opens Paywall Authoritatively */}
      <TouchableOpacity
        testID="premium-photo-unlock-cta"
        onPress={handlePress}
        activeOpacity={0.85}
        style={styles.ctaWrapper}
        accessibilityRole="button"
        accessibilityLabel={t('jurnal.unlockPremium')}
        accessibilityHint={t('jurnal.unlockMealPhotos')}
      >
        <LinearGradient
          colors={['#FFD45A', '#F59E0B']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.ctaButton}
        >
          <Crown size={14} color="#090C0E" />
          <Text style={styles.ctaText}>{t('jurnal.unlockPremium')}</Text>
          <ChevronRight size={14} color="#090C0E" />
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  containerCard: {
    marginTop: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  containerModal: {
    marginTop: 8,
    marginBottom: 16,
    paddingVertical: 20,
    paddingHorizontal: 16,
  },
  topGlowLine: {
    position: 'absolute',
    top: 0,
    left: 20,
    right: 20,
    height: 1.5,
  },
  badgeWrapper: {
    marginBottom: 10,
    alignItems: 'center',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  timelineTrack: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    maxWidth: 280,
    marginBottom: 12,
  },
  timelineTrackModal: {
    maxWidth: 320,
    marginBottom: 16,
  },
  timelineItem: {
    alignItems: 'center',
  },
  timelineCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  timelineCardActive: {
    transform: [{ scale: 1.05 }],
  },
  timelineCardTime: {
    color: 'rgba(255, 255, 255, 0.75)',
    fontSize: 11,
    fontWeight: '700',
  },
  timelineDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  timelineConnector: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255, 212, 90, 0.25)',
    marginHorizontal: 4,
  },
  textContainer: {
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 8,
  },
  title: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
    marginBottom: 4,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
    textAlign: 'center',
  },
  ctaWrapper: {
    width: '100%',
    maxWidth: 240,
    alignItems: 'center',
  },
  ctaButton: {
    width: '100%',
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 12,
  },
  ctaText: {
    color: '#090C0E',
    fontSize: 13,
    fontWeight: '800',
  },
});
