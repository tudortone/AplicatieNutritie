import React from 'react';
import { Text, View } from 'react-native';
import { Lock, Trophy } from 'lucide-react-native';

import { useTheme } from '../../context/ThemeContext';

export type AchievementCardProps = {
  id: string;
  name: string;
  requirement: string;
  unlocked: boolean;
  width: number | `${number}%`;
};

/** Responsive, localized presentation card; unlock state is supplied by gamification. */
export default function AchievementCard({ id, name, requirement, unlocked, width }: AchievementCardProps) {
  const { colors } = useTheme();

  return (
    <View
      testID={`achievement-card-${id}`}
      style={{
        width,
        minWidth: 0,
        backgroundColor: unlocked ? colors.accent + '14' : 'rgba(255,255,255,0.03)',
        borderColor: unlocked ? colors.accent + '44' : 'rgba(255,255,255,0.07)',
        borderWidth: 1,
        borderRadius: 16,
        padding: 12,
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 9,
      }}
    >
      <View
        testID={!unlocked ? `achievement-lock-${id}` : `achievement-trophy-${id}`}
        style={{
          width: 34,
          height: 34,
          borderRadius: 17,
          backgroundColor: unlocked ? colors.accent + '25' : 'rgba(255,255,255,0.05)',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {unlocked ? <Trophy size={18} color={colors.accent} /> : <Lock size={16} color={colors.textTertiary} />}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{
            fontSize: 12,
            fontWeight: '700',
            color: unlocked ? colors.textPrimary : colors.textTertiary,
            lineHeight: 16,
          }}
          numberOfLines={2}
          maxFontSizeMultiplier={1.3}
        >
          {name}
        </Text>
        <Text
          style={{ fontSize: 11, color: colors.textSecondary, marginTop: 3, lineHeight: 15 }}
          numberOfLines={2}
          maxFontSizeMultiplier={1.3}
        >
          {requirement}
        </Text>
      </View>
    </View>
  );
}
