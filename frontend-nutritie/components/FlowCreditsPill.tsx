import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Sparkles } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useFlowCredits } from '../context/FlowCreditsContext';

export function FlowCreditsPill() {
  const { t } = useTranslation();
  const { balance, loading, unlimited, open } = useFlowCredits();
  return (
    <TouchableOpacity
      onPress={open}
      accessibilityRole="button"
      accessibilityLabel={t('flowCredits.openA11y')}
      style={styles.pill}
      activeOpacity={0.82}
    >
      <Sparkles size={15} color="#CCFF00" />
      <View>
        <Text style={styles.label} maxFontSizeMultiplier={1.2}>{t('flowCredits.shortLabel')}</Text>
        {loading ? <ActivityIndicator size="small" color="#CCFF00" /> : (
          <Text style={styles.value} maxFontSizeMultiplier={1.2}>
            {unlimited ? '∞' : ((typeof balance === 'object' && balance !== null ? balance.total : (typeof balance === 'number' ? balance : 0)) ?? 0)}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  pill: {
    minWidth: 62,
    height: 44,
    paddingHorizontal: 10,
    borderRadius: 22,
    backgroundColor: '#0B0E0C',
    borderWidth: 1,
    borderColor: 'rgba(204,255,0,0.45)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  label: { color: '#AAB39A', fontSize: 8, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' },
  value: { color: '#CCFF00', fontSize: 16, lineHeight: 18, fontWeight: '900' },
});
