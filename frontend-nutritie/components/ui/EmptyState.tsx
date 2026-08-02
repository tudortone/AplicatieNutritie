import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

interface EmptyStateProps {
  icon?: string;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Culori din tema (optional — foloseste valori default dark) */
  accentColor?: string;
  textColor?: string;
  mutedColor?: string;
}

/**
 * Stare goala cu ilustratie emoji, titlu, subtitlu si actiune optionala.
 * Folosita pe ecranele unde utilizatorul nu are inca date (mese, antrenamente etc.).
 */
export function EmptyState({
  icon = '📭',
  title,
  subtitle,
  actionLabel,
  onAction,
  accentColor = '#CCFF00',
  textColor = '#FFFFFF',
  mutedColor = '#9CA3AF',
}: EmptyStateProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.icon}>{icon}</Text>
      <Text style={[styles.title, { color: textColor }]}>{title}</Text>
      {subtitle && (
        <Text style={[styles.subtitle, { color: mutedColor }]}>{subtitle}</Text>
      )}
      {actionLabel && onAction && (
        <TouchableOpacity
          style={[styles.action, { backgroundColor: accentColor }]}
          onPress={onAction}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
        >
          <Text style={styles.actionText}>{actionLabel}</Text>
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
    fontSize: 56,
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
  actionText: {
    color: '#090C0E',
    fontSize: 15,
    fontWeight: 'bold',
  },
});
