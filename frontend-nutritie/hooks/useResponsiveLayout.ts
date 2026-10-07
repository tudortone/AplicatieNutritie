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
    const leftInset = insets.left || 0;
    const rightInset = insets.right || 0;

    const shortestDimension = Math.min(width, height);
    const isLandscape = width > height;
    // Calificare canonică Android sw600dp pentru tablete: cea mai scurtă latură >= 600
    const isTablet = shortestDimension >= 600;
    // Foldable unfolded: ecran pătrățos/lat fără a fi o tabletă completă (500-600dp)
    const isFoldableUnfolded = !isTablet && shortestDimension >= 500 && width / height >= 0.95;
    const isCompact = width <= 390;
    const isVeryCompact = width <= 350;
    const isSmallScreen = width < 375 || height < 700;
    const isLargeScreen = width >= 430 || height >= 900 || isTablet;

    const baseHorizontalPadding = isTablet ? 28 : width <= 360 ? 14 : width < 375 ? 16 : 20;
    // Protejăm conținutul împotriva notch-urilor laterale în modul peisaj
    const horizontalPadding = Math.max(baseHorizontalPadding, Math.max(leftInset, rightInset));

    // Trebuie să rămână identic cu formula din TabLayout.
    const tabBarContentHeight = isCompact ? 54 : 58;
    const tabBarHeight = tabBarContentHeight + bottomInset;
    const scrollPaddingBottom = tabBarHeight + 24;
    const scrollPaddingTop = topInset + (isSmallScreen ? 10 : 16);

    // Pe tablete/ecrane mari permitem cardurilor să se extindă frumos (până la 760px),
    // iar în modul landscape pe telefoane limităm la 600px centrat.
    const contentMaxWidth = isTablet
      ? Math.min(width - horizontalPadding * 2, 760)
      : isLandscape
        ? Math.min(width - horizontalPadding * 2, 600)
        : 520;

    return {
      insets,
      topInset,
      bottomInset,
      leftInset,
      rightInset,
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
      isFoldableUnfolded,
      isLandscape,
      shortestDimension,
      screenWidth: width,
      screenHeight: height,
      fontScale,
      contentMaxWidth,
    };
  }, [insets, width, height, fontScale]);
}
