import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Modal,
  Pressable,
} from 'react-native';
import { ChevronDown, AlertTriangle, Plus, RotateCcw, Maximize2, X } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { FlowIcon } from '../ui/FlowIcon';
import { MacroDistributionBar } from './MacroDistributionBar';
import { IngredientCardRow } from './IngredientCardRow';
import { ChangeIngredientSheet, FoodCandidate } from './ChangeIngredientSheet';
import { useFlowCredits } from '../../context/FlowCreditsContext';
import { CATEGORIE_ICONA } from '../../lib/mealUtils';
import type { AlimentScanat } from './FoodScanSuccessModal';
import type { TipMasa } from '../../types';

const MEAL_CATEGORIES: { id: TipMasa }[] = [
  { id: 'mic_dejun' },
  { id: 'pranz' },
  { id: 'cina' },
  { id: 'gustare' },
];

interface PhotoMealResultViewProps {
  rezultat: AlimentScanat[];
  photoUri?: string | null;
  tipMasa: TipMasa;
  onChangeTipMasa: (tip: TipMasa) => void;
  onUpdateRezultat: (items: AlimentScanat[]) => void;
  onSaveToJournal: () => void;
  onCancelAndRescan: () => void;
  isSaving: boolean;
  saveFailureMessage?: string | null;
  onRetrySave?: () => void;
  onSaveOffline?: () => void;
  requiresReview?: boolean;
  disabled?: boolean;
  pendingPhotoSaveLocked?: boolean;
  bottomInset?: number;
}

