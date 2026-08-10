import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';

interface Props {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /**
   * Distanța dintre partea de sus a ecranului și view-ul mutat de tastatură.
   * Ecranele fără header nativ folosesc 0. Un ecran cu header poate furniza
   * explicit înălțimea lui.
   */
  keyboardVerticalOffset?: number;
}

/**
 * Wrapper stabil pentru tastatură.
 *
 * Implementarea veche apela `useBottomTabBarHeight()` și folosea un
 * ErrorBoundary drept mecanism de detectare a contextului. La ecranele stack,
 * prima randare arunca o eroare, componenta era remontată pe fallback și putea
 * produce un flick. În plus, înălțimea tab-bar-ului de jos era folosită drept
 * offset față de partea de SUS, deși acestea sunt coordonate diferite.
 */
export default function KeyboardAwareScreen({
  children,
  style,
  keyboardVerticalOffset = 0,
}: Props) {
  // BUG-010: pe Android fereastra se redimensionează deja la tastatură
  // (edge-to-edge + softwareKeyboardLayoutMode:resize, app.json), deci KAV cu
  // behavior:'height'/'padding' ar scădea încă o dată -> offset dublu. Doar iOS
  // are nevoie de behavior:'padding'; pe Android behavior undefined = fără KAV.
  return (
    <KeyboardAvoidingView
      style={[styles.flex, style]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={keyboardVerticalOffset}
      enabled
    >
      {children}
    </KeyboardAvoidingView>
  );
}

/**
 * Padding-ul din partea de jos pentru ecranele din tab-uri, derivat din
 * înălțimea reală a tab-barului + inset-ul de jos (BUG-022), în loc de
 * constanta fixă 120 care putea lăsa conținut sub navigation bar.
 */
export function useContentBottomPadding(): number {
  const { tabBarHeight } = useResponsiveLayout();
  return tabBarHeight + 24;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});

/**
 * Fallback pentru ecranele vechi care nu folosesc încă useResponsiveLayout().
 * Include bara de tab (~86 px) și spațiu de respirație, fără paddingul excesiv
 * de 160 px folosit anterior.
 */
export const CONTENT_BOTTOM_PADDING = 120;
