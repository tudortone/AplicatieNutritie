import React from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../context/ThemeContext';
import { MEAL_CATEGORIES } from '../../lib/mealUtils';
import { coachMealTotals, validateCoachMealDraft, type CoachMealDraft, type CoachMealIngredient } from '../../lib/coachMealDraft';
import type { TipMasa } from '../../types';

interface Props {
  visible: boolean;
  draft: CoachMealDraft | null;
  saving: boolean;
  onChange: (draft: CoachMealDraft) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

export function CoachMealConfirmModal({ visible, draft, saving, onChange, onCancel, onConfirm }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  if (!draft) return null;
  const totals = coachMealTotals(draft);
  const updateItem = (index: number, key: keyof CoachMealIngredient, value: string) => {
    const items = draft.items.map((item, position) => position === index ? { ...item, [key]: value } : item);
    onChange({ ...draft, items, calories: coachMealTotals({ ...draft, items }).calories });
  };
  const field = (label: string, value: string, onChangeText: (value: string) => void, numeric = false) => (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        keyboardType={numeric ? 'decimal-pad' : 'default'}
        placeholder={numeric ? '—' : undefined}
        placeholderTextColor={colors.textTertiary}
        style={[styles.input, { color: colors.textPrimary, borderColor: colors.cardBorder, backgroundColor: colors.surfaceElevated }]}
      />
    </View>
  );
  return (
    <Modal visible={visible} animationType="fade" transparent statusBarTranslucent onRequestClose={() => { if (!saving) onCancel(); }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: colors.surfaceBg, borderColor: colors.cardBorder, paddingBottom: Math.max(insets.bottom, 12) }]}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>{t('chat.suggestion.confirmTitle')}</Text>
          <Text style={[styles.note, { color: colors.textSecondary }]}>{t('chat.suggestion.estimateNotice')}</Text>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
            {field(t('chat.suggestion.mealName'), draft.name, (name) => onChange({ ...draft, name }))}
            {field(t('chat.suggestion.date'), draft.date, (date) => onChange({ ...draft, date }))}
            <Text style={[styles.section, { color: colors.textPrimary }]}>{t('chat.suggestion.category')}</Text>
            <View style={styles.categories}>
              {MEAL_CATEGORIES.map((category) => {
                const selected = draft.category === category.id;
                return <Pressable
                  key={category.id}
                  accessibilityRole="button"
                  accessibilityLabel={t(`chat.mealCategory.${category.id}`)}
                  accessibilityState={{ selected }}
                  onPress={() => onChange({ ...draft, category: category.id as TipMasa })}
                  style={[styles.category, { borderColor: selected ? colors.accentSecondary : colors.cardBorder, backgroundColor: selected ? colors.accentSecondary : colors.surfaceElevated }]}
                ><Text style={{ color: selected ? colors.textOnAccentSecondary : colors.textPrimary, fontWeight: '700' }}>{t(`chat.mealCategory.${category.id}`)}</Text></Pressable>;
              })}
            </View>
            <Text style={[styles.section, { color: colors.textPrimary }]}>{t('chat.recipeCard.ingredients')}</Text>
            {draft.items.map((item, index) => <View key={index} style={[styles.ingredient, { borderColor: colors.cardBorder }]}>
              {field(`${t('chat.suggestion.ingredient')} ${index + 1}`, item.name, (value) => updateItem(index, 'name', value))}
              <View style={styles.twoFields}>
                {field(`${t('chat.suggestion.quantity')} ${index + 1}`, item.quantity, (value) => updateItem(index, 'quantity', value), true)}
                {field(`${t('chat.suggestion.unit')} ${index + 1}`, item.unit, (value) => updateItem(index, 'unit', value))}
              </View>
              <View style={styles.twoFields}>
                {field(`${t('chat.suggestion.calories')} ${index + 1}`, item.calories, (value) => updateItem(index, 'calories', value), true)}
                {field(`${t('chat.suggestion.protein')} ${index + 1}`, item.protein, (value) => updateItem(index, 'protein', value), true)}
              </View>
              <View style={styles.twoFields}>
                {field(`${t('chat.suggestion.carbs')} ${index + 1}`, item.carbs, (value) => updateItem(index, 'carbs', value), true)}
                {field(`${t('chat.suggestion.fat')} ${index + 1}`, item.fat, (value) => updateItem(index, 'fat', value), true)}
              </View>
              {field(`${t('chat.suggestion.fiber')} ${index + 1}`, item.fiber, (value) => updateItem(index, 'fiber', value), true)}
            </View>)}
            <Text style={[styles.total, { color: colors.textPrimary }]}>{t('chat.suggestion.total')}: {totals.calories || '—'} kcal · P {totals.protein || '—'}g · C {totals.carbs || '—'}g · F {totals.fat || '—'}g</Text>
            {!validateCoachMealDraft(draft) ? <Text style={[styles.note, { color: colors.textSecondary }]}>{t('chat.suggestion.completeValues')}</Text> : null}
          </ScrollView>
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" accessibilityLabel={t('alerts.butoane.anuleaza')} disabled={saving} onPress={onCancel} style={[styles.button, { borderColor: colors.cardBorder }]}>
              <Text style={{ color: colors.textPrimary, fontWeight: '800' }}>{t('alerts.butoane.anuleaza')}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={t('chat.suggestion.confirmSave')} accessibilityState={{ disabled: saving || !validateCoachMealDraft(draft) }} disabled={saving || !validateCoachMealDraft(draft)} onPress={onConfirm} style={[styles.button, { backgroundColor: saving || !validateCoachMealDraft(draft) ? colors.disabledBg : colors.accentSecondary }]}>
              <Text style={{ color: saving || !validateCoachMealDraft(draft) ? colors.disabledText : colors.textOnAccentSecondary, fontWeight: '800' }}>{saving ? t('chat.saving') : t('chat.suggestion.confirmSave')}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.7)' },
  sheet: { maxHeight: '88%', borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, paddingHorizontal: 16, paddingTop: 18 },
  title: { fontSize: 19, fontWeight: '900' },
  note: { fontSize: 12, lineHeight: 18, marginTop: 5, marginBottom: 8 },
  scroll: { paddingBottom: 16 },
  field: { flex: 1, minWidth: 0, marginTop: 8 },
  label: { fontSize: 12, fontWeight: '700', marginBottom: 4 },
  input: { borderWidth: 1, borderRadius: 10, minHeight: 44, paddingHorizontal: 10, fontSize: 14 },
  section: { fontSize: 14, fontWeight: '800', marginTop: 14 },
  categories: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  category: { minHeight: 44, borderWidth: 1, borderRadius: 11, justifyContent: 'center', paddingHorizontal: 10 },
  ingredient: { borderWidth: 1, borderRadius: 12, padding: 10, marginTop: 9 },
  twoFields: { flexDirection: 'row', gap: 8 },
  total: { fontSize: 13, fontWeight: '800', marginTop: 14 },
  actions: { flexDirection: 'row', gap: 9, paddingVertical: 9 },
  button: { flex: 1, minHeight: 50, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
});
