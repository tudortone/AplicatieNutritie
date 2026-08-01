import React from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CheckCircle2,
  AlertTriangle,
  Info,
  Bell,
  XCircle,
  Trophy,
  X,
} from 'lucide-react-native';
import { router } from 'expo-router';
import { Radius, Spacing } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';
import type { NotificationType } from '../context/NotificationBannerContext';

export interface InAppNotificationProps {
  visible: boolean;
  title: string;
  message?: string;
  type?: NotificationType;
  actionLabel?: string;
  actionRoute?: string;
  onDismiss: () => void;
}

export default function InAppNotification({
  visible,
  title,
  message,
  type = 'info',
  actionLabel,
  actionRoute,
  onDismiss,
}: InAppNotificationProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  if (!visible) return null;

  const typeColor = (() => {
    switch (type) {
      case 'success': return colors.success;
      case 'reward': return colors.accentSecondary;
      case 'warning': return colors.warning;
      case 'error': return colors.danger;
      case 'reminder':
      case 'info':
      default: return colors.accentTertiary;
    }
  })();

  const icon = (() => {
    switch (type) {
      case 'success': return <CheckCircle2 size={20} color={typeColor} />;
      case 'warning': return <AlertTriangle size={20} color={typeColor} />;
      case 'error': return <XCircle size={20} color={typeColor} />;
      case 'reward': return <Trophy size={20} color={typeColor} />;
      case 'reminder': return <Bell size={20} color={typeColor} />;
      default: return <Info size={20} color={typeColor} />;
    }
  })();

  const topPosition = Math.max(insets.top + Spacing.sm, Platform.OS === 'android' ? 24 : 8);

  const runAction = () => {
    if (!actionRoute) return;
    onDismiss();
    router.push(actionRoute as never);
  };

  return (
    <Animated.View
      entering={FadeInDown.duration(280).springify().damping(18)}
      exiting={FadeOutUp.duration(200)}
      style={[styles.container, { top: topPosition }]}
      accessibilityLiveRegion="polite"
    >
      <BlurView
        intensity={Platform.OS === 'ios' ? 45 : 30}
        tint="dark"
        style={[
          styles.card,
          {
            backgroundColor: `${colors.surface}F2`,
            borderColor: `${typeColor}40`,
          },
        ]}
      >
        <View style={[styles.indicatorBar, { backgroundColor: typeColor }]} />
        <View style={[styles.iconCircle, { backgroundColor: `${typeColor}1F` }]}>
          {icon}
        </View>

        <View style={styles.content}>
          <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>
            {title}
          </Text>
          {message ? (
            <Text style={[styles.message, { color: colors.textSecondary }]} numberOfLines={3}>
              {message}
            </Text>
          ) : null}
        </View>

        {actionLabel && actionRoute ? (
          <Pressable
            onPress={runAction}
            accessibilityRole="button"
            accessibilityLabel={actionLabel}
            hitSlop={6}
            style={({ pressed }) => [
              styles.actionPill,
              { backgroundColor: `${typeColor}16`, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Text style={[styles.actionText, { color: typeColor }]}>{actionLabel}</Text>
          </Pressable>
        ) : null}

        <Pressable
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel="Închide notificarea"
          hitSlop={10}
          style={({ pressed }) => [styles.closeButton, { opacity: pressed ? 0.55 : 1 }]}
        >
          <X size={17} color={colors.textTertiary} />
        </Pressable>
      </BlurView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: Spacing.lg,
    right: Spacing.lg,
    zIndex: 99999,
    elevation: 30,
  },
  card: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    paddingVertical: Spacing.md,
    paddingRight: 42,
  },
  indicatorBar: {
    width: 4,
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: Spacing.md,
    marginRight: Spacing.md,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '800',
  },
  message: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
  actionPill: {
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.sm,
    marginLeft: Spacing.sm,
  },
  actionText: {
    fontSize: 12,
    fontWeight: '800',
  },
  closeButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
