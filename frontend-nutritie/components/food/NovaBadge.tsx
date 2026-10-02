import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface NovaBadgeProps {
  group?: number; // 1 | 2 | 3 | 4
  showDescription?: boolean;
}

const NOVA_CONFIG: Record<number, { label: string; desc: string; color: string; bg: string }> = {
  1: {
    label: 'NOVA 1',
    desc: 'Alimente neprocesate sau minim procesate',
    color: '#10B981',
    bg: '#10B98122',
  },
  2: {
    label: 'NOVA 2',
    desc: 'Ingrediente culinare procesate (uleiuri, unt)',
    color: '#F59E0B',
    bg: '#F59E0B22',
  },
  3: {
    label: 'NOVA 3',
    desc: 'Alimente procesate (conserve, brânzeturi)',
    color: '#F97316',
    bg: '#F9731622',
  },
  4: {
    label: 'NOVA 4',
    desc: 'Alimente ultra-procesate (snacks, sucuri, aditivi)',
    color: '#EF4444',
    bg: '#EF444422',
  },
};

export const NovaBadge: React.FC<NovaBadgeProps> = ({
  group,
  showDescription = true,
}) => {
  if (!group || !NOVA_CONFIG[group]) return null;

  const config = NOVA_CONFIG[group];

  return (
    <View style={styles.wrapper}>
      <View style={[styles.badge, { backgroundColor: config.bg, borderColor: config.color }]}>
        <View style={[styles.circle, { backgroundColor: config.color }]}>
          <Text style={styles.circleText}>{group}</Text>
        </View>
        <Text style={[styles.badgeText, { color: config.color }]}>{config.label}</Text>
      </View>
      {showDescription && (
        <Text style={styles.descText} numberOfLines={2}>
          {config.desc}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    marginVertical: 4,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    alignSelf: 'flex-start',
    gap: 6,
  },
  circle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  descText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
    marginTop: 3,
  },
});
