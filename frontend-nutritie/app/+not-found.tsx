import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Compass, Home } from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTheme } from '../context/ThemeContext';

// BUG-032: fără un +not-found propriu, expo-router folosea default-ul în engleză
// și fără temă. Acest ecran păstrează stilul aplicației și oferă o cale clară de
// ieșire (replace la /(tabs)), sigură și când nu există stack pe care să dai back.
export default function NotFoundScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.glowTop, { backgroundColor: colors.accent }]} />

      <View style={[styles.content, { paddingTop: Math.max(insets.top, 40), paddingBottom: Math.max(insets.bottom, 24) }]}>
        <Animated.View entering={FadeInDown.duration(400)} style={[styles.iconRing, { borderColor: colors.accent, backgroundColor: `${colors.accent}15` }]}>
          <Compass size={40} color={colors.accent} />
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(400).delay(120)} style={styles.textWrap}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Pagina nu a fost găsită</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Adresa cerută nu există în aplicație. Te poți întoarce în siguranță la ecranul principal.
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(400).delay(240)} style={styles.actions}>
          <Pressable
            onPress={() => router.replace('/(tabs)')}
            accessibilityRole="button"
            accessibilityLabel="Înapoi la aplicație"
            style={({ pressed }) => [styles.primaryBtn, { backgroundColor: colors.accent, opacity: pressed ? 0.8 : 1 }]}
          >
            <Home size={18} color={colors.background} />
            <Text style={[styles.primaryText, { color: colors.background }]}>Înapoi la aplicație</Text>
          </Pressable>

          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
            accessibilityRole="button"
            accessibilityLabel="Înapoi"
            style={({ pressed }) => [styles.secondaryBtn, { borderColor: colors.border, opacity: pressed ? 0.6 : 1 }]}
          >
            <Text style={[styles.secondaryText, { color: colors.textSecondary }]}>Înapoi</Text>
          </Pressable>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  glowTop: { position: 'absolute', top: -140, left: -100, width: 320, height: 320, borderRadius: 160, opacity: 0.05 },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  iconRing: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  textWrap: { alignItems: 'center', marginBottom: 32 },
  title: { fontSize: 22, fontWeight: '900', textAlign: 'center', marginBottom: 10 },
  subtitle: { fontSize: 14, lineHeight: 21, textAlign: 'center', maxWidth: 320 },
  actions: { width: '100%', maxWidth: 360, gap: 12 },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 52,
    borderRadius: 16,
    paddingHorizontal: 20,
  },
  primaryText: { fontSize: 15, fontWeight: '800' },
  secondaryBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 20,
  },
  secondaryText: { fontSize: 14, fontWeight: '700' },
});