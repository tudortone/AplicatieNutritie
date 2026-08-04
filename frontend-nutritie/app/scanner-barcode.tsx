
import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Modal,
  Pressable
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
import { ScanLine, X, Plus, Package, Trash2, ArrowLeft, CheckCircle2, Sparkles, ShoppingBag, Snowflake, ChefHat, Clock, Layers, Check, Wand2 } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { useTheme } from '../context/ThemeContext';
import { useNotificationBanner } from '../context/NotificationBannerContext';
import { getProdusByBarcode, ProdusScanat } from '../lib/openfoodfacts';
import { useCamara, ProdusCamara } from '../hooks/useCamara';
import { AddMealBottomSheet, AddMealBottomSheetRef } from '../components/AddMealBottomSheet';
import { ManualProductForm } from '../components/food/ManualProductForm';

export default function ScannerBarcodeScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { showBanner } = useNotificationBanner();
  const { produse, adaugaProdus, modificaCantitate, toggleCongelator, stergeProdus } = useCamara();

  const [manualModalVisible, setManualModalVisible] = useState(false);
  const [fullManualModalVisible, setFullManualModalVisible] = useState(false);

  const [permission, requestPermission] = useCameraPermissions();
  // ⚠️ useRef sincron — previne race condition (useState e async, lasă ferestre)
  const lockRef = useRef(false);
  const lastCodeRef = useRef<{ code: string; at: number }>({ code: '', at: 0 });
  const [searching, setSearching] = useState(false);
  const [produsGasit, setProdusGasit] = useState<ProdusScanat | null>(null);
  const [codNegasit, setCodNegasit] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'scan' | 'camara'>('scan');
  const [camaraSuccessModal, setCamaraSuccessModal] = useState<{ visible: boolean; produs: ProdusScanat | null }>({ visible: false, produs: null });

  const [selectedCamaraItems, setSelectedCamaraItems] = useState<string[]>([]);

  const toggleCamaraSelect = useCallback((id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedCamaraItems(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  }, []);

  const handleGateateCuAICamara = useCallback(() => {
    if (selectedCamaraItems.length === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const ingredienteSelectate = produse
      .filter(p => selectedCamaraItems.includes(p.id))
      .map(p => `${p.nume}${p.cantitate && p.cantitate > 1 ? ` (${p.cantitate}x)` : ''}`)
      .join(', ');

    const promptReteta = `Salut! Am în cămară următoarele ingrediente: ${ingredienteSelectate}. Ce rețetă delicioasă, sănătoasă și bogată în proteine pot pregăti folosind aceste alimente? Te rog să îmi dai pași clari de preparare și estimarea valorilor nutriționale per porție.`;

    router.push({
      pathname: '/(tabs)/chat' as any,
      params: { prompt: promptReteta },
    });
  }, [selectedCamaraItems, produse, router]);

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
        title: "Salvat în Cămara Mea!",
        message: `${p.nume} este acum disponibil pentru acces rapid.`,
        type: "success",
      });
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
      setProdusGasit(null);
      setCamaraSuccessModal({ visible: true, produs: p });
    } catch (e) {
      console.error(e);
      Alert.alert("Eroare", "Nu am putut salva în Cămară. Verifică conexiunea.");
    }
  };

  const handleAdaugaLaMasa = (item: ProdusScanat | ProdusCamara) => {
    addMealSheetRef.current?.openWithItem({
      nume: item.nume,
      calorii: item.calorii_100g,
      proteine: item.proteine_100g,
      carbohidrati: item.carbohidrati_100g,
      grasimi: item.grasimi_100g,
      gramajDefault: 100,
      pantryProductName: item.nume,
    });
  };

  const handlePantryUsed = useCallback((productName: string) => {
    const produsInCamara = produse.find(p =>
      p.nume.toLowerCase().trim() === productName.toLowerCase().trim()
    );
    if (produsInCamara) {
      const currentQty = produsInCamara.cantitate || 1;
      if (currentQty <= 1) {
        stergeProdus(produsInCamara.id);
        showBanner({ title: '🗑️ Produs consumat', message: `"${productName}" a fost șters din cămară.`, type: 'success' });
      } else {
        modificaCantitate(produsInCamara.id, -1);
        showBanner({ title: '📉 Cantitate actualizată', message: `"${productName}" mai are ${currentQty - 1} bucăți în cămară.`, type: 'info' });
      }
    }
  }, [produse, stergeProdus, modificaCantitate, showBanner]);

  if (!permission) {
    return <View style={[styles.container, { backgroundColor: colors.background }]} />;
  }

  if (!permission.granted) {
    return (
      <View style={[styles.permContainer, { backgroundColor: colors.background }]}>
        <ScanLine size={52} color={colors.accent} />
        <Text style={[styles.permTitle, { color: colors.textPrimary }]}>Acces la cameră</Text>
        <Text style={[styles.permSub, { color: colors.textSecondary }]}>
          Avem nevoie de permisiunea ta pentru a scana coduri de bare de pe produse.
        </Text>
        <TouchableOpacity
          onPress={requestPermission}
          style={[styles.permBtn, { backgroundColor: colors.accent }]}
          accessibilityLabel="Acordă permisiunea camerei"
          accessibilityRole="button"
        >
          <Text style={styles.permBtnText}>Permite Accesul</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const handleAskGrokRecipes = () => {
    Haptics.selectionAsync();
    if (produse.length === 0) {
      showBanner({ title: 'Cămara este goală', message: 'Scanează sau adaugă ingrediente înainte de a cere rețete AI.', type: 'warning' });
      return;
    }
    const ingredienteList = produse.map(p => `${p.nume} (${p.cantitate || 1}x${p.is_congelat ? ' - la congelator ❄️' : ''})`).join(', ');
    const promptGrok = `Salut Grok! Am în Cămara Mea următoarele ingrediente: ${ingredienteList}. Ce rețete sănătoase, bogate în proteine și rapide pot găti astăzi folosind aceste alimente? Ține cont și de cele la congelator sau care expiră curând.`;
    router.push({
      pathname: '/(tabs)/chat',
      params: { prompt: promptGrok }
    });
  };

  const renderCamaraItem = ({ item }: { item: ProdusCamara }) => {
    const isSelected = selectedCamaraItems.includes(item.id);
    return (
      <Pressable
        onPress={() => toggleCamaraSelect(item.id)}
        style={[styles.pantryCard, { backgroundColor: colors.cardBg, borderColor: isSelected ? colors.accent : item.is_congelat ? '#00F0FF66' : colors.cardBorder }]}
      >
        <TouchableOpacity
          onPress={() => toggleCamaraSelect(item.id)}
          style={{
            width: 24,
            height: 24,
            borderRadius: 12,
            borderWidth: 2,
            borderColor: isSelected ? colors.accent : colors.textSecondary,
            backgroundColor: isSelected ? colors.accent : 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 12,
          }}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          {isSelected && <Check size={14} color={colors.background} strokeWidth={3} />}
        </TouchableOpacity>

        <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <View style={{ backgroundColor: colors.accent + '26', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 }}>
            <Text style={{ fontSize: 11, fontWeight: '900', color: colors.accent }}>{item.cantitate || 1}x STACK</Text>
          </View>
          {item.is_congelat ? (
            <View style={{ backgroundColor: '#00F0FF26', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Snowflake size={11} color="#00F0FF" />
              <Text style={{ fontSize: 11, fontWeight: '800', color: '#00F0FF' }}>CONGELAT • ~90 zile</Text>
            </View>
          ) : (
            <View style={{ backgroundColor: 'rgba(255,255,255,0.06)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Clock size={11} color={colors.textSecondary} />
              <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textSecondary }}>Expiră în ~{item.zile_valabilitate || 14} zile</Text>
            </View>
          )}
        </View>

        <Text style={[styles.pantryTitle, { color: colors.textPrimary }]}>{item.nume}</Text>
        {!!item.brand && <Text style={[styles.pantryBrand, { color: colors.textSecondary }]}>{item.brand}</Text>}
        <Text style={[styles.pantryMacro, { color: colors.accent }]}>
          {item.calorii_100g} kcal/100g • P: {item.proteine_100g}g • C: {item.carbohidrati_100g}g • G: {item.grasimi_100g}g
        </Text>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {/* Butoane stack +/- */}
        <TouchableOpacity
          onPress={() => {
            Haptics.selectionAsync();
            modificaCantitate(item.id, 1);
          }}
          style={[styles.stackBtn, { backgroundColor: 'rgba(255,255,255,0.08)' }]}
        >
          <Plus size={14} color={colors.textPrimary} />
        </TouchableOpacity>

        {/* Buton Congelator Toggle ❄️ */}
        <TouchableOpacity
          onPress={() => {
            Haptics.selectionAsync();
            toggleCongelator(item.id);
          }}
          style={[styles.stackBtn, { backgroundColor: item.is_congelat ? '#00F0FF26' : 'rgba(255,255,255,0.06)' }]}
        >
          <Snowflake size={16} color={item.is_congelat ? '#00F0FF' : colors.textSecondary} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => handleAdaugaLaMasa(item)}
          style={[styles.addMasaBtn, { backgroundColor: colors.accent }]}
          accessibilityLabel={`Adaugă ${item.nume} la masă`}
          accessibilityRole="button"
        >
          <Plus size={18} color="#000" strokeWidth={3} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => stergeProdus(item.id)}
          style={[styles.deleteBtn, { backgroundColor: colors.danger + '1A' }]}
          accessibilityLabel={`Șterge ${item.nume} din cămară`}
          accessibilityRole="button"
        >
          <Trash2 size={16} color={colors.danger} />
        </TouchableOpacity>
      </View>
    </Pressable>
  );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Top Bar */}
      <View style={styles.headerBar}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={12}
          style={[styles.navBtn, { backgroundColor: colors.surfaceBg }]}
          accessibilityLabel="Înapoi"
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
          >
            <Text style={[styles.tabText, { color: activeTab === 'scan' ? '#000' : colors.textPrimary }]}>
              Scanare Barcode
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setActiveTab('camara')}
            style={[
              styles.tabBtn,
              activeTab === 'camara' && { backgroundColor: colors.accent },
            ]}
          >
            <Text style={[styles.tabText, { color: activeTab === 'camara' ? '#000' : colors.textPrimary }]}>
              Inventar ({produse.length})
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {activeTab === 'scan' ? (
        <View style={styles.cameraWrap}>
          <CameraView
            testID="barcode-scanner-camera"
            accessibilityLabel="Scanner cod de bare"
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
            <Text style={[styles.scanHint, { color: '#FFF' }]}>
              Îndreaptă camera către codul de bare al produsului
            </Text>
          </View>

          {searching && (
            <BlurView intensity={40} tint="dark" style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color={colors.accent} />
              <Text style={[styles.loadingText, { color: colors.textPrimary }]}>
                Căutăm produsul (Bază locală • Cache • AI)...
              </Text>
            </BlurView>
          )}

          {produsGasit && (
            <BlurView intensity={70} tint="dark" style={[styles.resultCard, { borderColor: colors.accent }]}>
              <View style={styles.resHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.resTitle, { color: colors.textPrimary }]}>{produsGasit.nume}</Text>
                  {!!produsGasit.brand && (
                    <Text style={[styles.resBrand, { color: colors.textSecondary }]}>{produsGasit.brand}</Text>
                  )}
                </View>
                <TouchableOpacity
                  onPress={() => {
                    setProdusGasit(null);
                    lockRef.current = false;
                  }}
                  style={styles.resClose}
                  accessibilityLabel="Închide detaliile produsului scanat"
                  accessibilityRole="button"
                  hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                >
                  <X size={20} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              {Boolean(produsGasit.estimat || produsGasit.sursa === 'estimare_ai') && (
                <View style={{ backgroundColor: 'rgba(245, 158, 11, 0.15)', borderRadius: 12, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#F59E0B' }}>
                  <Text style={{ fontSize: 12, fontWeight: '800', color: '#F59E0B', marginBottom: 2 }}>
                    ⚠️ Valori Estimate de Inteligența Artificială
                  </Text>
                  <Text style={{ fontSize: 11, color: colors.textSecondary, lineHeight: 15 }}>
                    Acest produs nu a fost găsit în baza oficială. Valorile nutriționale și gramajul au fost generate de modelul AI și trebuie verificate înainte de adăugarea în jurnal.
                  </Text>
                </View>
              )}

              <View style={styles.macroGrid}>
                <View style={styles.macroBox}>
                  <Text style={[styles.macroVal, { color: colors.accent }]}>{produsGasit.calorii_100g}</Text>
                  <Text style={[styles.macroLbl, { color: colors.textSecondary }]}>kcal / 100g</Text>
                </View>
                <View style={styles.macroBox}>
                  <Text style={[styles.macroVal, { color: colors.textPrimary }]}>{produsGasit.proteine_100g}g</Text>
                  <Text style={[styles.macroLbl, { color: colors.textSecondary }]}>Proteine</Text>
                </View>
                <View style={styles.macroBox}>
                  <Text style={[styles.macroVal, { color: colors.textPrimary }]}>{produsGasit.carbohidrati_100g}g</Text>
                  <Text style={[styles.macroLbl, { color: colors.textSecondary }]}>Carbi</Text>
                </View>
                <View style={styles.macroBox}>
                  <Text style={[styles.macroVal, { color: colors.textPrimary }]}>{produsGasit.grasimi_100g}g</Text>
                  <Text style={[styles.macroLbl, { color: colors.textSecondary }]}>Grăsimi</Text>
                </View>
              </View>

              {/* Profil Aminoacizi Esențiali & BCAA */}
              {produsGasit.proteine_100g > 0 && (
                <View style={{ backgroundColor: 'rgba(0, 240, 255, 0.08)', borderRadius: 14, padding: 12, marginVertical: 12, borderWidth: 1, borderColor: 'rgba(0, 240, 255, 0.25)' }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <Text style={{ fontSize: 12, fontWeight: '800', color: '#00F0FF' }}>⚡ Profil Aminoacizi (EAA • BCAA)</Text>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textSecondary }}>
                      ~{Math.round(produsGasit.proteine_100g * 184)} mg BCAA
                    </Text>
                  </View>
                  <Text style={{ fontSize: 11, color: colors.textSecondary, lineHeight: 15 }}>
                    Leucină ~{Math.round(produsGasit.proteine_100g * 82)}mg • Izoleucină ~{Math.round(produsGasit.proteine_100g * 48)}mg • Valină ~{Math.round(produsGasit.proteine_100g * 54)}mg per 100g. Profil complet în Jurnal.
                  </Text>
                </View>
              )}

              <View style={styles.resActions}>
                <TouchableOpacity
                  onPress={handleSalveazaInCamara}
                  style={[styles.actionBtn, { backgroundColor: colors.surfaceBg, borderColor: colors.cardBorder }]}
                >
                  <Text style={[styles.actionBtnText, { color: colors.textPrimary }]}>+ În Cămară</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => handleAdaugaLaMasa(produsGasit)}
                  style={[styles.actionBtnPrimary, { backgroundColor: colors.accent }]}
                >
                  <Text style={styles.actionPrimaryText}>Adaugă la Masă (g)</Text>
                </TouchableOpacity>
              </View>
            </BlurView>
          )}

          {codNegasit && !produsGasit && (
            <BlurView intensity={70} tint="dark" style={[styles.resultCard, { borderColor: colors.warning }]}>
              <View style={styles.resHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.resTitle, { color: colors.textPrimary }]}>Produs negăsit în baza de date</Text>
                  <Text style={[styles.resBrand, { color: colors.textSecondary }]}>Ultimul cod scanat: {codNegasit}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => {
                    setCodNegasit(null);
                    lockRef.current = false;
                  }}
                  style={styles.resClose}
                  accessibilityLabel="Închide detaliile codului negăsit"
                  accessibilityRole="button"
                  hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                >
                  <X size={20} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              <Text style={{ color: colors.textSecondary, fontSize: 13, marginVertical: 10 }}>
                Nu am găsit acest produs în catalog sau OpenFoodFacts. Îl poți adăuga manual la masă sau poți estima valorile după nume.
              </Text>

              <View style={styles.resActions}>
                <TouchableOpacity
                  onPress={() => {
                    setCodNegasit(null);
                    lockRef.current = false;
                    addMealSheetRef.current?.open();
                  }}
                  style={[styles.actionBtn, { backgroundColor: colors.surfaceBg, borderColor: colors.cardBorder }]}
                >
                  <Text style={[styles.actionBtnText, { color: colors.textPrimary }]}>Completează manual</Text>
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
                >
                  <Text style={styles.actionPrimaryText}>Estimează după nume</Text>
                </TouchableOpacity>
              </View>
            </BlurView>
          )}
        </View>
      ) : (
        <View style={styles.pantryWrap}>
          <View style={{ paddingHorizontal: 20, paddingTop: 14, gap: 10 }}>
            {/* Buton AI Chef Grok Rețete */}
            <TouchableOpacity
              onPress={handleAskGrokRecipes}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                paddingVertical: 12,
                borderRadius: 16,
                backgroundColor: '#00F0FF1F',
                borderWidth: 1.5,
                borderColor: '#00F0FF'
              }}
            >
              <ChefHat size={18} color="#00F0FF" />
              <Text style={{ fontSize: 13.5, fontWeight: '900', color: '#00F0FF' }}>
                Rețete AI Grok cu ingredientele din Cămară
              </Text>
            </TouchableOpacity>

            {/* Buton + Adaugă Manual (Ouă, Carne, Legume) */}
            <TouchableOpacity
              onPress={() => setManualModalVisible(true)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                paddingVertical: 10,
                borderRadius: 14,
                backgroundColor: colors.surfaceBg,
                borderWidth: 1,
                borderColor: colors.cardBorder
              }}
            >
              <Plus size={16} color={colors.accent} />
              <Text style={{ fontSize: 13, fontWeight: '800', color: colors.textPrimary }}>
                + Adaugă Produs Manual (Ouă, Carne, Legume...)
              </Text>
            </TouchableOpacity>
          </View>

          <FlatList
            data={produse}
            keyExtractor={(item) => item.id}
            renderItem={renderCamaraItem}
            contentContainerStyle={{ padding: 20, paddingBottom: 100 }}
            ListEmptyComponent={
              <View style={styles.emptyPantry}>
                <Package size={48} color={colors.textTertiary} />
                <Text style={[styles.emptyPTitle, { color: colors.textPrimary }]}>
                  Cămara ta este goală
                </Text>
                <Text style={[styles.emptyPSub, { color: colors.textSecondary }]}>
                  Scanează codurile de bare ale produselor tale preferate pentru a le adăuga aici.
                </Text>
                <TouchableOpacity
                  onPress={() => setActiveTab('scan')}
                  style={[styles.emptyPBtn, { backgroundColor: colors.accent }]}
                >
                  <Text style={styles.emptyPBtnText}>Scanează Primul Produs</Text>
                </TouchableOpacity>
              </View>
            }
          />

          {selectedCamaraItems.length > 0 && (
            <View
              style={{
                position: 'absolute',
                left: 16,
                right: 16,
                bottom: 24,
                borderRadius: 22,
                borderWidth: 1,
                borderColor: colors.cardBorder,
                backgroundColor: colors.surfaceBg,
                padding: 14,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.35,
                shadowRadius: 16,
                elevation: 10,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <TouchableOpacity
                  style={{
                    flex: 1,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    paddingVertical: 14,
                    borderRadius: 16,
                    backgroundColor: colors.accent,
                  }}
                  onPress={handleGateateCuAICamara}
                  activeOpacity={0.85}
                >
                  <Wand2 size={18} color="#000" strokeWidth={2.5} />
                  <Text style={{ fontSize: 15, fontWeight: '800', color: '#000' }}>
                    Gătește cu AI ({selectedCamaraItems.length})
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
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
            <Text style={[styles.successModalTitle, { color: colors.textPrimary }]}>Salvat în Cămară!</Text>
            <Text style={[styles.successModalSubtitle, { color: colors.textSecondary }]}>
              {camaraSuccessModal.produs?.nume} a fost adăugat cu succes în cămara ta digitală.
            </Text>

            {camaraSuccessModal.produs && (
              <View style={[styles.successProductPreview, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}>
                <Text style={[styles.successProductName, { color: colors.textPrimary }]} numberOfLines={1}>
                  {camaraSuccessModal.produs.nume}
                </Text>
                <Text style={[styles.successProductMacros, { color: colors.accent }]}>
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
              >
                <Text style={[styles.successBtnSecondaryText, { color: colors.textPrimary }]}>Continuă Scanarea</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.successBtnPrimary, { backgroundColor: colors.accent }]}
                onPress={() => {
                  setCamaraSuccessModal({ visible: false, produs: null });
                  lockRef.current = false;
                  setActiveTab('camara');
                }}
              >
                <ShoppingBag size={18} color="#000" />
                <Text style={styles.successBtnPrimaryText}>Vezi Cămara</Text>
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
              <Text style={{ fontSize: 18, fontWeight: '900', color: colors.textPrimary }}>+ Adaugă Produs Manual</Text>
              <TouchableOpacity onPress={() => setManualModalVisible(false)} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}>
                <X size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 14, textAlign: 'center' }}>
              Alege o presetare rapidă sau adaugă ingrediente fără cod de bare (ex. Ouă, Carne, Legume proaspete).
            </Text>

            <View style={{ gap: 8, width: '100%', marginBottom: 20 }}>
              {[
                { nume: 'Ouă proaspete (10 buc)', cal: 155, p: 13, c: 1, g: 11, exp: 14, cong: false },
                { nume: 'Carne de pui piept proaspăt (500g)', cal: 165, p: 31, c: 0, g: 3.6, exp: 90, cong: true },
                { nume: 'Carne de vită slabă (500g)', cal: 250, p: 26, c: 0, g: 15, exp: 90, cong: true },
                { nume: 'Brânză de vaci slabă (300g)', cal: 98, p: 18, c: 3.5, g: 1.2, exp: 10, cong: false },
                { nume: 'Legume proaspete mix (1 kg)', cal: 45, p: 2, c: 9, g: 0.3, exp: 7, cong: false },
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
                        grasimi_100g: preset.g
                      },
                      { zileValabilitate: preset.exp, isCongelat: preset.cong, cantitate: 1 }
                    );
                    setManualModalVisible(false);
                    showBanner({ title: 'Produs Adăugat', message: `✅ ${preset.nume} a fost adăugat în Cămară!`, type: 'success' });
                  }}
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: 14,
                    borderRadius: 14,
                    backgroundColor: preset.cong ? '#00F0FF14' : colors.cardBg,
                    borderWidth: 1,
                    borderColor: preset.cong ? '#00F0FF40' : colors.cardBorder
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '800', color: colors.textPrimary }}>{preset.nume}</Text>
                    <Text style={{ fontSize: 12, color: colors.accent, marginTop: 2 }}>
                      {preset.cal} kcal • P: {preset.p}g {preset.cong ? '• ❄️ CONGELATOR' : `• ⏳ ~${preset.exp} zile`}
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
              >
                <Plus size={18} color={colors.accent} />
                <Text style={{ fontSize: 14, fontWeight: '800', color: colors.accent }}>
                  Introdu alt produs complet manual
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
        onRequestClose={() => setFullManualModalVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: colors.background, padding: 16 }}>
          <ManualProductForm
            initialBarcode={codNegasit || ''}
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
                }
              );
              setFullManualModalVisible(false);
              showBanner({
                title: 'Produs Adăugat',
                message: `✅ ${prod.name} a fost adăugat în Cămară!`,
                type: 'success',
              });
            }}
            onCancel={() => setFullManualModalVisible(false)}
          />
        </View>
      </Modal>

      <AddMealBottomSheet ref={addMealSheetRef} onPantryUsed={handlePantryUsed} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  permContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  permTitle: { fontSize: 24, fontWeight: '900', marginTop: 18, marginBottom: 8 },
  permSub: { fontSize: 15, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  permBtn: { paddingHorizontal: 24, paddingVertical: 14, borderRadius: 16 },
  permBtnText: { color: '#000', fontSize: 16, fontWeight: '800' },

  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 54 : 30,
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
  actionPrimaryText: { color: '#000', fontSize: 14, fontWeight: '900' },

  pantryWrap: { flex: 1 },
  pantryCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderRadius: 18, borderWidth: 1, marginBottom: 12 },
  pantryTitle: { fontSize: 16, fontWeight: '800' },
  pantryBrand: { fontSize: 13, fontWeight: '600', marginTop: 2 },
  pantryMacro: { fontSize: 12, fontWeight: '800', marginTop: 6 },

  addMasaBtn: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  deleteBtn: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  stackBtn: { width: 34, height: 34, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },

  emptyPantry: { alignItems: 'center', padding: 40, marginTop: 40 },
  emptyPTitle: { fontSize: 20, fontWeight: '900', marginTop: 16, marginBottom: 8 },
  emptyPSub: { fontSize: 14, lineHeight: 22, textAlign: 'center', marginBottom: 24 },
  emptyPBtn: { paddingHorizontal: 20, paddingVertical: 14, borderRadius: 14 },
  emptyPBtnText: { color: '#000', fontSize: 15, fontWeight: '800' },

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
  successBtnPrimaryText: { color: '#000', fontSize: 13.5, fontWeight: '900', textAlign: 'center' },
});