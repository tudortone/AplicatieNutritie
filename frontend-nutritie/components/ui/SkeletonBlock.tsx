import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

interface SkeletonBlockProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: any;
}

/**
 * Bloc animat tip skeleton loading.
 * Foloseste o animatie de pulse pentru a indica incarcarea.
 */
export function SkeletonBlock({ width = '100%', height = 16, borderRadius = 8, style }: SkeletonBlockProps) {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.7, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        styles.block,
        { width: width as any, height, borderRadius, opacity },
        style,
      ]}
    />
  );
}

/**
 * Card skeleton pentru mese/antrenamente.
 * Imita structura unui card real.
 */
export function SkeletonCard() {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <SkeletonBlock width={120} height={18} borderRadius={6} />
        <SkeletonBlock width={60} height={14} borderRadius={6} />
      </View>
      <View style={styles.cardBody}>
        <SkeletonBlock width="80%" height={14} borderRadius={6} />
        <SkeletonBlock width="60%" height={14} borderRadius={6} />
      </View>
      <View style={styles.cardFooter}>
        <SkeletonBlock width={80} height={28} borderRadius={14} />
        <SkeletonBlock width={80} height={28} borderRadius={14} />
        <SkeletonBlock width={80} height={28} borderRadius={14} />
      </View>
    </View>
  );
}

/**
 * Skeleton pentru ecranul Home (Dashboard).
 */
export function HomeSkeleton() {
  return (
    <View style={styles.container}>
      {/* Calorii ring placeholder */}
      <View style={styles.heroRow}>
        <SkeletonBlock width={160} height={160} borderRadius={80} />
        <View style={{ flex: 1, gap: 12, marginLeft: 20 }}>
          <SkeletonBlock width="90%" height={20} borderRadius={6} />
          <SkeletonBlock width="70%" height={16} borderRadius={6} />
          <SkeletonBlock width="80%" height={16} borderRadius={6} />
        </View>
      </View>
      {/* Macro cards */}
      <View style={styles.macroRow}>
        <SkeletonBlock width="30%" height={56} borderRadius={12} />
        <SkeletonBlock width="30%" height={56} borderRadius={12} />
        <SkeletonBlock width="30%" height={56} borderRadius={12} />
      </View>
      {/* Meal cards */}
      <SkeletonCard />
      <SkeletonCard />
      <SkeletonCard />
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    backgroundColor: '#1A1F25',
  },
  container: {
    padding: 16,
    gap: 16,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  macroRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  card: {
    backgroundColor: '#12161A',
    borderRadius: 16,
    padding: 16,
    gap: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardBody: {
    gap: 10,
  },
  cardFooter: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
});
