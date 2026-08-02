import { Tabs, useRouter } from 'expo-router';
import React from 'react';
import { Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Home, List, MessageCircle, User, BarChart3, Dumbbell, Gift, History } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';

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

  const icon = (Icon: typeof Home) => ({ color }: { color: string; size: number }) => (
    <Icon size={iconSize} color={color} strokeWidth={color === colors.accent ? 2.5 : 1.5} />
  );

  const headerAction = (type: 'progress' | 'history') => {
    const isProgress = type === 'progress';
    const Icon = isProgress ? Gift : History;
    const label = isProgress ? 'Questuri și progres sport' : 'Jurnal antrenamente';
    return (
      <Pressable
        onPress={() => router.push(isProgress ? '/progres-antrenamente' : '/jurnal-antrenamente')}
        accessibilityRole="button"
        accessibilityLabel={label}
        hitSlop={6}
        style={({ pressed }) => [
          styles.headerAction,
          {
            backgroundColor: isProgress ? `${colors.accent}20` : colors.surfaceBg,
            borderColor: isProgress ? `${colors.accent}66` : colors.border,
            opacity: pressed ? 0.6 : 1,
          },
        ]}
      >
        <Icon size={19} color={isProgress ? colors.accent : colors.textPrimary} />
      </Pressable>
    );
  };

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
      <Tabs.Screen name="index" options={{ title: 'Acasă', tabBarAccessibilityLabel: 'Acasă', tabBarIcon: icon(Home) }} />
      <Tabs.Screen name="istoric" options={{ title: 'Jurnal', tabBarAccessibilityLabel: 'Jurnal alimentar', tabBarIcon: icon(List) }} />
      <Tabs.Screen
        name="antrenamente"
        options={{
          title: 'Sport',
          tabBarAccessibilityLabel: 'Antrenamente',
          tabBarIcon: icon(Dumbbell),
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
      <Tabs.Screen
        name="statistici"
        options={{ title: compact ? 'Stats' : 'Statistici', tabBarAccessibilityLabel: 'Statistici', tabBarIcon: icon(BarChart3) }}
      />
      <Tabs.Screen
        name="chat"
        options={{ title: compact ? 'AI' : 'Asistent', tabBarAccessibilityLabel: 'Asistent NutriAI', tabBarIcon: icon(MessageCircle) }}
      />
      <Tabs.Screen name="profil" options={{ title: 'Profil', tabBarAccessibilityLabel: 'Profil', tabBarIcon: icon(User) }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: { position: 'absolute', borderTopWidth: 0, elevation: 0, backgroundColor: 'transparent' },
  tabBarBg: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' },
  tabBarItem: { minWidth: 0, paddingHorizontal: 0 },
  tabBarLabel: { fontSize: 11, fontWeight: '700', marginTop: 2 },
  compactLabel: { fontSize: 9, lineHeight: 11 },
  headerActions: { flexDirection: 'row', gap: 8, marginRight: 14 },
  headerAction: { width: 40, height: 40, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
