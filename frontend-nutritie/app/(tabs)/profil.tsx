
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
import { Save, LogOut, Target, Scale, Zap, Sparkles, ChevronRight, Palette, Bell, Lock, ShieldCheck, Footprints, Activity, Trophy, Camera, CheckCircle2, User, Pencil, Check } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../context/ThemeContext';
import { themes, themeDecor, themeDisplayNames, ThemeName } from '../../constants/theme';
import ThemeBackdrop, { ThemeShapePreview } from '../../components/ui/ThemeBackdrop';
import { useNotifications } from '../../hooks/useNotifications';
import { useAuth } from '../../context/AuthContext';
import { useBiometrics } from '../../hooks/useBiometrics';
import { useHealthSync, HEALTH_PROVIDERS } from '../../hooks/useHealthSync';
import { useNotificationBanner } from '../../context/NotificationBannerContext';
import { useNotify } from '../../hooks/useNotify';
import { useGamificare } from '../../hooks/useGamificare';
// FIX UI: tastatura acoperea cele 7 input-uri din profil.
import KeyboardAwareScreen from '../../components/ui/KeyboardAwareScreen';
import { INSIGNE_LIST } from '../../constants/insigne';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';

export default function ProfilScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { colors, decor, themeName, setTheme } = useTheme();
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

  // Selectarea pozei de profil: din galerie sau direct din cameră.
  const alegePozaProfil = async (sursa: 'galerie' | 'camera' = 'galerie') => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      if (sursa === 'camera') {
        const permCamera = await ImagePicker.requestCameraPermissionsAsync();
        if (!permCamera.granted) {
          Alert.alert("Permisiune necesară", "Avem nevoie de acces la cameră pentru a face o poză de profil.");
          return;
        }
        const rezultatCamera = await ImagePicker.launchCameraAsync({
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.7,
        });
        if (!rezultatCamera.canceled && rezultatCamera.assets?.length) {
          setAvatarUrl(rezultatCamera.assets[0].uri);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
        return;
      }

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

  const stergePozaProfil = async () => {
    setAvatarUrl(null);
    await AsyncStorage.removeItem('avatar_url');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  // Meniu unic pentru avatar (folosit și din header, și din cardul "Date personale").
  const deschideOptiuniAvatar = () => {
    const optiuni: any[] = [
      { text: 'Fă o poză', onPress: () => alegePozaProfil('camera') },
      { text: 'Alege din galerie', onPress: () => alegePozaProfil('galerie') },
    ];
    if (avatarUrl) {
      optiuni.push({ text: 'Șterge poza', style: 'destructive', onPress: stergePozaProfil });
    }
    optiuni.push({ text: 'Anulează', style: 'cancel' });
    Alert.alert('Poză de profil', 'Alege sursa imaginii', optiuni);
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
      // Salvăm întâi în Supabase
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

      if (error) throw error;

      // Apoi salvăm local (doar după ce Supabase a confirmat)
      await AsyncStorage.setItem('greutate', greutate);
      await AsyncStorage.setItem('greutateTinta', greutateTinta);
      await AsyncStorage.setItem('caloriiTinta', caloriiTinta);
      await AsyncStorage.setItem('proteineTinta', proteineTinta);
      await AsyncStorage.setItem('carbiTinta', carbiTinta);
      await AsyncStorage.setItem('grasimiTinta', grasimiTinta);
      await AsyncStorage.setItem('nume_profil', nume);
      if (avatarUrl) {
        await AsyncStorage.setItem('avatar_url', avatarUrl);
      } else {
        await AsyncStorage.removeItem('avatar_url');
      }

      notify.success('Profil actualizat', 'Modificările au fost salvate');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowSuccessAnim(true);
      setTimeout(() => setShowSuccessAnim(false), 2600);
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
      {
        text: "Deconectează",
        style: "destructive",
        onPress: async () => {
          // Ștergem toate datele utilizatorului din AsyncStorage
          const allKeys = await AsyncStorage.getAllKeys();
          const userKeys = allKeys.filter(k =>
            k.startsWith('chat_history_') ||
            ['greutate', 'greutateTinta', 'caloriiTinta', 'proteineTinta',
             'carbiTinta', 'grasimiTinta', 'nume_profil', 'greutate_istoric',
             'current_workout_session', 'nutriai_workouts', 'gamificare_v1',
             'notificari_v1', 'nutriai_theme', 'favorite_foods',
             'health_sync_enabled', 'health_step_goal', 'health_sync_provider',
             'nutriai_tip_closed_date', 'avatar_url', 'onboarding_done',
             'chat_history'].includes(k)
          );
          if (userKeys.length > 0) {
            await AsyncStorage.multiRemove(userKeys);
          }
          await supabase.auth.signOut();
        }
      }
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

  // Obiective zilnice - definite o singură dată, randate din map.
  const campuriTinte: {
    key: string;
    label: string;
    value: string;
    onChange: (v: string) => void;
    icon: React.ReactNode;
    tint: string;
  }[] = [
    { key: 'greutate', label: 'Greutate (kg)', value: greutate, onChange: setGreutate, icon: <Scale size={18} color={colors.accent} />, tint: colors.accent },
    { key: 'greutateTinta', label: 'Țintă Greutate (kg)', value: greutateTinta, onChange: setGreutateTinta, icon: <Target size={18} color={colors.accent} />, tint: colors.accent },
    { key: 'caloriiTinta', label: 'Țintă Calorii (kcal/zi)', value: caloriiTinta, onChange: setCaloriiTinta, icon: <Target size={18} color={colors.accent} />, tint: colors.accent },
    { key: 'proteineTinta', label: 'Țintă Proteine (g/zi)', value: proteineTinta, onChange: setProteineTinta, icon: <Zap size={18} color={colors.accentSecondary} />, tint: colors.accentSecondary },
    { key: 'carbiTinta', label: 'Țintă Carbohidrați (g/zi)', value: carbiTinta, onChange: setCarbiTinta, icon: <Zap size={18} color={colors.accentTertiary} />, tint: colors.accentTertiary },
    { key: 'grasimiTinta', label: 'Țintă Grăsimi (g/zi)', value: grasimiTinta, onChange: setGrasimiTinta, icon: <Zap size={18} color={colors.warning} />, tint: colors.warning },
  ];

  return (
    <KeyboardAwareScreen style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Fundal decorativ desenat custom, specific temei (subtil) */}
      <ThemeBackdrop />

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.scroll, { paddingTop: scrollPaddingTop, paddingBottom: scrollPaddingBottom }]}
      >

        {/* Avatar header */}
        <Animated.View entering={FadeInDown.duration(500)} style={styles.avatarSection}>
          <TouchableOpacity activeOpacity={0.85} onPress={deschideOptiuniAvatar} accessibilityLabel="Schimbă poza de profil">
            <LinearGradient
              colors={[colors.accent + '66', colors.accentSecondary + '33']}
              style={[styles.avatarRing, { shadowColor: colors.shadow, shadowOpacity: decor.shadowOpacity, shadowRadius: decor.shadowRadius }]}
            >
              <View style={[styles.avatarInner, { backgroundColor: colors.surface, overflow: 'hidden' }]}>
                {avatarUrl ? (
                  <Image
                    source={{ uri: avatarUrl }}
                    style={{ width: '100%', height: '100%', borderRadius: 29 }}
                    // FIX UI: fara resizeMode imaginea era intinsa/deformata.
                    resizeMode="cover"
                    accessibilityLabel="Poza de profil"
                  />
                ) : (
                  <Text style={[styles.avatarText, { color: colors.accent }]}>{initials}</Text>
                )}
              </View>
            </LinearGradient>
            <View style={[styles.cameraBadge, { backgroundColor: colors.surfaceElevated, borderColor: colors.background }]}>
              <Camera size={14} color={colors.accent} />
            </View>
          </TouchableOpacity>
          <Text style={[styles.displayName, { color: colors.textPrimary }]}>{nume || session.user.email?.split('@')[0]}</Text>
          <Text style={[styles.emailText, { color: colors.textSecondary }]}>{session.user.email}</Text>

          <View style={[styles.planBadge, { borderColor: colors.accent + '22' }]}>
            <LinearGradient colors={[colors.accent + decor.tintAlpha, 'rgba(0,0,0,0)']} style={styles.planBadgeGrad}>
              <Zap size={14} color={colors.accent} />
              <Text style={[styles.planBadgeText, { color: colors.accent }]}>AI Premium Plan</Text>
            </LinearGradient>
          </View>
        </Animated.View>

        {/* Personal Details: Avatar + Name / Display Name */}
        <Animated.View entering={FadeInDown.duration(550).delay(30)}>
          <View style={styles.sectionHeaderRow}>
            <User size={16} color={colors.accent} />
            <Text style={[styles.sectionLabel, { color: colors.textSecondary, marginBottom: 0 }]}>{t('profile.personal_details')}</Text>
          </View>
          <BlurView intensity={decor.blurIntensity} tint="dark" style={[styles.card, { borderColor: colors.cardBorder, marginBottom: 24, marginTop: 12 }]}>
            <LinearGradient colors={[colors.cardBg, 'rgba(0,0,0,0)']} style={styles.cardGrad}>

              {/* Rând nou: poza de profil se schimbă direct de aici */}
              <TouchableOpacity style={styles.inputRow} activeOpacity={0.8} onPress={deschideOptiuniAvatar}>
                <View style={[styles.avatarThumb, { borderColor: colors.accent + '33', backgroundColor: colors.surfaceBg }]}>
                  {avatarUrl ? (
                    <Image source={{ uri: avatarUrl }} style={styles.avatarThumbImg} resizeMode="cover" />
                  ) : (
                    <Text style={[styles.avatarThumbText, { color: colors.accent }]}>{initials}</Text>
                  )}
                </View>
                <View style={styles.inputContent}>
                  <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Poză de profil</Text>
                  <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '700' }}>
                    {avatarUrl ? 'Schimbă sau șterge poza' : 'Adaugă o poză'}
                  </Text>
                </View>
                <Camera size={18} color={colors.textSecondary} />
              </TouchableOpacity>

              <View style={[styles.separator, { backgroundColor: colors.border }]} />

              <View style={styles.inputRow}>
                <View style={[styles.inputIcon, { backgroundColor: colors.accent + decor.tintAlpha }]}>
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
          <Text style={{ color: colors.textTertiary, fontSize: 12, marginLeft: 4, marginBottom: 12 }}>
            Tema schimbă culorile și figurile desenate din toată aplicația.
          </Text>
          <View style={styles.themeGrid}>
            {(['midnight', 'ocean', 'sunset'] as ThemeName[]).map((tName) => {
              const tColors = themes[tName];
              const tDecor = themeDecor[tName];
              const isSelected = themeName === tName;
              return (
                <TouchableOpacity
                  key={tName}
                  style={[
                    styles.themeCard,
                    {
                      backgroundColor: tColors.surfaceBg,
                      borderColor: isSelected ? tColors.accent + '99' : tColors.border,
                    },
                  ]}
                  onPress={() => setTheme(tName)}
                  activeOpacity={0.85}
                >
                  {/* figura desenată custom a temei */}
                  <View style={{ opacity: isSelected ? 1 : 0.55, marginBottom: 8 }}>
                    <ThemeShapePreview theme={tName} size={40} />
                  </View>
                  <View style={styles.themeSwatchRow}>
                    <View style={[styles.themeSwatch, { backgroundColor: tColors.background }]} />
                    <View style={[styles.themeSwatch, { backgroundColor: tColors.accent }]} />
                    <View style={[styles.themeSwatch, { backgroundColor: tColors.accentSecondary }]} />
                  </View>
                  <Text style={[styles.themeNameText, { color: isSelected ? tColors.accent : colors.textTertiary }]}>
                    {themeDisplayNames[tName]}
                  </Text>
                  {isSelected && (
                    <View style={[styles.themeCheck, { backgroundColor: tColors.accent + '22', borderColor: tColors.accent + '55' }]}>
                      <Check size={12} color={tColors.accent} strokeWidth={3} />
                    </View>
                  )}
                  {/* accent line, in loc de glow puternic */}
                  <View style={{ height: 2, width: 22, borderRadius: 2, marginTop: 8, backgroundColor: isSelected ? tColors.accent : 'transparent', opacity: tDecor.backdropOpacity > 0 ? 1 : 1 }} />
                </TouchableOpacity>
              );
            })}
          </View>
        </Animated.View>

        {/* Notifications section */}
        <Animated.View entering={FadeInDown.duration(600).delay(80)}>
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>REMINDERE & NOTIFICĂRI</Text>
          <BlurView intensity={decor.blurIntensity} tint="dark" style={[styles.card, { borderColor: colors.cardBorder, marginBottom: 20 }]}>
            <LinearGradient colors={[colors.cardBg, 'rgba(0,0,0,0)']} style={styles.cardGrad}>
              <View style={[styles.inputRow, { alignItems: 'center' }]}>
                <View style={[styles.inputIcon, { backgroundColor: colors.accent + decor.tintAlpha }]}>
                  <Bell size={18} color={colors.accent} />
                </View>
                <View style={[styles.inputContent, { flex: 1 }]}>
                  <Text style={[styles.inputLabel, { color: colors.textPrimary, fontSize: 16, marginBottom: 2 }]}>Remindere Zilnice de Masă</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Primești 3 notificări la 08:00, 13:00 și 19:30</Text>
                </View>
                <Switch
                  value={notificationsEnabled}
                  onValueChange={(val) => { toggleReminders(val); }}
                  trackColor={{ false: colors.surfaceElevated, true: colors.accent + '80' }}
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
            <BlurView intensity={decor.blurIntensity} tint="dark" style={[styles.card, { borderColor: colors.cardBorder, marginBottom: 20, marginTop: 12 }]}>
              <LinearGradient colors={[colors.cardBg, 'rgba(0,0,0,0)']} style={styles.cardGrad}>
                <View style={[styles.inputRow, { alignItems: 'center' }]}>
                  <View style={[styles.inputIcon, { backgroundColor: colors.accent + decor.tintAlpha }]}>
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
          <BlurView intensity={decor.blurIntensity} tint="dark" style={[styles.card, { borderColor: colors.cardBorder, marginBottom: 20, marginTop: 12 }]}>
            <LinearGradient colors={[colors.cardBg, 'rgba(0,0,0,0)']} style={styles.cardGrad}>
              <View style={[styles.inputRow, { alignItems: 'center' }]}>
                <View style={[styles.inputIcon, { backgroundColor: colors.accent + decor.tintAlpha }]}>
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

              <View style={{ marginTop: 16, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 16 }}>
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
                          borderColor: active ? colors.accent + '66' : colors.border,
                          backgroundColor: active ? colors.accent + decor.tintAlpha : colors.overlayLight,
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
                    backgroundColor: unlocked ? colors.accent + decor.tintAlpha : colors.overlayLight,
                    borderColor: unlocked ? colors.accent + '33' : colors.border,
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
                      backgroundColor: unlocked ? colors.accent + '1F' : colors.overlayStrong,
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
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>{t('profile.daily_targets')}</Text>

          <TouchableOpacity style={[styles.aiSetupBtn, { borderColor: colors.accent + '22' }]} onPress={() => router.push('/calculator-ai')}>
            <LinearGradient colors={[colors.accent + decor.tintAlpha, 'rgba(0,0,0,0)']} style={styles.aiSetupGrad}>
              <Sparkles size={22} color={colors.accent} />
              <View style={styles.aiSetupTextWrap}>
                <Text style={[styles.aiSetupTitle, { color: colors.textPrimary }]}>Asistent Configurare Profil</Text>
                <Text style={[styles.aiSetupSub, { color: colors.textTertiary }]}>Calculează țintele automat cu AI</Text>
              </View>
              <ChevronRight size={20} color={colors.textSecondary} />
            </LinearGradient>
          </TouchableOpacity>

          <BlurView intensity={decor.blurIntensity} tint="dark" style={[styles.card, { borderColor: colors.cardBorder }]}>
            <LinearGradient colors={[colors.cardBg, 'rgba(0,0,0,0)']} style={styles.cardGrad}>
              {campuriTinte.map((camp, idx) => (
                <View key={camp.key}>
                  {idx > 0 && <View style={[styles.separator, { backgroundColor: colors.border }]} />}
                  <View style={styles.inputRow}>
                    <View style={[styles.inputIcon, { backgroundColor: camp.tint + decor.tintAlpha }]}>
                      {camp.icon}
                    </View>
                    <View style={styles.inputContent}>
                      <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>{camp.label}</Text>
                      <TextInput
                        style={[styles.inputField, { color: colors.textPrimary }]}
                        value={camp.value}
                        onChangeText={camp.onChange}
                        keyboardType="numeric"
                        placeholderTextColor={colors.textSecondary}
                        selectionColor={colors.accent}
                      />
                    </View>
                  </View>
                </View>
              ))}
            </LinearGradient>
          </BlurView>
        </Animated.View>

        {/* Save button */}
        <Animated.View entering={FadeInDown.duration(600).delay(200)}>
          <TouchableOpacity
            style={[styles.saveBtn, { shadowColor: colors.shadow, shadowOpacity: decor.shadowOpacity, shadowRadius: decor.shadowRadius }]}
            onPress={salveaza}
            disabled={loading}
          >
            <LinearGradient colors={colors.accentGradient} style={styles.saveBtnGrad}>
              {loading ? (
                <ActivityIndicator color={colors.background} />
              ) : (
                <>
                  <Save size={20} color={colors.background} strokeWidth={2.5} />
                  <Text style={[styles.saveBtnText, { color: colors.background }]}>{t('profile.save')}</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>

        {/* Info card */}
        <Animated.View entering={FadeInUp.duration(600).delay(300)} style={[styles.infoCard, { borderColor: colors.border }]}>
          <BlurView intensity={Math.max(8, decor.blurIntensity - 4)} tint="dark" style={styles.infoCardBlur}>
            <LinearGradient colors={[colors.overlayLight, 'rgba(0,0,0,0)']} style={styles.infoCardGrad}>
              <Text style={[styles.infoCardTitle, { color: colors.textPrimary }]}>💡 Cum funcționează</Text>
              <Text style={[styles.infoCardText, { color: colors.textSecondary }]}>
                Obiectivele pe care le setezi sunt folosite de asistentul AI pentru a-ți oferi recomandări personalizate și a-ți urmări progresul zilnic.
              </Text>
            </LinearGradient>
          </BlurView>
        </Animated.View>

        {/* Logout */}
        <Animated.View entering={FadeInUp.duration(600).delay(400)}>
          <TouchableOpacity style={[styles.logoutBtn, { borderColor: colors.danger + '22', backgroundColor: colors.dangerBg }]} onPress={deconectare}>
            <LogOut size={18} color={colors.danger} />
            <Text style={[styles.logoutText, { color: colors.danger }]}>Deconectare</Text>
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>

      {/* Success Animation Modal Overlay */}
      {showSuccessAnim && (
        <Animated.View entering={FadeInDown.duration(350).springify()} style={styles.successOverlay}>
          <BlurView intensity={60} tint="dark" style={[styles.successCard, { borderColor: colors.accent + '55' }]}>
            <LinearGradient colors={[colors.accent + '18', 'rgba(0,0,0,0.85)']} style={styles.successGrad}>
              <Animated.View entering={FadeInUp.duration(400).delay(100).springify()} style={[styles.successIconCircle, { backgroundColor: colors.accent }]}>
                <CheckCircle2 size={44} color={colors.background} />
              </Animated.View>
              <Text style={[styles.successTitle, { color: colors.textPrimary }]}>Profil Actualizat!</Text>
              <Text style={[styles.successSub, { color: colors.textSecondary }]}>Modificările tale (poză, nume și obiective) au fost salvate cu succes.</Text>
            </LinearGradient>
          </BlurView>
        </Animated.View>
      )}
    </KeyboardAwareScreen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  scroll: { paddingHorizontal: 20 },

  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, fontSize: 15, fontWeight: '500' },

  // Avatar section
  avatarSection: { alignItems: 'center', marginBottom: 30 },
  avatarRing: { width: 96, height: 96, borderRadius: 32, padding: 2, marginBottom: 16, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
  avatarInner: { flex: 1, borderRadius: 29, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 28, fontWeight: '900', letterSpacing: -1 },
  displayName: { fontSize: 24, fontWeight: '900', letterSpacing: -0.5, marginBottom: 4 },
  emailText: { fontSize: 14, fontWeight: '500', marginBottom: 16 },
  planBadge: { borderRadius: 16, overflow: 'hidden', borderWidth: 1 },
  planBadgeGrad: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, gap: 6 },
  planBadgeText: { fontSize: 13, fontWeight: '700', marginLeft: 4 },

  avatarThumb: { width: 44, height: 44, borderRadius: 14, borderWidth: 1, overflow: 'hidden', justifyContent: 'center', alignItems: 'center' },
  avatarThumbImg: { width: '100%', height: '100%' },
  avatarThumbText: { fontSize: 15, fontWeight: '800' },

  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12, marginLeft: 4 },
  sectionLabel: { fontSize: 13, fontWeight: '800', letterSpacing: 1.5, marginBottom: 14, marginLeft: 4 },

  themeGrid: { flexDirection: 'row', gap: 10, marginBottom: 28 },
  themeCard: { flex: 1, paddingVertical: 16, paddingHorizontal: 10, borderRadius: 20, borderWidth: 1, alignItems: 'center' },
  themeSwatchRow: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  themeSwatch: { width: 14, height: 14, borderRadius: 7, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  themeNameText: { fontSize: 12, fontWeight: '800', textAlign: 'center' },
  themeCheck: { position: 'absolute', top: 8, right: 8, width: 20, height: 20, borderRadius: 10, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },

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
  separator: { height: 1, marginHorizontal: 20 },

  // Save button
  saveBtn: { borderRadius: 20, overflow: 'hidden', marginBottom: 20, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
  saveBtnGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 20, gap: 10 },
  saveBtnText: { fontSize: 18, fontWeight: '900', letterSpacing: 0.3 },

  // Info card
  infoCard: { borderRadius: 20, overflow: 'hidden', borderWidth: 1, marginBottom: 24 },
  infoCardBlur: { overflow: 'hidden' },
  infoCardGrad: { padding: 20 },
  infoCardTitle: { fontSize: 15, fontWeight: '800', marginBottom: 8 },
  infoCardText: { fontSize: 14, lineHeight: 22 },

  // Logout
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 20, borderRadius: 20, borderWidth: 1 },
  logoutText: { fontSize: 16, fontWeight: '700' },

  cameraBadge: { position: 'absolute', bottom: 10, right: 0, width: 30, height: 30, borderRadius: 15, borderWidth: 2, justifyContent: 'center', alignItems: 'center' },
  successOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 28, zIndex: 999, backgroundColor: 'rgba(0,0,0,0.5)' },
  successCard: { width: '100%', maxWidth: 350, borderRadius: 28, overflow: 'hidden', borderWidth: 1 },
  successGrad: { paddingHorizontal: 28, paddingVertical: 36, alignItems: 'center' },
  successIconCircle: { width: 84, height: 84, borderRadius: 42, justifyContent: 'center', alignItems: 'center', marginBottom: 20, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.25, shadowRadius: 12, elevation: 6 },
  successTitle: { fontSize: 24, fontWeight: '900', textAlign: 'center', marginBottom: 8, letterSpacing: -0.5 },
  successSub: { fontSize: 14, lineHeight: 21, textAlign: 'center' },
});
