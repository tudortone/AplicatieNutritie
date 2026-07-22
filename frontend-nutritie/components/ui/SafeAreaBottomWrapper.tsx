import React from 'react';
import { View, ViewStyle, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export interface SafeAreaBottomWrapperProps {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  extraBottomOffset?: number;
}

/**
 * MODULE 1: GLOBAL UI LAYOUT FIX (Bottom Navigation Overlap)
 * Wraps main screen content to account for the absolute bottom tab height.
 * Uses useSafeAreaInsets from react-native-safe-area-context + global paddingBottom: insets.bottom + 60.
 */
export function SafeAreaBottomWrapper({
  children,
  style,
  extraBottomOffset = 60,
}: SafeAreaBottomWrapperProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.container,
        style,
        { paddingBottom: insets.bottom + extraBottomOffset },
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
