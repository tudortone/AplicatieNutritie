import React from 'react';
import { View, type StyleProp, type ViewStyle, StyleSheet } from 'react-native';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';

export interface SafeAreaBottomWrapperProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Spațiu suplimentar după bara de tab; implicit 24 px. */
  extraBottomOffset?: number;
  /** Folosește false doar pentru ecrane care nu sunt randate într-un navigator tab. */
  includeTabBar?: boolean;
}

/**
 * Wrapper compatibil pentru ecranele vechi. Înălțimea este derivată din aceeași
 * sursă ca tab-bar-ul și se actualizează la resize/split-screen.
 */
export function SafeAreaBottomWrapper({
  children,
  style,
  extraBottomOffset = 24,
  includeTabBar = true,
}: SafeAreaBottomWrapperProps) {
  const { bottomInset, tabBarHeight } = useResponsiveLayout();
  const baseBottom = includeTabBar ? tabBarHeight : bottomInset;

  return (
    <View style={[styles.container, style, { paddingBottom: baseBottom + extraBottomOffset }]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
