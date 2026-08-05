import { Tabs, useRouter } from 'expo-router';
import React from 'react';
import { Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Home, List, MessageCircle, User, BarChart3, Dumbbell, Gift, History } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';

type SportAction = 'progress' | 'history';

// Componentă stabilă pentru iconițele tab-bar. Înainte, `icon = (Icon) => (...)`
// crea o componentă nouă la fiecare render al TabLayout, iar React Navigation o
// remonta (unmount+remount) la schimbare de temă sau resize.
function TabIcon({ Icon, size, color, accent }: {
  Icon: typeof Home;
  size: number;
  color: string;
  accent: string;
}) {
  return <Icon size={size} color={color} strokeWidth={color === accent ? 2.5 : 1.5} />;
}

export default function TabLayout() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const compact = width <= 390;
  const veryCompact = width <= 350;
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'ios' ? 24 : 14);
  const tabHeight = (compact ? 54 : 58) + bottomInset;
  const iconSize = compact ? 21 : 24;

  // Funcțiile tabBarIcon au identitate stabilă (useMemo), deci React Navigation
  // nu mai vede un tip de componentă nou la fiecare render.
  const tabIcons = React.useMemo(() => ({
    home: (p: { color: string; size: number }) => <TabIcon Icon={Home} size={iconSize} color={p.color} accent={colors.accent} />,
    istoric: (p: { color: string; size: number }) => <TabIcon Icon={List} size={iconSize} color={p.color} accent={colors.accent} />,
    sport: (p: { color: string; size: number }) => <TabIcon Icon={Dumbbell} size={iconSize} color={p.color} accent={colors.accent} />,
    statistici: (p: { color: string; size: number }) => <TabIcon Icon={BarChart3} size={iconSize} color={p.color} accent={colors.accent} />,
    chat: (p: { color: string; size: number }) => <TabIcon Icon={MessageCircle} size={iconSize} color={p.color} accent={colors.accent} />,
    profil: (p: { color: string; size: number }) => <TabIcon Icon={User} size={iconSize} color={p.color} accent={colors.accent} />,
  }), [iconSize, colors.accent]);

  const headerAction = (type: SportAction) => {
    const config = {
      progress: { Icon: Gift, label: 'Questuri și progres sport', route: '/progres-antrenamente' as const, active: true },
      history: { Icon: History, label: 'Jurnal antrenamente', route: '/jurnal-antrenamente' as const, active: false },
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
        <Tabs.Screen name="index" options={{ title: 'Acasă', tabBarAccessibilityLabel: 'Acasă', tabBarIcon: tabIcons.home }} />
        <Tabs.Screen name="istoric" options={{ title: 'Jurnal', tabBarAccessibilityLabel: 'Jurnal alimentar', tabBarIcon: tabIcons.istoric }} />
        <Tabs.Screen
          name="antrenamente"
          options={{
            title: 'Sport',
            tabBarAccessibilityLabel: 'Antrenamente',
            tabBarIcon: tabIcons.sport,
            headerShown: true,
            headerTitle: 'Sport',
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
        <Tabs.Screen name="statistici" options={{ title: compact ? 'Stats' : 'Statistici', tabBarAccessibilityLabel: 'Statistici', tabBarIcon: tabIcons.statistici }} />
        <Tabs.Screen name="chat" options={{ title: compact ? 'AI' : 'Asistent', tabBarAccessibilityLabel: 'Asistent NutriAI', tabBarIcon: tabIcons.chat }} />
        <Tabs.Screen name="profil" options={{ title: 'Profil', tabBarAccessibilityLabel: 'Profil', tabBarIcon: tabIcons.profil }} />
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
