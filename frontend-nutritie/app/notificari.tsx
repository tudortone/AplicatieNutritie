import React, { useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import {
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  Info,
  Bell,
  XCircle,
  Trophy,
  Trash2,
  CheckCheck,
} from 'lucide-react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Radius, Spacing } from '../constants/theme';
import { useNotificationBanner, AppNotification } from '../context/NotificationBannerContext';
import { useTheme } from '../context/ThemeContext';

export default function NotificariScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { notifications, markAllRead, clearAll } = useNotificationBanner();

  useEffect(() => {
    markAllRead();
  }, [markAllRead]);

  const getIconBg = (type: string): string => {
    switch (type) {
      case 'success': return colors.success + '20';
      case 'warning': return colors.warning + '20';
      case 'error': return colors.danger + '20';
      case 'reward': return colors.accentSecondary + '20';
      case 'reminder': return colors.accentTertiary + '20';
      default: return colors.accentTertiary + '20';
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'success':
        return <CheckCircle2 size={18} color={colors.success} />;
      case 'warning':
        return <AlertTriangle size={18} color={colors.warning} />;
      case 'error':
        return <XCircle size={18} color={colors.danger} />;
      case 'reward':
        return <Trophy size={18} color={colors.accentSecondary} />;
      case 'reminder':
        return <Bell size={18} color={colors.accentTertiary} />;
      case 'info':
      default:
        return <Info size={18} color={colors.accentTertiary} />;
    }
  };

  const renderItem = ({ item, index }: { item: AppNotification; index: number }) => {
    const timeFormatted = new Date(item.createdAt).toLocaleTimeString('ro-RO', {
      hour: '2-digit',
      minute: '2-digit',
    });

    const handlePress = () => {
      if (item.actionRoute) {
        router.push(item.actionRoute as any);
      }
    };

    return (
      <Animated.View entering={FadeInDown.duration(400).delay(index * 60)}>
        <TouchableOpacity
          style={[
            styles.card,
            {
              backgroundColor: item.read ? colors.surface : colors.surfaceElevated,
              borderColor: item.read ? colors.border : colors.accent + '44',
            }
          ]}
          activeOpacity={item.actionRoute ? 0.7 : 1}
          onPress={handlePress}
        >
          <View style={[styles.iconContainer, { backgroundColor: getIconBg(item.type) }]}>
            {getIcon(item.type)}
          </View>
          <View style={styles.cardContent}>
            <View style={styles.cardHeader}>
              <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>{item.title}</Text>
              <Text style={[styles.cardTime, { color: colors.textTertiary }]}>{timeFormatted}</Text>
            </View>
            {item.message ? (
              <Text style={[styles.cardMessage, { color: colors.textSecondary }]}>{item.message}</Text>
            ) : null}
            {item.actionLabel ? (
              <Text style={[styles.actionLink, { color: colors.accent }]}>{item.actionLabel} →</Text>
            ) : null}
          </View>
          {!item.read && (
            <View style={[styles.unreadDot, { backgroundColor: colors.accent }]} />
          )}
        </TouchableOpacity>
      </Animated.View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Background glow */}
      <View style={[styles.glowTop, { backgroundColor: colors.accent }]} />

      {/* Header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: Math.max(insets.top, Spacing.lg),
            borderBottomColor: colors.border,
            backgroundColor: colors.surface + 'CC',
          }
        ]}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.backButton, { backgroundColor: colors.surfaceBg, borderColor: colors.border }]}
        >
          <ArrowLeft size={20} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Notificări</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            onPress={() => markAllRead()}
            style={[styles.iconBtn, { backgroundColor: colors.surfaceBg, borderColor: colors.border }]}
          >
            <CheckCheck size={18} color={colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => clearAll()}
            style={[styles.iconBtn, { backgroundColor: colors.danger + '15', borderColor: colors.danger + '30' }]}
          >
            <Trash2 size={18} color={colors.danger} />
          </TouchableOpacity>
        </View>
      </View>

      {/* List */}
      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: Math.max(insets.bottom, Spacing.xl) + 80 }
        ]}
        ListEmptyComponent={
          <Animated.View entering={FadeInDown.duration(500)} style={styles.emptyContainer}>
            <View style={[styles.emptyIconBg, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
              <Bell size={40} color={colors.textTertiary} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>Nicio notificare</Text>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              Evenimentele și recompensele din aplicație vor apărea aici.
            </Text>
          </Animated.View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  glowTop: {
    position: 'absolute',
    top: -150,
    right: -80,
    width: 300,
    height: 300,
    borderRadius: 150,
    opacity: 0.05,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  headerActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    padding: Spacing.lg,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
  },
  iconContainer: {
    width: 38,
    height: 38,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
    flexShrink: 0,
  },
  cardContent: {
    flex: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
  },
  cardTime: {
    fontSize: 12,
  },
  cardMessage: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
  actionLink: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 6,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 4,
    marginLeft: 6,
    flexShrink: 0,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 100,
  },
  emptyIconBg: {
    width: 88,
    height: 88,
    borderRadius: 28,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    maxWidth: 240,
  },
});
