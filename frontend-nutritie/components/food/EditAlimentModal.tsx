import React, { forwardRef, useImperativeHandle, useRef, useMemo, useCallback, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  BackHandler,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { BottomSheetModal, BottomSheetScrollView, BottomSheetBackdrop, BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { Check, X, Minus, Plus, Trash2, AlertCircle, Sparkles } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../context/ThemeContext';
import { AlimentDetaliat } from '../../types';
import { ConfirmSheet } from '../ui/ConfirmSheet';
import {
  NutritionalBasis,
  extrageBazaNutritionala,
  scaleazaDinBaza,
  actualizeazaCantitateAliment,
  LIMITE_DB_MESE,
} from '../../lib/mealUtils';

export interface EditAlimentSheetRef {
  open: (aliment: AlimentDetaliat) => void;
  close: () => void;
  /** REMED-010: pentru BackHandler-ul foii-părinte (top-of-stack corect pe Android). */
  isPresent: () => boolean;
}

interface EditAlimentSheetProps {
  onSave: (aliment: AlimentDetaliat) => Promise<boolean> | void;
  onDelete?: (aliment: AlimentDetaliat) => Promise<boolean> | void;
}

/** Parsează un string numeric (acceptă virgulă și punct). Returnează null dacă e nevalid sau <= 0. */
function parseazaCantitate(text: string): number | null {
  const curatat = text.trim().replace(/,/g, '.');
  if (!curatat) return null;
  const n = parseFloat(curatat);
  if (isNaN(n) || !isFinite(n) || n <= 0) return null;
  return Math.round(n * 10) / 10;
}

export const EditAlimentSheet = forwardRef<EditAlimentSheetRef, EditAlimentSheetProps>(
  function EditAlimentSheet({ onSave, onDelete }, ref) {
    const { colors } = useTheme();
    const { t } = useTranslation();
    const bottomSheetRef = useRef<BottomSheetModal>(null);

    const [aliment, setAliment] = useState<AlimentDetaliat | null>(null);
    const [basis, setBasis] = useState<NutritionalBasis | null>(null);
    const [nume, setNume] = useState<string>('');
    const [cantitateStr, setCantitateStr] = useState<string>('');
    const [initialQuantity, setInitialQuantity] = useState<number>(100);
    const [isSaving, setIsSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [inputFocused, setInputFocused] = useState(false);
    const [showNameEdit, setShowNameEdit] = useState(false);
    const [prezent, setPrezent] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    const snapPoints = useMemo(() => ['82%'], []);

    // Cantitatea numerică curentă validată
    const cantitateNumerica = useMemo(() => {
      return parseazaCantitate(cantitateStr);
    }, [cantitateStr]);

    const unitate = basis?.unit || 'g';
    const isGramUnit = unitate.toLowerCase() === 'g' || unitate.toLowerCase() === 'grame' || unitate.toLowerCase() === 'grams';
    const step = isGramUnit ? 10 : 1;
    const minStep = isGramUnit ? 1 : 0.5;
    const maxLimit = isGramUnit ? LIMITE_DB_MESE.gramaj : 5000;

    // Previzualizare nutrițională în timp real din baza autoritară
    const preview = useMemo(() => {
      if (!basis) {
        return { calorii: 0, proteine: 0, carbohidrati: 0, grasimi: 0, fibre: 0 };
      }
      const q = cantitateNumerica ?? 0;
      return scaleazaDinBaza(basis, q);
    }, [basis, cantitateNumerica]);

    const isValid = cantitateNumerica !== null && cantitateNumerica > 0 && cantitateNumerica <= maxLimit;

    // Deschiderea sheet-ului resetează starea și capturează baza nutrițională autoritară
    useImperativeHandle(ref, () => ({
      open: (al: AlimentDetaliat) => {
        setAliment(al);
        const b = extrageBazaNutritionala(al);
        setBasis(b);
        setNume(al.nume || '');
        const currentQty = al.grame && al.grame > 0 ? al.grame : 100;
        setInitialQuantity(currentQty);
        setCantitateStr(String(currentQty));
        setIsSaving(false);
        setSaveError(null);
        setShowNameEdit(false);
        setPrezent(true);
        bottomSheetRef.current?.present();
      },
      close: () => {
        setPrezent(false);
        bottomSheetRef.current?.dismiss();
      },
      isPresent: () => prezent,
    }));

    // REMED-010: hardware-back pe Android închide DOAR această foaie dacă e deschisă
    useEffect(() => {
      if (Platform.OS !== 'android') return;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        if (prezent) {
          bottomSheetRef.current?.dismiss();
          return true;
        }
        return false;
      });
      return () => sub.remove();
    }, [prezent]);

    const renderBackdrop = useCallback(
      (props: any) => (
        <BottomSheetBackdrop
          {...props}
          disappearsOnIndex={-1}
          appearsOnIndex={0}
          opacity={0.6}
          pressBehavior="close"
        />
      ),
      [],
    );

    const handleIncrement = useCallback(() => {
      try { Haptics.selectionAsync(); } catch {}
      setSaveError(null);
      const current = cantitateNumerica ?? initialQuantity;
      const next = Math.min(maxLimit, Math.round(current + step));
      setCantitateStr(String(next));
    }, [cantitateNumerica, initialQuantity, step, maxLimit]);

    const handleDecrement = useCallback(() => {
      try { Haptics.selectionAsync(); } catch {}
      setSaveError(null);
      const current = cantitateNumerica ?? initialQuantity;
      const next = Math.max(minStep, Math.round(current - step));
      setCantitateStr(String(next));
    }, [cantitateNumerica, initialQuantity, step, minStep]);

    const applyDelta = useCallback((delta: number) => {
      try { Haptics.selectionAsync(); } catch {}
      setSaveError(null);
      const current = cantitateNumerica ?? initialQuantity;
      const next = Math.max(minStep, Math.min(maxLimit, Math.round(current + delta)));
      setCantitateStr(String(next));
    }, [cantitateNumerica, initialQuantity, minStep, maxLimit]);

    const handleSave = async () => {
      if (!aliment || !basis || !isValid || cantitateNumerica === null || isSaving) return;
      setSaveError(null);
      setIsSaving(true);

      const alimentActualizat = actualizeazaCantitateAliment(
        {
          ...aliment,
          nume: nume.trim() || aliment.nume,
        },
        cantitateNumerica,
        basis,
      );

      try {
        const result = await onSave(alimentActualizat);
        if (result !== false) {
          try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
          setIsSaving(false);
          setPrezent(false);
          bottomSheetRef.current?.dismiss();
        } else {
          setIsSaving(false);
          setSaveError(t('jurnal.saveErrorRetry'));
        }
      } catch (err: any) {
        setIsSaving(false);
        setSaveError(err?.message || t('jurnal.saveErrorRetry'));
      }
    };

    const handleDelete = () => {
      if (!aliment || !onDelete || isSaving) return;
      try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
      setShowDeleteConfirm(true);
    };

    const confirmDelete = async () => {
      if (!aliment || !onDelete) return;
      setIsSaving(true);
      setSaveError(null);
      try {
        const res = await onDelete(aliment);
        if (res !== false) {
          try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
          setIsSaving(false);
          setShowDeleteConfirm(false);
          setPrezent(false);
          bottomSheetRef.current?.dismiss();
        } else {
          setIsSaving(false);
          setShowDeleteConfirm(false);
          setSaveError(t('jurnal.saveErrorRetry'));
        }
      } catch (err: any) {
        setIsSaving(false);
        setShowDeleteConfirm(false);
        setSaveError(err?.message || t('jurnal.saveErrorRetry'));
      }
    };

    return (
      <>
        <BottomSheetModal
        ref={bottomSheetRef}
        snapPoints={snapPoints}
        stackBehavior="push"
        enablePanDownToClose
        enableDynamicSizing={false}
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: colors.surfaceBg, borderColor: colors.cardBorder, borderWidth: 1 }}
        handleIndicatorStyle={{ backgroundColor: colors.overlayStrong, width: 44 }}
        onDismiss={() => {
          setPrezent(false);
          setIsSaving(false);
          setSaveError(null);
        }}
      >
        {aliment ? (
          <View style={{ flex: 1 }}>
            {/* Header: Food Name and Current Quantity */}
            <View style={styles.header}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text
                  style={[styles.foodTitle, { color: colors.textPrimary }]}
                  numberOfLines={2}
                  maxFontSizeMultiplier={1.3}
                >
                  {nume || aliment.nume}
                </Text>
                <Text
                  style={[styles.currentQuantitySubtitle, { color: colors.textSecondary }]}
                  maxFontSizeMultiplier={1.3}
                >
                  {t('jurnal.currentQuantity', { quantity: initialQuantity, unit: unitate })}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => bottomSheetRef.current?.dismiss()}
                style={[styles.closeBtn, { backgroundColor: 'rgba(255,255,255,0.06)' }]}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityRole="button"
                accessibilityLabel={t('jurnal.closeCorrectIngredient')}
              >
                <X size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <BottomSheetScrollView
              contentContainerStyle={styles.body}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* Optional Food Name Edit Accordion */}
              {showNameEdit ? (
                <View style={styles.nameEditSection}>
                  <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>
                    {t('jurnal.nameLabel')}
                  </Text>
                  <BottomSheetTextInput
                    style={[styles.nameInput, { color: colors.textPrimary, borderColor: colors.cardBorder, backgroundColor: colors.cardBg }]}
                    value={nume}
                    onChangeText={setNume}
                    placeholder={t('jurnal.namePlaceholderEdit')}
                    placeholderTextColor={colors.textTertiary}
                    accessibilityLabel={t('jurnal.nameLabel')}
                  />
                </View>
              ) : (
                <TouchableOpacity
                  onPress={() => setShowNameEdit(true)}
                  style={styles.renameToggle}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={[styles.renameToggleText, { color: colors.accentSecondary }]}>
                    {t('jurnal.editMeal')} (nume)
                  </Text>
                </TouchableOpacity>
              )}

              {/* Stepper Quantity Row: [-] [ quantity ] [+] unit */}
              <View style={styles.stepperSection}>
                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>
                  {t('jurnal.editQuantityTitle')}
                </Text>
                <View style={styles.stepperRow}>
                  <TouchableOpacity
                    style={[
                      styles.stepperBtn,
                      {
                        backgroundColor: colors.cardBg,
                        borderColor: colors.cardBorder,
                        opacity: cantitateNumerica !== null && cantitateNumerica <= minStep ? 0.35 : 1,
                      },
                    ]}
                    disabled={(cantitateNumerica !== null && cantitateNumerica <= minStep) || isSaving}
                    onPress={handleDecrement}
                    accessibilityRole="button"
                    accessibilityLabel={t('jurnal.decreaseQuantity')}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Minus size={22} color={colors.textPrimary} />
                  </TouchableOpacity>

                  <View
                    style={[
                      styles.stepperInputWrapper,
                      {
                        backgroundColor: colors.cardBg,
                        borderColor: inputFocused ? colors.accent : colors.cardBorder,
                      },
                    ]}
                  >
                    <BottomSheetTextInput
                      style={[styles.stepperInput, { color: colors.textPrimary }]}
                      value={cantitateStr}
                      onChangeText={(val) => {
                        setSaveError(null);
                        setCantitateStr(val);
                      }}
                      keyboardType={Platform.OS === 'ios' ? 'decimal-pad' : 'numeric'}
                      selectTextOnFocus
                      onFocus={() => setInputFocused(true)}
                      onBlur={() => setInputFocused(false)}
                      accessibilityLabel={`${t('jurnal.gramajShort')}, ${cantitateStr} ${unitate}`}
                      placeholder="0"
                      placeholderTextColor={colors.textTertiary}
                      maxFontSizeMultiplier={1.3}
                    />
                    <Text style={[styles.unitText, { color: colors.accent }]}>
                      {unitate}
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={[
                      styles.stepperBtn,
                      {
                        backgroundColor: colors.cardBg,
                        borderColor: colors.cardBorder,
                        opacity: cantitateNumerica !== null && cantitateNumerica >= maxLimit ? 0.35 : 1,
                      },
                    ]}
                    disabled={(cantitateNumerica !== null && cantitateNumerica >= maxLimit) || isSaving}
                    onPress={handleIncrement}
                    accessibilityRole="button"
                    accessibilityLabel={t('jurnal.increaseQuantity')}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Plus size={22} color={colors.textPrimary} />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Quick Portion Adjustment Chips */}
              <View style={styles.chipsSection}>
                <View style={styles.chipsRow}>
                  {[-50, -10, 10, 50].map((delta) => {
                    const isNeg = delta < 0;
                    return (
                      <TouchableOpacity
                        key={delta}
                        style={[
                          styles.chip,
                          {
                            backgroundColor: colors.cardBg,
                            borderColor: isNeg ? colors.cardBorder : colors.accent + '44',
                          },
                        ]}
                        disabled={isSaving}
                        onPress={() => applyDelta(delta)}
                        accessibilityRole="button"
                        accessibilityLabel={`${delta > 0 ? '+' : ''}${delta}${unitate}`}
                      >
                        <Text
                          style={[
                            styles.chipText,
                            { color: isNeg ? colors.textSecondary : colors.accent },
                          ]}
                        >
                          {delta > 0 ? `+${delta}` : `${delta}`} {unitate}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Live Nutrition Preview Card */}
              <View
                style={[
                  styles.previewCard,
                  { backgroundColor: 'rgba(0,0,0,0.22)', borderColor: colors.cardBorder },
                ]}
              >
                <View style={styles.previewHeader}>
                  <Sparkles size={14} color={colors.accent} />
                  <Text style={[styles.previewTitle, { color: colors.textSecondary }]}>
                    {t('jurnal.nutritionPreview')}
                  </Text>
                </View>

                <View style={styles.previewGrid}>
                  <View style={styles.previewCol}>
                    <Text
                      style={[styles.previewValue, { color: colors.accent }]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.7}
                    >
                      {preview.calorii}
                    </Text>
                    <Text style={[styles.previewLabel, { color: colors.textSecondary }]}>
                      kcal
                    </Text>
                  </View>
                  <View style={styles.previewDivider} />
                  <View style={styles.previewCol}>
                    <Text
                      style={[styles.previewValue, { color: colors.success }]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.7}
                    >
                      {preview.proteine}g
                    </Text>
                    <Text style={[styles.previewLabel, { color: colors.textSecondary }]}>
                      {t('jurnal.macroProtein')}
                    </Text>
                  </View>
                  <View style={styles.previewDivider} />
                  <View style={styles.previewCol}>
                    <Text
                      style={[styles.previewValue, { color: colors.warning }]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.7}
                    >
                      {preview.carbohidrati}g
                    </Text>
                    <Text style={[styles.previewLabel, { color: colors.textSecondary }]}>
                      {t('jurnal.macroCarbs')}
                    </Text>
                  </View>
                  <View style={styles.previewDivider} />
                  <View style={styles.previewCol}>
                    <Text
                      style={[styles.previewValue, { color: colors.accentSecondary }]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.7}
                    >
                      {preview.grasimi}g
                    </Text>
                    <Text style={[styles.previewLabel, { color: colors.textSecondary }]}>
                      {t('jurnal.macroFats')}
                    </Text>
                  </View>
                  {preview.fibre > 0 ? (
                    <>
                      <View style={styles.previewDivider} />
                      <View style={styles.previewCol}>
                        <Text
                          style={[styles.previewValue, { color: colors.accentTertiary }]}
                          numberOfLines={1}
                          adjustsFontSizeToFit
                          minimumFontScale={0.7}
                        >
                          {preview.fibre}g
                        </Text>
                        <Text style={[styles.previewLabel, { color: colors.textSecondary }]}>
                          {t('jurnal.macroFiber')}
                        </Text>
                      </View>
                    </>
                  ) : null}
                </View>
              </View>

              {/* Validation or Persistence Error Box */}
              {!isValid && cantitateStr.trim().length > 0 ? (
                <View
                  style={[
                    styles.errorBox,
                    { backgroundColor: colors.danger + '18', borderColor: colors.danger + '44' },
                  ]}
                  accessibilityRole="alert"
                >
                  <AlertCircle size={15} color={colors.danger} />
                  <Text style={[styles.errorText, { color: colors.danger }]}>
                    {t('jurnal.quantityInvalid')}
                  </Text>
                </View>
              ) : null}

              {saveError ? (
                <View
                  style={[
                    styles.errorBox,
                    { backgroundColor: colors.danger + '18', borderColor: colors.danger + '44' },
                  ]}
                  accessibilityRole="alert"
                >
                  <AlertCircle size={15} color={colors.danger} />
                  <Text style={[styles.errorText, { color: colors.danger }]}>
                    {saveError}
                  </Text>
                </View>
              ) : null}

              {/* Action Buttons: Save Changes & Remove from meal */}
              <View style={styles.actionsContainer}>
                <TouchableOpacity
                  style={[
                    styles.saveBtn,
                    {
                      backgroundColor: colors.accent,
                      opacity: isValid && !isSaving ? 1 : 0.45,
                    },
                  ]}
                  disabled={!isValid || isSaving}
                  onPress={handleSave}
                  accessibilityRole="button"
                  accessibilityLabel={t('jurnal.saveChanges')}
                  activeOpacity={0.85}
                >
                  {isSaving ? (
                    <ActivityIndicator size="small" color={colors.textOnAccent} />
                  ) : (
                    <>
                      <Check size={18} color={colors.textOnAccent} strokeWidth={2.5} />
                      <Text style={[styles.saveBtnText, { color: colors.textOnAccent }]}>
                        {t('jurnal.saveChanges')}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>

                {onDelete ? (
                  <TouchableOpacity
                    style={[
                      styles.deleteBtn,
                      {
                        borderColor: colors.danger + '40',
                        backgroundColor: colors.danger + '10',
                      },
                    ]}
                    disabled={isSaving}
                    onPress={handleDelete}
                    accessibilityRole="button"
                    accessibilityLabel={t('jurnal.removeFromMeal')}
                    activeOpacity={0.8}
                  >
                    <Trash2 size={16} color={colors.danger} />
                    <Text style={[styles.deleteBtnText, { color: colors.danger }]}>
                      {t('jurnal.removeFromMeal')}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </BottomSheetScrollView>
          </View>
        ) : null}
      </BottomSheetModal>

        <ConfirmSheet
          visible={showDeleteConfirm}
          title={t('jurnal.confirmRemoveIngredientTitle')}
          message={t('jurnal.confirmRemoveIngredientNamed', { nume: aliment?.nume || '' })}
          icon={<Trash2 size={24} color={colors.danger} />}
          destructive
          loading={isSaving}
          buttonLayout="horizontal"
          confirmLabel={t('jurnal.removeFromMeal')}
          cancelLabel={t('alerts.butoane.anuleaza')}
          onCancel={() => {
            if (!isSaving) setShowDeleteConfirm(false);
          }}
          onConfirm={confirmDelete}
        />
      </>
    );
  },
);

EditAlimentSheet.displayName = 'EditAlimentSheet';

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  foodTitle: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  currentQuantitySubtitle: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 3,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  body: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 32,
  },
  renameToggle: {
    alignSelf: 'flex-start',
    marginBottom: 12,
    paddingVertical: 2,
  },
  renameToggleText: {
    fontSize: 12,
    fontWeight: '700',
  },
  nameEditSection: {
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  nameInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    fontWeight: '700',
  },
  stepperSection: {
    marginBottom: 14,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stepperBtn: {
    width: 48,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepperInputWrapper: {
    flex: 1,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    borderWidth: 1.5,
    paddingHorizontal: 12,
  },
  stepperInput: {
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'center',
    paddingVertical: 0,
    minWidth: 60,
  },
  unitText: {
    fontSize: 15,
    fontWeight: '800',
    marginLeft: 4,
  },
  chipsSection: {
    marginBottom: 18,
  },
  chipsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  chip: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '800',
  },
  previewCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    marginBottom: 16,
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  previewTitle: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  previewGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  previewCol: {
    flex: 1,
    alignItems: 'center',
  },
  previewValue: {
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 2,
  },
  previewLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  previewDivider: {
    width: 1,
    height: 32,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
  },
  actionsContainer: {
    gap: 10,
    marginTop: 4,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 50,
    borderRadius: 14,
  },
  saveBtnText: {
    fontSize: 15,
    fontWeight: '800',
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
  },
  deleteBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
});