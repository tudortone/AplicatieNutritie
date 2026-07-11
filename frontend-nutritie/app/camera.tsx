import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView,
  Dimensions, Alert, ActivityIndicator, KeyboardAvoidingView, Platform
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../supabase';
import { API_URL } from '@/constants/config';
import Animated, { FadeIn, FadeInUp, FadeInDown, ZoomIn } from 'react-native-reanimated';
import { X, Scan, Zap, ChevronDown, Plus, Heart, Image as ImageIcon } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { AlimentAI } from '../types';
import { useFavorite } from '../hooks/useFavorite';

const { width, height } = Dimensions.get('window');
const SCAN_BOX_SIZE = width * 0.78;

export default function CameraScreen() {
  const { colors } = useTheme();
  const { session } = useAuth();
  const { addFavorite, isFavorite } = useFavorite();
  const [permission, requestPermission] = useCameraPermissions();
  const [seIncarca, setSeIncarca] = useState(false);
  const [rezultat, setRezultat] = useState<AlimentAI[] | null>(null);
  const [grame, setGrame] = useState<number[]>([]);
  const [selectedAI, setSelectedAI] = useState<'auto' | 'gemini' | 'openai' | 'groq'>('auto');
  const [aiMenuVisible, setAiMenuVisible] = useState(false);
  const [aiStatus, setAiStatus] = useState<Record<string, { nume: string; status: string; secundeRamase: number; mesaj: string }>>({});
  const cameraRef = useRef<CameraView>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);
  const router = useRouter();

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch(`${API_URL}/api/ai-status`);
        if (res.ok) {
          const data = await res.json();
          if (isMountedRef.current) setAiStatus(data);
        }
      } catch {}
    };
    fetchStatus();
    const timer = setInterval(fetchStatus, 3000);
    return () => {
      isMountedRef.current = false;
      clearInterval(timer);
    };
  }, []);

  const anuleazaScanare = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setSeIncarca(false);
    setRezultat(null);
  };

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

  const proceseazaImagineUri = async (uri: string) => {
    if (seIncarca || !session) return;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setSeIncarca(true);
    setRezultat(null);
    try {
      const formData = new FormData();
      const ext = uri.split('.').pop()?.toLowerCase() || 'jpg';
      const mimeType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
      formData.append('imagine', { uri, name: `mancare.${ext}`, type: mimeType } as any);
      formData.append('provider', selectedAI);

      const raspuns = await fetch(`${API_URL}/api/analizeaza-mancare-structurat`, {
        method: 'POST', body: formData,
        headers: { 
          'Accept': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        signal: controller.signal
      });
      const date = await raspuns.json();

      if (date.stareAI && isMountedRef.current) {
        setAiStatus(date.stareAI);
      }

      if (date.eroare) {
        if (isMountedRef.current) Alert.alert("Eroare AI", date.eroare);
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
        if (isMountedRef.current) {
          setRezultat(arr);
          setGrame(arr.map(item => Math.round(item.estimare_grame) || 100));
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError' && isMountedRef.current) {
        Alert.alert("Eroare", "Nu am putut contacta serverul AI. Verifică conexiunea.");
      }
    } finally {
      if (isMountedRef.current) setSeIncarca(false);
    }
  };

  const analizeazaFoto = async () => {
    if (!cameraRef.current || seIncarca || !session) return;
    try {
      const foto = await cameraRef.current.takePictureAsync({
        quality: 0.6, base64: false, shutterSound: false
      });
      if (foto && foto.uri) {
        proceseazaImagineUri(foto.uri);
      }
    } catch (e) {
      console.error("Eroare captură foto:", e);
    }
  };

  const alegeDinGalerie = async () => {
    if (seIncarca || !session) return;
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert("Permisiune necesară", "Vă rugăm să acordați acces la galeria de poze pentru a putea selecta imagini.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.7,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        proceseazaImagineUri(result.assets[0].uri);
      }
    } catch (e) {
      console.error("Eroare galerie:", e);
      Alert.alert("Eroare", "Nu s-a putut deschide galeria.");
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
        <TouchableOpacity onPress={() => { anuleazaScanare(); router.back(); }} style={styles.closeBtn}>
          <BlurView intensity={20} tint="dark" style={styles.closeBtnBlur}>
            <X color="#fff" size={24} />
          </BlurView>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.topBadge, { borderColor: colors.accent + '55' }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            setAiMenuVisible(!aiMenuVisible);
          }}
          activeOpacity={0.8}
        >
          <BlurView intensity={30} tint="dark" style={styles.topBadgeBlur}>
            <Zap size={14} color={colors.accent} />
            <Text style={[styles.topBadgeText, { color: colors.accent }]}>
              {selectedAI === 'auto'
                ? 'NUTRIAI: AUTO'
                : selectedAI === 'gemini'
                ? 'NUTRIAI: GEMINI 2.5'
                : selectedAI === 'openai'
                ? 'NUTRIAI: OPENAI'
                : 'NUTRIAI: GROQ'}
            </Text>
            <ChevronDown
              size={14}
              color={colors.accent}
              style={{ transform: [{ rotate: aiMenuVisible ? '180deg' : '0deg' }] }}
            />
          </BlurView>
        </TouchableOpacity>
      </View>

      {/* Dropdown meniu elegant pentru alegerea modelului AI */}
      {aiMenuVisible && (
        <Animated.View entering={FadeInDown.duration(220)} style={styles.aiDropdownMenu}>
          <BlurView intensity={90} tint="dark" style={styles.aiDropdownBlur}>
            <Text style={styles.aiDropdownHeader}>ALEGE FURNIZORUL AI PENTRU ANALIZĂ</Text>
            {(
              [
                { id: 'auto', name: '⚡ Auto (Recomandat)', desc: 'Selecție inteligentă în cascadă' },
                { id: 'gemini', name: '🔮 Google Gemini 2.5', desc: 'Rapid, 4 chei API în rotație' },
                { id: 'openai', name: '🟢 OpenAI GPT-4o', desc: 'Analiză vizuală de referință' },
                { id: 'groq', name: '⚡ Groq Llama Vision', desc: 'Open-source ultrarapid' },
              ] as const
            ).map((item) => {
              const statusObj = aiStatus[item.id];
              const isCooldown = statusObj?.status === 'cooldown' && (statusObj?.secundeRamase || 0) > 0;
              const isSelected = selectedAI === item.id;

              return (
                <TouchableOpacity
                  key={item.id}
                  style={[
                    styles.aiDropdownItem,
                    isSelected && { backgroundColor: 'rgba(255,255,255,0.08)', borderColor: colors.accent + '44' },
                  ]}
                  onPress={() => {
                    if (isCooldown) {
                      Alert.alert(
                        `AI Blocat Temporar (${statusObj?.secundeRamase}s)`,
                        statusObj?.mesaj || 'Modelul este temporar în limită de cereri.'
                      );
                      return;
                    }
                    Haptics.selectionAsync().catch(() => {});
                    setSelectedAI(item.id);
                    setAiMenuVisible(false);
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.aiDropdownTitle, isSelected && { color: colors.accent }]}>
                      {item.name}
                    </Text>
                    <Text style={styles.aiDropdownDesc}>{item.desc}</Text>
                  </View>
                  {isCooldown ? (
                    <View style={styles.cooldownBadge}>
                      <Text style={styles.cooldownBadgeText}>{statusObj?.secundeRamase}s</Text>
                    </View>
                  ) : (
                    <View
                      style={[
                        styles.statusIndicator,
                        isSelected && { backgroundColor: colors.accent },
                      ]}
                    />
                  )}
                </TouchableOpacity>
              );
            })}
          </BlurView>
        </Animated.View>
      )}

      {/* Scan Frame */}
      <View style={styles.scanArea}>
        <Animated.View entering={ZoomIn.duration(600).delay(100)} style={styles.scanBox}>
          <View style={[styles.corner, styles.cornerTL, { borderColor: colors.accent }]} />
          <View style={[styles.corner, styles.cornerTR, { borderColor: colors.accent }]} />
          <View style={[styles.corner, styles.cornerBL, { borderColor: colors.accent }]} />
          <View style={[styles.corner, styles.cornerBR, { borderColor: colors.accent }]} />
        </Animated.View>
        <Text style={styles.scanHint}>Îndreaptă camera spre farfurie</Text>
      </View>

      {/* Full Screen AI Loading Overlay */}
      {seIncarca && (
        <Animated.View entering={FadeIn.duration(300)} style={StyleSheet.absoluteFill}>
          <BlurView intensity={80} tint="dark" style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
            <View style={{
              padding: 28,
              borderRadius: 24,
              backgroundColor: 'rgba(15, 19, 24, 0.85)',
              borderWidth: 1,
              borderColor: colors.accent + '44',
              alignItems: 'center',
              width: '85%',
              shadowColor: colors.accent,
              shadowOffset: { width: 0, height: 10 },
              shadowOpacity: 0.3,
              shadowRadius: 20,
            }}>
              <ActivityIndicator color={colors.accent} size="large" />
              <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 18, marginTop: 18, textAlign: 'center' }}>
                Analizăm imaginea cu AI...
              </Text>
              <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, marginTop: 6, textAlign: 'center' }}>
                Identificăm alimentele și calculăm macronutrienții
              </Text>
              <TouchableOpacity 
                style={{ marginTop: 22, paddingHorizontal: 24, paddingVertical: 10, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' }}
                onPress={anuleazaScanare}
              >
                <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '700' }}>✕ Anulează</Text>
              </TouchableOpacity>
            </View>
          </BlurView>
        </Animated.View>
      )}

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
                      <TouchableOpacity
                        style={{ paddingHorizontal: 6, justifyContent: 'center' }}
                        onPress={() => {
                          const g = grame[index] || item.estimare_grame || 100;
                          const rap = g / 100;
                          addFavorite({
                            nume: item.nume,
                            calorii: Math.round(item.calorii_per_100g * rap),
                            proteine: Math.round(item.proteine_per_100g * rap),
                            carbohidrati: Math.round((item.carbohidrati_per_100g || 0) * rap),
                            grasimi: Math.round((item.grasimi_per_100g || 0) * rap),
                          });
                        }}
                      >
                        <Heart size={20} color="#f43f5e" fill={isFavorite(item.nume) ? "#f43f5e" : "transparent"} />
                      </TouchableOpacity>
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
                
                <TouchableOpacity style={styles.retryBtn} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); anuleazaScanare(); }}>
                  <Text style={styles.retryBtnText}>🔄 Anulează & Scanează din nou</Text>
                </TouchableOpacity>
              </LinearGradient>
            </BlurView>
          </Animated.View>
        </KeyboardAvoidingView>
      )}

      {/* Shutter & Gallery button */}
      {!rezultat && (
        <Animated.View entering={FadeInUp.duration(600).delay(200)} style={styles.shutterArea}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 28 }}>
            <TouchableOpacity
              style={[styles.galleryBtn, { borderColor: 'rgba(255,255,255,0.2)', backgroundColor: 'rgba(0,0,0,0.5)' }]}
              onPress={alegeDinGalerie}
              disabled={seIncarca}
            >
              <ImageIcon size={22} color="#FFFFFF" />
              <Text style={styles.galleryBtnText}>Galerie</Text>
            </TouchableOpacity>

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

            <View style={{ width: 72 }} />
          </View>
          <Text style={styles.shutterLabel}>Apasă pe buton sau alege o poză din galerie</Text>
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
  shutterLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: '600', marginTop: 16, letterSpacing: 0.5 },
  galleryBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 20, borderWidth: 1 },
  galleryBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },

  aiDropdownMenu: { position: 'absolute', top: 100, left: 24, right: 24, zIndex: 1000, borderRadius: 24, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', shadowColor: '#000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.5, shadowRadius: 24, elevation: 15 },
  aiDropdownBlur: { padding: 18, backgroundColor: 'rgba(15, 23, 42, 0.88)' },
  aiDropdownHeader: { fontSize: 11, fontWeight: '800', color: 'rgba(255,255,255,0.45)', letterSpacing: 1.2, marginBottom: 12 },
  aiDropdownItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, borderRadius: 16, marginBottom: 8, borderWidth: 1, borderColor: 'transparent' },
  aiDropdownTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', marginBottom: 2 },
  aiDropdownDesc: { color: 'rgba(255,255,255,0.55)', fontSize: 12 },
  cooldownBadge: { backgroundColor: 'rgba(239, 68, 68, 0.25)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, borderWidth: 1, borderColor: '#ef4444' },
  cooldownBadgeText: { color: '#ef4444', fontSize: 12, fontWeight: '800' },
  statusIndicator: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.25)' },
});
