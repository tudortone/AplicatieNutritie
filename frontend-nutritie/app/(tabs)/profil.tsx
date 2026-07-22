import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, Alert, ActivityIndicator, Platform, Switch, Image
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { Save, LogOut, Target, Scale, Zap, Sparkles, ChevronRight, Palette, Bell, Lock, ShieldCheck, Footprints, Activity, Trophy, Camera, CheckCircle2, User, Pencil } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../../context/ThemeContext';
import { themes, themeDisplayNames, ThemeName } from '../../constants/theme';
import { useNotifications } from '../../hooks/useNotifications';
import { useAuth } from '../../context/AuthContext';
import { useBiometrics } from '../../hooks/useBiometrics';
import { useHealthSync, HEALTH_PROVIDERS } from '../../hooks/useHealthSync';
import { useNotificationBanner } from '../../context/NotificationBannerContext';
import { useNotify } from '../../hooks/useNotify';
import { useGamificare } from '../../hooks/useGamificare';
import { INSIGNE_LIST } from '../../constants/insigne';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';

export default function ProfilScreen() {
  const router = useRouter();
  const { colors, themeName, setTheme } = useTheme();
  const { enabled: notificationsEnabled, toggleReminders, isExpoGo } = useNotifications();
  const { isSupported, biometricType, isEnabled, toggleBiometric } = useBiometrics();
  const { isEnabled: healthSyncEnabled, platformName, toggleSync: toggleHealthSync, selectedProvider, setProvider } = useHealthSync();
  const { session, user, loadingAuth } = useAuth();
  const { showBanner } = useNotificationBanner();
  const notify = useNotify();
  const { insigne } = useGamificare();
  const { scrollPaddingTop, scrollPaddingBottom } = useResponsiveLayout();
  const [greutate, setGreutate] = useState('75');
  const [greutateTinta, setGreutateTinta] = useState('70');
  const [caloriiTinta, setCaloriiTinta] = useState('2000');
  const [proteineTinta, setProteineTinta] = useState('150');
  const [carbiTinta, setCarbiTinta] = useState('250');
  const [grasimiTinta, setGrasimiTinta] = useState('70');
  const [nume, setNume] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [showSuccessAnim, setShowSuccessAnim] = useState(false);
  
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    const initProfile = async () => {
      if (loadingAuth) return;
      setCheckingSession(true);
      try {
        if (session) {
          const metadata = user?.user_metadata || session.user.user_metadata || {};
          let g = metadata.greutate;
          let gt = metadata.greutateTinta;
          let c = metadata.caloriiTinta;
          let p = metadata.proteineTinta;
          let cb = metadata.carbiTinta;
          let gr = metadata.grasimiTinta;

          if (!g) g = await AsyncStorage.getItem('greutate');
          if (!gt) gt = await AsyncStorage.getItem('greutateTinta');
          if (!c) c = await AsyncStorage.getItem('caloriiTinta');
          if (!p) p = await AsyncStorage.getItem('proteineTinta');
          if (!cb) cb = await AsyncStorage.getItem('carbiTinta');
          if (!gr) gr = await AsyncStorage.getItem('grasimiTinta');

          let nm = metadata.nume || metadata.display_name;
          let av = metadata.avatar_url;
          if (!nm) nm = await AsyncStorage.getItem('nume_profil');
          if (!av) av = await AsyncStorage.getItem('avatar_url');

          setNume(nm ? String(nm) : (session.user.email?.split('@')[0] || 'Utilizator'));
          setAvatarUrl(av ? String(av) : null);

          setGreutate(g ? String(g) : '75');
          setGreutateTinta(gt ? String(gt) : '70');
          setCaloriiTinta(c ? String(c) : '2000');
          setProteineTinta(p ? String(p) : '150');
          setCarbiTinta(cb ? String(cb) : '250');
          setGrasimiTinta(gr ? String(gr) : '70');

          if (g) await AsyncStorage.setItem('greutate', String(g));
          if (gt) await AsyncStorage.setItem('greutateTinta', String(gt));
          if (c) await AsyncStorage.setItem('caloriiTinta', String(c));
          if (p) await AsyncStorage.setItem('proteineTinta', String(p));
          if (cb) await AsyncStorage.setItem('carbiTinta', String(cb));
          if (gr) await AsyncStorage.setItem('grasimiTinta', String(gr));
        }
      } catch (e) {
        console.error("Eroare la inițializarea profilului:", e);
      } finally {
        setCheckingSession(false);
      }
    };

    initProfile();
  }, [session, user, loadingAuth]);

  const alegePozaProfil = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const permisiune = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permisiune.granted) {
        Alert.alert("Permisiune necesară", "Avem nevoie de acces la galeria foto pentru a alege o poză de profil.");
        return;
      }
      const rezultat = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });
      if (!rezultat.canceled && rezultat.assets && rezultat.assets.length > 0) {
        const nouaUri = rezultat.assets[0].uri;
        setAvatarUrl(nouaUri);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (e) {
      console.error("Eroare selecție poză:", e);
    }
  };

  const salveaza = async () => {
    if (!greutate || !greutateTinta || !caloriiTinta || !proteineTinta || !carbiTinta || !grasimiTinta) {
      showBanner({
        title: "Date incomplete",
        message: "Te rog să completezi toate obiectivele.",
        type: 'warning'
      });
      return;
    }
    
    setLoading(true);
    try {
      await AsyncStorage.setItem('greutate', greutate);
      await AsyncStorage.setItem('greutateTinta', greutateTinta);
      await AsyncStorage.setItem('caloriiTinta', caloriiTinta);
      await AsyncStorage.setItem('proteineTinta', proteineTinta);
      await AsyncStorage.setItem('carbiTinta', carbiTinta);
      await AsyncStorage.setItem('grasimiTinta', grasimiTinta);
      await AsyncStorage.setItem('nume_profil', nume);
      if (avatarUrl) await AsyncStorage.setItem('avatar_url', avatarUrl);

      const { error } = await supabase.auth.updateUser({
        data: {
          nume: nume.trim() || session?.user.email?.split('@')[0],
          avatar_url: avatarUrl || '',
          greutate: parseFloat(greutate) || 75,
          greutateTinta: parseFloat(greutateTinta) || 70,
          caloriiTinta: parseInt(caloriiTinta) || 2000,
          proteineTinta: parseInt(proteineTinta) || 150,
          carbiTinta: parseInt(carbiTinta) || 250,
          grasimiTinta: parseInt(grasimiTinta) || 70
        }
      });

      if (error) {
        showBanner({
          title: "Eroare salvare",
          message: `Eroare salvare în Cloud: ${error.message}`,
          type: 'warning'
        });
      } else {
        notify.success('Profil actualizat', 'Modificările au fost salvate');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setShowSuccessAnim(true);
        setTimeout(() => setShowSuccessAnim(false), 2600);
      }
    } catch {
      showBanner({
        title: "Salvat local",
        message: "Conexiune indisponibilă. Datele au fost salvate local.",
        type: 'info'
      });
    } finally {
      setLoading(false);
    }
  };

  const deconectare = async () => {
    Alert.alert("Deconectare", "Ești sigur că vrei să te deconectezi?", [
      { text: "Anulează", style: "cancel" },
      { text: "Deconectează", style: "destructive", onPress: () => supabase.auth.signOut() }
    ]);
  };

  if (checkingSession) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Se încarcă profilul...</Text>
      </View>
    );
  }

  if (!session) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Nu ești autentificat.</Text>
      </View>
    );
  }

  const initials = session.user.email?.slice(0, 2).toUpperCase() || 'NU';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.glowTop, { backgroundColor: colors.accent }]} />
      <View style={[styles.glowBottom, { backgroundColor: colors.accentSecondary }]} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.scroll, { paddingTop: scrollPaddingTop, paddingBottom: scrollPaddingBottom }]}>

        {/* Avatar header */}
        <Animated.View entering={FadeInDown.duration(500)} style={styles.avatarSection}>
          <TouchableOpacity activeOpacity={0.85} onPress={alegePozaProfil}>
            <LinearGradient colors={colors.accentGradient} style={[styles.avatarRing, { shadowColor: colors.accent }]}>
              <View style={[styles.avatarInner, { backgroundColor: '#0F1318', overflow: 'hidden' }]}>
                {avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} style={{ width: '100%', height: '100%', borderRadius: 29 }} />
                ) : (
                  <Text style={[styles.avatarText, { color: colors.accent }]}>{initials}</Text>
                )}
              </View>
            </LinearGradient>
            <View style={[styles.cameraBadge, { backgroundColor: colors.accent, borderColor: colors.background }]}>
              <Camera size={14} color="#000" />
            </View>
          </TouchableOpacity>
          <Text style={[styles.displayName, { color: colors.textPrimary }]}>{nume || session.user.email?.split('@')[0]}</Text>
          <Text style={[styles.emailText, { color: colors.textSecondary }]}>{session.user.email}</Text>

          <View style={[styles.planBadge, { borderColor: colors.accent + '33' }]}>
            <LinearGradient colors={[colors.accent + '25', 'rgba(0,0,0,0)']} style={styles.planBadgeGrad}>
              <Zap size={14} color={colors.accent} />
              <Text style={[styles.planBadgeText, { color: colors.accent }]}>AI Premium Plan</Text>
            </LinearGradient>
          </View>
        </Animated.View>

        {/* Personal Details: Name / Display Name */}
        <Animated.View entering={FadeInDown.duration(550).delay(30)}>
          <View style={styles.sectionHeaderRow}>
            <User size={16} color={colors.accent} />
            <Text style={[styles.sectionLabel, { color: colors.textSecondary, marginBottom: 0 }]}>DATE PERSONALE</Text>
          </View>
          <BlurView intensity={20} tint="dark" style={[styles.card, { borderColor: colors.cardBorder, marginBottom: 24, marginTop: 12 }]}>
            <LinearGradient colors={[colors.cardBg, 'rgba(0,0,0,0)']} style={styles.cardGrad}>
              <View style={styles.inputRow}>
                <View style={[styles.inputIcon, { backgroundColor: colors.accent + '1F' }]}>
                  <Pencil size={18} color={colors.accent} />
                </View>
                <View style={styles.inputContent}>
                  <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Nume / Pseudonim Afișat</Text>
                  <TextInput
                    style={[styles.inputField, { color: colors.textPrimary, fontSize: 18 }]}
                    value={nume}
                    onChangeText={setNume}
                    placeholder="Introdu numele tău..."
                    placeholderTextColor={colors.textSecondary}
                    selectionColor={colors.accent}
                  />
                </View>
              </View>
            </LinearGradient>
          </BlurView>
        </Animated.View>

        {/* Visual Theme Section */}
        <Animated.View entering={FadeInDown.duration(600).delay(50)}>
          <View style={styles.sectionHeaderRow}>
            <Palette size={16} color={colors.accent} />
            <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>TEMĂ VIZUALĂ</Text>
          </View>
          <View style={styles.themeGrid}>
            {(['midnight', 'ocean', 'sunset'] as ThemeName[]).map((tName) => {
              const tColors = themes[tName];
              const isSelected = themeName === tName;
              return (
                <TouchableOpacity
                  key={tName}
                  style={[
                    styles.themeCard,
                    { backgroundColor: tColors.surfaceBg, borderColor: isSelected ? tColors.accent : 'rgba(255,255,255,0.08)' },
                    isSelected && { borderWidth: 2 }
                  ]}
                  onPress={() => setTheme(tName)}
                  activeOpacity={0.8}
                >
                  <View style={styles.themeSwatchRow}>
                    <View style={[styles.themeSwatch, { backgroundColor: tColors.background }]} />
                    <View style={[styles.themeSwatch, { backgroundColor: tColors.accent }]} />
                    <View style={[styles.themeSwatch, { backgroundColor: tColors.accentSecondary }]} />
                  </View>
                  <Text style={[styles.themeNameText, { color: isSelected ? tColors.accent : colors.textPrimary }]}>
                    {themeDisplayNames[tName]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Animated.View>

        {/* Notifications section */}
        <Animated.View entering={FadeInDown.duration(600).delay(80)}>
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>REMINDERE & NOTIFICĂRI</Text>
          <BlurView intensity={20} tint="dark" style={[styles.card, { borderColor: colors.cardBorder, marginBottom: 20 }]}>
            <LinearGradient colors={[colors.cardBg, 'rgba(0,0,0,0)']} style={styles.cardGrad}>
              <View style={[styles.inputRow, { alignItems: 'center' }]}>
                <View style={[styles.inputIcon, { backgroundColor: colors.accent + '1F' }]}>
                  <Bell size={18} color={colors.accent} />
                </View>
                <View style={[styles.inputContent, { flex: 1 }]}>
                  <Text style={[styles.inputLabel, { color: colors.textPrimary, fontSize: 16, marginBottom: 2 }]}>Remindere Zilnice de Masă</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Primești 3 notificări la 08:00, 13:00 și 19:30</Text>
                </View>
                <Switch
                  value={notificationsEnabled}
                  onValueChange={(val) => { toggleReminders(val); }}
                  trackColor={{ false: '#3f3f3f', true: colors.accent + '80' }}
                  thumbColor={notificationsEnabled ? colors.accent : '#f4f3f4'}
                />
              </View>
              {isExpoGo && (
                <View style={{ paddingHorizontal: 20, paddingBottom: 14 }}>
                  <Text style={{ color: colors.textSecondary, fontSize: 11, fontStyle: 'italic' }}>
                    ℹ️ Expo Go: Notificările push necesită development build. Reminderele locale orare rămân active.
                  </Text>
                </View>
              )}
            </LinearGradient>
          </BlurView>
        </Animated.View>

        {/* Security / Biometric section */}
        {isSupported && (
          <Animated.View entering={FadeInDown.duration(600).delay(90)}>
            <View style={styles.sectionHeaderRow}>
              <ShieldCheck size={16} color={colors.accent} />
              <Text style={[styles.sectionLabel, { color: colors.textSecondary, marginBottom: 0 }]}>SECURITATE AVANSATĂ</Text>
            </View>
            <BlurView intensity={20} tint="dark" style={[styles.card, { borderColor: colors.cardBorder, marginBottom: 20, marginTop: 12 }]}>
              <LinearGradient colors={[colors.cardBg, 'rgba(0,0,0,0)']} style={styles.cardGrad}>
                <View style={[styles.inputRow, { alignItems: 'center' }]}>
                  <View style={[styles.inputIcon, { backgroundColor: colors.accent + '1F' }]}>
                    <Lock size={18} color={colors.accent} />
                  </View>
                  <View style={[styles.inputContent, { flex: 1 }]}>
                    <Text style={[styles.inputLabel, { color: colors.textPrimary, fontSize: 16, marginBottom: 2 }]}>Blocare cu {biometricType}</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Solicită autentificare la pornire și după 5 min inactivitate</Text>
                  </View>
                  <Switch
                    value={isEnabled}
                    onValueChange={(val) => { toggleBiometric(val); }}
                    trackColor={{ false: colors.surfaceElevated, true: colors.accent }}
                    thumbColor={Platform.OS === 'ios' ? '#FFFFFF' : (isEnabled ? colors.background : '#f4f3f4')}
                  />
                </View>
              </LinearGradient>
            </BlurView>
          </Animated.View>
        )}

        {/* Apple HealthKit / Google Fit section */}
        <Animated.View entering={FadeInDown.duration(600).delay(95)}>
          <View style={styles.sectionHeaderRow}>
            <Activity size={16} color={colors.accent} />
            <Text style={[styles.sectionLabel, { color: colors.textSecondary, marginBottom: 0 }]}>CONECTIVITATE FITNESS & BRĂȚĂRI</Text>
          </View>
          <BlurView intensity={20} tint="dark" style={[styles.card, { borderColor: colors.cardBorder, marginBottom: 20, marginTop: 12 }]}>
            <LinearGradient colors={[colors.cardBg, 'rgba(0,0,0,0)']} style={styles.cardGrad}>
              <View style={[styles.inputRow, { alignItems: 'center' }]}>
                <View style={[styles.inputIcon, { backgroundColor: colors.accent + '1F' }]}>
                  <Footprints size={18} color={colors.accent} />
                </View>
                <View style={[styles.inputContent, { flex: 1 }]}>
                  <Text style={[styles.inputLabel, { color: colors.textPrimary, fontSize: 16, marginBottom: 2 }]}>Sincronizare Activă ({platformName})</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Preluare automată pași și calcul calorii arse în jurnal</Text>
                </View>
                <Switch
                  value={healthSyncEnabled}
                  onValueChange={(val) => { 
                    toggleHealthSync(val); 
                    if (val) AsyncStorage.removeItem('ascundeCardHealth');
                  }}
                  trackColor={{ false: colors.surfaceElevated, true: colors.accent }}
                  thumbColor={Platform.OS === 'ios' ? '#FFFFFF' : (healthSyncEnabled ? colors.background : '#f4f3f4')}
                />
              </View>

              {/* Furnizori de fitness interactivi */}
              <View style={{ marginTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)', paddingTop: 16 }}>
                <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '700', marginBottom: 10, textTransform: 'uppercase' }}>
                  Alege Aplicația sau Brățara de Fitness:
                </Text>
                <View style={{ gap: 8 }}>
                  {HEALTH_PROVIDERS.map((p) => {
                    const active = selectedProvider === p.id;
                    return (
                      <TouchableOpacity
                        key={p.id}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          padding: 12,
                          borderRadius: 14,
                          borderWidth: 1,
                          borderColor: active ? colors.accent : 'rgba(255,255,255,0.08)',
                          backgroundColor: active ? colors.accent + '15' : 'rgba(255,255,255,0.02)',
                          gap: 12,
                        }}
                        onPress={() => setProvider(p.id)}
                        activeOpacity={0.75}
                      >
                        <Text style={{ fontSize: 22 }}>{p.icon}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: active ? colors.accent : colors.textPrimary, fontWeight: active ? '800' : '600', fontSize: 14 }}>
                            {p.name}
                          </Text>
                          <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 1 }}>
                            {p.description}
                          </Text>
                        </View>
                        {active && (
                          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent }} />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </LinearGradient>
          </BlurView>
        </Animated.View>

        {/* Secțiune Insigne & Gamificare */}
        <Animated.View entering={FadeInDown.duration(600).delay(80)}>
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
            INSIGNE & RECOMPENSE ({insigne.length}/{INSIGNE_LIST.length})
          </Text>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 }}>
            {INSIGNE_LIST.map((insign) => {
              const unlocked = insigne.includes(insign.id);
              return (
                <View
                  key={insign.id}
                  style={{
                    width: '48%',
                    backgroundColor: unlocked ? colors.accent + '14' : 'rgba(255,255,255,0.03)',
                    borderColor: unlocked ? colors.accent + '44' : 'rgba(255,255,255,0.07)',
                    borderWidth: 1,
                    borderRadius: 14,
                    padding: 12,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                  }}
                >
                  <View
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 19,
                      backgroundColor: unlocked ? colors.accent + '25' : 'rgba(255,255,255,0.05)',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {unlocked ? (
                      <Trophy size={18} color={colors.accent} />
                    ) : (
                      <Lock size={16} color={colors.textTertiary} />
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: '700',
                        color: unlocked ? colors.textPrimary : colors.textTertiary,
                      }}
                      numberOfLines={1}
                    >
                      {insign.nume}
                    </Text>
                    <Text
                      style={{
                        fontSize: 11,
                        color: colors.textSecondary,
                        marginTop: 2,
                      }}
                      numberOfLines={2}
                    >
                      {insign.conditie}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        </Animated.View>

        {/* Targets section */}
        <Animated.View entering={FadeInDown.duration(600).delay(100)}>
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>OBIECTIVELE TALE</Text>

          <TouchableOpacity style={[styles.aiSetupBtn, { borderColor: colors.accent + '33' }]} onPress={() => router.push('/calculator-ai')}>
            <LinearGradient colors={[colors.accent + '25', 'rgba(0,0,0,0)']} style={styles.aiSetupGrad}>
              <Sparkles size={22} color={colors.accent} />
              <View style={styles.aiSetupTextWrap}>
                <Text style={[styles.aiSetupTitle, { color: colors.textPrimary }]}>Asistent Configurare Profil</Text>
                <Text style={[styles.aiSetupSub, { color: colors.textTertiary }]}>Calculează țintele automat cu AI</Text>
              </View>
              <ChevronRight size={20} color={colors.textSecondary} />
            </LinearGradient>
          </TouchableOpacity>

          <BlurView intensity={20} tint="dark" style={[styles.card, { borderColor: colors.cardBorder }]}>
            <LinearGradient colors={[colors.cardBg, 'rgba(0,0,0,0)']} style={styles.cardGrad}>

              <View style={styles.inputRow}>
                <View style={[styles.inputIcon, { backgroundColor: colors.accent + '1F' }]}>
                  <Scale size={18} color={colors.accent} />
                </View>
                <View style={styles.inputContent}>
                  <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Greutate (kg)</Text>
                  <TextInput
                    style={[styles.inputField, { color: colors.textPrimary }]}
                    value={greutate}
                    onChangeText={setGreutate}
                    keyboardType="numeric"
                    placeholderTextColor={colors.textSecondary}
                    selectionColor={colors.accent}
                  />
                </View>
              </View>

              <View style={styles.separator} />

              <View style={styles.inputRow}>
                <View style={[styles.inputIcon, { backgroundColor: colors.accent + '1F' }]}>
                  <Target size={18} color={colors.accent} />
                </View>
                <View style={styles.inputContent}>
                  <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Greutate Țintă (kg)</Text>
                  <TextInput
                    style={[styles.inputField, { color: colors.textPrimary }]}
                    value={greutateTinta}
                    onChangeText={setGreutateTinta}
                    keyboardType="numeric"
                    placeholderTextColor={colors.textSecondary}
                    selectionColor={colors.accent}
                  />
                </View>
              </View>

              <View style={styles.separator} />

              <View style={styles.inputRow}>
                <View style={[styles.inputIcon, { backgroundColor: colors.accent + '1F' }]}>
                  <Target size={18} color={colors.accent} />
                </View>
                <View style={styles.inputContent}>
                  <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Țintă Calorii (kcal/zi)</Text>
                  <TextInput
                    style={[styles.inputField, { color: colors.textPrimary }]}
                    value={caloriiTinta}
                    onChangeText={setCaloriiTinta}
                    keyboardType="numeric"
                    placeholderTextColor={colors.textSecondary}
                    selectionColor={colors.accent}
                  />
                </View>
              </View>

              <View style={styles.separator} />

              <View style={styles.inputRow}>
                <View style={[styles.inputIcon, { backgroundColor: colors.accentSecondary + '1F' }]}>
                  <Zap size={18} color={colors.accentSecondary} />
                </View>
                <View style={styles.inputContent}>
                  <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Țintă Proteine (g/zi)</Text>
                  <TextInput
                    style={[styles.inputField, { color: colors.textPrimary }]}
                    value={proteineTinta}
                    onChangeText={setProteineTinta}
                    keyboardType="numeric"
                    placeholderTextColor={colors.textSecondary}
                    selectionColor={colors.accent}
                  />
                </View>
              </View>

              <View style={styles.separator} />

              <View style={styles.inputRow}>
                <View style={[styles.inputIcon, { backgroundColor: colors.accentTertiary + '1F' }]}>
                  <Zap size={18} color={colors.accentTertiary} />
                </View>
                <View style={styles.inputContent}>
                  <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Țintă Carbohidrați (g/zi)</Text>
                  <TextInput
                    style={[styles.inputField, { color: colors.textPrimary }]}
                    value={carbiTinta}
                    onChangeText={setCarbiTinta}
                    keyboardType="numeric"
                    placeholderTextColor={colors.textSecondary}
                    selectionColor={colors.accent}
                  />
                </View>
              </View>

              <View style={styles.separator} />

              <View style={styles.inputRow}>
                <View style={[styles.inputIcon, { backgroundColor: colors.warning + '1F' }]}>
                  <Zap size={18} color={colors.warning} />
                </View>
                <View style={styles.inputContent}>
                  <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Țintă Grăsimi (g/zi)</Text>
                  <TextInput
                    style={[styles.inputField, { color: colors.textPrimary }]}
                    value={grasimiTinta}
                    onChangeText={setGrasimiTinta}
                    keyboardType="numeric"
                    placeholderTextColor={colors.textSecondary}
                    selectionColor={colors.accent}
                  />
                </View>
              </View>

            </LinearGradient>
          </BlurView>
        </Animated.View>

        {/* Save button */}
        <Animated.View entering={FadeInDown.duration(600).delay(200)}>
          <TouchableOpacity style={[styles.saveBtn, { shadowColor: colors.accent }]} onPress={salveaza} disabled={loading}>
            <LinearGradient colors={colors.accentGradient} style={styles.saveBtnGrad}>
              {loading ? (
                <ActivityIndicator color={colors.background} />
              ) : (
                <>
                  <Save size={20} color={colors.background} strokeWidth={2.5} />
                  <Text style={[styles.saveBtnText, { color: colors.background }]}>Salvează Modificările</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>

        {/* Info card */}
        <Animated.View entering={FadeInUp.duration(600).delay(300)} style={styles.infoCard}>
          <BlurView intensity={15} tint="dark" style={styles.infoCardBlur}>
            <LinearGradient colors={['rgba(255,255,255,0.03)', 'rgba(0,0,0,0)']} style={styles.infoCardGrad}>
              <Text style={styles.infoCardTitle}>💡 Cum funcționează</Text>
              <Text style={[styles.infoCardText, { color: colors.textSecondary }]}>
                Obiectivele pe care le setezi sunt folosite de asistentul AI pentru a-ți oferi recomandări personalizate și a-ți urmări progresul zilnic.
              </Text>
            </LinearGradient>
          </BlurView>
        </Animated.View>

        {/* Logout */}
        <Animated.View entering={FadeInUp.duration(600).delay(400)}>
          <TouchableOpacity style={[styles.logoutBtn, { borderColor: colors.danger + '33', backgroundColor: colors.danger + '0A' }]} onPress={deconectare}>
            <LogOut size={18} color={colors.danger} />
            <Text style={[styles.logoutText, { color: colors.danger }]}>Deconectare</Text>
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>

      {/* Success Animation Modal Overlay */}
      {showSuccessAnim && (
        <Animated.View entering={FadeInDown.duration(350).springify()} style={styles.successOverlay}>
          <BlurView intensity={85} tint="dark" style={[styles.successCard, { borderColor: colors.accent }]}>
            <LinearGradient colors={[colors.accent + '25', 'rgba(0,0,0,0.85)']} style={styles.successGrad}>
              <Animated.View entering={FadeInUp.duration(400).delay(100).springify()} style={[styles.successIconCircle, { backgroundColor: colors.accent }]}>
                <CheckCircle2 size={44} color="#000" />
              </Animated.View>
              <Text style={[styles.successTitle, { color: colors.textPrimary }]}>Profil Actualizat!</Text>
              <Text style={[styles.successSub, { color: colors.textSecondary }]}>Modificările tale (poză, nume și obiective) au fost salvate cu succes.</Text>
            </LinearGradient>
          </BlurView>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  glowTop: { position: 'absolute', top: -100, left: -80, width: 300, height: 300, borderRadius: 150, opacity: 0.04 },
  glowBottom: { position: 'absolute', bottom: 50, right: -80, width: 280, height: 280, borderRadius: 140, opacity: 0.05 },

  scroll: { paddingHorizontal: 20 },

  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, fontSize: 15, fontWeight: '500' },

  // Avatar section
  avatarSection: { alignItems: 'center', marginBottom: 30 },
  avatarRing: { width: 96, height: 96, borderRadius: 32, padding: 3, marginBottom: 16, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 20, elevation: 15 },
  avatarInner: { flex: 1, borderRadius: 29, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 28, fontWeight: '900', letterSpacing: -1 },
  displayName: { fontSize: 24, fontWeight: '900', letterSpacing: -0.5, marginBottom: 4 },
  emailText: { fontSize: 14, fontWeight: '500', marginBottom: 16 },
  planBadge: { borderRadius: 16, overflow: 'hidden', borderWidth: 1 },
  planBadgeGrad: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, gap: 6 },
  planBadgeText: { fontSize: 13, fontWeight: '700', marginLeft: 4 },

  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12, marginLeft: 4 },
  sectionLabel: { fontSize: 13, fontWeight: '800', letterSpacing: 1.5, marginBottom: 14, marginLeft: 4 },

  themeGrid: { flexDirection: 'row', gap: 10, marginBottom: 28 },
  themeCard: { flex: 1, padding: 14, borderRadius: 20, borderWidth: 1, alignItems: 'center' },
  themeSwatchRow: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  themeSwatch: { width: 16, height: 16, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  themeNameText: { fontSize: 12, fontWeight: '800', textAlign: 'center' },

  aiSetupBtn: { borderRadius: 24, overflow: 'hidden', borderWidth: 1, marginBottom: 20 },
  aiSetupGrad: { padding: 20, flexDirection: 'row', alignItems: 'center', gap: 16 },
  aiSetupTextWrap: { flex: 1 },
  aiSetupTitle: { fontSize: 16, fontWeight: '800', marginBottom: 4 },
  aiSetupSub: { fontSize: 13, fontWeight: '500' },

  card: { borderRadius: 28, overflow: 'hidden', borderWidth: 1, marginBottom: 24 },
  cardGrad: { paddingVertical: 8 },
  inputRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, gap: 16 },
  inputIcon: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  inputContent: { flex: 1 },
  inputLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  inputField: { fontSize: 22, fontWeight: '800', padding: 0 },
  separator: { height: 1, backgroundColor: 'rgba(255,255,255,0.04)', marginHorizontal: 20 },

  // Save button
  saveBtn: { borderRadius: 20, overflow: 'hidden', marginBottom: 20, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 20, elevation: 10 },
  saveBtnGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 20, gap: 10 },
  saveBtnText: { fontSize: 18, fontWeight: '900', letterSpacing: 0.3 },

  // Info card
  infoCard: { borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)', marginBottom: 24 },
  infoCardBlur: { overflow: 'hidden' },
  infoCardGrad: { padding: 20 },
  infoCardTitle: { fontSize: 15, fontWeight: '800', color: '#E5E7EB', marginBottom: 8 },
  infoCardText: { fontSize: 14, lineHeight: 22 },

  // Logout
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 20, borderRadius: 20, borderWidth: 1 },
  logoutText: { fontSize: 16, fontWeight: '700' },

  cameraBadge: { position: 'absolute', bottom: 10, right: 0, width: 30, height: 30, borderRadius: 15, borderWidth: 2, justifyContent: 'center', alignItems: 'center' },
  successOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 28, zIndex: 999, backgroundColor: 'rgba(0,0,0,0.5)' },
  successCard: { width: '100%', maxWidth: 350, borderRadius: 28, overflow: 'hidden', borderWidth: 1.5 },
  successGrad: { paddingHorizontal: 28, paddingVertical: 36, alignItems: 'center' },
  successIconCircle: { width: 84, height: 84, borderRadius: 42, justifyContent: 'center', alignItems: 'center', marginBottom: 20, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.5, shadowRadius: 20, elevation: 12 },
  successTitle: { fontSize: 24, fontWeight: '900', textAlign: 'center', marginBottom: 8, letterSpacing: -0.5 },
  successSub: { fontSize: 14, lineHeight: 21, textAlign: 'center' },
});
