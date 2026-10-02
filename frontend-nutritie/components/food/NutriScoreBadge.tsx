import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface NutriScoreBadgeProps {
  grade?: string; // 'a' | 'b' | 'c' | 'd' | 'e'
  score?: number;
  size?: 'small' | 'medium' | 'large';
}

const NUTRI_COLORS: Record<string, string> = {
  a: '#038141',
  b: '#85BB2F',
  c: '#FECB02',
  d: '#EE8100',
  e: '#E63E11',
};

const NUTRI_DESCRIPTIONS: Record<string, string> = {
  a: 'Calitate nutrițională excelentă',
  b: 'Calitate nutrițională bună',
  c: 'Calitate nutrițională medie',
  d: 'Calitate nutrițională scăzută',
  e: 'Calitate nutrițională foarte scăzută',
};

export const NutriScoreBadge: React.FC<NutriScoreBadgeProps> = ({
  grade,
  score,
  size = 'medium',
}) => {
  const activeGrade = (grade || '').toLowerCase();
  const isValidGrade = ['a', 'b', 'c', 'd', 'e'].includes(activeGrade);

  if (!isValidGrade) {
    return (
      <View style={[styles.container, styles.unknownContainer]}>
        <Text style={styles.unknownText}>Nutri-Score N/A</Text>
      </View>
    );
  }

  const grades = ['a', 'b', 'c', 'd', 'e'];
  const isLarge = size === 'large';

  return (
    <View style={styles.wrapper}>
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>NUTRI-SCORE</Text>
        {typeof score === 'number' && (
          <Text style={styles.scoreText}>Scor: {score}</Text>
        )}
      </View>
      <View style={[styles.barContainer, isLarge && styles.barContainerLarge]}>
        {grades.map((g) => {
          const isActive = g === activeGrade;
          const color = NUTRI_COLORS[g];
          return (
            <View
              key={g}
              style={[
                styles.segment,
                { backgroundColor: isActive ? color : color + '40' },
                isActive && [styles.activeSegment, { borderColor: '#FFFFFF' }],
                isLarge && styles.segmentLarge,
                isActive && isLarge && styles.activeSegmentLarge,
              ]}
            >
              <Text
                style={[
                  styles.letter,
                  { color: isActive ? '#FFFFFF' : '#FFFFFF70' },
                  isActive && styles.activeLetter,
                  isLarge && styles.letterLarge,
                ]}
              >
                {g.toUpperCase()}
              </Text>
            </View>
          );
        })}
      </View>
      {NUTRI_DESCRIPTIONS[activeGrade] && (
        <Text style={styles.descriptionText}>
          {NUTRI_DESCRIPTIONS[activeGrade]}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    marginVertical: 4,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  headerTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 0.5,
  },
  scoreText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#CBD5E1',
  },
  barContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    padding: 3,
    backgroundColor: '#0F172A',
    gap: 3,
  },
  barContainerLarge: {
    padding: 4,
    borderRadius: 10,
    gap: 4,
  },
  segment: {
    flex: 1,
    height: 24,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentLarge: {
    height: 32,
    borderRadius: 6,
  },
  activeSegment: {
    borderWidth: 2,
    transform: [{ scale: 1.08 }],
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
    zIndex: 2,
  },
  activeSegmentLarge: {
    borderWidth: 2.5,
    transform: [{ scale: 1.1 }],
  },
  letter: {
    fontSize: 12,
    fontWeight: '700',
  },
  letterLarge: {
    fontSize: 15,
  },
  activeLetter: {
    fontWeight: '900',
  },
  descriptionText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
    marginTop: 4,
  },
  container: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  unknownContainer: {
    backgroundColor: '#334155',
  },
  unknownText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
  },
});
