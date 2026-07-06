import React, { useState, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView,
  Dimensions, Alert, ActivityIndicator, KeyboardAvoidingView, Platform
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { supabase } from '../supabase';
import { API_URL } from '@/constants/config';
import Animated, { FadeIn, FadeInUp, ZoomIn } from 'react-native-reanimated';
import { X, Scan, Zap, ChevronDown, Plus } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { AlimentAI } from '../types';
import type { Session } from '@supabase/supabase-js';

const { width, height } = Dimensions.get('window');
const SCAN_BOX_SIZE = width * 0.78;

export default function CameraScreen() {
  const { colors } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [seIncarca, setSeIncarca] = useState(false);
  const [rezultat, setRezultat] = useState<AlimentAI[] | null>(null);
  const [grame, setGrame] = useState<number[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const cameraRef = useRef<CameraView>(null);
  const router = useRouter();

  React.useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: currentSession } }) => setSession(currentSession));
  }, []);

  const totalCalculat = useMemo(() => {
    return rezultat
      ? rezultat.reduce((acc, item, index) => {
          const factor = (grame[index] || 0) / 100;
          return {
            calorii: acc.calorii + (item.calorii_per_100g || 0) * factor,
            proteine: acc.proteine + (item.proteine_per_100g || 0) * factor,
            grasimi: acc.grasimi + (item.grasimi_per_100g || 0) * factor,
            carbohidrati: acc.carbohidrati + (item.carbohidrati_per_100g || 0) * factor,
          };
        }, { calorii: 0, proteine: 0, grasimi: 0, carbohidrati: 0 })
      : { calorii: 0, proteine: 0, grasimi: 0, carbohidrati: 0 };
  }, [rezultat, grame]);

  const analizeazaFoto = async () => {
    if (!cameraRef.current || seIncarca || !session) return;
    setSeIncarca(true);
    setRezultat(null);
    try {
      const foto = await cameraRef.current.takePictureAsync({
        quality: 0.6, base64: true, shutterSound: false
      });
      if (!foto) {
        setSeIncarca(false);
        return;
      }

      const formData = new FormData();
      formData.append('imagine', { uri: foto.uri, name: 'mancare.jpg', type: 'image/jpeg' } as any);

      const raspuns = await fetch(`${API_URL}/api/analizeaza-mancare-structurat`, {
        method: 'POST', body: formData,
        headers: { 
          'Accept': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
      });
      const date = await raspuns.json();

      if (date.eroare) {
        Alert.alert("Eroare AI", date.eroare);
      } else {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        const rawArr = Array.isArray(date) ? date : [date];
        const arr = rawArr.map((item: any) => ({
          nume: item.nume || 'Aliment identificat',
          estimare_grame: Number(item.estimare_grame) || 100,
          calorii_per_100g: Number(item.calorii_per_100g) || 0,
          proteine_per_100g: Number(item.proteine_per_100g) || 0,
          grasimi_per_100g: Number(item.grasimi_per_100g) || 0,
          carbohidrati_per_100g: Number(item.carbohidrati_per_100g) || 0,
        }));
        setRezultat(arr);
        setGrame(arr.map(item => Math.round(item.estimare_grame) || 100));
      }
    } catch {
      Alert.alert("Eroare", "Nu am putut contacta serverul AI. Verifică conexiunea.");
    } finally {
      setSeIncarca(false);
    }
  };

  const adaugaElementManual = () => {
    const nouAliment: AlimentAI = {
      nume: 'Aliment nou',
      estimare_grame: 100,
      calorii_per_100g: 100,
      proteine_per_100g: 5,
      grasimi_per_100g: 2,
      carbohidrati_per_100g: 15
    };
    setRezultat(prev => prev ? [...prev, nouAliment] : [nouAliment]);
    setGrame(prev => [...prev, 100]);
  };

  const adaugaInJurnal = async () => {
    if (!rezultat || !session) return;
    setSeIncarca(true);
    try {
      const totalCalorii = totalCalculat.calorii;
      const totalProteine = totalCalculat.proteine;
      const totalGrasimi = totalCalculat.grasimi;
      const totalCarbohidrati = totalCalculat.carbohidrati;

      const numeMese = rezultat.map((r, i) => `${r.nume} (${grame[i]}g)`).join(', ');

      const { error } = await supabase.from('mese').insert({
        user_id: session.user.id,
        nume: numeMese,
        calorii: Math.round(totalCalorii),
        proteine: Math.round(totalProteine),
        grasimi: Math.round(totalGrasimi),
        carbohidrati: Math.round(totalCarbohidrati)
      });

      if (error) {
        Alert.alert("Eroare salvare", `Nu s-a putut salva masa: ${error.message}`);
      } else {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert("✅ Succes", "Masa a fost adăugată în jurnalul tău.", [
          { text: "Super!", onPress: () => router.replace('/(tabs)') }
        ]);
      }
    } catch {
      Alert.alert("Eroare", "A apărut o eroare la salvarea mesei.");
    } finally {
      setSeIncarca(false);
    }
  };

  if (!permission) {
    return <View style={[styles.container, { backgroundColor: colors.background }]} />;
  }

  if (!permission.granted) {
    return (
      <View style={[styles.permissionContainer, { backgroundColor: colors.background }]}>
        <View style={styles.permissionContent}>
          <Animated.View entering={ZoomIn.duration(600)} style={[styles.permissionIcon, { shadowColor: colors.accent }]}>
            <LinearGradient colors={colors.accentGradient} style={styles.permissionIconGrad}>
              <Scan size={44} color={colors.background} strokeWidth={2.5} />
            </LinearGradient>
          </Animated.View>
          <Text style={[styles.permissionTitle, { color: colors.textPrimary }]}>Permisiune Cameră</Text>
          <Text style={[styles.permissionSub, { color: colors.textSecondary }]}>NutriAI are nevoie de acces la cameră pentru a analiza mâncarea din farfurie.</Text>
          
          <Animated.View entering={FadeInUp.duration(600).delay(200)} style={[styles.permissionBtn, { shadowColor: colors.accent }]}>
            <TouchableOpacity onPress={requestPermission}>
              <LinearGradient colors={colors.accentGradient} style={styles.permissionBtnGrad}>
                <Text style={[styles.permissionBtnText, { color: colors.background }]}>Permite accesul</Text>
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>

          <TouchableOpacity style={styles.cancelLink} onPress={() => router.back()}>
            <Text style={[styles.cancelLinkText, { color: colors.textSecondary }]}>Înapoi</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }



  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <CameraView style={StyleSheet.absoluteFillObject} ref={cameraRef} />

      {/* Top Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn}>
          <BlurView intensity={20} tint="dark" style={styles.closeBtnBlur}>
            <X color="#fff" size={24} />
          </BlurView>
        </TouchableOpacity>

        <View style={[styles.topBadge, { borderColor: colors.accent + '33' }]}>
          <BlurView intensity={20} tint="dark" style={styles.topBadgeBlur}>
            <Zap size={14} color={colors.accent} />
            <Text style={[styles.topBadgeText, { color: colors.accent }]}>SCANNER NUTRIAI</Text>
            <ChevronDown size={14} color="#6B7280" />
          </BlurView>
        </View>
      </View>

      {/* Scan Frame */}
      <View style={styles.scanArea}>
        <Animated.View entering={ZoomIn.duration(600).delay(100)} style={styles.scanBox}>
          <View style={[styles.corner, styles.cornerTL, { borderColor: colors.accent }]} />
          <View style={[styles.corner, styles.cornerTR, { borderColor: colors.accent }]} />
          <View style={[styles.corner, styles.cornerBL, { borderColor: colors.accent }]} />
          <View style={[styles.corner, styles.cornerBR, { borderColor: colors.accent }]} />
          
          {seIncarca && (
            <Animated.View entering={FadeIn.duration(300)} style={styles.scanningOverlay}>
              <BlurView intensity={20} tint="dark" style={styles.scanningBlur}>
                <ActivityIndicator color={colors.accent} size="large" />
                <Text style={[styles.scanningText, { color: colors.accent }]}>Analizez cu AI...</Text>
              </BlurView>
            </Animated.View>
          )}
        </Animated.View>
        <Text style={styles.scanHint}>Îndreaptă camera spre farfurie</Text>
      </View>

      {/* Result sheet */}
      {rezultat && (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <Animated.View entering={FadeInUp.duration(500).springify()} style={[styles.resultSheet, { borderColor: colors.accent + '26' }]}>
            <BlurView intensity={50} tint="dark" style={styles.resultBlur}>
              <LinearGradient colors={[colors.accent + '10', 'rgba(0,0,0,0)']} style={styles.resultGrad}>
                <View style={styles.resultHandle} />
                
                <Text style={[styles.resultTitle, { color: colors.textPrimary }]}>Ce am găsit în farfurie:</Text>
                
                <ScrollView style={styles.itemsList} showsVerticalScrollIndicator={false}>
                  {rezultat.map((item, index) => (
                    <View key={index} style={styles.foodRow}>
                      <TextInput 
                        style={[styles.foodNameInput, { color: colors.textPrimary }]} 
                        value={item.nume} 
                        onChangeText={(t) => {
                          setRezultat(prev => prev ? prev.map((item, i) => i === index ? { ...item, nume: t } : item) : null);
                        }}
                      />
                      <View style={[styles.gramContainer, { borderColor: colors.accent + '33' }]}>
                        <TextInput
                          style={[styles.gramInput, { color: colors.accent }]}
                          keyboardType="numeric"
                          value={grame[index] !== undefined ? String(grame[index]) : '0'}
                          onChangeText={(text) => {
                            const val = parseInt(text) || 0;
                            setGrame(prev => prev.map((g, i) => i === index ? val : g));
                          }}
                        />
                        <Text style={[styles.gramUnit, { color: colors.accent }]}>g</Text>
                      </View>
                    </View>
                  ))}
                  
                  <TouchableOpacity style={styles.addExtraBtn} onPress={adaugaElementManual}>
                    <Plus size={16} color={colors.textSecondary} />
                    <Text style={[styles.addExtraText, { color: colors.textSecondary }]}>Adaugă element extra</Text>
                  </TouchableOpacity>
                </ScrollView>

                <View style={styles.macroRow}>
                  <View style={styles.macroItem}>
                    <Text style={[styles.macroValue, { color: colors.accent }]}>{Math.round(totalCalculat.calorii)}</Text>
                    <Text style={[styles.macroLabel, { color: colors.textSecondary }]}>kcal</Text>
                  </View>
                  <View style={styles.macroDivider} />
                  <View style={styles.macroItem}>
                    <Text style={[styles.macroValue, { color: colors.accentSecondary }]}>{Math.round(totalCalculat.proteine)}g</Text>
                    <Text style={[styles.macroLabel, { color: colors.textSecondary }]}>proteine</Text>
                  </View>
                  <View style={styles.macroDivider} />
                  <View style={styles.macroItem}>
                    <Text style={[styles.macroValue, { color: colors.accentTertiary }]}>{Math.round(totalCalculat.carbohidrati)}g</Text>
                    <Text style={[styles.macroLabel, { color: colors.textSecondary }]}>carbs</Text>
                  </View>
                  <View style={styles.macroDivider} />
                  <View style={styles.macroItem}>
                    <Text style={[styles.macroValue, { color: colors.warning }]}>{Math.round(totalCalculat.grasimi)}g</Text>
                    <Text style={[styles.macroLabel, { color: colors.textSecondary }]}>grăsimi</Text>
                  </View>
                </View>

                <TouchableOpacity style={[styles.addBtn, { shadowColor: colors.accent }]} onPress={adaugaInJurnal}>
                  <LinearGradient colors={colors.accentGradient} style={styles.addBtnGrad}>
                    <Text style={[styles.addBtnText, { color: colors.background }]}>+ Adaugă {Math.round(totalCalculat.calorii)} kcal în Jurnal</Text>
                  </LinearGradient>
                </TouchableOpacity>
                
                <TouchableOpacity style={styles.retryBtn} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setRezultat(null); }}>
                  <Text style={styles.retryBtnText}>🔄 Anulează & Scanează din nou</Text>
                </TouchableOpacity>
              </LinearGradient>
            </BlurView>
          </Animated.View>
        </KeyboardAvoidingView>
      )}

      {/* Shutter button */}
      {!rezultat && (
        <Animated.View entering={FadeInUp.duration(600).delay(200)} style={styles.shutterArea}>
          <TouchableOpacity
            style={[styles.shutterBtn, { shadowColor: colors.accent, borderColor: colors.accent + '4D' }]}
            onPress={analizeazaFoto}
            disabled={seIncarca}
          >
            <LinearGradient
              colors={seIncarca ? ['#333', '#222'] : colors.accentGradient}
              style={styles.shutterGrad}
            >
              {seIncarca
                ? <ActivityIndicator color={colors.background} />
                : <Scan size={32} color={colors.background} strokeWidth={2.5} />
              }
            </LinearGradient>
          </TouchableOpacity>
          <Text style={styles.shutterLabel}>Apasă pentru a analiza</Text>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  permissionContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  permissionContent: { alignItems: 'center', padding: 32 },
  permissionIcon: { marginBottom: 32, shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.5, shadowRadius: 24, elevation: 20 },
  permissionIconGrad: { width: 96, height: 96, borderRadius: 32, justifyContent: 'center', alignItems: 'center' },
  permissionTitle: { fontSize: 36, fontWeight: '900', letterSpacing: -1, marginBottom: 12 },
  permissionSub: { fontSize: 16, textAlign: 'center', lineHeight: 24, marginBottom: 40, maxWidth: '85%' },
  permissionBtn: { width: '100%', borderRadius: 20, overflow: 'hidden', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 16, elevation: 10 },
  permissionBtnGrad: { padding: 20, alignItems: 'center' },
  permissionBtnText: { fontSize: 18, fontWeight: '900' },
  cancelLink: { marginTop: 24, padding: 12 },
  cancelLinkText: { fontSize: 16, fontWeight: '600' },

  topBar: { position: 'absolute', top: 60, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24 },
  closeBtn: { borderRadius: 20, overflow: 'hidden' },
  closeBtnBlur: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  topBadge: { borderRadius: 20, overflow: 'hidden', borderWidth: 1 },
  topBadgeBlur: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  topBadgeText: { fontSize: 13, fontWeight: '700', letterSpacing: 0.5, marginLeft: 6 },

  scanArea: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scanBox: {
    width: SCAN_BOX_SIZE, height: SCAN_BOX_SIZE, borderRadius: 24,
    justifyContent: 'center', alignItems: 'center', overflow: 'hidden',
  },
  corner: { position: 'absolute', width: 36, height: 36, borderWidth: 3 },
  cornerTL: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 16 },
  cornerTR: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 16 },
  cornerBL: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 16 },
  cornerBR: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 16 },
  scanningOverlay: { ...StyleSheet.absoluteFillObject, borderRadius: 24, overflow: 'hidden' },
  scanningBlur: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scanningText: { fontWeight: '700', fontSize: 16, marginTop: 16 },
  scanHint: { color: 'rgba(255,255,255,0.5)', fontSize: 14, fontWeight: '500', marginTop: 24, letterSpacing: 0.5 },

  resultSheet: { position: 'absolute', bottom: 0, left: 0, right: 0, borderTopLeftRadius: 40, borderTopRightRadius: 40, overflow: 'hidden', borderWidth: 1 },
  resultBlur: { overflow: 'hidden', maxHeight: height * 0.8 },
  resultGrad: { padding: 32, paddingTop: 20 },
  resultHandle: { width: 48, height: 5, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 3, alignSelf: 'center', marginBottom: 24 },
  resultTitle: { fontSize: 20, fontWeight: '800', marginBottom: 16, letterSpacing: -0.3 },
  
  itemsList: { maxHeight: 220, marginBottom: 20 },
  foodRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.03)', padding: 12, borderRadius: 16, marginBottom: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  foodNameInput: { fontSize: 16, fontWeight: '600', flex: 1, marginRight: 12, paddingVertical: 4 },
  gramContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 12, paddingHorizontal: 12, borderWidth: 1 },
  gramInput: { fontSize: 16, fontWeight: '800', paddingVertical: 8, minWidth: 40, textAlign: 'center' },
  gramUnit: { fontSize: 14, fontWeight: '600', marginLeft: 4 },
  addExtraBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 12, marginTop: 4, gap: 6 },
  addExtraText: { fontSize: 14, fontWeight: '600' },

  macroRow: { flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 20, padding: 20, marginBottom: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  macroItem: { flex: 1, alignItems: 'center' },
  macroValue: { fontSize: 22, fontWeight: '900', marginBottom: 4 },
  macroLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  macroDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.08)' },
  addBtn: { borderRadius: 20, overflow: 'hidden', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 20, elevation: 10 },
  addBtnGrad: { padding: 20, alignItems: 'center' },
  addBtnText: { fontSize: 17, fontWeight: '900', letterSpacing: 0.5 },
  retryBtn: { padding: 16, alignItems: 'center', marginTop: 12, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', backgroundColor: 'rgba(255,255,255,0.08)' },
  retryBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },

  shutterArea: { position: 'absolute', bottom: 60, left: 0, right: 0, alignItems: 'center' },
  shutterBtn: { width: 80, height: 80, borderRadius: 40, overflow: 'hidden', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.6, shadowRadius: 24, elevation: 20, borderWidth: 3 },
  shutterGrad: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  shutterLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: '500', marginTop: 16, letterSpacing: 0.5 },
});