export function PhotoMealResultView({
  rezultat,
  photoUri,
  tipMasa,
  onChangeTipMasa,
  onUpdateRezultat,
  onSaveToJournal,
  onCancelAndRescan,
  isSaving,
  saveFailureMessage,
  onRetrySave,
  onSaveOffline,
  requiresReview = false,
  disabled = false,
  pendingPhotoSaveLocked = false,
  bottomInset = 16,
}: PhotoMealResultViewProps) {
  const { t } = useTranslation();
  const flowCredits = useFlowCredits();
  const [mealCategoryOpen, setMealCategoryOpen] = useState(false);
  const [changeSheetTargetIndex, setChangeSheetTargetIndex] = useState<number | null>(null);
  const [isAddingNewIngredient, setIsAddingNewIngredient] = useState(false);
  const [lastDeletedItem, setLastDeletedItem] = useState<{ item: AlimentScanat; index: number } | null>(null);
  const [photoZoomVisible, setPhotoZoomVisible] = useState(false);

  // Synchronous macro recalculation from current items
  const totals = useMemo(() => {
    let calorii = 0;
    let proteine = 0;
    let carbohidrati = 0;
    let grasimi = 0;
    let fibre = 0;

    for (const item of rezultat) {
      const f = (item.estimare_grame || 0) / 100;
      calorii += (item.calorii_per_100g || 0) * f;
      proteine += (item.proteine_per_100g || 0) * f;
      carbohidrati += (item.carbohidrati_per_100g || 0) * f;
      grasimi += (item.grasimi_per_100g || 0) * f;
      fibre += (item.fibre_per_100g || 0) * f;
    }

    return {
      calorii: Math.round(calorii),
      proteine: Math.round(proteine * 10) / 10,
      carbohidrati: Math.round(carbohidrati * 10) / 10,
      grasimi: Math.round(grasimi * 10) / 10,
      fibre: Math.round(fibre * 10) / 10,
    };
  }, [rezultat]);

  const mealTitle = useMemo(() => {
    if (rezultat.length === 0) return t('camera.unidentifiedFoodDefault', 'Masă detectată');
    if (rezultat.length === 1) return rezultat[0].nume;
    return rezultat.map((i) => i.nume).join(', ');
  }, [rezultat, t]);

  const handleUpdateGrams = (index: number, nextGrams: number) => {
    const updated = [...rezultat];
    updated[index] = {
      ...updated[index],
      estimare_grame: nextGrams,
    };
    onUpdateRezultat(updated);
  };

  const handleDeleteIngredient = (index: number) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}
    const deleted = rezultat[index];
    setLastDeletedItem({ item: deleted, index });
    const updated = rezultat.filter((_, i) => i !== index);
    onUpdateRezultat(updated);
  };

  const handleUndoDelete = () => {
    if (!lastDeletedItem) return;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    const updated = [...rezultat];
    updated.splice(lastDeletedItem.index, 0, lastDeletedItem.item);
    onUpdateRezultat(updated);
    setLastDeletedItem(null);
  };

  const handleSelectCandidate = (candidate: FoodCandidate) => {
    if (isAddingNewIngredient) {
      // Add as new ingredient with default 100g portion
      const newItem: AlimentScanat = {
        nume: candidate.nume,
        estimare_grame: 100,
        calorii_per_100g: candidate.calorii_per_100g,
        proteine_per_100g: candidate.proteine_per_100g,
        carbohidrati_per_100g: candidate.carbohidrati_per_100g,
        grasimi_per_100g: candidate.grasimi_per_100g,
        fibre_per_100g: candidate.fibre_per_100g,
        ...(photoUri ? { imageUrl: photoUri } : {}),
      };
      onUpdateRezultat([...rezultat, newItem]);
      setIsAddingNewIngredient(false);
    } else if (changeSheetTargetIndex !== null) {
      // Replace existing ingredient, keeping current portion
      const current = rezultat[changeSheetTargetIndex];
      const updated = [...rezultat];
      updated[changeSheetTargetIndex] = {
        ...current,
        nume: candidate.nume,
        calorii_per_100g: candidate.calorii_per_100g,
        proteine_per_100g: candidate.proteine_per_100g,
        carbohidrati_per_100g: candidate.carbohidrati_per_100g,
        grasimi_per_100g: candidate.grasimi_per_100g,
        fibre_per_100g: candidate.fibre_per_100g,
      };
      onUpdateRezultat(updated);
      setChangeSheetTargetIndex(null);
    }
  };

  return (
    <View style={styles.container} testID="photo-meal-result-view">
      <View style={styles.dragHandle} />
      {/* 1. Resilient Save Failure Recovery Banner (If save failed) */}
      {saveFailureMessage ? (
        <View style={styles.saveFailureCard} testID="save-failure-banner">
          <AlertTriangle size={20} color="#FB923C" style={{ marginRight: 10 }} />
          <View style={{ flex: 1 }}>
            <Text style={styles.saveFailureTitle}>{t('camera.saveFailedTitle', 'Salvarea a eșuat')}</Text>
            <Text style={styles.saveFailureBody}>
              {saveFailureMessage}. {t('camera.saveFailedPreserved', 'Mâncarea și modificările tale sunt păstrate intacte.')}
            </Text>
          </View>
        </View>
      ) : null}

      <ScrollView
        testID="camera-result-scroll"
        style={styles.scrollArea}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(bottomInset, 16) + 128 }]}
        showsVerticalScrollIndicator={true}
        nestedScrollEnabled={true}
        keyboardShouldPersistTaps="handled"
      >
        {/* 2. Hero Meal Photo Card & Lightbox Preview */}
        {photoUri ? (
          <TouchableOpacity
            testID="camera-hero-photo-preview"
            activeOpacity={0.92}
            onPress={() => {
              try {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              } catch {}
              setPhotoZoomVisible(true);
            }}
            accessibilityRole="button"
            accessibilityLabel={t('camera.tapToZoomPhoto', 'Apasă pentru a mări poza')}
            style={styles.heroPhotoCard}
          >
            <Image
              source={{ uri: photoUri }}
              style={styles.heroPhotoImage}
              resizeMode="cover"
            />
            <LinearGradient
              colors={['transparent', 'rgba(9, 12, 14, 0.85)']}
              style={styles.heroPhotoGradient}
            />
            <View style={styles.heroPhotoBottomRow}>
              <View style={styles.heroPhotoZoomBadge}>
                <Maximize2 size={12} color="#CCFF00" style={{ marginRight: 5 }} />
                <Text style={styles.heroPhotoZoomText}>{t('camera.tapToZoom', 'Zoom')}</Text>
              </View>
            </View>
          </TouchableOpacity>
        ) : null}

        {/* Meal Header Info */}
        <View style={styles.headerInfoBlock}>
          <Text maxFontSizeMultiplier={1.3} style={styles.eyebrowText}>
            {t('camera.detectedMeal')}
          </Text>
          <View style={styles.titleBadgeRow}>
            <Text numberOfLines={2} style={styles.mealTitle}>
              {mealTitle}
            </Text>
          </View>

          <View style={styles.metaRow}>
            <View style={styles.aiEstimateBadge}>
              <View style={styles.aiEstimateDot} />
              <Text style={styles.aiEstimateText}>{t('camera.aiEstimateBadge', 'Estimare AI')}</Text>
            </View>

            {/* Meal Category Dropdown Toggle */}
            <TouchableOpacity
              testID="camera-meal-correction-toggle"
              disabled={disabled || pendingPhotoSaveLocked}
              onPress={() => setMealCategoryOpen((prev) => !prev)}
              style={styles.categoryChip}
              accessibilityRole="button"
              accessibilityLabel={t('camera.changeMealCategory', 'Corectează categoria mesei')}
              accessibilityState={{ disabled: Boolean(disabled || pendingPhotoSaveLocked) }}
            >
              <FlowIcon name={CATEGORIE_ICONA[tipMasa]} size={12} color="#CCFF00" />
              <Text style={styles.categoryChipText}>
                {t(`chat.mealCategory.${tipMasa}`, tipMasa)}
              </Text>
              <ChevronDown size={12} color="#CCFF00" />
            </TouchableOpacity>
          </View>

          {/* Credit Consumption Status Badge */}
          <View
            style={[styles.creditStatusRow, pendingPhotoSaveLocked && styles.creditStatusRowDraft]}
            testID="photo-credit-status-badge"
          >
            <FlowIcon
              name={pendingPhotoSaveLocked ? 'file-text' : 'zap'}
              size={11}
              color={pendingPhotoSaveLocked ? '#8B93A0' : '#CCFF00'}
            />
            <Text style={[styles.creditStatusText, pendingPhotoSaveLocked && styles.creditStatusTextDraft]}>
              {pendingPhotoSaveLocked
                ? t('camera.draftRestoredNoCredit', 'Ciornă restaurată • Fără cost suplimentar')
                : flowCredits.unlimited
                ? t('camera.creditsUnlimited', 'Acces Premium Nelimitat')
                : flowCredits.lastConsumedCategory === 'daily'
                ? t('camera.dailyCreditConsumedCount', '1 Credit Gratuit folosit • {{count}} rămase', { count: flowCredits.balance.total })
                : flowCredits.lastConsumedCategory === 'rewarded'
                ? t('camera.rewardedCreditConsumedCount', '1 Credit Reclamă folosit • {{count}} rămase', { count: flowCredits.balance.total })
                : flowCredits.lastConsumedCategory === 'purchased'
                ? t('camera.purchasedCreditConsumedCount', '1 Credit Cumpărat folosit • {{count}} rămase', { count: flowCredits.balance.total })
                : t('camera.creditConsumedCount', '1 Flow Credit folosit • {{count}} rămase', { count: flowCredits.balance.total })}
            </Text>
          </View>

          {/* Pending Photo Save Lock Notice */}
          {pendingPhotoSaveLocked ? (
            <Text
              testID="camera-pending-save-lock-notice"
              accessibilityRole="alert"
              style={styles.pendingSaveLockedNotice}
            >
              {t('camera.pendingPhotoSaveLocked')}
            </Text>
          ) : null}
        </View>

        {/* Category Selection Row (Accordion) */}
        {mealCategoryOpen && !disabled && !pendingPhotoSaveLocked && (
          <View style={styles.categoryDropdownRow} accessibilityRole="radiogroup">
            {MEAL_CATEGORIES.map((cat) => {
              const selected = tipMasa === cat.id;
              return (
                <TouchableOpacity
                  key={cat.id}
                  onPress={() => {
                    try {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    } catch {}
                    onChangeTipMasa(cat.id);
                    setMealCategoryOpen(false);
                  }}
                  style={[styles.categoryOption, selected && styles.categoryOptionSelected]}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                >
                  <FlowIcon
                    name={CATEGORIE_ICONA[cat.id]}
                    size={14}
                    color={selected ? '#CCFF00' : '#8B93A0'}
                  />
                  <Text style={[styles.categoryOptionText, selected && styles.categoryOptionTextSelected]}>
                    {t(`chat.mealCategory.${cat.id}`, cat.id)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* 3. Primary Nutrition Summary Card (Option A Athletic Pro HUD) */}
        <View style={styles.nutritionCard} testID="camera-macro-summary">
          <View style={styles.calorieRow}>
            <Text style={styles.calorieValue}>{totals.calorii}</Text>
            <Text style={styles.calorieUnit}>kcal</Text>
          </View>

          {/* 4-Color Proportional Macro Distribution Bar */}
          <MacroDistributionBar
            protein={totals.proteine}
            carbs={totals.carbohidrati}
            fat={totals.grasimi}
            fiber={totals.fibre}
          />
        </View>

        {/* Quality Warning if Review is Required */}
        {requiresReview && (
          <View style={styles.qualityWarning} testID="camera-quality-warning">
            <AlertTriangle size={18} color="#FB923C" style={{ marginRight: 8 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.qualityWarningTitle}>
                {t('camera.reviewRequiredTitle', 'Verifică estimarea')}
              </Text>
              <Text style={styles.qualityWarningBody}>
                {t('camera.reviewRequiredMessage', 'Unele cantități sau valori par neobișnuite. Corectează gramajul înainte de salvare.')}
              </Text>
            </View>
          </View>
        )}

        {/* 4. Detected Ingredients Section */}
        <View style={styles.ingredientsHeaderRow}>
          <Text style={styles.sectionTitle}>
            {t('camera.detectedIngredients', 'Ingrediente detectate')} ({rezultat.length})
          </Text>

          {lastDeletedItem && (
            <TouchableOpacity onPress={handleUndoDelete} style={styles.undoBtn}>
              <RotateCcw size={13} color="#CCFF00" style={{ marginRight: 4 }} />
              <Text style={styles.undoBtnText}>{t('camera.undoDelete', 'Anulează ștergerea')}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Ingredient Cards */}
        {rezultat.map((item, index) => (
          <IngredientCardRow
            key={`${item.nume}-${index}`}
            ingredient={item}
            index={index}
            disabled={disabled}
            pendingPhotoSaveLocked={pendingPhotoSaveLocked}
            onChangeGrams={handleUpdateGrams}
            onOpenChangeSheet={(idx) => {
              setIsAddingNewIngredient(false);
              setChangeSheetTargetIndex(idx);
            }}
            onDelete={handleDeleteIngredient}
          />
        ))}

        {/* Add Extra Ingredient Button */}
        {!disabled && !pendingPhotoSaveLocked && (
          <TouchableOpacity
            testID="add-missing-ingredient-btn"
            onPress={() => {
              setIsAddingNewIngredient(true);
              setChangeSheetTargetIndex(null);
            }}
            style={styles.addIngredientDashedBtn}
            accessibilityRole="button"
            accessibilityLabel={t('camera.addAnotherIngredient', 'Adaugă alt ingredient în această masă')}
          >
            <Plus size={16} color="#CCFF00" style={{ marginRight: 8 }} />
            <Text style={styles.addIngredientDashedText}>
              {t('camera.addAnotherIngredient', 'Adaugă alt ingredient')}
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* 5. Sticky Bottom Action Dock */}
      <View style={[styles.bottomDock, { paddingBottom: Math.max(bottomInset, 16) + 8 }]}>
        {saveFailureMessage ? (
          // Retry Save Button (Orange/Lime Accent)
          <TouchableOpacity
            testID="camera-retry-save-btn"
            onPress={onRetrySave || onSaveToJournal}
            disabled={isSaving}
            style={[styles.primaryCTA, styles.retrySaveCTA]}
            accessibilityRole="button"
            accessibilityLabel={t('camera.retrySaveWithCalories', 'Reîncearcă salvarea • {{calories}} kcal', { calories: totals.calorii })}
          >
            <LinearGradient colors={['#FB923C', '#CCFF00']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.ctaGrad}>
              {isSaving ? (
                <ActivityIndicator size="small" color="#000000" />
              ) : (
                <Text style={styles.ctaText}>
                  {t('camera.retrySaveWithCalories', 'Reîncearcă salvarea • {{calories}} kcal', { calories: totals.calorii })}
                </Text>
              )}
            </LinearGradient>
          </TouchableOpacity>
        ) : (
          // Standard Primary Save Button (Neon Lime)
          <TouchableOpacity
            testID="camera-add-journal-btn"
            onPress={onSaveToJournal}
            disabled={isSaving || disabled || requiresReview}
            style={[styles.primaryCTA, (disabled || requiresReview) && { opacity: 0.5 }]}
            accessibilityRole="button"
            accessibilityLabel={t('camera.addToJournal')}
            accessibilityState={{ disabled: Boolean(isSaving || disabled || requiresReview), busy: isSaving }}
          >
            <LinearGradient colors={['#CCFF00', '#A8FF3E']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.ctaGrad}>
              {isSaving ? (
                <View style={styles.savingRow}>
                  <ActivityIndicator size="small" color="#000000" style={{ marginRight: 8 }} />
                  <Text style={styles.ctaText}>{t('camera.savingToJournal', 'Salvez în jurnal...')}</Text>
                </View>
              ) : (
                <Text style={styles.ctaText}>{t('camera.addToJournal', 'Adaugă în Jurnal')} • {totals.calorii} kcal</Text>
              )}
            </LinearGradient>
          </TouchableOpacity>
        )}

        {/* Offline Save Fallback Option if Save Failed */}
        {saveFailureMessage && onSaveOffline && (
          <TouchableOpacity testID="save-offline-direct-btn" onPress={onSaveOffline} style={styles.saveOfflineBtn}>
            <Text style={styles.saveOfflineText}>{t('camera.saveOfflineSafe', 'Salvează offline în siguranță')}</Text>
          </TouchableOpacity>
        )}

        {/* Secondary: Rescan Button */}
        {!saveFailureMessage && (
          <TouchableOpacity
            testID="camera-retry-btn"
            onPress={onCancelAndRescan}
            disabled={isSaving}
            style={styles.cancelLink}
          >
            <Text style={styles.cancelLinkText}>
              {t('camera.cancelAndRescan', 'Anulează & Scanează din nou')}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* 6. Change Ingredient Bottom Sheet Modal */}
      <ChangeIngredientSheet
        visible={changeSheetTargetIndex !== null || isAddingNewIngredient}
        currentIngredientName={
          changeSheetTargetIndex !== null && rezultat[changeSheetTargetIndex]
            ? rezultat[changeSheetTargetIndex].nume
            : ''
        }
        onClose={() => {
          setChangeSheetTargetIndex(null);
          setIsAddingNewIngredient(false);
        }}
        onSelectCandidate={handleSelectCandidate}
      />

      {/* 7. Lightbox Full-screen Modal for Photo Inspection */}
      <Modal
        visible={photoZoomVisible && Boolean(photoUri)}
        transparent={false}
        animationType="fade"
        onRequestClose={() => setPhotoZoomVisible(false)}
        testID="photo-zoom-lightbox-modal"
      >
        <View style={styles.lightboxContainer}>
          <Pressable
            testID="photo-zoom-close-btn"
            onPress={() => setPhotoZoomVisible(false)}
            style={styles.lightboxCloseBtn}
            accessibilityRole="button"
            accessibilityLabel={t('common.close', 'Închide')}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <X size={22} color="#FFFFFF" />
          </Pressable>
          {photoUri ? (
            <Image
              source={{ uri: photoUri }}
              style={styles.lightboxImage}
              resizeMode="contain"
            />
          ) : null}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#090C0E',
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  saveFailureCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(251, 146, 60, 0.12)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FB923C',
    padding: 12,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
  },
  saveFailureTitle: {
    color: '#FB923C',
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 2,
  },
  saveFailureBody: {
    color: '#E2E8F0',
    fontSize: 12,
    lineHeight: 16,
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  heroPhotoCard: {
    width: '100%',
    height: 200,
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 14,
    backgroundColor: '#12161A',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  heroPhotoImage: {
    width: '100%',
    height: '100%',
  },
  heroPhotoGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 70,
  },
  heroPhotoBottomRow: {
    position: 'absolute',
    bottom: 10,
    right: 12,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  heroPhotoZoomBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(9, 12, 14, 0.82)',
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(204, 255, 0, 0.35)',
  },
  heroPhotoZoomText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  headerInfoBlock: {
    marginBottom: 14,
  },
  lightboxContainer: {
    flex: 1,
    backgroundColor: '#090C0E',
    justifyContent: 'center',
    alignItems: 'center',
  },
  lightboxCloseBtn: {
    position: 'absolute',
    top: 48,
    right: 20,
    zIndex: 10,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  lightboxImage: {
    width: '100%',
    height: '85%',
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  thumbnail: {
    width: 64,
    height: 64,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    marginRight: 14,
  },
  thumbnailFallback: {
    backgroundColor: '#12161A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  eyebrowText: {
    color: '#CCFF00',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  titleBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  mealTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 22,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  aiEstimateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(204, 255, 0, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(204, 255, 0, 0.25)',
  },
  aiEstimateDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#CCFF00',
    marginRight: 5,
  },
  aiEstimateText: {
    color: '#CCFF00',
    fontSize: 11,
    fontWeight: '700',
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#12161A',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.10)',
    gap: 5,
  },
  categoryChipText: {
    color: '#CCFF00',
    fontSize: 11,
    fontWeight: '700',
  },
  categoryDropdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#12161A',
    borderRadius: 12,
    padding: 6,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  categoryOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 5,
  },
  categoryOptionSelected: {
    backgroundColor: 'rgba(204, 255, 0, 0.15)',
  },
  categoryOptionText: {
    color: '#8B93A0',
    fontSize: 12,
    fontWeight: '600',
  },
  categoryOptionTextSelected: {
    color: '#CCFF00',
    fontWeight: '700',
  },
  nutritionCard: {
    backgroundColor: '#12161A',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: 16,
    marginBottom: 16,
  },
  calorieRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  calorieValue: {
    color: '#CCFF00',
    fontSize: 36,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
    letterSpacing: -1,
  },
  calorieUnit: {
    color: '#8B93A0',
    fontSize: 16,
    fontWeight: '700',
    marginLeft: 6,
  },
  qualityWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(251, 146, 60, 0.10)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(251, 146, 60, 0.40)',
    padding: 12,
    marginBottom: 16,
  },
  qualityWarningTitle: {
    color: '#FB923C',
    fontSize: 13,
    fontWeight: '700',
  },
  qualityWarningBody: {
    color: '#8B93A0',
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  ingredientsHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  undoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(204, 255, 0, 0.10)',
  },
  undoBtnText: {
    color: '#CCFF00',
    fontSize: 12,
    fontWeight: '700',
  },
  addIngredientDashedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(204, 255, 0, 0.40)',
    borderRadius: 14,
    paddingVertical: 14,
    marginTop: 4,
    marginBottom: 16,
    backgroundColor: 'rgba(204, 255, 0, 0.03)',
  },
  addIngredientDashedText: {
    color: '#CCFF00',
    fontSize: 14,
    fontWeight: '700',
  },
  bottomDock: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(9, 12, 14, 0.95)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  primaryCTA: {
    borderRadius: 14,
    overflow: 'hidden',
    height: 52, // 52dp comfortable touch target
  },
  retrySaveCTA: {
    shadowColor: '#FB923C',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },
  ctaGrad: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '900',
  },
  savingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  saveOfflineBtn: {
    alignItems: 'center',
    paddingVertical: 8,
    marginTop: 6,
  },
  saveOfflineText: {
    color: '#FB923C',
    fontSize: 13,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  cancelLink: {
    alignItems: 'center',
    paddingVertical: 8,
    marginTop: 4,
  },
  cancelLinkText: {
    color: '#8B93A0',
    fontSize: 13,
    fontWeight: '600',
  },
  pendingSaveLockedNotice: {
    marginTop: 8,
    fontSize: 12,
    lineHeight: 17,
    color: '#8B93A0',
  },
  creditStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: 'rgba(204, 255, 0, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(204, 255, 0, 0.2)',
    alignSelf: 'flex-start',
  },
  creditStatusRowDraft: {
    backgroundColor: 'rgba(139, 147, 160, 0.08)',
    borderColor: 'rgba(139, 147, 160, 0.2)',
  },
  creditStatusText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#CCFF00',
  },
  creditStatusTextDraft: {
    color: '#8B93A0',
  },
});
