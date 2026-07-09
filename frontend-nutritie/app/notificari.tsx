import React, { useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
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
import { Colors, Radius, Spacing } from '../constants/theme';
import { useNotificationBanner, AppNotification } from '../context/NotificationBannerContext';

export default function NotificariScreen() {
  const insets = useSafeAreaInsets();
  const { notifications, markAllRead, clearAll } = useNotificationBanner();

  useEffect(() => {
    markAllRead();
  }, [markAllRead]);

  const getIcon = (type: string) => {
    switch (type) {
      case 'success':
        return <CheckCircle2 size={18} color={Colors.accent} />;
      case 'warning':
        return <AlertTriangle size={18} color={Colors.warning} />;
      case 'error':
        return <XCircle size={18} color={Colors.danger} />;
      case 'reward':
        return <Trophy size={18} color={Colors.accentSecondary} />;
      case 'reminder':
        return <Bell size={18} color={Colors.accentTertiary} />;
      case 'info':
      default:
        return <Info size={18} color={Colors.accentTertiary} />;
    }
  };

  const renderItem = ({ item }: { item: AppNotification }) => {
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
      <TouchableOpacity
        style={[styles.card, !item.read && styles.cardUnread]}
        activeOpacity={item.actionRoute ? 0.7 : 1}
        onPress={handlePress}
      >
        <View style={styles.iconContainer}>{getIcon(item.type)}</View>
        <View style={styles.cardContent}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>{item.title}</Text>
            <Text style={styles.cardTime}>{timeFormatted}</Text>
          </View>
          {item.message ? <Text style={styles.cardMessage}>{item.message}</Text> : null}
          {item.actionLabel ? (
            <Text style={styles.actionLink}>{item.actionLabel} →</Text>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top, Spacing.lg) }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Notificări</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={() => markAllRead()} style={styles.iconBtn}>
            <CheckCheck size={20} color={Colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => clearAll()} style={styles.iconBtn}>
            <Trash2 size={20} color={Colors.danger} />
          </TouchableOpacity>
        </View>
      </View>

      {/* List */}
      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Bell size={44} color={Colors.textTertiary} />
            <Text style={styles.emptyTitle}>Nicio notificare</Text>
            <Text style={styles.emptyText}>
              Evenimentele și recompensele din aplicație vor apărea aici.
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backButton: {
    padding: Spacing.sm,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  headerActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  iconBtn: {
    padding: Spacing.sm,
  },
  listContent: {
    padding: Spacing.lg,
    paddingBottom: 40,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardUnread: {
    borderColor: `${Colors.accent}55`,
    backgroundColor: Colors.surfaceElevated,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: Radius.pill,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  cardContent: {
    flex: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textPrimary,
    flex: 1,
  },
  cardTime: {
    fontSize: 12,
    color: Colors.textTertiary,
  },
  cardMessage: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  actionLink: {
    fontSize: 12,
    color: Colors.accent,
    fontWeight: '600',
    marginTop: 6,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginTop: Spacing.md,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: Spacing.xs,
    maxWidth: 240,
  },
});
