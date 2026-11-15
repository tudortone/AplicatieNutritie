
import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  Modal,
  Linking
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { BlurView } from 'expo-blur';
import { ScanLine, X, Plus, ArrowLeft, CheckCircle2, ShoppingBag, ChefHat } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { useTranslation } from 'react-i18next';
import { useTheme } from '../context/ThemeContext';
import { useNotificationBannerActions } from '../context/NotificationBannerContext';
import { getProdusByBarcode, ProdusScanat } from '../lib/openfoodfacts';
import { useCamara, ProdusCamara, ProdusCamaraUpdate } from '../hooks/useCamara';
import { AddMealBottomSheet, AddMealBottomSheetRef } from '../components/AddMealBottomSheet';
import { ManualProductForm } from '../components/food/ManualProductForm';
import { PantryView } from '../components/camara/PantryView';
import {
  InteractiveTourOverlayHost,
  useInteractiveTour,
  useRegisterTourTarget,
} from '../context/InteractiveTourContext';

const useSafeLocalSearchParams: typeof useLocalSearchParams =
  typeof useLocalSearchParams === 'function'
    ? useLocalSearchParams
    : ((() => ({})) as unknown as typeof useLocalSearchParams);

export default function ScannerBarcodeScreen() {
  const router = useRouter();
  const routeParams = useSafeLocalSearchParams<{ tab?: string; tour?: string }>();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { showBanner } = useNotificationBannerActions();
  const {
    produse,
    loading: camaraLoading = false,
    error: camaraError = null,
    adaugaProdus,
    modificaCantitate,
    actualizeazaProdus,
    consumaDinCamara,
    toggleCongelator,
    stergeProdus,
    refresh: refreshCamara,
  } = useCamara();

  const [manualModalVisible, setManualModalVisible] = useState(false);
  const [fullManualModalVisible, setFullManualModalVisible] = useState(false);
  const [manualPrefillName, setManualPrefillName] = useState('');

  const [permission, requestPermission] = useCameraPermissions();
  // ⚠️ useRef sincron — previne race condition (useState e async, lasă ferestre)
  const lockRef = useRef(false);
  const lastCodeRef = useRef<{ code: string; at: number }>({ code: '', at: 0 });
  const [searching, setSearching] = useState(false);
  const [produsGasit, setProdusGasit] = useState<ProdusScanat | null>(null);
  const [codNegasit, setCodNegasit] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'scan' | 'camara'>(
    routeParams?.tab === 'camara' || routeParams?.tour === '1' ? 'camara' : 'scan'
  );
  const pantryManageTargetRef = useRef<View>(null);
  const pantryRecipeTargetRef = useRef<View>(null);
  const tour = useInteractiveTour();

  useEffect(() => {
    if (routeParams?.tab === 'camara' || routeParams?.tour === '1') {
      setActiveTab('camara');
    }
  }, [routeParams?.tab, routeParams?.tour]);

  useRegisterTourTarget('pantryManage', {
    targetRef: pantryManageTargetRef,
    onBeforeMeasure: () => setActiveTab('camara'),
  });

  useRegisterTourTarget('pantryRecipes', {
    targetRef: pantryRecipeTargetRef,
    onBeforeMeasure: () => setActiveTab('camara'),
  });
  const [camaraSuccessModal, setCamaraSuccessModal] = useState<{ visible: boolean; produs: ProdusScanat | null }>({ visible: false, produs: null });

  const [selectedCamaraItems, setSelectedCamaraItems] = useState<string[]>([]);

  const toggleCamaraSelect = useCallback((id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedCamaraItems(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  }, []);

  const handleGeneratePantryRecipes = useCallback(
    (itemsForRecipes: ProdusCamara[]) => {
      if (itemsForRecipes.length === 0) {
        showBanner({
          title: t('scannerBarcode.emptyPantryTitle'),
          message: t('scannerBarcode.emptyPantryMsg'),
          type: 'warning',
        });
        return;
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const ingredienteText = itemsForRecipes
        .map((p) => {
          const qtyTag =
            typeof p.cantitate_g === 'number' && p.cantitate_g > 0
              ? `${Math.round(p.cantitate_g)}g`
              : `${p.cantitate || 1}x`;
          const freezeSuffix = p.is_congelat ? t('scannerBarcode.frozenIngredientSuffix') : '';
          return `${p.nume} (${qtyTag}${freezeSuffix})`;
        })
        .join(', ');

      const promptKey =
        selectedCamaraItems.length > 0
          ? 'scannerBarcode.selectedRecipePrompt'
          : 'scannerBarcode.askGrokPrompt';

      router.push({
        pathname: '/(tabs)/chat',
        params: { prompt: t(promptKey, { ingredients: ingredienteText }) },
      });
    },
    [selectedCamaraItems.length, router, showBanner, t]
  );

  const addMealSheetRef = useRef<AddMealBottomSheetRef>(null);

  const handleBarcodeScanned = useCallback(async ({ data }: { data: string }) => {
    const now = Date.now();

    // 1. lock sincron (useRef, nu așteaptă re-render)
    if (lockRef.current) return;
    // 2. modal deschis / rezultat pe ecran → nu mai scana
    if (produsGasit || codNegasit || searching || activeTab !== 'scan') return;
    // 3. dedupe: același cod în ultimele 3s = ignorat
    if (lastCodeRef.current.code === data && now - lastCodeRef.current.at < 3000) return;
    // 4. validare minimă (doar coduri de produs EAN/UPC)
    if (!/^\d{8,14}$/.test(data)) return;

    lockRef.current = true;
    lastCodeRef.current = { code: data, at: now };
    setSearching(true);

    try {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } catch {}

      const res = await getProdusByBarcode(data);
      setSearching(false);

      if (res) {
        setProdusGasit(res);
        setCodNegasit(null);
        try {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch {}
      } else {
        setProdusGasit(null);
        setCodNegasit(data);
        try {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        } catch {}
      }
    } catch (e) {
      console.error('[barcode]', e);
      setCodNegasit(data);
      setSearching(false);
    } finally {
      // cooldown de 1.5s ÎNAINTE de deblocare (nu instant)
      setTimeout(() => {
        lockRef.current = false;
      }, 1500);
    }
  }, [produsGasit, codNegasit, searching, activeTab]);

  const handleSalveazaInCamara = async () => {
    if (!produsGasit) return;
    const p = produsGasit;
    try {
      await adaugaProdus(p);
      showBanner({
        title: t('scannerBarcode.savedPantryTitle'),
        message: t('scannerBarcode.savedPantryMessage', { name: p.nume }),
        type: "success",
      });
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
      setProdusGasit(null);
      setCamaraSuccessModal({ visible: true, produs: p });
    } catch (e) {
      console.error(e);
      Alert.alert(t('alerts.titluri.eroare'), t('alerts.mesaje.salvareCamaraEsueaza'));
    }
  };

  const handleAdaugaLaMasa = (item: ProdusScanat | ProdusCamara) => {
    const rawGrams =
      'cantitate_g' in item && typeof item.cantitate_g === 'number' && item.cantitate_g > 0
        ? item.cantitate_g
        : undefined;
    const usePartialRemaining = rawGrams !== undefined && rawGrams < 100;
    const defaultGr = usePartialRemaining ? Math.max(1, Math.round(rawGrams)) : 100;
    const scale = defaultGr / 100;

    addMealSheetRef.current?.openWithItem({
      nume: item.nume,
      calorii: Math.round(item.calorii_100g * scale),
      proteine: Math.round(item.proteine_100g * scale * 10) / 10,
      carbohidrati: Math.round(item.carbohidrati_100g * scale * 10) / 10,
      grasimi: Math.round(item.grasimi_100g * scale * 10) / 10,
      gramajDefault: defaultGr,
      pantryProductName: item.nume,
      pantryProductId: 'id' in item ? item.id : undefined,
    });
  };

  const handlePantryUsed = useCallback(
    async (productName: string, usedGrams?: number, pantryProductId?: string) => {
      if (typeof consumaDinCamara === 'function') {
        const res = await consumaDinCamara({
          id: pantryProductId,
          name: productName,
          usedGrams,
        });
        if (res.status === 'consumed') {
          showBanner({
            title: t('scannerBarcode.consumedTitle'),
            message: t('scannerBarcode.consumedMessage', { name: productName }),
            type: 'success',
          });
        } else if (res.status === 'updated_grams') {
          showBanner({
            title: t('scannerBarcode.quantityUpdatedTitle'),
            message: t('scannerBarcode.gramsUpdatedMessage', {
              name: productName,
              grams: res.remainingGrams,
            }),
            type: 'info',
          });
        } else if (res.status === 'updated_count') {
          showBanner({
            title: t('scannerBarcode.quantityUpdatedTitle'),
            message: t('scannerBarcode.quantityUpdatedMessage', {
              name: productName,
              count: res.remainingCount,
            }),
            type: 'info',
          });
        }
        return;
      }

      const produsInCamara = produse.find(
        (p) =>
          (pantryProductId && p.id === pantryProductId) ||
          p.nume.toLowerCase().trim() === productName.toLowerCase().trim()
      );
      if (produsInCamara) {
        const currentQty = produsInCamara.cantitate || 1;
        if (currentQty <= 1) {
          stergeProdus(produsInCamara.id);
          showBanner({
            title: t('scannerBarcode.consumedTitle'),
            message: t('scannerBarcode.consumedMessage', { name: productName }),
            type: 'success',
          });
        } else {
          modificaCantitate(produsInCamara.id, -1);
          showBanner({
            title: t('scannerBarcode.quantityUpdatedTitle'),
            message: t('scannerBarcode.quantityUpdatedMessage', {
              name: productName,
              count: currentQty - 1,
            }),
            type: 'info',
          });
        }
      }
    },
    [consumaDinCamara, produse, stergeProdus, modificaCantitate, showBanner, t]
  );

  const handleSavePantryEdit = useCallback(
    async (id: string, updates: ProdusCamaraUpdate) => {
      if (typeof actualizeazaProdus === 'function') {
        await actualizeazaProdus(id, updates);
        return;
      }
      const existing = produse.find((p) => p.id === id);
      if (existing && updates.is_congelat !== undefined && updates.is_congelat !== existing.is_congelat) {
        await toggleCongelator(id);
      }
    },
    [actualizeazaProdus, produse, toggleCongelator]
  );

  const handleStepGrams = useCallback(
    async (id: string, nextGrams: number) => {
      if (typeof actualizeazaProdus === 'function') {
        await actualizeazaProdus(id, { cantitate_g: nextGrams });
      }
    },
    [actualizeazaProdus]
  );

  const handleAskGrokRecipes = () => {
    Haptics.selectionAsync();
    handleGeneratePantryRecipes(produse);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Top Bar */}
      <View style={[styles.headerBar, { paddingTop: insets.top + (Platform.OS === 'ios' ? 10 : 12) }]}>
        <TouchableOpacity
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
          hitSlop={12}
          style={[styles.navBtn, { backgroundColor: colors.surfaceBg }]}
          accessibilityLabel={t('common.back')}
          accessibilityRole="button"
        >
          <ArrowLeft size={20} color={colors.textPrimary} />
        </TouchableOpacity>

        <View style={styles.tabsRow}>
          <TouchableOpacity
            onPress={() => setActiveTab('scan')}
            style={[
              styles.tabBtn,
              activeTab === 'scan' && { backgroundColor: colors.accent },
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected: activeTab === 'scan' }}
            accessibilityLabel={t('scannerBarcode.scanTabA11y')}
          >
            <Text maxFontSizeMultiplier={1.3} style={[styles.tabText, { color: activeTab === 'scan' ? colors.background : colors.textPrimary }]}>
              {t('scannerBarcode.scanTab')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setActiveTab('camara')}
            style={[
              styles.tabBtn,
              activeTab === 'camara' && { backgroundColor: colors.accent },
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected: activeTab === 'camara' }}
            accessibilityLabel={t('scannerBarcode.inventoryTabA11y', { count: produse.length })}
          >
            <Text maxFontSizeMultiplier={1.3} style={[styles.tabText, { color: activeTab === 'camara' ? colors.background : colors.textPrimary }]}>
              {t('scannerBarcode.inventoryTab', { count: produse.length })}
            </Text>
          </TouchableOpacity>
        </View>

        {activeTab === 'camara' && (
          <View ref={pantryRecipeTargetRef} collapsable={false}>
            <TouchableOpacity
              onPress={handleAskGrokRecipes}
              hitSlop={8}
              style={[
                styles.navBtn,
                {
                  backgroundColor: `${colors.accentTertiary}20`,
                  borderWidth: 1,
                  borderColor: `${colors.accentTertiary}55`,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={t('scannerBarcode.askRecipesA11y')}
            >
              <ChefHat size={19} color={colors.accentTertiary} />
            </TouchableOpacity>
          </View>
        )}
      </View>

      {activeTab === 'scan' ? (
        !permission ? (
          // BUG-059: ecran cu spinner în loc de View gol — fără flash pe starea inițială.
          <View style={[styles.permContainer, { backgroundColor: colors.background }]}>
            <ActivityIndicator size="large" color={colors.accent} />
          </View>
        ) : !permission.granted ? (
          <View style={[styles.permContainer, { backgroundColor: colors.background }]}>
            <ScanLine size={52} color={colors.accent} />
            <Text maxFontSizeMultiplier={1.3} style={[styles.permTitle, { color: colors.textPrimary }]}>
              {t('scannerBarcode.permissionTitle')}
            </Text>
            <Text maxFontSizeMultiplier={1.3} style={[styles.permSub, { color: colors.textSecondary }]}>
              {t('scannerBarcode.permissionSubtitle')}
            </Text>
            {/* BUG-059: refuz definitiv (canAskAgain=false pe Android) = dead-end la
                cererea de permisiune; ghidăm utilizatorul către setările aplicației. */}
            {permission.canAskAgain === false ? (
              <>
                <TouchableOpacity
                  onPress={() => Linking.openSettings()}
                  style={[styles.permBtn, { backgroundColor: colors.accent }]}
                  accessibilityLabel={t('scannerBarcode.openSettingsA11y')}
                  accessibilityRole="button"
                  accessibilityHint={t('scannerBarcode.openSettingsHint')}
                >
                  <Text maxFontSizeMultiplier={1.3} style={[styles.permBtnText, { color: colors.background }]}>
                    {t('scannerBarcode.openSettings')}
                  </Text>
                </TouchableOpacity>
                <Text maxFontSizeMultiplier={1.3} style={[styles.permHint, { color: colors.textSecondary }]}>
                  {t('scannerBarcode.cameraDeniedHint')}
                </Text>
              </>
            ) : (
              <TouchableOpacity
                onPress={requestPermission}
                style={[styles.permBtn, { backgroundColor: colors.accent }]}
                accessibilityLabel={t('scannerBarcode.allowAccessA11y')}
                accessibilityRole="button"
              >
                <Text maxFontSizeMultiplier={1.3} style={[styles.permBtnText, { color: colors.background }]}>
                  {t('scannerBarcode.allowAccess')}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
        <View style={styles.cameraWrap}>
          <CameraView
            testID="barcode-scanner-camera"
            accessibilityLabel={t('scannerBarcode.scannerA11y')}
            style={StyleSheet.absoluteFill}
            barcodeScannerSettings={{
              barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'],
            }}
            // undefined = handler dezactivat nativ — nu mai emite evenimente
            onBarcodeScanned={
              produsGasit || codNegasit || searching ? undefined : handleBarcodeScanned
            }
          />

          {/* Target box viewfinder */}
          <View style={styles.viewfinderOverlay}>
            <View style={[styles.targetBox, { borderColor: colors.accent }]} />
            <Text maxFontSizeMultiplier={1.3} style={[styles.scanHint, { color: '#FFF' }]}>
              {t('scannerBarcode.scanHint')}
            </Text>
          </View>

          {searching && (
            <BlurView intensity={40} tint="dark" style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color={colors.accent} />
              <Text maxFontSizeMultiplier={1.3} style={[styles.loadingText, { color: colors.textPrimary }]}>
                {t('scannerBarcode.searchingProduct')}
              </Text>
            </BlurView>
          )}

          {produsGasit && (
            <BlurView intensity={70} tint="dark" style={[styles.resultCard, { bottom: Math.max(insets.bottom, 16) + 14, borderColor: colors.accent }]}>
              <View style={styles.resHeader}>
                <View style={{ flex: 1 }}>
                  <Text maxFontSizeMultiplier={1.3} style={[styles.resTitle, { color: colors.textPrimary }]} numberOfLines={2} ellipsizeMode="tail">{produsGasit.nume}</Text>
                  {!!produsGasit.brand && (
                    <Text maxFontSizeMultiplier={1.3} style={[styles.resBrand, { color: colors.textSecondary }]} numberOfLines={1} ellipsizeMode="tail">{produsGasit.brand}</Text>
                  )}
                </View>
                <TouchableOpacity
                  onPress={() => {
                    setProdusGasit(null);
                    lockRef.current = false;
                  }}
                  style={styles.resClose}
                  accessibilityLabel={t('scannerBarcode.closeProductA11y')}
                  accessibilityRole="button"
                  hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                >
                  <X size={20} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              {Boolean(produsGasit.estimat || produsGasit.sursa === 'estimare_ai') && (
                <View style={{ backgroundColor: `${colors.warning}26`, borderRadius: 12, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: colors.warning }}>
                  <Text maxFontSizeMultiplier={1.3} style={{ fontSize: 12, fontWeight: '800', color: colors.warning, marginBottom: 2 }}>
                    {t('scannerBarcode.estimatedTitle')}
                  </Text>
                  <Text maxFontSizeMultiplier={1.3} style={{ fontSize: 11, color: colors.textSecondary, lineHeight: 15 }}>
                    {t('scannerBarcode.estimatedDescription')}
                  </Text>
                </View>
              )}

              <View style={styles.macroGrid}>
                <View style={styles.macroBox}>
                  <Text maxFontSizeMultiplier={1.3} style={[styles.macroVal, { color: colors.accent }]}>{produsGasit.calorii_100g}</Text>
                  <Text maxFontSizeMultiplier={1.3} style={[styles.macroLbl, { color: colors.textSecondary }]}>kcal / 100g</Text>
                </View>
                <View style={styles.macroBox}>
                  <Text maxFontSizeMultiplier={1.3} style={[styles.macroVal, { color: colors.textPrimary }]}>{produsGasit.proteine_100g}g</Text>
                  <Text maxFontSizeMultiplier={1.3} style={[styles.macroLbl, { color: colors.textSecondary }]}>{t('scannerBarcode.protein')}</Text>
                </View>
                <View style={styles.macroBox}>
                  <Text maxFontSizeMultiplier={1.3} style={[styles.macroVal, { color: colors.textPrimary }]}>{produsGasit.carbohidrati_100g}g</Text>
                  <Text maxFontSizeMultiplier={1.3} style={[styles.macroLbl, { color: colors.textSecondary }]}>{t('scannerBarcode.carbs')}</Text>
                </View>
                <View style={styles.macroBox}>
                  <Text maxFontSizeMultiplier={1.3} style={[styles.macroVal, { color: colors.textPrimary }]}>{produsGasit.grasimi_100g}g</Text>
                  <Text maxFontSizeMultiplier={1.3} style={[styles.macroLbl, { color: colors.textSecondary }]}>{t('scannerBarcode.fat')}</Text>
                </View>
              </View>

              {/* Profil Aminoacizi Esențiali & BCAA */}
              {produsGasit.proteine_100g > 0 && (
                <View style={{ backgroundColor: `${colors.accentTertiary}14`, borderRadius: 14, padding: 12, marginVertical: 12, borderWidth: 1, borderColor: `${colors.accentTertiary}40` }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <Text maxFontSizeMultiplier={1.3} style={{ fontSize: 12, fontWeight: '800', color: colors.accentTertiary }}>{t('scannerBarcode.aminoTitle')}</Text>
                    <Text maxFontSizeMultiplier={1.3} style={{ fontSize: 11, fontWeight: '700', color: colors.textSecondary }}>
                      ~{Math.round(produsGasit.proteine_100g * 184)} mg BCAA
                    </Text>
                  </View>
                  <Text maxFontSizeMultiplier={1.3} style={{ fontSize: 11, color: colors.textSecondary, lineHeight: 15 }}>
                    {t('scannerBarcode.aminoDescription', {
                      leucine: Math.round(produsGasit.proteine_100g * 82),
                      isoleucine: Math.round(produsGasit.proteine_100g * 48),
                      valine: Math.round(produsGasit.proteine_100g * 54),
                    })}
                  </Text>
                </View>
              )}

              <View style={styles.resActions}>
                <TouchableOpacity
                  onPress={handleSalveazaInCamara}
                  style={[styles.actionBtn, { backgroundColor: colors.surfaceBg, borderColor: colors.cardBorder }]}
                  accessibilityRole="button"
                  accessibilityLabel={t('scannerBarcode.saveToPantryA11y', { name: produsGasit.nume })}
                >
                  <Text maxFontSizeMultiplier={1.3} style={[styles.actionBtnText, { color: colors.textPrimary }]}>{t('scannerBarcode.saveToPantry')}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => handleAdaugaLaMasa(produsGasit)}
                  style={[styles.actionBtnPrimary, { backgroundColor: colors.accent }]}
                  accessibilityRole="button"
                  accessibilityLabel={t('scannerBarcode.addToMealA11y', { name: produsGasit.nume })}
                >
                  <Text maxFontSizeMultiplier={1.3} style={[styles.actionPrimaryText, { color: colors.background }]}>{t('scannerBarcode.addToMeal')}</Text>
                </TouchableOpacity>
              </View>
            </BlurView>
          )}

          {codNegasit && !produsGasit && (
            <BlurView intensity={70} tint="dark" style={[styles.resultCard, { bottom: Math.max(insets.bottom, 16) + 14, borderColor: colors.warning }]}>
              <View style={styles.resHeader}>
                <View style={{ flex: 1 }}>
                  <Text maxFontSizeMultiplier={1.3} style={[styles.resTitle, { color: colors.textPrimary }]}>{t('scannerBarcode.notFoundTitle')}</Text>
                  <Text maxFontSizeMultiplier={1.3} style={[styles.resBrand, { color: colors.textSecondary }]}>{t('scannerBarcode.lastCode', { code: codNegasit })}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => {
                    setCodNegasit(null);
                    lockRef.current = false;
                  }}
                  style={styles.resClose}
                  accessibilityLabel={t('scannerBarcode.closeNotFoundA11y')}
                  accessibilityRole="button"
                  hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                >
                  <X size={20} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              <Text maxFontSizeMultiplier={1.3} style={{ color: colors.textSecondary, fontSize: 13, marginVertical: 10 }}>
                {t('scannerBarcode.notFoundDescription')}
              </Text>

              <View style={styles.resActions}>
                <TouchableOpacity
                  onPress={() => {
                    setCodNegasit(null);
                    lockRef.current = false;
                    addMealSheetRef.current?.open();
                  }}
                  style={[styles.actionBtn, { backgroundColor: colors.surfaceBg, borderColor: colors.cardBorder }]}
                  accessibilityRole="button"
                  accessibilityLabel={t('scannerBarcode.completeManualA11y')}
                >
                  <Text maxFontSizeMultiplier={1.3} style={[styles.actionBtnText, { color: colors.textPrimary }]}>{t('scannerBarcode.completeManual')}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => {
                    const cod = codNegasit;
                    setCodNegasit(null);
                    lockRef.current = false;
                    addMealSheetRef.current?.openWithItem({
                      nume: `Produs EAN ${cod}`,
                      calorii: 100,
                      proteine: 5,
                      carbohidrati: 15,
                      grasimi: 2,
                      gramajDefault: 100,
                    });
                  }}
                  style={[styles.actionBtnPrimary, { backgroundColor: colors.accent }]}
                  accessibilityRole="button"
                  accessibilityLabel={t('scannerBarcode.estimateByNameA11y')}
                >
                  <Text maxFontSizeMultiplier={1.3} style={[styles.actionPrimaryText, { color: colors.background }]}>{t('scannerBarcode.estimateByName')}</Text>
                </TouchableOpacity>
              </View>
            </BlurView>
          )}
        </View>
        )
      ) : (
        <PantryView
          produse={produse}
          loading={camaraLoading}
          error={camaraError}
          onRefresh={refreshCamara}
          selectedIds={selectedCamaraItems}
          onToggleSelect={toggleCamaraSelect}
          onClearSelection={() => setSelectedCamaraItems([])}
          onQuickAdd={(prefillName) => {
            if (prefillName) {
              setManualPrefillName(prefillName);
              setFullManualModalVisible(true);
            } else {
              setManualPrefillName('');
              setManualModalVisible(true);
            }
          }}
          onScanFirst={() => setActiveTab('scan')}
          onAddMeal={handleAdaugaLaMasa}
          onStepUnit={(id, delta) => {
            Haptics.selectionAsync();
            modificaCantitate(id, delta);
          }}
          onStepGrams={(id, nextGrams) => {
            Haptics.selectionAsync();
            handleStepGrams(id, nextGrams);
          }}
          onSaveEdit={handleSavePantryEdit}
          onDeleteItem={async (id) => {
            await stergeProdus(id);
            setSelectedCamaraItems((prev) => prev.filter((itemId) => itemId !== id));
          }}
          onGenerateRecipes={handleGeneratePantryRecipes}
          controlsTargetRef={pantryManageTargetRef}
        />
      )}

      {/* Animatie UI & confirmare vizuala cand pui in Camara */}
      <Modal
        visible={camaraSuccessModal.visible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setCamaraSuccessModal({ visible: false, produs: null });
          lockRef.current = false;
        }}
      >
        <View style={styles.successModalBackdrop}>
          <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={[styles.successModalCard, { backgroundColor: colors.surfaceBg, borderColor: colors.accent }]}>
            <View style={[styles.successIconBubble, { backgroundColor: colors.accent + '22', borderColor: colors.accent }]}>
              <CheckCircle2 size={44} color={colors.accent} />
            </View>
            <Text maxFontSizeMultiplier={1.3} style={[styles.successModalTitle, { color: colors.textPrimary }]}>{t('scannerBarcode.successTitle')}</Text>
            <Text maxFontSizeMultiplier={1.3} style={[styles.successModalSubtitle, { color: colors.textSecondary }]}>
              {t('scannerBarcode.successMessage', { name: camaraSuccessModal.produs?.nume || '' })}
            </Text>

            {camaraSuccessModal.produs && (
              <View style={[styles.successProductPreview, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}>
                <Text maxFontSizeMultiplier={1.3} style={[styles.successProductName, { color: colors.textPrimary }]} numberOfLines={1}>
                  {camaraSuccessModal.produs.nume}
                </Text>
                <Text maxFontSizeMultiplier={1.3} style={[styles.successProductMacros, { color: colors.accent }]}>
                  {camaraSuccessModal.produs.calorii_100g} kcal/100g • P: {camaraSuccessModal.produs.proteine_100g}g
                </Text>
              </View>
            )}

            <View style={styles.successModalActions}>
              <TouchableOpacity
                style={[styles.successBtnSecondary, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}
                onPress={() => {
                  setCamaraSuccessModal({ visible: false, produs: null });
                  lockRef.current = false;
                }}
                accessibilityRole="button"
                accessibilityLabel={t('scannerBarcode.continueScanningA11y')}
              >
                <Text maxFontSizeMultiplier={1.3} style={[styles.successBtnSecondaryText, { color: colors.textPrimary }]}>{t('scannerBarcode.continueScanning')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.successBtnPrimary, { backgroundColor: colors.accent }]}
                onPress={() => {
                  setCamaraSuccessModal({ visible: false, produs: null });
                  lockRef.current = false;
                  setActiveTab('camara');
                }}
                accessibilityRole="button"
                accessibilityLabel={t('scannerBarcode.viewPantryA11y')}
              >
                <ShoppingBag size={18} color={colors.background} />
                <Text maxFontSizeMultiplier={1.3} style={[styles.successBtnPrimaryText, { color: colors.background }]}>{t('scannerBarcode.viewPantry')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal Adăugare Manuală în Cămară */}
      <Modal
        visible={manualModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setManualModalVisible(false)}
      >
        <View style={styles.successModalBackdrop}>
          <BlurView intensity={70} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={[styles.successModalCard, { backgroundColor: colors.surfaceBg, borderColor: colors.accent, width: '92%' }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginBottom: 14 }}>
              <Text maxFontSizeMultiplier={1.3} style={{ fontSize: 18, fontWeight: '900', color: colors.textPrimary }}>{t('scannerBarcode.manualAddTitle')}</Text>
              <TouchableOpacity onPress={() => setManualModalVisible(false)} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} accessibilityRole="button" accessibilityLabel={t('scannerBarcode.closeManualA11y')}>
                <X size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text maxFontSizeMultiplier={1.3} style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 14, textAlign: 'center' }}>
              {t('scannerBarcode.manualAddDescription')}
            </Text>

            <View style={{ gap: 8, width: '100%', marginBottom: 20 }}>
              {[
                { nume: 'Ouă proaspete (10 buc)', cal: 155, p: 13, c: 1, g: 11, exp: 14, cong: false, qty: 10, qtyG: undefined },
                { nume: 'Carne de pui piept proaspăt (500g)', cal: 165, p: 31, c: 0, g: 3.6, exp: 90, cong: true, qty: 1, qtyG: 500 },
                { nume: 'Carne de vită slabă (500g)', cal: 250, p: 26, c: 0, g: 15, exp: 90, cong: true, qty: 1, qtyG: 500 },
                { nume: 'Brânză de vaci slabă (300g)', cal: 98, p: 18, c: 3.5, g: 1.2, exp: 10, cong: false, qty: 1, qtyG: 300 },
                { nume: 'Legume proaspete mix (1 kg)', cal: 45, p: 2, c: 9, g: 0.3, exp: 7, cong: false, qty: 1, qtyG: 1000 },
              ].map((preset, idx) => (
                <TouchableOpacity
                  key={idx}
                  onPress={async () => {
                    Haptics.selectionAsync();
                    await adaugaProdus(
                      {
                        barcode: 'MANUAL',
                        nume: preset.nume,
                        calorii_100g: preset.cal,
                        proteine_100g: preset.p,
                        carbohidrati_100g: preset.c,
                        grasimi_100g: preset.g,
                        cantitate_g: preset.qtyG,
                      },
                      {
                        zileValabilitate: preset.exp,
                        isCongelat: preset.cong,
                        cantitate: preset.qty,
                        cantitate_g: preset.qtyG,
                      }
                    );
                    setManualModalVisible(false);
                    showBanner({ title: t('scannerBarcode.productAddedTitle'), message: t('scannerBarcode.productAddedMessage', { name: preset.nume }), type: 'success' });
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={t('scannerBarcode.addPresetA11y', { name: preset.nume })}
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: 14,
                    borderRadius: 14,
                    backgroundColor: preset.cong ? `${colors.accentTertiary}14` : colors.cardBg,
                    borderWidth: 1,
                    borderColor: preset.cong ? `${colors.accentTertiary}40` : colors.cardBorder
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text maxFontSizeMultiplier={1.3} style={{ fontSize: 14, fontWeight: '800', color: colors.textPrimary }}>{preset.nume}</Text>
                    <Text maxFontSizeMultiplier={1.3} style={{ fontSize: 12, color: colors.accent, marginTop: 2 }}>
                      {preset.cal} kcal • P: {preset.p}g {preset.cong ? t('scannerBarcode.freezerBadge') : t('scannerBarcode.daysBadge', { count: preset.exp })}
                    </Text>
                  </View>
                  <Plus size={18} color={colors.accent} />
                </TouchableOpacity>
              ))}

              <TouchableOpacity
                onPress={() => {
                  setManualModalVisible(false);
                  setFullManualModalVisible(true);
                }}
                style={{
                  flexDirection: 'row',
                  justifyContent: 'center',
                  alignItems: 'center',
                  padding: 14,
                  borderRadius: 14,
                  borderWidth: 1.5,
                  borderStyle: 'dashed',
                  borderColor: colors.accent,
                  marginTop: 6,
                  gap: 8,
                }}
                accessibilityRole="button"
                accessibilityLabel={t('scannerBarcode.otherManualA11y')}
              >
                <Plus size={18} color={colors.accent} />
                <Text maxFontSizeMultiplier={1.3} style={{ fontSize: 14, fontWeight: '800', color: colors.accent }}>
                  {t('scannerBarcode.otherManual')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal Introducere Complet Manuală */}
      <Modal
        visible={fullManualModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          setFullManualModalVisible(false);
          setManualPrefillName('');
        }}
      >
        <View style={{ flex: 1, backgroundColor: colors.background, padding: 16, paddingTop: Math.max(insets.top, 16) }}>
          <ManualProductForm
            initialBarcode={codNegasit || ''}
            initialName={manualPrefillName}
            skipRemoteCatalogInsert
            onSave={async (prod, gr) => {
              await adaugaProdus(
                {
                  barcode: prod.barcode || 'MANUAL',
                  nume: prod.name,
                  brand: prod.brand,
                  calorii_100g: prod.kcalPer100g,
                  proteine_100g: prod.proteinPer100g,
                  carbohidrati_100g: prod.carbsPer100g,
                  grasimi_100g: prod.fatPer100g,
                },
                {
                  zileValabilitate: 14,
                  isCongelat: false,
                  cantitate: 1,
                  cantitate_g: gr || prod.servingGrams || 100,
                }
              );
              setFullManualModalVisible(false);
              setManualPrefillName('');
              showBanner({
                title: t('scannerBarcode.productAddedTitle'),
                message: t('scannerBarcode.productAddedMessage', { name: prod.name }),
                type: 'success',
              });
            }}
            onCancel={() => {
              setFullManualModalVisible(false);
              setManualPrefillName('');
            }}
          />
        </View>
      </Modal>

      <AddMealBottomSheet ref={addMealSheetRef} onPantryUsed={handlePantryUsed} />
      {tour ? <InteractiveTourOverlayHost screen="pantry" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  permContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  permTitle: { fontSize: 24, fontWeight: '900', marginTop: 18, marginBottom: 8 },
  permSub: { fontSize: 15, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  permBtn: { paddingHorizontal: 24, paddingVertical: 14, borderRadius: 16 },
  permHint: { fontSize: 13, textAlign: 'center', lineHeight: 19, marginTop: 14, maxWidth: '88%' },
  permBtnText: { fontSize: 16, fontWeight: '800' },

  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    // paddingTop: suprascris inline cu insets.top + 12
    paddingBottom: 14,
    gap: 12,
    zIndex: 10,
  },
  navBtn: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  tabsRow: { flex: 1, flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 14, padding: 4 },
  tabBtn: { flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center' },
  tabText: { fontSize: 13, fontWeight: '800' },

  cameraWrap: { flex: 1, position: 'relative' },
  viewfinderOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center' },
  targetBox: { width: 260, height: 140, borderRadius: 20, borderWidth: 2, borderStyle: 'dashed' },
  scanHint: { fontSize: 14, fontWeight: '700', marginTop: 20, textAlign: 'center', backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12 },

  loadingOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center' },
  loadingText: { fontSize: 16, fontWeight: '800', marginTop: 16 },

  resultCard: {
    position: 'absolute',
    bottom: 30,
    left: 16,
    right: 16,
    borderRadius: 24,
    borderWidth: 1.5,
    padding: 20,
    overflow: 'hidden',
  },
  resHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  resTitle: { fontSize: 18, fontWeight: '900' },
  resBrand: { fontSize: 13, fontWeight: '600', marginTop: 2 },
  resClose: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },

  macroGrid: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 18 },
  macroBox: { alignItems: 'center', flex: 1 },
  macroVal: { fontSize: 18, fontWeight: '900' },
  macroLbl: { fontSize: 11, fontWeight: '700', marginTop: 2 },

  resActions: { flexDirection: 'row', gap: 10 },
  actionBtn: { flex: 1, height: 48, borderRadius: 14, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  actionBtnText: { fontSize: 14, fontWeight: '800' },
  actionBtnPrimary: { flex: 1.3, height: 48, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  actionPrimaryText: { fontSize: 14, fontWeight: '900' },

  successModalBackdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  successModalCard: { width: '100%', borderRadius: 28, borderWidth: 1.5, padding: 24, alignItems: 'center' },
  successIconBubble: { width: 84, height: 84, borderRadius: 42, borderWidth: 2, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  successModalTitle: { fontSize: 22, fontWeight: '900', marginBottom: 8 },
  successModalSubtitle: { fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  successProductPreview: { width: '100%', padding: 14, borderRadius: 16, borderWidth: 1, marginBottom: 24, alignItems: 'center' },
  successProductName: { fontSize: 16, fontWeight: '800', marginBottom: 4 },
  successProductMacros: { fontSize: 13, fontWeight: '700' },
  successModalActions: { flexDirection: 'row', gap: 10, width: '100%', alignItems: 'center' },
  successBtnSecondary: { flex: 1, minHeight: 50, borderRadius: 16, borderWidth: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 10 },
  successBtnSecondaryText: { fontSize: 13, fontWeight: '800', textAlign: 'center' },
  successBtnPrimary: { flex: 1.1, minHeight: 50, borderRadius: 16, flexDirection: 'row', gap: 8, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 10 },
  successBtnPrimaryText: { fontSize: 14, fontWeight: '900', textAlign: 'center' },
});
