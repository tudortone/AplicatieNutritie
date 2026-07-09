import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CheckCircle2, AlertTriangle, Info, Bell, XCircle, Trophy } from 'lucide-react-native';
import { router } from 'expo-router';
import { Colors, Radius, Spacing } from '../constants/theme';
import { NotificationType } from '../context/NotificationBannerContext';

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

  if (!visible) return null;

  const getIcon = () => {
    switch (type) {
      case 'success':
        return <CheckCircle2 size={20} color={Colors.accent} />;
      case 'warning':
        return <AlertTriangle size={20} color={Colors.warning} />;
      case 'error':
        return <XCircle size={20} color={Colors.danger} />;
      case 'reward':
        return <Trophy size={20} color={Colors.accentSecondary} />;
      case 'reminder':
        return <Bell size={20} color={Colors.accentTertiary} />;
      case 'info':
      default:
        return <Info size={20} color={Colors.accentTertiary} />;
    }
  };

  const getTypeColor = () => {
    switch (type) {
      case 'success':
        return Colors.accent;
      case 'reward':
        return Colors.accentSecondary;
      case 'warning':
        return Colors.warning;
      case 'error':
        return Colors.danger;
      case 'reminder':
      case 'info':
      default:
        return Colors.accentTertiary;
    }
  };

  const topPosition = Math.max(insets.top + Spacing.sm, Platform.OS === 'ios' ? 48 : 24);

  const handlePress = () => {
    onDismiss();
    if (actionRoute) {
      router.push(actionRoute as any);
    }
  };

  return (
    <Animated.View
      entering={FadeInDown.duration(350).springify()}
      exiting={FadeOutUp.duration(250)}
      style={[styles.container, { top: topPosition }]}
    >
      <TouchableOpacity
        activeOpacity={0.92}
        onPress={handlePress}
        style={styles.touchable}
        accessibilityRole="button"
        accessibilityLabel="Notificare NutriAI"
      >
        <BlurView
          intensity={Platform.OS === 'ios' ? 45 : 35}
          tint="dark"
          style={[styles.blurCard, { borderColor: `${getTypeColor()}33` }]}
        >
          <View style={[styles.indicatorBar, { backgroundColor: getTypeColor() }]} />

          <View style={[styles.iconCircle, { backgroundColor: `${getTypeColor()}1F` }]}>
            {getIcon()}
          </View>

          <View style={styles.content}>
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
            {message ? (
              <Text style={styles.message} numberOfLines={2}>
                {message}
              </Text>
            ) : null}
          </View>

          {actionLabel ? (
            <View style={styles.actionPill}>
              <Text style={[styles.actionText, { color: getTypeColor() }]}>{actionLabel}</Text>
            </View>
          ) : null}
        </BlurView>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: Spacing.lg,
    right: Spacing.lg,
    zIndex: 99999,
  },
  touchable: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  blurCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(18, 22, 26, 0.88)',
    borderWidth: 1,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    paddingVertical: Spacing.md,
    paddingRight: Spacing.md,
  },
  indicatorBar: {
    width: 4,
    height: '100%',
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
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  message: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  actionPill: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.sm,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginLeft: Spacing.sm,
  },
  actionText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
