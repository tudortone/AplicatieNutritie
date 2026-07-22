/**
 * useResponsiveLayout — Hook centralizat pentru layout responsive pe toate modelele iOS/Android.
 * Furnizează insets safe area reale + constante de layout derivate din ecranul real.
 */
import { useMemo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Platform, Dimensions } from 'react-native';

export function useResponsiveLayout() {
  const insets = useSafeAreaInsets();
  const { width, height } = Dimensions.get('window');

  return useMemo(() => {
    // Padding top real: notch / Dynamic Island / status bar
    const topInset = Math.max(insets.top, Platform.OS === 'ios' ? 44 : 24);
    // Padding bottom real: home indicator
    const bottomInset = Math.max(insets.bottom, Platform.OS === 'ios' ? 16 : 0);

    // Padding lateral adaptiv
    const horizontalPadding = width < 375 ? 16 : 20;

    // Tab bar height estimată (inclusiv home indicator)
    const tabBarHeight = 58 + bottomInset;

    // Padding scroll pentru content sub tab bar
    const scrollPaddingBottom = tabBarHeight + 24;

    // paddingTop pentru scroll content sub header
    const scrollPaddingTop = topInset + 16;

    // Tip ecran (util pentru layout adaptiv)
    const isSmallScreen = height < 700; // iPhone SE, etc.
    const isLargeScreen = height >= 900; // iPhone Pro Max, iPad

    return {
      insets,
      topInset,
      bottomInset,
      horizontalPadding,
      tabBarHeight,
      scrollPaddingBottom,
      scrollPaddingTop,
      isSmallScreen,
      isLargeScreen,
      screenWidth: width,
      screenHeight: height,
    };
  }, [insets, width, height]);
}
