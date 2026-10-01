import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { FlowIcon, resolveFlowIconName } from './FlowIcon';

interface EmptyStateProps {
  /** Semantic FlowIcon name or known legacy icon metadata from static catalogs. */
  icon?: string;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Culori din tema (optional — cad pe valorile temei active prin useTheme) */
  accentColor?: string;
  textColor?: string;
  mutedColor?: string;
}

/**
 * Stare goală cu pictogramă vectorială, titlu, subtitlu și acțiune opțională.
 * Folosita pe ecranele unde utilizatorul nu are inca date (mese, antrenamente etc.).
 */
export function EmptyState({
  icon = 'inbox',
  title,
  subtitle,
  actionLabel,
  onAction,
  accentColor,
  textColor,
  mutedColor,
}: EmptyStateProps) {
  const { colors } = useTheme();
  const accent = accentColor ?? colors.accent;
  const text = textColor ?? colors.textPrimary;
  const muted = mutedColor ?? colors.textSecondary;

  return (
    <View style={styles.container}>
      <View style={styles.icon}>
        <FlowIcon name={resolveFlowIconName(icon) ?? 'inbox'} size={44} color={accent} />
      </View>
      <Text style={[styles.title, { color: text }]} maxFontSizeMultiplier={1.3}>{title}</Text>
      {subtitle && (
        <Text style={[styles.subtitle, { color: muted }]} maxFontSizeMultiplier={1.3}>{subtitle}</Text>
      )}
      {actionLabel && onAction && (
        <TouchableOpacity
          style={[styles.action, { backgroundColor: accent }]}
          onPress={onAction}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
        >
          <Text style={[styles.actionText, { color: colors.textOnAccent }]} maxFontSizeMultiplier={1.3}>{actionLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 12,
    minHeight: 250,
  },
  icon: {
    width: 64,
    height: 64,
    marginBottom: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 280,
  },
  action: {
    marginTop: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 14,
  },
  // actionText: culoarea se pune inline (colors.textOnAccent) în render.
  actionText: {
    fontSize: 15,
    fontWeight: 'bold',
  },
});
