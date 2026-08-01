/**
 * Layout responsiv centralizat pentru ecranele din tab-uri.
 * Folosește dimensiunile reactive ale ferestrei (tabletă, split-screen, rotație)
 * și aceeași formulă de înălțime ca bara definită în app/(tabs)/_layout.tsx.
 */
import { useMemo } from 'react';
import { Platform, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function useResponsiveLayout() {
  const insets = useSafeAreaInsets();
  const { width, height, fontScale } = useWindowDimensions();

  return useMemo(() => {
    // Insets reale; fallback-ul se aplică doar când providerul/platforma raportează 0.
    const topInset = Math.max(insets.top, Platform.OS === 'android' ? 24 : 0);
    const bottomInset = Math.max(
      insets.bottom,
      Platform.OS === 'ios' ? 24 : 14,
    );

    const isTablet = width >= 768;
    const isSmallScreen = width < 375 || height < 700;
    const isLargeScreen = width >= 430 || height >= 900;
    const horizontalPadding = isTablet ? 28 : width < 375 ? 16 : 20;

    // Trebuie să rămână identic cu formula din TabLayout.
    const tabBarHeight = 58 + bottomInset;
    const scrollPaddingBottom = tabBarHeight + 24;
    const scrollPaddingTop = topInset + (isSmallScreen ? 10 : 16);

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
      isTablet,
      screenWidth: width,
      screenHeight: height,
      fontScale,
      // Lățime comună pentru carduri, ca ecranele să nu se întindă excesiv pe tabletă.
      contentMaxWidth: isTablet ? 680 : 520,
    };
  }, [insets, width, height, fontScale]);
}
