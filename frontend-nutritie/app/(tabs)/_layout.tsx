import { Tabs, useRouter } from 'expo-router';
import React from 'react';
import { Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Home, List, MessageCircle, User, BarChart3, Dumbbell, Gift, History } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { useTranslation } from 'react-i18next';

type SportAction = 'progress' | 'history';

export default function TabLayout() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const compact = width <= 420;
  const veryCompact = width <= 350;
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'ios' ? 24 : 14);
  const tabHeight = (compact ? 54 : 58) + bottomInset;
  const iconSize = compact ? 21 : 24;

  const icon = (Icon: typeof Home) => {
    const TabIcon = ({ color }: { color: string; size: number }) => (
      <Icon size={iconSize} color={color} strokeWidth={color === colors.accent ? 2.5 : 1.5} />
    );
    TabIcon.displayName = 'TabIcon';
    return TabIcon;
  };

  const headerAction = (type: SportAction) => {
    const config = {
      progress: { Icon: Gift, label: t('tabs.workoutQuestsAction'), route: '/progres-antrenamente' as const, active: true },
      history: { Icon: History, label: t('tabs.workoutJournalAction'), route: '/jurnal-antrenamente' as const, active: false },
    }[type];
    const ActionIcon = config.Icon;
    return (
      <Pressable
        onPress={() => router.push(config.route)}
        accessibilityRole="button"
        accessibilityLabel={config.label}
        hitSlop={5}
        style={({ pressed }) => [
          styles.headerAction,
          {
            backgroundColor: config.active ? `${colors.accent}20` : colors.surfaceBg,
            borderColor: config.active ? `${colors.accent}66` : colors.border,
            opacity: pressed ? 0.6 : 1,
          },
        ]}
      >
        <ActionIcon size={18} color={config.active ? colors.accent : colors.textPrimary} />
      </Pressable>
    );
  };

  return (
    <View style={styles.root}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.accent,
          tabBarInactiveTintColor: colors.textSecondary,
          tabBarHideOnKeyboard: true,
          tabBarShowLabel: !veryCompact,
          tabBarItemStyle: styles.tabBarItem,
          tabBarStyle: [
            styles.tabBar,
            { height: tabHeight, paddingBottom: bottomInset, paddingTop: compact ? 7 : 10 },
            Platform.OS === 'android' && {
              backgroundColor: `${colors.surface}F8`,
              borderTopWidth: 1,
              borderTopColor: colors.border,
              position: 'absolute' as const,
              elevation: 16,
            },
          ],
          tabBarBackground: Platform.OS === 'ios'
            ? () => <BlurView intensity={60} tint="dark" style={[StyleSheet.absoluteFill, styles.tabBarBg]} />
            : undefined,
          tabBarLabelStyle: [styles.tabBarLabel, compact && styles.compactLabel],
        }}
      >
        <Tabs.Screen name="index" options={{ title: t('tabs.home'), tabBarAccessibilityLabel: t('tabs.a11yHome'), tabBarIcon: icon(Home) }} />
        <Tabs.Screen name="istoric" options={{ title: t('tabs.journal'), tabBarAccessibilityLabel: t('tabs.a11yJournal'), tabBarIcon: icon(List) }} />
        <Tabs.Screen
          name="antrenamente"
          options={{
            title: t('tabs.workouts'),
            tabBarAccessibilityLabel: t('tabs.a11yWorkouts'),
            tabBarIcon: icon(Dumbbell),
            headerShown: true,
            headerTitle: t('tabs.workouts'),
            headerTitleStyle: { color: colors.textPrimary, fontWeight: '900' },
            headerStyle: { backgroundColor: colors.background },
            headerShadowVisible: false,
            headerRight: () => (
              <View style={styles.headerActions}>
                {headerAction('progress')}
                {headerAction('history')}
              </View>
            ),
          }}
        />
        <Tabs.Screen name="statistici" options={{ title: compact ? t('tabs.statsCompact') : t('tabs.stats'), tabBarAccessibilityLabel: t('tabs.a11yStats'), tabBarIcon: icon(BarChart3) }} />
        <Tabs.Screen name="chat" options={{ title: compact ? t('tabs.assistantCompact') : t('tabs.assistant'), tabBarAccessibilityLabel: t('tabs.a11yAssistant'), tabBarIcon: icon(MessageCircle) }} />
        <Tabs.Screen name="profil" options={{ title: t('tabs.profile'), tabBarAccessibilityLabel: t('tabs.a11yProfile'), tabBarIcon: icon(User) }} />
      </Tabs>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  tabBar: { position: 'absolute', borderTopWidth: 0, elevation: 0, backgroundColor: 'transparent' },
  tabBarBg: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' },
  tabBarItem: { minWidth: 0, paddingHorizontal: 0 },
  tabBarLabel: { fontSize: 11, fontWeight: '700', marginTop: 2 },
  compactLabel: { fontSize: 9, lineHeight: 11 },
  headerActions: { flexDirection: 'row', gap: 6, marginRight: 12 },
  headerAction: { width: 38, height: 38, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
