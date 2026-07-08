import { Tabs } from 'expo-router';
import React from 'react';
import { Platform, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { Home, List, MessageCircle, User, BarChart3 } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';

export default function TabLayout() {
  const { colors } = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarHideOnKeyboard: true,
        tabBarStyle: [
          styles.tabBar,
          Platform.OS === 'android' && { backgroundColor: colors.background, position: 'relative' as const, height: 74, paddingBottom: 18, paddingTop: 10 }
        ],
        tabBarBackground: Platform.OS === 'ios' ? () => (
          <BlurView
            intensity={60}
            tint="dark"
            style={[StyleSheet.absoluteFill, styles.tabBarBg]}
          />
        ) : undefined,
        tabBarLabelStyle: styles.tabBarLabel,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Acasă',
          tabBarIcon: ({ color, size }) => <Home size={size} color={color} strokeWidth={color === colors.accent ? 2.5 : 1.5} />,
        }}
      />
      <Tabs.Screen
        name="istoric"
        options={{
          title: 'Jurnal',
          tabBarIcon: ({ color, size }) => <List size={size} color={color} strokeWidth={color === colors.accent ? 2.5 : 1.5} />,
        }}
      />
      <Tabs.Screen
        name="statistici"
        options={{
          title: 'Statistici',
          tabBarIcon: ({ color, size }) => <BarChart3 size={size} color={color} strokeWidth={color === colors.accent ? 2.5 : 1.5} />,
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Asistent',
          tabBarIcon: ({ color, size }) => <MessageCircle size={size} color={color} strokeWidth={color === colors.accent ? 2.5 : 1.5} />,
        }}
      />
      <Tabs.Screen
        name="profil"
        options={{
          title: 'Profil',
          tabBarIcon: ({ color, size }) => <User size={size} color={color} strokeWidth={color === colors.accent ? 2.5 : 1.5} />,
        }}
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
    height: Platform.OS === 'ios' ? 96 : 74,
    paddingBottom: Platform.OS === 'ios' ? 34 : 18,
    paddingTop: 10,
  },
  tabBarBg: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  tabBarLabel: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  }
});
