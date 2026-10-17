import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Trash2, RefreshCw } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { StepperQuantityControl } from '../ui/StepperQuantityControl';
import type { AlimentScanat } from './FoodScanSuccessModal';

interface IngredientCardRowProps {
  ingredient: AlimentScanat;
  index: number;
  disabled?: boolean;
  pendingPhotoSaveLocked?: boolean;
  onChangeGrams: (index: number, nextGrams: number) => void;
  onOpenChangeSheet: (index: number) => void;
  onDelete: (index: number) => void;
}

export function IngredientCardRow({
  ingredient,
  index,
  disabled = false,
  pendingPhotoSaveLocked = false,
  onChangeGrams,
  onOpenChangeSheet,
  onDelete,
}: IngredientCardRowProps) {
  const { t } = useTranslation();

  const grame = ingredient.estimare_grame || 0;
  const factor = grame / 100;
  const kcal = Math.round((ingredient.calorii_per_100g || 0) * factor);
  const prot = Math.round((ingredient.proteine_per_100g || 0) * factor * 10) / 10;
  const carb = Math.round((ingredient.carbohidrati_per_100g || 0) * factor * 10) / 10;
  const gras = Math.round((ingredient.grasimi_per_100g || 0) * factor * 10) / 10;

  return (
    <View style={styles.card} testID={`ingredient-card-${index}`}>
      <View style={styles.topRow}>
        <View style={styles.infoCol}>
          <Text
            maxFontSizeMultiplier={1.3}
            numberOfLines={2}
            style={styles.nameText}
          >
            {ingredient.nume || t('camera.unidentifiedFoodDefault', 'Aliment identificat')}
          </Text>

          <Text maxFontSizeMultiplier={1.3} style={styles.macroText}>
            {kcal} kcal · {prot}g {t('camera.proteinShort', 'prot.')} · {carb}g {t('camera.carbsShort', 'carb.')} · {gras}g {t('jurnal.macroFatsShort', 'gr.')}
          </Text>
        </View>

        {/* Stepper Quantity Control */}
        {pendingPhotoSaveLocked ? (
          <Text testID="camera-locked-ingredient-grams" style={styles.lockedGramsText}>
            {grame} g
          </Text>
        ) : (
          <StepperQuantityControl
            grams={grame}
            onChangeGrams={(nextG) => onChangeGrams(index, nextG)}
            disabled={disabled}
          />
        )}
      </View>

      {/* Bottom Action Line: Discreet 'Schimbă' & 'Șterge' */}
      {!disabled && !pendingPhotoSaveLocked && (
        <View style={styles.actionsLine}>
          <TouchableOpacity
            testID={`ingredient-change-btn-${index}`}
            onPress={() => onOpenChangeSheet(index)}
            style={styles.changeActionBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={`Schimbă ingredientul ${ingredient.nume}`}
          >
            <RefreshCw size={13} color="#8B93A0" style={{ marginRight: 5 }} />
            <Text style={styles.changeActionText}>Schimbă</Text>
          </TouchableOpacity>

          <TouchableOpacity
            testID={`ingredient-delete-btn-${index}`}
            onPress={() => onDelete(index)}
            style={styles.deleteActionBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={`Șterge ${ingredient.nume}`}
          >
            <Trash2 size={15} color="#EF4444" />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#12161A',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: 14,
    marginBottom: 10,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  infoCol: {
    flex: 1,
    paddingRight: 10,
  },
  nameText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
    marginBottom: 4,
  },
  macroText: {
    color: '#8B93A0',
    fontSize: 12,
    fontWeight: '500',
  },
  actionsLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.04)',
  },
  changeActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  changeActionText: {
    color: '#8B93A0',
    fontSize: 12,
    fontWeight: '600',
  },
  deleteActionBtn: {
    padding: 6,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockedGramsText: {
    color: '#CCFF00',
    fontSize: 16,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
});
