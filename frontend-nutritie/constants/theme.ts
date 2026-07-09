export type ThemeName = 'midnight' | 'ocean' | 'sunset';

export interface ThemeColors {
  background: string;
  surface: string;
  surfaceElevated: string;
  accent: string;
  accentSecondary: string;
  accentTertiary: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  danger: string;
  warning: string;
  success: string;
  border: string;
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
  surface: '#12161A',
  surfaceElevated: '#181D22',
  accent: '#CCFF00',
  accentSecondary: '#A855F7',
  accentTertiary: '#00F0FF',
  textPrimary: '#FFFFFF',
  textSecondary: '#6B7280',
  textTertiary: '#9CA3AF',
  danger: '#F87171',
  warning: '#FB923C',
  success: '#4ADE80',
  border: 'rgba(255,255,255,0.08)',
  accentGradient: ['#CCFF00', '#A8FF3E'],
  accentSecondaryGradient: ['#A855F7', '#7C3AED'],
  cardBorder: 'rgba(255,255,255,0.08)',
  cardBg: '#12161A',
  surfaceBg: '#181D22',
};

const ocean: ThemeColors = {
  background: '#0A1628',
  surface: '#0F1E36',
  surfaceElevated: '#162846',
  accent: '#38BDF8',
  accentSecondary: '#818CF8',
  accentTertiary: '#2DD4BF',
  textPrimary: '#F0F9FF',
  textSecondary: '#64748B',
  textTertiary: '#94A3B8',
  danger: '#FB7185',
  warning: '#FBBF24',
  success: '#4ADE80',
  border: 'rgba(56,189,248,0.12)',
  accentGradient: ['#38BDF8', '#7DD3FC'],
  accentSecondaryGradient: ['#818CF8', '#6366F1'],
  cardBorder: 'rgba(56,189,248,0.12)',
  cardBg: '#0F1E36',
  surfaceBg: '#162846',
};

const sunset: ThemeColors = {
  background: '#1A0A0E',
  surface: '#261217',
  surfaceElevated: '#32191F',
  accent: '#FB923C',
  accentSecondary: '#F472B6',
  accentTertiary: '#FBBF24',
  textPrimary: '#FFF7ED',
  textSecondary: '#78716C',
  textTertiary: '#A8A29E',
  danger: '#EF4444',
  warning: '#F59E0B',
  success: '#4ADE80',
  border: 'rgba(251,146,60,0.12)',
  accentGradient: ['#FB923C', '#FDBA74'],
  accentSecondaryGradient: ['#F472B6', '#EC4899'],
  cardBorder: 'rgba(251,146,60,0.12)',
  cardBg: '#261217',
  surfaceBg: '#32191F',
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

export const Colors = {
  background: '#090C0E',
  surface: '#12161A',
  surfaceElevated: '#181D22',
  accent: '#CCFF00',
  accentSecondary: '#A855F7',
  accentTertiary: '#00F0FF',
  textPrimary: '#FFFFFF',
  textSecondary: '#6B7280',
  textTertiary: '#9CA3AF',
  danger: '#F87171',
  warning: '#FB923C',
  success: '#4ADE80',
  border: 'rgba(255,255,255,0.08)',
  accentGradient: ['#CCFF00', '#A8FF3E'] as [string, string],
  accentSecondaryGradient: ['#A855F7', '#7C3AED'] as [string, string],
  cardBorder: 'rgba(255,255,255,0.08)',
  cardBg: '#12161A',
  surfaceBg: '#181D22',
} as const;

export const Spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const Radius = { sm: 8, md: 12, lg: 16, xl: 24, pill: 999 } as const;

