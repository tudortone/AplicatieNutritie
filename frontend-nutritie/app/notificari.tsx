import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable } from 'react-native';
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
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Radius, Spacing } from '../constants/theme';
import { useNotificationBanner, type AppNotification } from '../context/NotificationBannerContext';
import { useTheme } from '../context/ThemeContext';
import { ConfirmSheet } from '../components/ui/ConfirmSheet';
import { isValidActionRoute } from '../lib/actionRoutes';

export default function NotificariScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { notifications, markAllRead, clearAll } = useNotificationBanner();
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  useEffect(() => {
    markAllRead();
  }, [markAllRead]);

  const getIconBg = (type: string): string => {
    switch (type) {
      case 'success': return `${colors.success}20`;
      case 'warning': return `${colors.warning}20`;
      case 'error': return `${colors.danger}20`;
      case 'reward': return `${colors.accentSecondary}20`;
      default: return `${colors.accentTertiary}20`;
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'success': return <CheckCircle2 size={18} color={colors.success} />;
      case 'warning': return <AlertTriangle size={18} color={colors.warning} />;
      case 'error': return <XCircle size={18} color={colors.danger} />;
      case 'reward': return <Trophy size={18} color={colors.accentSecondary} />;
      case 'reminder': return <Bell size={18} color={colors.accentTertiary} />;
      default: return <Info size={18} color={colors.accentTertiary} />;
    }
  };

  const renderItem = ({ item }: { item: AppNotification }) => {
    const timeFormatted = new Date(item.createdAt).toLocaleTimeString('ro-RO', {
      hour: '2-digit',
      minute: '2-digit',
    });
    const canOpen = Boolean(item.actionRoute);

    const handlePress = () => {
      // BUG-038: actionRoute e persistat — îl acceptăm DOAR dacă e o rută
      // cunoscută din allowlist (lib/actionRoutes), nu un șir oarecare.
      const ruta = item.actionRoute;
      if (ruta && isValidActionRoute(ruta)) router.push(ruta as never);
    };

    return (
      // BUG-012: fără animație per-rând — pe un FlatList virtualizat, orice
      // schimbare de identitate (ex. markAllRead la mount) remonta rândurile și
      // re-triggera stagger-ul „wave" pe scroll.
      <View>
        <Pressable
          style={({ pressed }) => [
            styles.card,
            {
              backgroundColor: item.read ? colors.surface : colors.surfaceElevated,
              borderColor: item.read ? colors.border : `${colors.accent}44`,
              opacity: pressed && canOpen ? 0.72 : 1,
            },
          ]}
          onPress={handlePress}
          disabled={!canOpen}
          accessibilityRole={canOpen ? 'button' : undefined}
          accessibilityLabel={canOpen ? `${item.title}. ${item.actionLabel || 'Deschide'}` : item.title}
          accessibilityState={{ disabled: !canOpen }}
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
            {item.actionLabel && canOpen ? (
              <Text style={[styles.actionLink, { color: colors.accent }]}>{item.actionLabel} →</Text>
            ) : null}
          </View>
          {!item.read ? <View style={[styles.unreadDot, { backgroundColor: colors.accent }]} /> : null}
        </Pressable>
      </View>
    );
  };

  const hasNotifications = notifications.length > 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.glowTop, { backgroundColor: colors.accent }]} />

      <View
        style={[
          styles.header,
          {
            paddingTop: Math.max(insets.top, Spacing.lg),
            borderBottomColor: colors.border,
            backgroundColor: `${colors.surface}E8`,
          },
        ]}
      >
        <Pressable
          // BUG-013 (WS-2): dacă ConfirmSheet-ul (Modal transparent) e deschis,
          // îl închidem întâi, ca pop-ul să nu lase fereastra modală goală.
          onPress={() => {
            if (showClearConfirm) setShowClearConfirm(false);
            router.back();
          }}
          accessibilityRole="button"
          accessibilityLabel="Înapoi"
          hitSlop={8}
          style={({ pressed }) => [
            styles.headerButton,
            { backgroundColor: colors.surfaceBg, borderColor: colors.border, opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <ArrowLeft size={20} color={colors.textPrimary} />
        </Pressable>

        <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>Notificări</Text>

        <View style={styles.headerActions}>
          <Pressable
            onPress={markAllRead}
            disabled={!hasNotifications}
            accessibilityRole="button"
            accessibilityLabel="Marchează toate notificările ca citite"
            accessibilityState={{ disabled: !hasNotifications }}
            style={({ pressed }) => [
              styles.headerButton,
              {
                backgroundColor: colors.surfaceBg,
                borderColor: colors.border,
                opacity: !hasNotifications ? 0.35 : pressed ? 0.6 : 1,
              },
            ]}
          >
            <CheckCheck size={18} color={colors.textSecondary} />
          </Pressable>
          <Pressable
            onPress={() => setShowClearConfirm(true)}
            disabled={!hasNotifications}
            accessibilityRole="button"
            accessibilityLabel="Șterge toate notificările"
            accessibilityState={{ disabled: !hasNotifications }}
            style={({ pressed }) => [
              styles.headerButton,
              {
                backgroundColor: `${colors.danger}15`,
                borderColor: `${colors.danger}30`,
                opacity: !hasNotifications ? 0.35 : pressed ? 0.6 : 1,
              },
            ]}
          >
            <Trash2 size={18} color={colors.danger} />
          </Pressable>
        </View>
      </View>

      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={[
          styles.listContent,
          !hasNotifications && styles.emptyList,
          { paddingBottom: Math.max(insets.bottom, Spacing.xl) + 24 },
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

      <ConfirmSheet
        visible={showClearConfirm}
        title="Ștergi toate notificările?"
        message="Această acțiune elimină întregul istoric de notificări și nu poate fi anulată."
        confirmLabel="Șterge toate"
        onCancel={() => setShowClearConfirm(false)}
        onConfirm={() => {
          setShowClearConfirm(false);
          clearAll();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
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
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    gap: 10,
  },
  headerButton: {
    width: 44,
    height: 44,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  headerActions: { flexDirection: 'row', gap: Spacing.sm },
  listContent: { padding: Spacing.lg },
  emptyList: { flexGrow: 1 },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
    flexShrink: 0,
  },
  cardContent: { flex: 1 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  cardTitle: { fontSize: 15, fontWeight: '700', flex: 1 },
  cardTime: { fontSize: 12 },
  cardMessage: { fontSize: 13, lineHeight: 18, marginTop: 4 },
  actionLink: { fontSize: 12, fontWeight: '700', marginTop: 6 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, marginTop: 4, marginLeft: 6, flexShrink: 0 },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 60 },
  emptyIconBg: {
    width: 88,
    height: 88,
    borderRadius: 28,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  emptyTitle: { fontSize: 18, fontWeight: '800', marginBottom: 8 },
  emptyText: { fontSize: 14, lineHeight: 20, textAlign: 'center', maxWidth: 260 },
});
