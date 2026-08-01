import { Tabs } from 'expo-router';
import React from 'react';
import { Platform, StyleSheet, useWindowDimensions } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Home, List, MessageCircle, User, BarChart3, Dumbbell } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';

export default function TabLayout() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const compact = width <= 390;
  const veryCompact = width <= 350;
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'ios' ? 24 : 14);
  const tabHeight = (compact ? 54 : 58) + bottomInset;
  const iconSize = compact ? 21 : 24;

  const icon = (Icon: typeof Home) => ({ color }: { color: string; size: number }) => (
    <Icon
      size={iconSize}
      color={color}
      strokeWidth={color === colors.accent ? 2.5 : 1.5}
    />
  );

  return (
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
          {
            height: tabHeight,
            paddingBottom: bottomInset,
            paddingTop: compact ? 7 : 10,
          },
          Platform.OS === 'android' && {
            backgroundColor: `${colors.surface}F8`,
            borderTopWidth: 1,
            borderTopColor: colors.border,
            position: 'absolute' as const,
            elevation: 16,
          },
        ],
        tabBarBackground: Platform.OS === 'ios'
          ? () => (
              <BlurView
                intensity={60}
                tint="dark"
                style={[StyleSheet.absoluteFill, styles.tabBarBg]}
              />
            )
          : undefined,
        tabBarLabelStyle: [styles.tabBarLabel, compact && styles.compactLabel],
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Acasă', tabBarAccessibilityLabel: 'Acasă', tabBarIcon: icon(Home) }}
      />
      <Tabs.Screen
        name="istoric"
        options={{ title: 'Jurnal', tabBarAccessibilityLabel: 'Jurnal alimentar', tabBarIcon: icon(List) }}
      />
      <Tabs.Screen
        name="antrenamente"
        options={{ title: 'Sport', tabBarAccessibilityLabel: 'Antrenamente', tabBarIcon: icon(Dumbbell) }}
      />
      <Tabs.Screen
        name="statistici"
        options={{
          title: compact ? 'Stats' : 'Statistici',
          tabBarAccessibilityLabel: 'Statistici',
          tabBarIcon: icon(BarChart3),
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: compact ? 'AI' : 'Asistent',
          tabBarAccessibilityLabel: 'Asistent NutriAI',
          tabBarIcon: icon(MessageCircle),
        }}
      />
      <Tabs.Screen
        name="profil"
        options={{ title: 'Profil', tabBarAccessibilityLabel: 'Profil', tabBarIcon: icon(User) }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    borderTopWidth: 0,
    elevation: 0,
    backgroundColor: 'transparent',
  },
  tabBarBg: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  tabBarItem: {
    minWidth: 0,
    paddingHorizontal: 0,
  },
  tabBarLabel: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
  compactLabel: {
    fontSize: 9,
    lineHeight: 11,
  },
});
