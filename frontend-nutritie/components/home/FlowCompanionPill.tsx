import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Lightbulb } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import * as Haptics from 'expo-haptics';

import { useTheme } from '../../context/ThemeContext';
import { getCompanionStage, getLimitBeaconStatus } from '../../lib/flowCompanion';

const COMPANION_AVATAR = require('../../assets/images/flow-companion-avatar.jpg');

export interface FlowCompanionPillProps {
  streak: number;
  caloriiConsumate: number;
  caloriiTinta: number;
  isCompact?: boolean;
  onPress: () => void;
}

export function FlowCompanionPill({
  streak,
  caloriiConsumate,
  caloriiTinta,
  isCompact = false,
  onPress,
}: FlowCompanionPillProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();

  const stage = getCompanionStage(streak);
  const beacon = getLimitBeaconStatus(caloriiConsumate, caloriiTinta);

  const handlePress = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    onPress();
  };

  const stageName = t(stage.nameKey, stage.defaultName);
  const beaconLabel = t(beacon.labelKey, beacon.defaultLabel);

  return (
    <TouchableOpacity
      testID="home-flow-companion-pill"
      onPress={handlePress}
      activeOpacity={0.82}
      accessibilityRole="button"
      accessibilityLabel={`${stageName} • ${beaconLabel}`}
      style={[
        styles.pill,
        isCompact && styles.pillCompact,
        {
          backgroundColor: '#0B0E0C',
          borderColor: beacon.color + '44',
        },
      ]}
    >
      {/* Custom 3D Cyber-Spirit Mascot Avatar */}
      <View
        style={[
          styles.avatarCircle,
          {
            borderColor: beacon.color + '66',
            shadowColor: beacon.color,
          },
        ]}
      >
        <Image
          source={COMPANION_AVATAR}
          style={styles.avatarImage}
          resizeMode="cover"
        />
      </View>

      {/* Info: Name and Beacon */}
      {!isCompact && (
        <View style={styles.textContainer}>
          <Text style={[styles.stageName, { color: colors.textPrimary }]} numberOfLines={1}>
            {stageName}
          </Text>
          <View style={styles.beaconRow}>
            <View
              style={[
                styles.beaconDot,
                {
                  backgroundColor: beacon.color,
                  shadowColor: beacon.color,
                },
              ]}
            />
            <Text style={[styles.beaconText, { color: beacon.color }]} numberOfLines={1}>
              {beaconLabel}
            </Text>
          </View>
        </View>
      )}

      {/* In compact mode, show the glowing beacon bulb next to the avatar */}
      {isCompact && (
        <View
          style={[
            styles.compactBeaconWrap,
            {
              backgroundColor: beacon.color + '22',
            },
          ]}
        >
          <Lightbulb size={12} color={beacon.color} strokeWidth={2.5} />
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  pill: {
    height: 44,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  pillCompact: {
    gap: 6,
    paddingHorizontal: 6,
  },
  avatarCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.5,
    overflow: 'hidden',
    backgroundColor: '#090C0E',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 5,
    elevation: 4,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  textContainer: {
    justifyContent: 'center',
    minWidth: 64,
    maxWidth: 96,
  },
  stageName: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  beaconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 1,
  },
  beaconDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 4,
    elevation: 3,
  },
  beaconText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  compactBeaconWrap: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
