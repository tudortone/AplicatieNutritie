import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import {
  X,
  Plus,
  Minus,
  Scale,
  ShieldCheck,
  AlertTriangle,
  Beaker,
  Sparkles,
  Info,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../supabase';
import {
  MEAL_CATEGORIES,
  CATEGORIE_ICONA,
  getTipMasaDupaOra,
  getMealCategoryLabel,
  insereazaMasaCuPoza,
  clampValoare,
  LIMITE_DB_MESE,
} from '../../lib/mealUtils';
import { marcheazaMeseModificate } from '../../lib/freshnessMese';
import { useNotificationBanner } from '../../context/NotificationBannerContext';
import { FlowIcon } from '../ui/FlowIcon';
import { NutriScoreBadge } from './NutriScoreBadge';
import { NovaBadge } from './NovaBadge';
import { MealSaveSuccessModal, type MealSuccessData } from '../ui/MealSaveSuccessModal';
import { getDetaliiCompleteProdus } from '../../lib/openfoodfacts';
import { pushOfflineMealVerificat, type MasaOfflinePayload } from '../../lib/offlineQueue';
import type { FoodProduct } from './types';
import type { TipMasa, Masa, AlimentDetaliat } from '../../types';

interface FoodProductDetailModalProps {
  visible: boolean;
  product: FoodProduct | null;
  initialGrams?: number;
  onClose: () => void;
  onAddSuccess?: (masa: Masa) => void;
}

export const FoodProductDetailModal: React.FC<FoodProductDetailModalProps> = ({
  visible,
  product: initialProduct,
  initialGrams = 100,
  onClose,
  onAddSuccess,
}) => {
  const { colors } = useTheme();
  const { session, user } = useAuth();
  const { t } = useTranslation();
  const { showBanner } = useNotificationBanner();

  const [product, setProduct] = useState<FoodProduct | null>(initialProduct);
  const [grame, setGrame] = useState<number>(initialGrams);
  const [grameInput, setGrameInput] = useState<string>(String(initialGrams));
  const [tipMasa, setTipMasa] = useState<TipMasa>(() => getTipMasaDupaOra());
  const [viewPer100g, setViewPer100g] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [loadingDetails, setLoadingDetails] = useState<boolean>(false);
  const [successData, setSuccessData] = useState<MealSuccessData | null>(null);

  // Sincronizează produsul și gramajul când modalul se deschide
  useEffect(() => {
    if (initialProduct) {
      setProduct(initialProduct);
      const defaultG = initialProduct.servingGrams || initialGrams || 100;
      setGrame(defaultG);
      setGrameInput(String(defaultG));
      setTipMasa(getTipMasaDupaOra());

      // Dacă produsul are cod de bare dar nu are ingrediente sau detalii complete, le interogăm async
      if (initialProduct.barcode && !initialProduct.ingredientsText) {
        setLoadingDetails(true);
        getDetaliiCompleteProdus(initialProduct.barcode)
          .then((extra) => {
            if (extra) {
              setProduct((prev) => (prev ? { ...prev, ...extra } : prev));
            }
          })
          .catch(() => {})
          .finally(() => setLoadingDetails(false));
      }
    }
  }, [initialProduct, initialGrams]);

  const handleGramajChange = useCallback((nouGramaj: number) => {
    const valid = Math.max(1, Math.min(nouGramaj, 5000));
    setGrame(valid);
    setGrameInput(String(valid));
  }, []);

  const handleGramajInputBlur = useCallback(() => {
    const parsed = parseInt(grameInput.replace(/[^0-9]/g, ''), 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      handleGramajChange(parsed);
    } else {
      setGrameInput(String(grame));
    }
  }, [grameInput, grame, handleGramajChange]);

  // Calcule dinamice nutriționale pentru gramajul selectat
  const factor = useMemo(() => grame / 100, [grame]);

  const totaluri = useMemo(() => {
    if (!product) return { calorii: 0, proteine: 0, carbohidrati: 0, grasimi: 0, fibre: 0, zaharuri: 0, saturate: 0, sare: 0, sodiu: 0 };
    return {
      calorii: Math.round(product.kcalPer100g * factor),
      proteine: Math.round(product.proteinPer100g * factor * 10) / 10,
      carbohidrati: Math.round(product.carbsPer100g * factor * 10) / 10,
      grasimi: Math.round(product.fatPer100g * factor * 10) / 10,
      fibre: product.fiberPer100g ? Math.round(product.fiberPer100g * factor * 10) / 10 : 0,
      zaharuri: product.sugarPer100g ? Math.round(product.sugarPer100g * factor * 10) / 10 : 0,
      saturate: product.saturatedFatPer100g ? Math.round(product.saturatedFatPer100g * factor * 10) / 10 : 0,
      sare: product.saltPer100g ? Math.round(product.saltPer100g * factor * 100) / 100 : 0,
      sodiu: product.sodiumPer100g ? Math.round(product.sodiumPer100g * factor) : 0,
    };
  }, [product, factor]);

  // Adăugare în jurnal
  const handleAdaugaInJurnal = async () => {
    const effectiveUserId = session?.user?.id || user?.id;
    if (!product || saving) return;
    if (!effectiveUserId) {
      showBanner({
        title: t('alerts.titluri.eroare'),
        message: t('alerts.mesaje.autentificareNecesaraInregistrare'),
        type: 'warning',
      });
      return;
    }

    setSaving(true);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}

    const acum = new Date();
    const dataISO = `${acum.getFullYear()}-${String(acum.getMonth() + 1).padStart(2, '0')}-${String(acum.getDate()).padStart(2, '0')}`;
    const oraStr = `${String(acum.getHours()).padStart(2, '0')}:${String(acum.getMinutes()).padStart(2, '0')}`;
    const mealId = `meal_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const alimentItem: AlimentDetaliat = {
      nume: product.brand ? `${product.name} (${product.brand})` : product.name,
      grame,
      calorii: totaluri.calorii,
      proteine: totaluri.proteine,
      carbohidrati: totaluri.carbohidrati,
      grasimi: totaluri.grasimi,
      fibre: totaluri.fibre,
      imageUrl: product.imageUrl,
      aminoacizi: product.aminoacizi,
      micronutrienti: product.micronutrienti,
    };

    const payload = {
      id: mealId,
      user_id: effectiveUserId,
      nume: alimentItem.nume,
      tip_masa: tipMasa,
      calorii: clampValoare(totaluri.calorii, LIMITE_DB_MESE.calorii),
      proteine: clampValoare(totaluri.proteine, LIMITE_DB_MESE.proteine),
      carbohidrati: clampValoare(totaluri.carbohidrati, LIMITE_DB_MESE.carbohidrati),
      grasimi: clampValoare(totaluri.grasimi, LIMITE_DB_MESE.grasimi),
      fibre: clampValoare(totaluri.fibre, LIMITE_DB_MESE.fibre),
      data: dataISO,
      ora: oraStr,
      imagine_url: product.imageUrl || null,
      alimente: [alimentItem],
    };

    try {
      const { data, error } = await insereazaMasaCuPoza(supabase, payload);

      if (error) {
        console.error('[FoodProductDetailModal] Eroare la inserarea mesei:', error);
        // Fallback offline queue verificat
        try {
          const payloadOffline: MasaOfflinePayload = {
            id: payload.id,
            user_id: effectiveUserId,
            nume: payload.nume,
            calorii: payload.calorii,
            proteine: payload.proteine,
            grasimi: payload.grasimi,
            carbohidrati: payload.carbohidrati,
            fibre: payload.fibre,
            tip_masa: payload.tip_masa,
            alimente: payload.alimente,
            imagine_url: payload.imagine_url ?? null,
            data: payload.data,
            ora: payload.ora,
            created_at: acum.toISOString(),
          };
          const pushOk = await pushOfflineMealVerificat(payloadOffline);
          if (pushOk) {
            marcheazaMeseModificate(effectiveUserId);
            setSuccessData({
              nume: alimentItem.nume,
              calorii: totaluri.calorii,
              proteine: totaluri.proteine,
              carbohidrati: totaluri.carbohidrati,
              grasimi: totaluri.grasimi,
              tip_masa: tipMasa,
              isOffline: true,
            });
            const masaOffline = payloadOffline as unknown as Masa;
            if (onAddSuccess) {
              onAddSuccess(masaOffline);
            }
            return;
          }
        } catch (queueErr) {
          console.warn('[FoodProductDetailModal] Eroare coada offline:', queueErr);
        }

        showBanner({
          title: t('alerts.titluri.eroareSalvare'),
          message: error.message || 'Nu s-a putut salva masa în jurnal.',
          type: 'error',
        });
        setSaving(false);
        return;
      }

      const masaSalvata = (data && data[0]) ? (data[0] as Masa) : (payload as unknown as Masa);

      // Invalidăm cache-ul jurnalului pentru reîmprospătare instantanee
      marcheazaMeseModificate(effectiveUserId);

      // Confirmare vizuală
      setSuccessData({
        nume: alimentItem.nume,
        calorii: totaluri.calorii,
        proteine: totaluri.proteine,
        carbohidrati: totaluri.carbohidrati,
        grasimi: totaluri.grasimi,
        tip_masa: tipMasa,
        isOffline: false,
      });

      if (onAddSuccess) {
        onAddSuccess(masaSalvata);
      }
    } catch (err: any) {
      console.error('[FoodProductDetailModal] Excepție salvare:', err);
      showBanner({
        title: t('alerts.titluri.eroareSalvare'),
        message: 'A apărut o problemă de conexiune.',
        type: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSuccessDismiss = () => {
    setSuccessData(null);
    onClose();
  };

  if (!visible || !product) return null;

  const displayFactor = viewPer100g ? 1 : factor;
  const dispKcal = Math.round(product.kcalPer100g * displayFactor);
  const dispProt = Math.round(product.proteinPer100g * displayFactor * 10) / 10;
  const dispCarbs = Math.round(product.carbsPer100g * displayFactor * 10) / 10;
  const dispFat = Math.round(product.fatPer100g * displayFactor * 10) / 10;
  const dispFiber = product.fiberPer100g ? Math.round(product.fiberPer100g * displayFactor * 10) / 10 : 0;
  const dispSugar = product.sugarPer100g ? Math.round(product.sugarPer100g * displayFactor * 10) / 10 : 0;
  const dispSatFat = product.saturatedFatPer100g ? Math.round(product.saturatedFatPer100g * displayFactor * 10) / 10 : 0;
  const dispSalt = product.saltPer100g ? Math.round(product.saltPer100g * displayFactor * 100) / 100 : 0;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={[styles.sheetContainer, { backgroundColor: colors.surfaceBg, borderColor: colors.cardBorder }]}>
          {/* Header Bar */}
          <View style={[styles.modalHeader, { borderBottomColor: colors.cardBorder }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
                {product.brand ? product.brand.toUpperCase() : 'PRODUS ALIMENTAR'}
              </Text>
              <Text style={[styles.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                {product.name}
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={[styles.closeCircle, { backgroundColor: colors.surface }]}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel="Închide"
            >
              <X size={20} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            {/* 1. Poza cu mâncarea (Food Picture) */}
            <View style={styles.imageSection}>
              {product.imageUrl ? (
                <View style={[styles.imageCard, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}>
                  <Image
                    source={{ uri: product.imageUrl }}
                    style={styles.foodImage}
                    contentFit="contain"
                    transition={250}
                  />
                  {product.source === 'openfoodfacts' && (
                    <View style={styles.sourceTag}>
                      <ShieldCheck size={12} color="#10B981" />
                      <Text style={styles.sourceTagText}>OpenFoodFacts</Text>
                    </View>
                  )}
                </View>
              ) : (
                <LinearGradient
                  colors={[colors.accent + '25', colors.surfaceBg]}
                  style={[styles.placeholderCard, { borderColor: colors.cardBorder }]}
                >
                  <FlowIcon name="apple" size={54} color={colors.accent} />
                  <Text style={[styles.placeholderText, { color: colors.textSecondary }]}>
                    {product.name}
                  </Text>
                </LinearGradient>
              )}
            </View>

            {/* 2. Scor Nutritiv (Nutritional Scores) */}
            <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
              <View style={styles.sectionHeaderRow}>
                <Sparkles size={16} color={colors.accent} />
                <Text style={[styles.sectionHeading, { color: colors.textPrimary }]}>SCOR NUTRITIV</Text>
                {loadingDetails && <ActivityIndicator size="small" color={colors.accent} style={{ marginLeft: 6 }} />}
              </View>

              {product.nutriscoreGrade ? (
                <NutriScoreBadge
                  grade={product.nutriscoreGrade}
                  score={product.nutriscoreScore}
                  size="large"
                />
              ) : (
                <View style={styles.badgeRowNotice}>
                  <Text style={[styles.noticeText, { color: colors.textSecondary }]}>
                    Nutri-Score necalculat pentru acest produs
                  </Text>
                </View>
              )}

              {product.novaGroup ? (
                <View style={{ marginTop: 8 }}>
                  <NovaBadge group={product.novaGroup} showDescription={true} />
                </View>
              ) : null}
            </View>

            {/* 3. Buton de adăugare în jurnal & Porții (Add to Diary Section) */}
            <View style={[styles.sectionCard, styles.actionCard, { backgroundColor: colors.surface, borderColor: colors.accent }]}>
              <View style={styles.sectionHeaderRow}>
                <Scale size={16} color={colors.accent} />
                <Text style={[styles.sectionHeading, { color: colors.accent }]}>ADĂUGARE ÎN JURNAL</Text>
              </View>

              {/* Selector categorie de masă */}
              <Text style={[styles.subLabel, { color: colors.textSecondary }]}>Categorie masă:</Text>
              <View style={styles.categoriesRow}>
                {MEAL_CATEGORIES.map((cat) => {
                  const isSelected = tipMasa === cat.id;
                  const iconName = CATEGORIE_ICONA[cat.id];
                  const label = getMealCategoryLabel(cat.id, t);
                  return (
                    <TouchableOpacity
                      key={cat.id}
                      style={[
                        styles.catChip,
                        {
                          backgroundColor: isSelected ? colors.accent : colors.surfaceBg,
                          borderColor: isSelected ? colors.accent : colors.cardBorder,
                        },
                      ]}
                      onPress={() => {
                        try { Haptics.selectionAsync(); } catch {}
                        setTipMasa(cat.id);
                      }}
                      activeOpacity={0.8}
                    >
                      <FlowIcon
                        name={iconName}
                        size={15}
                        color={isSelected ? colors.textOnAccent : colors.textPrimary}
                      />
                      <Text
                        style={[
                          styles.catChipText,
                          {
                            color: isSelected ? colors.textOnAccent : colors.textPrimary,
                            fontWeight: isSelected ? '800' : '600',
                          },
                        ]}
                      >
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Gramaj Picker */}
              <Text style={[styles.subLabel, { color: colors.textSecondary, marginTop: 12 }]}>Cantitate (grame):</Text>
              <View style={styles.gramControlRow}>
                <TouchableOpacity
                  style={[styles.stepperBtn, { backgroundColor: colors.surfaceBg, borderColor: colors.cardBorder }]}
                  onPress={() => handleGramajChange(grame - 10)}
                  activeOpacity={0.7}
                >
                  <Minus size={18} color={colors.textPrimary} />
                </TouchableOpacity>

                <View style={[styles.gramInputWrap, { backgroundColor: colors.surfaceBg, borderColor: colors.cardBorder }]}>
                  <TextInput
                    style={[styles.gramTextInput, { color: colors.textPrimary }]}
                    keyboardType="numeric"
                    value={grameInput}
                    onChangeText={setGrameInput}
                    onBlur={handleGramajInputBlur}
                    selectTextOnFocus
                    maxLength={4}
                  />
                  <Text style={[styles.gramUnitText, { color: colors.textSecondary }]}>g</Text>
                </View>

                <TouchableOpacity
                  style={[styles.stepperBtn, { backgroundColor: colors.surfaceBg, borderColor: colors.cardBorder }]}
                  onPress={() => handleGramajChange(grame + 10)}
                  activeOpacity={0.7}
                >
                  <Plus size={18} color={colors.textPrimary} />
                </TouchableOpacity>
              </View>

              {/* Quick Portions Chips */}
              <View style={styles.quickChipsRow}>
                {[50, 100, 150, 200].map((v) => {
                  const isActive = grame === v;
                  return (
                    <TouchableOpacity
                      key={v}
                      style={[
                        styles.quickChip,
                        {
                          backgroundColor: isActive ? colors.accent : colors.surfaceBg,
                          borderColor: isActive ? colors.accent : colors.cardBorder,
                        },
                      ]}
                      onPress={() => handleGramajChange(v)}
                    >
                      <Text style={[styles.quickChipText, { color: isActive ? colors.textOnAccent : colors.textPrimary }]}>
                        {v}g
                      </Text>
                    </TouchableOpacity>
                  );
                })}
                {product.servingGrams && product.servingGrams !== 100 && (
                  <TouchableOpacity
                    style={[
                      styles.quickChip,
                      {
                        backgroundColor: grame === product.servingGrams ? colors.accent : colors.surfaceBg,
                        borderColor: grame === product.servingGrams ? colors.accent : colors.cardBorder,
                      },
                    ]}
                    onPress={() => handleGramajChange(product.servingGrams!)}
                  >
                    <Text
                      style={[
                        styles.quickChipText,
                        { color: grame === product.servingGrams ? colors.textOnAccent : colors.textPrimary },
                      ]}
                    >
                      1 porție ({product.servingGrams}g)
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Live Macros Grid */}
              <View style={styles.macroPillsRow}>
                <View style={[styles.macroPill, { backgroundColor: colors.surfaceBg }]}>
                  <Text style={[styles.macroPillVal, { color: colors.accent }]}>{totaluri.calorii}</Text>
                  <Text style={[styles.macroPillLabel, { color: colors.textSecondary }]}>kcal</Text>
                </View>
                <View style={[styles.macroPill, { backgroundColor: colors.surfaceBg }]}>
                  <Text style={[styles.macroPillVal, { color: '#10B981' }]}>{totaluri.proteine}g</Text>
                  <Text style={[styles.macroPillLabel, { color: colors.textSecondary }]}>Prot</Text>
                </View>
                <View style={[styles.macroPill, { backgroundColor: colors.surfaceBg }]}>
                  <Text style={[styles.macroPillVal, { color: '#F59E0B' }]}>{totaluri.carbohidrati}g</Text>
                  <Text style={[styles.macroPillLabel, { color: colors.textSecondary }]}>Carbi</Text>
                </View>
                <View style={[styles.macroPill, { backgroundColor: colors.surfaceBg }]}>
                  <Text style={[styles.macroPillVal, { color: '#EF4444' }]}>{totaluri.grasimi}g</Text>
                  <Text style={[styles.macroPillLabel, { color: colors.textSecondary }]}>Grăsimi</Text>
                </View>
              </View>

              {/* BUTONUL PRINCIPAL DE ADĂUGARE ÎN JURNAL */}
              <TouchableOpacity
                onPress={handleAdaugaInJurnal}
                disabled={saving}
                style={styles.mainAddButton}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={`Adaugă în jurnal, ${totaluri.calorii} calorii`}
              >
                <LinearGradient
                  colors={[colors.accent, colors.accentSecondary || '#0284C7']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.gradientBtn}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color={colors.textOnAccent} />
                  ) : (
                    <>
                      <Plus size={20} color={colors.textOnAccent} strokeWidth={2.8} />
                      <Text style={[styles.mainAddBtnText, { color: colors.textOnAccent }]}>
                        Adaugă în Jurnal ({totaluri.calorii} kcal)
                      </Text>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>

            {/* 4. După în jos: Toate informațiile (All Nutrition & Product Info) */}
            <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
              <View style={styles.sectionHeaderRow}>
                <Info size={16} color={colors.accent} />
                <Text style={[styles.sectionHeading, { color: colors.textPrimary }]}>
                  INFORMAȚII NUTRIȚIONALE COMPLETE
                </Text>
              </View>

              {/* Comutator Per 100g vs Per Porție */}
              <View style={[styles.switchToggleRow, { backgroundColor: colors.surfaceBg }]}>
                <TouchableOpacity
                  style={[styles.switchBtn, !viewPer100g && { backgroundColor: colors.accent }]}
                  onPress={() => setViewPer100g(false)}
                >
                  <Text
                    style={[
                      styles.switchBtnText,
                      { color: !viewPer100g ? colors.textOnAccent : colors.textSecondary, fontWeight: !viewPer100g ? '800' : '600' },
                    ]}
                  >
                    Per porție ({grame}g)
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.switchBtn, viewPer100g && { backgroundColor: colors.accent }]}
                  onPress={() => setViewPer100g(true)}
                >
                  <Text
                    style={[
                      styles.switchBtnText,
                      { color: viewPer100g ? colors.textOnAccent : colors.textSecondary, fontWeight: viewPer100g ? '800' : '600' },
                    ]}
                  >
                    Per 100g
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Tabel Nutrițional */}
              <View style={styles.table}>
                <View style={[styles.tableRow, { borderBottomColor: colors.cardBorder }]}>
                  <Text style={[styles.tableLabelBold, { color: colors.textPrimary }]}>Energie / Calorii</Text>
                  <Text style={[styles.tableValBold, { color: colors.accent }]}>{dispKcal} kcal</Text>
                </View>

                <View style={[styles.tableRow, { borderBottomColor: colors.cardBorder }]}>
                  <Text style={[styles.tableLabelBold, { color: colors.textPrimary }]}>Proteine</Text>
                  <Text style={[styles.tableValBold, { color: '#10B981' }]}>{dispProt} g</Text>
                </View>

                <View style={[styles.tableRow, { borderBottomColor: colors.cardBorder }]}>
                  <Text style={[styles.tableLabelBold, { color: colors.textPrimary }]}>Carbohidrați</Text>
                  <Text style={[styles.tableValBold, { color: '#F59E0B' }]}>{dispCarbs} g</Text>
                </View>

                <View style={[styles.tableRowSub, { borderBottomColor: colors.cardBorder }]}>
                  <Text style={[styles.tableLabelSub, { color: colors.textSecondary }]}>• din care Zaharuri</Text>
                  <Text style={[styles.tableValSub, { color: colors.textSecondary }]}>{dispSugar} g</Text>
                </View>

                <View style={[styles.tableRow, { borderBottomColor: colors.cardBorder }]}>
                  <Text style={[styles.tableLabelBold, { color: colors.textPrimary }]}>Grăsimi</Text>
                  <Text style={[styles.tableValBold, { color: '#EF4444' }]}>{dispFat} g</Text>
                </View>

                <View style={[styles.tableRowSub, { borderBottomColor: colors.cardBorder }]}>
                  <Text style={[styles.tableLabelSub, { color: colors.textSecondary }]}>• din care Saturate</Text>
                  <Text style={[styles.tableValSub, { color: colors.textSecondary }]}>{dispSatFat} g</Text>
                </View>

                <View style={[styles.tableRow, { borderBottomColor: colors.cardBorder }]}>
                  <Text style={[styles.tableLabelBold, { color: colors.textPrimary }]}>Fibre alimentare</Text>
                  <Text style={[styles.tableValBold, { color: colors.textPrimary }]}>{dispFiber} g</Text>
                </View>

                <View style={[styles.tableRow, { borderBottomColor: colors.cardBorder }]}>
                  <Text style={[styles.tableLabelBold, { color: colors.textPrimary }]}>Sare</Text>
                  <Text style={[styles.tableValBold, { color: colors.textPrimary }]}>{dispSalt} g</Text>
                </View>
              </View>
            </View>

            {/* 5. Ingrediente Complete */}
            {product.ingredientsText ? (
              <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
                <View style={styles.sectionHeaderRow}>
                  <Beaker size={16} color={colors.accent} />
                  <Text style={[styles.sectionHeading, { color: colors.textPrimary }]}>INGREDIENTE</Text>
                </View>
                <Text style={[styles.bodyText, { color: colors.textSecondary }]}>
                  {product.ingredientsText}
                </Text>
              </View>
            ) : null}

            {/* 6. Alergeni și Urme */}
            {product.allergens ? (
              <View style={[styles.sectionCard, styles.allergenCard]}>
                <View style={styles.sectionHeaderRow}>
                  <AlertTriangle size={16} color="#F59E0B" />
                  <Text style={[styles.sectionHeading, { color: '#F59E0B' }]}>ALERGENI ȘI URME</Text>
                </View>
                <Text style={[styles.bodyText, { color: '#FEF3C7' }]}>
                  {product.allergens}
                </Text>
              </View>
            ) : null}

            {/* 7. Metadate Produs */}
            <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.cardBorder, marginBottom: 40 }]}>
              <Text style={[styles.sectionHeading, { color: colors.textSecondary, marginBottom: 8 }]}>DETALII PRODUS</Text>
              {product.barcode ? (
                <View style={styles.metaLine}>
                  <Text style={[styles.metaLabel, { color: colors.textSecondary }]}>Cod de bare:</Text>
                  <Text style={[styles.metaValue, { color: colors.textPrimary }]}>{product.barcode}</Text>
                </View>
              ) : null}
              {product.brand ? (
                <View style={styles.metaLine}>
                  <Text style={[styles.metaLabel, { color: colors.textSecondary }]}>Brand / Producător:</Text>
                  <Text style={[styles.metaValue, { color: colors.textPrimary }]}>{product.brand}</Text>
                </View>
              ) : null}
              {product.servingLabel ? (
                <View style={styles.metaLine}>
                  <Text style={[styles.metaLabel, { color: colors.textSecondary }]}>Porție ambalaj:</Text>
                  <Text style={[styles.metaValue, { color: colors.textPrimary }]}>{product.servingLabel}</Text>
                </View>
              ) : null}
            </View>
          </ScrollView>
        </View>
      </View>

      {/* Modal succes salvare masă */}
      <MealSaveSuccessModal
        visible={Boolean(successData)}
        data={successData}
        onDismiss={handleSuccessDismiss}
      />
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    maxHeight: '92%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  headerSubtitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginTop: 2,
  },
  closeCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 32,
  },
  imageSection: {
    marginBottom: 14,
  },
  imageCard: {
    width: '100%',
    height: 200,
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
  },
  foodImage: {
    width: '100%',
    height: '100%',
  },
  sourceTag: {
    position: 'absolute',
    top: 10,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#0F172AEE',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  sourceTagText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#10B981',
  },
  placeholderCard: {
    width: '100%',
    height: 140,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
  },
  placeholderText: {
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  sectionCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 14,
  },
  actionCard: {
    borderWidth: 1.5,
  },
  allergenCard: {
    backgroundColor: '#78350F33',
    borderColor: '#F59E0B88',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  sectionHeading: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  badgeRowNotice: {
    paddingVertical: 6,
  },
  noticeText: {
    fontSize: 12,
    fontStyle: 'italic',
  },
  subLabel: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
  },
  categoriesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
  },
  catChipText: {
    fontSize: 12,
  },
  gramControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 4,
  },
  stepperBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gramInputWrap: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  gramTextInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
  },
  gramUnitText: {
    fontSize: 14,
    fontWeight: '700',
  },
  quickChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
    marginBottom: 12,
  },
  quickChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  quickChipText: {
    fontSize: 11,
    fontWeight: '700',
  },
  macroPillsRow: {
    flexDirection: 'row',
    gap: 8,
    marginVertical: 8,
  },
  macroPill: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
  },
  macroPillVal: {
    fontSize: 14,
    fontWeight: '900',
  },
  macroPillLabel: {
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
  },
  mainAddButton: {
    marginTop: 12,
    borderRadius: 14,
    overflow: 'hidden',
    elevation: 3,
  },
  gradientBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 8,
  },
  mainAddBtnText: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  switchToggleRow: {
    flexDirection: 'row',
    borderRadius: 10,
    padding: 3,
    marginBottom: 12,
  },
  switchBtn: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: 'center',
  },
  switchBtnText: {
    fontSize: 12,
  },
  table: {
    gap: 2,
  },
  tableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 7,
    borderBottomWidth: 1,
  },
  tableRowSub: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
    paddingLeft: 12,
    borderBottomWidth: 1,
  },
  tableLabelBold: {
    fontSize: 13,
    fontWeight: '700',
  },
  tableValBold: {
    fontSize: 13,
    fontWeight: '800',
  },
  tableLabelSub: {
    fontSize: 12,
    fontWeight: '500',
  },
  tableValSub: {
    fontSize: 12,
    fontWeight: '700',
  },
  bodyText: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '500',
  },
  metaLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  metaLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  metaValue: {
    fontSize: 12,
    fontWeight: '700',
  },
});
