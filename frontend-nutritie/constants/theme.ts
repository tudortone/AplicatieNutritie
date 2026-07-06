export type ThemeName = 'midnight' | 'ocean' | 'sunset';

export interface ThemeColors {
  background: string;
  accent: string;
  accentSecondary: string;
  accentTertiary: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  danger: string;
  warning: string;
  // Gradient pairs for buttons/CTAs
  accentGradient: [string, string];
  accentSecondaryGradient: [string, string];
  // Surface colors for cards/inputs
  cardBorder: string;
  cardBg: string;
  surfaceBg: string;
}

const midnight: ThemeColors = {
  background: '#090C0E',
  accent: '#CCFF00',
  accentSecondary: '#A855F7',
  accentTertiary: '#00F0FF',
  textPrimary: '#FFFFFF',
  textSecondary: '#6B7280',
  textTertiary: '#9CA3AF',
  danger: '#F87171',
  warning: '#FB923C',
  accentGradient: ['#CCFF00', '#A8FF3E'],
  accentSecondaryGradient: ['#A855F7', '#7C3AED'],
  cardBorder: 'rgba(204,255,0,0.12)',
  cardBg: 'rgba(255,255,255,0.04)',
  surfaceBg: 'rgba(255,255,255,0.06)',
};

const ocean: ThemeColors = {
  background: '#0A1628',
  accent: '#38BDF8',
  accentSecondary: '#818CF8',
  accentTertiary: '#2DD4BF',
  textPrimary: '#F0F9FF',
  textSecondary: '#64748B',
  textTertiary: '#94A3B8',
  danger: '#FB7185',
  warning: '#FBBF24',
  accentGradient: ['#38BDF8', '#7DD3FC'],
  accentSecondaryGradient: ['#818CF8', '#6366F1'],
  cardBorder: 'rgba(56,189,248,0.12)',
  cardBg: 'rgba(255,255,255,0.03)',
  surfaceBg: 'rgba(255,255,255,0.05)',
};

const sunset: ThemeColors = {
  background: '#1A0A0E',
  accent: '#FB923C',
  accentSecondary: '#F472B6',
  accentTertiary: '#FBBF24',
  textPrimary: '#FFF7ED',
  textSecondary: '#78716C',
  textTertiary: '#A8A29E',
  danger: '#EF4444',
  warning: '#F59E0B',
  accentGradient: ['#FB923C', '#FDBA74'],
  accentSecondaryGradient: ['#F472B6', '#EC4899'],
  cardBorder: 'rgba(251,146,60,0.12)',
  cardBg: 'rgba(255,255,255,0.03)',
  surfaceBg: 'rgba(255,255,255,0.05)',
};

export const themes: Record<ThemeName, ThemeColors> = {
  midnight,
  ocean,
  sunset,
};

export const themeDisplayNames: Record<ThemeName, string> = {
  midnight: '🌙 Midnight Neon',
  ocean: '🌊 Ocean Breeze',
  sunset: '🌅 Sunset Blaze',
};

export function getThemeColors(name: ThemeName): ThemeColors {
  return themes[name] || midnight;
}

// Default export for backward compatibility — components that haven't
// migrated to useTheme() yet can still import Colors.
export const Colors = midnight;
