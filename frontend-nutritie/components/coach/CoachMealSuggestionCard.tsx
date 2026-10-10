import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronDown, ChevronUp, Plus, Check } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../context/ThemeContext';
import { coachMealTotals, type CoachMealDraft } from '../../lib/coachMealDraft';

export interface CoachMealSuggestionCardProps {
  draft: CoachMealDraft;
  status?: 'ready' | 'saved' | 'pending';
  onAdd: () => void;
}

export function CoachMealSuggestionCard({ draft, status = 'ready', onAdd }: CoachMealSuggestionCardProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const totals = coachMealTotals(draft);
  const category = draft.category ? t(`chat.mealCategory.${draft.category}`) : t('chat.suggestion.suggestedMeal');
  return (
    <View style={[styles.card, { backgroundColor: colors.surfaceElevated, borderColor: colors.accentSecondary + '66' }]}>
      <View style={styles.top}>
        <Text style={[styles.category, { color: colors.accentSecondary }]}>{category}</Text>
        <Pressable
          onPress={onAdd}
          disabled={status !== 'ready'}
          accessibilityRole="button"
          accessibilityLabel={status === 'saved' ? t('chat.suggestion.saved') : t('chat.addToJournal')}
          accessibilityState={{ disabled: status !== 'ready' }}
          style={[styles.add, { backgroundColor: status === 'ready' ? colors.accentSecondary : colors.surfaceBg }]}
        >
          {status === 'saved' ? <Check size={16} color={colors.textPrimary} /> : <Plus size={16} color={colors.textOnAccentSecondary} />}
          <Text style={[styles.addText, { color: status === 'ready' ? colors.textOnAccentSecondary : colors.textPrimary }]}>
            {status === 'saved' ? t('chat.suggestion.saved') : status === 'pending' ? t('chat.suggestion.pending') : t('chat.addToJournal')}
          </Text>
        </Pressable>
      </View>
      <Text style={[styles.title, { color: colors.textPrimary }]}>{draft.name || t('chat.recipeCard.untitled')}</Text>
      {draft.explanation ? <Text numberOfLines={3} style={[styles.description, { color: colors.textSecondary }]}>{draft.explanation}</Text> : null}
      {totals.calories !== '' ? (
        <Text style={[styles.macros, { color: colors.textPrimary }]}>
          {totals.calories} kcal{totals.protein !== '' ? ` · P ${totals.protein}g` : ''}{totals.carbs !== '' ? ` · C ${totals.carbs}g` : ''}{totals.fat !== '' ? ` · F ${totals.fat}g` : ''}
        </Text>
      ) : <Text style={[styles.description, { color: colors.textSecondary }]}>{t('chat.suggestion.completeValues')}</Text>}
      {draft.items.length > 0 || draft.preparation ? (
        <Pressable onPress={() => setExpanded((value) => !value)} accessibilityRole="button" accessibilityLabel={t('chat.suggestion.details')} style={styles.detailsButton}>
          <Text style={[styles.detailsText, { color: colors.accentSecondary }]}>{t('chat.suggestion.details')}</Text>
          {expanded ? <ChevronUp size={16} color={colors.accentSecondary} /> : <ChevronDown size={16} color={colors.accentSecondary} />}
        </Pressable>
      ) : null}
      {expanded ? (
        <View style={[styles.details, { borderTopColor: colors.cardBorder }]}>
          {draft.items.map((item, index) => <Text key={`${item.name}-${index}`} style={[styles.item, { color: colors.textSecondary }]}>
            {item.name}{item.quantity ? ` · ${item.quantity} ${item.unit}` : ''}{item.calories ? ` · ${item.calories} kcal` : ''}
          </Text>)}
          {draft.preparation ? <Text style={[styles.item, { color: colors.textSecondary }]}>{draft.preparation}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: '100%', borderWidth: 1, borderRadius: 18, padding: 14, marginTop: 7, marginBottom: 8 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  category: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.7 },
  add: { minHeight: 44, borderRadius: 12, paddingHorizontal: 12, flexDirection: 'row', gap: 5, alignItems: 'center', justifyContent: 'center' },
  addText: { fontSize: 12, fontWeight: '800' },
  title: { fontSize: 16, lineHeight: 21, fontWeight: '800', marginTop: 9 },
  description: { fontSize: 12, lineHeight: 18, marginTop: 5 },
  macros: { fontSize: 12, fontWeight: '700', marginTop: 8 },
  detailsButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', marginTop: 4 },
  detailsText: { fontSize: 12, fontWeight: '700' },
  details: { borderTopWidth: 1, paddingTop: 8 },
  item: { fontSize: 12, lineHeight: 18, marginBottom: 5 },
});
