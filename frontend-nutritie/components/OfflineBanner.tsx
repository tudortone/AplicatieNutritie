import React from 'react';
import { Text, View, StyleSheet, Animated } from 'react-native';
import { WifiOff } from 'lucide-react-native';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { useTheme } from '../context/ThemeContext';

/**
 * Banner persistent afișat în partea de sus a ecranului când dispozitivul
 * nu are conexiune la internet. Se ascunde automat la reconectare.
 */
export default function OfflineBanner() {
  const { colors } = useTheme();
  const { isOffline } = useNetworkStatus();

  if (!isOffline) return null;

  return (
    <View style={[styles.banner, { backgroundColor: colors.dangerBg, borderBottomColor: colors.dangerBorder }]}>
      <WifiOff size={16} color={colors.danger} />
      <Text style={[styles.text, { color: colors.danger }]}>
        Fără conexiune la internet
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    gap: 8,
  },
  text: {
    fontSize: 13,
    fontWeight: '600',
  },
});
