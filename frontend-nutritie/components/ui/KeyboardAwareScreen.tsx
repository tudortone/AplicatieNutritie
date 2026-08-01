import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

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
  return (
    <KeyboardAvoidingView
      style={[styles.flex, style]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={keyboardVerticalOffset}
      enabled
    >
      {children}
    </KeyboardAvoidingView>
  );
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
