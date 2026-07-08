import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  FlatList,
  Platform
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { ScanLine, X, Plus, Check, Search, Package, Trash2, ArrowLeft } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { useTheme } from '../context/ThemeContext';
import { useNotificationBanner } from '../context/NotificationBannerContext';
import { getProdusByBarcode, ProdusScanat } from '../lib/openfoodfacts';
import { useCamara, ProdusCamara } from '../hooks/useCamara';
import { AddMealBottomSheet, AddMealBottomSheetRef } from '../components/AddMealBottomSheet';

export default function ScannerBarcodeScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { showBanner } = useNotificationBanner();
  const { produse, loading: loadingCamara, adaugaProdus, stergeProdus } = useCamara();

  const [permission, requestPermission] = useCameraPermissions();
  const [scanLocked, setScanLocked] = useState(false);
  const [searching, setSearching] = useState(false);
  const [produsGasit, setProdusGasit] = useState<ProdusScanat | null>(null);
  const [activeTab, setActiveTab] = useState<'scan' | 'camara'>('scan');

  const addMealSheetRef = useRef<AddMealBottomSheetRef>(null);

  const handleBarcodeScanned = useCallback(async ({ data }: { data: string }) => {
    if (scanLocked || searching || activeTab !== 'scan') return;
    setScanLocked(true);
    setSearching(true);

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}

    const res = await getProdusByBarcode(data);
    setSearching(false);

    if (res) {
      setProdusGasit(res);
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {}
    } else {
      Alert.alert(
        "Produs negăsit",
        `Codul EAN "${data}" nu a fost găsit în baza OpenFoodFacts. Poți adăuga produsul manual la masă.`,
        [{ text: "OK" }]
      );
      setTimeout(() => setScanLocked(false), 2000);
    }
  }, [scanLocked, searching, activeTab]);

  const handleSalveazaInCamara = async () => {
    if (!produsGasit) return;
    try {
      await adaugaProdus(produsGasit);
      showBanner({
        title: "Salvat în Cămara Mea!",
        message: `${produsGasit.nume} este acum disponibil pentru acces rapid.`,
        type: "success",
      });
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
      setProdusGasit(null);
      setScanLocked(false);
    } catch {
      Alert.alert("Eroare", "Nu am putut salva în Cămară. Verifică dacă tabela există în Supabase.");
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
    });
  };

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

  const renderCamaraItem = ({ item }: { item: ProdusCamara }) => (
    <View style={[styles.pantryCard, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.pantryTitle, { color: colors.textPrimary }]}>{item.nume}</Text>
        {!!item.brand && <Text style={[styles.pantryBrand, { color: colors.textSecondary }]}>{item.brand}</Text>}
        <Text style={[styles.pantryMacro, { color: colors.accent }]}>
          {item.calorii_100g} kcal / 100g • P: {item.proteine_100g}g • C: {item.carbohidrati_100g}g • G: {item.grasimi_100g}g
        </Text>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
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
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Top Bar */}
      <View style={styles.headerBar}>
        <TouchableOpacity
          onPress={() => router.back()}
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
              Cămara Mea ({produse.length})
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {activeTab === 'scan' ? (
        <View style={styles.cameraWrap}>
          <CameraView
            style={StyleSheet.absoluteFill}
            barcodeScannerSettings={{
              barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'],
            }}
            onBarcodeScanned={handleBarcodeScanned}
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
                Căutăm în OpenFoodFacts...
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
                    setScanLocked(false);
                  }}
                  style={styles.resClose}
                  accessibilityLabel="Închide detaliile produsului scanat"
                  accessibilityRole="button"
                >
                  <X size={20} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

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
        </View>
      ) : (
        <View style={styles.pantryWrap}>
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
        </View>
      )}

      <AddMealBottomSheet ref={addMealSheetRef} />
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

  emptyPantry: { alignItems: 'center', padding: 40, marginTop: 40 },
  emptyPTitle: { fontSize: 20, fontWeight: '900', marginTop: 16, marginBottom: 8 },
  emptyPSub: { fontSize: 14, lineHeight: 22, textAlign: 'center', marginBottom: 24 },
  emptyPBtn: { paddingHorizontal: 20, paddingVertical: 14, borderRadius: 14 },
  emptyPBtnText: { color: '#000', fontSize: 15, fontWeight: '800' },
});
