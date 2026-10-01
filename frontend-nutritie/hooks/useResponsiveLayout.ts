/**
 * Layout responsiv centralizat pentru ecranele din tab-uri.
 * Folosește dimensiunile reactive ale ferestrei și aceeași formulă de
 * înălțime ca bara definită în app/(tabs)/_layout.tsx.
 */
import { useMemo } from 'react';
import { Platform, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function useResponsiveLayout() {
  const insets = useSafeAreaInsets();
  const { width, height, fontScale } = useWindowDimensions();

  return useMemo(() => {
    const topInset = Math.max(insets.top, Platform.OS === 'android' ? 24 : 0);
    const bottomInset = Math.max(insets.bottom, Platform.OS === 'ios' ? 24 : 14);
    const isTablet = width >= 768;
    const isCompact = width <= 390;
    const isVeryCompact = width <= 350;
    const isSmallScreen = width < 375 || height < 700;
    const isLargeScreen = width >= 430 || height >= 900;
    const horizontalPadding = isTablet ? 28 : width <= 360 ? 14 : width < 375 ? 16 : 20;

    // Trebuie să rămână identic cu formula din TabLayout.
    const tabBarContentHeight = isCompact ? 54 : 58;
    const tabBarHeight = tabBarContentHeight + bottomInset;
    const scrollPaddingBottom = tabBarHeight + 24;
    const scrollPaddingTop = topInset + (isSmallScreen ? 10 : 16);

    // Pe tablete/ecrane mari permitem cardurilor să se extindă frumos (până la 760px),
    // eliminând zonele moarte laterale masive („bare negre” goale).
    const contentMaxWidth = isTablet ? Math.min(width - horizontalPadding * 2, 760) : 520;

    return {
      insets,
      topInset,
      bottomInset,
      horizontalPadding,
      tabBarContentHeight,
      tabBarHeight,
      scrollPaddingBottom,
      scrollPaddingTop,
      isCompact,
      isVeryCompact,
      isSmallScreen,
      isLargeScreen,
      isTablet,
      screenWidth: width,
      screenHeight: height,
      fontScale,
      contentMaxWidth,
    };
  }, [insets, width, height, fontScale]);
}
