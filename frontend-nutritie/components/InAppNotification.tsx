import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CheckCircle2, AlertTriangle, Info, Bell, X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../context/ThemeContext';

export type BannerType = 'success' | 'info' | 'warning' | 'reminder';

export interface InAppNotificationProps {
  visible: boolean;
  title: string;
  message?: string;
  type?: BannerType;
  onDismiss: () => void;
}

export default function InAppNotification({
  visible,
  title,
  message,
  type = 'info',
  onDismiss,
}: InAppNotificationProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (visible) {
      if (type === 'success') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      } else if (type === 'warning') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      } else {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      }
    }
  }, [visible, type]);

  if (!visible) return null;

  const getIcon = () => {
    switch (type) {
      case 'success':
        return <CheckCircle2 size={22} color={colors.accent} />;
      case 'warning':
        return <AlertTriangle size={22} color={colors.warning} />;
      case 'reminder':
        return <Bell size={22} color={colors.accent} />;
      case 'info':
      default:
        return <Info size={22} color={colors.accentSecondary} />;
    }
  };

  const getBorderColor = () => {
    switch (type) {
      case 'warning':
        return `${colors.warning}44`;
      case 'info':
        return `${colors.accentSecondary}44`;
      case 'success':
      case 'reminder':
      default:
        return `${colors.accent}44`;
    }
  };

  const topPosition = Math.max(insets.top + 8, Platform.OS === 'ios' ? 48 : 24);

  return (
    <Animated.View
      entering={FadeInDown.duration(350).springify()}
      exiting={FadeOutUp.duration(250)}
      style={[
        styles.container,
        {
          top: topPosition,
        },
      ]}
    >
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={onDismiss}
        style={styles.touchable}
        accessibilityRole="button"
        accessibilityLabel="Închide notificarea"
      >
        <BlurView
          intensity={Platform.OS === 'ios' ? 40 : 30}
          tint="dark"
          style={[
            styles.blurCard,
            {
              borderColor: getBorderColor(),
            },
          ]}
        >
          <LinearGradient
            colors={[`${colors.accent}14`, 'rgba(0,0,0,0)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.gradient}
          />

          <View style={styles.contentRow}>
            <View style={styles.iconContainer}>{getIcon()}</View>

            <View style={styles.textContainer}>
              <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
              {!!message && (
                <Text style={[styles.message, { color: colors.textTertiary }]} numberOfLines={2}>
                  {message}
                </Text>
              )}
            </View>

            <View style={styles.closeBtn}>
              <X size={18} color={colors.textTertiary} />
            </View>
          </View>
        </BlurView>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 9999,
    elevation: 10,
  },
  touchable: {
    width: '100%',
  },
  blurCard: {
    borderRadius: 22,
    borderWidth: 1,
    overflow: 'hidden',
    backgroundColor: 'rgba(9, 12, 14, 0.78)',
  },
  gradient: {
    ...StyleSheet.absoluteFillObject,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  iconContainer: {
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textContainer: {
    flex: 1,
    marginRight: 8,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  message: {
    fontSize: 12,
    lineHeight: 16,
  },
  closeBtn: {
    padding: 4,
  },
});
