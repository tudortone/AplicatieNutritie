
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, Modal,
  ScrollView, RefreshControl, Alert, ActivityIndicator, Platform, Switch, Image, Linking, Share,
  useWindowDimensions,
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { Save, LogOut, Zap, Sparkles, ChevronRight, Palette, Bell, Lock, ShieldCheck, Footprints, Activity, Camera, CheckCircle2, User, Pencil, Crown, Mail, FileText, Watch, Globe, Download } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../context/ThemeContext';
import { themes, themeDisplayNames, ThemeName } from '../../constants/theme';
import { changeLanguage, SUPPORTED_LANGUAGES, LANGUAGE_NAMES } from '../../i18n';
import { useNotifications } from '../../hooks/useNotifications';
import { getConsent, cancelManagedReminders } from '../../lib/notificationConsent';
import { DEFAULT_MEAL_REMINDERS } from '../../lib/notifications';
import { FlowIcon } from '../../components/ui/FlowIcon';
import { useAuth } from '../../context/AuthContext';
import { useAds } from '../../context/AdsContext';
import { useFlowCredits } from '../../context/FlowCreditsContext';
import { useBiometrics } from '../../hooks/useBiometrics';
import { useHealthSync } from '../../hooks/useHealthSync';
import { useNotificationBannerActions } from '../../context/NotificationBannerContext';
import { useNotify } from '../../hooks/useNotify';
import { useGamificareData } from '../../context/GamificareContext';
// FIX UI: tastatura acoperea cele 7 input-uri din profil.
import KeyboardAwareScreen from '../../components/ui/KeyboardAwareScreen';
import { INSIGNE_LIST } from '../../constants/insigne';
import AchievementCard from '../../components/gamification/AchievementCard';
import { getAchievementGridColumns } from '../../lib/achievementLayout';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import { FeedbackModal } from '../../components/ui/FeedbackModal';
import { DeleteAccountModal } from '../../components/ui/DeleteAccountModal';
import { ConfirmSheet } from '../../components/ui/ConfirmSheet';
import { WatchSelectorSheet, WatchSelectorSheetRef } from '../../components/ui/WatchSelectorSheet';
import { API_URL } from '../../constants/config';
import { API_PREFIX } from '../../lib/api';
import { getLegalUrls } from '../../lib/legalUrls';
import { salveazaTargeturiPending, stergeTargeturiPending, citesteTargeturiPending } from '../../lib/sincronizeazaTargeturi';
import { clearOfflineQueue } from '../../lib/offlineQueue';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { finalizeConfirmedAccountDeletion } from '../../lib/accountDeletion';
import { buildCompleteUserExport, fetchServerGdprExport } from '../../lib/gdprExport';

// Adresa oficiala de suport pentru sesizari si suport utilizatori.
const EMAIL_SUPORT = process.env.EXPO_PUBLIC_SUPPORT_EMAIL?.trim() || 'supportgetflow@gmail.com';

const MEAL_REMINDER_LABEL_KEYS: Record<string, string> = {
  reminder_mic_dejun: 'chat.recipeGen.tipMasa.breakfast',
  reminder_pranz: 'chat.recipeGen.tipMasa.lunch',
  reminder_cina: 'chat.recipeGen.tipMasa.dinner',
};

export default function ProfilScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { width: windowWidth, fontScale } = useWindowDimensions();
  const achievementColumns = getAchievementGridColumns(windowWidth, fontScale);
  const [achievementGridWidth, setAchievementGridWidth] = useState(0);
  const achievementCardWidth = achievementColumns === 2 && achievementGridWidth > 0
    ? (achievementGridWidth - 10) / 2
    : '100%';
  const { colors, themeName, setTheme } = useTheme();
  const { enabled: notificationsEnabled, toggleReminders, isExpoGo } = useNotifications();
  const { isSupported, biometricType, isEnabled, toggleBiometric } = useBiometrics();
  const { isEnabled: healthSyncEnabled, platformName, toggleSync: toggleHealthSync, providerInfo } = useHealthSync();
  const watchSheetRef = React.useRef<WatchSelectorSheetRef>(null);
  const { session, user, loadingAuth } = useAuth();
  const { privacyOptionsRequired, showPrivacyOptions } = useAds();
  const flowCredits = useFlowCredits();
  const { showBanner } = useNotificationBannerActions();
  const notify = useNotify();
  const { insigne } = useGamificareData();
  const { scrollPaddingTop, scrollPaddingBottom, horizontalPadding } = useResponsiveLayout();
  const [greutate, setGreutate] = useState('75');
  const [greutateTinta, setGreutateTinta] = useState('70');
  const [caloriiTinta, setCaloriiTinta] = useState('2000');
  const [proteineTinta, setProteineTinta] = useState('150');
  const [carbiTinta, setCarbiTinta] = useState('250');
  const [grasimiTinta, setGrasimiTinta] = useState('70');
  const [nume, setNume] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [showSuccessAnim, setShowSuccessAnim] = useState(false);
  const [feedbackVisible, setFeedbackVisible] = useState(false);
  const [deleteAccountModalVisible, setDeleteAccountModalVisible] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const reduceMotion = useReducedMotion();

  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [languageModalVisible, setLanguageModalVisible] = useState(false);
  const [languageQuery, setLanguageQuery] = useState('');
  const [achievementsModalVisible, setAchievementsModalVisible] = useState(false);

  const normalizedLanguageQuery = languageQuery.trim().toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const sortedLanguages = [...SUPPORTED_LANGUAGES].sort((a, b) => new Intl.Collator(i18n.language || 'en').compare(LANGUAGE_NAMES[a].label, LANGUAGE_NAMES[b].label));
  const filteredLanguages = sortedLanguages.filter((lang) => {
    const label = LANGUAGE_NAMES[lang].label.toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return !normalizedLanguageQuery || label.includes(normalizedLanguageQuery) || lang.includes(normalizedLanguageQuery);
  });
  const sortedAchievements = [...INSIGNE_LIST].sort((a, b) => t(a.numeI18n, { defaultValue: a.nume }).localeCompare(t(b.numeI18n, { defaultValue: b.nume }), i18n.language || 'en'));

  const stergereContDefinitiva = () => {
    setDeleteAccountModalVisible(true);
  };

  const executaStergereaContului = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}${API_PREFIX}/user/delete-account`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
        },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.eroare || t('profile.deleteAccountFailed'));
      }
      const userIdSters = session?.user.id;
      if (!userIdSters) throw new Error(t('profile.deleteAccountFailed'));
      const { localCleanupComplete } = await finalizeConfirmedAccountDeletion({
        userId: userIdSters,
        signOut: () => supabase.auth.signOut(),
      });
      if (!localCleanupComplete) {
        Alert.alert(
          t('profile.accountDeletedTitle'),
          t('profile.accountDeletedLocalCleanupPending'),
        );
        return;
      }
      showBanner({
        title: t('profile.accountDeletedTitle'),
        message: t('profile.accountDeletedMessage'),
        type: 'info',
      });
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message || t('profile.deleteAccountFailed'));
    } finally {
      setLoading(false);
    }
  };

  const exportaDateleMele = async () => {
    const userId = session?.user.id;
    const token = session?.access_token;
    if (!userId || !token) {
      Alert.alert(t('common.error'), t('profile.exportDataFailed'));
      return;
    }

    try {
      setLoading(true);
      const serverExport = await fetchServerGdprExport({
        apiUrl: API_URL,
        apiPrefix: API_PREFIX,
        token,
        expectedUserId: userId,
      });
      const completeExport = await buildCompleteUserExport({ userId, serverExport });
      const json = `${JSON.stringify(completeExport, null, 2)}\n`;
      const day = new Date().toISOString().slice(0, 10);
      const filename = `getflow-data-export-${day}.json`;

      if (Platform.OS === 'android') {
        const permission = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (!permission.granted) return;
        const uri = await FileSystem.StorageAccessFramework.createFileAsync(
          permission.directoryUri,
          filename,
          'application/json',
        );
        await FileSystem.writeAsStringAsync(uri, json, { encoding: FileSystem.EncodingType.UTF8 });
      } else {
        const base = FileSystem.cacheDirectory || FileSystem.documentDirectory;
        if (!base) throw new Error('GDPR_EXPORT_STORAGE_UNAVAILABLE');
        const uri = `${base}${filename}`;
        await FileSystem.writeAsStringAsync(uri, json, { encoding: FileSystem.EncodingType.UTF8 });
        await Share.share({ url: uri, title: t('profile.exportDataTitle') });
      }

      showBanner({
        title: t('profile.exportDataSuccessTitle'),
        message: t('profile.exportDataSuccessMessage'),
        type: 'success',
      });
    } catch {
      Alert.alert(t('common.error'), t('profile.exportDataFailed'));
    } finally {
      setLoading(false);
    }
  };

  const initProfile = useCallback(async () => {
    if (loadingAuth) return;
    setCheckingSession(true);
    try {
      if (session) {
        const metadata = user?.user_metadata || session.user.user_metadata || {};
        const pending = await citesteTargeturiPending(session.user.id);
        const pTargets = pending?.userId === session.user.id ? pending.targets : undefined;

        let g = pTargets?.greutate ?? metadata.greutate;
        let gt = pTargets?.greutateTinta ?? metadata.greutateTinta;
        let c = pTargets?.caloriiTinta ?? metadata.caloriiTinta;
        let p = pTargets?.proteineTinta ?? metadata.proteineTinta;
        let cb = pTargets?.carbiTinta ?? metadata.carbiTinta;
        let gr = pTargets?.grasimiTinta ?? metadata.grasimiTinta;

        let nm = pTargets?.nume || metadata.nume || metadata.display_name;
        let av = pTargets?.avatar_url || metadata.avatar_url;

        setNume(nm ? String(nm) : (session.user.email?.split('@')[0] || 'Utilizator'));
        setAvatarUrl(av ? String(av) : null);

        setGreutate(g !== undefined && g !== null ? String(g) : '75');
        setGreutateTinta(gt !== undefined && gt !== null ? String(gt) : '70');
        setCaloriiTinta(c !== undefined && c !== null ? String(c) : '2000');
        setProteineTinta(p !== undefined && p !== null ? String(p) : '150');
        setCarbiTinta(cb !== undefined && cb !== null ? String(cb) : '250');
        setGrasimiTinta(gr !== undefined && gr !== null ? String(gr) : '70');
      }
    } catch (e) {
      console.warn('Eroare încărcare profil:', e);
    } finally {
      setCheckingSession(false);
    }
  }, [loadingAuth, session, user]);

  useEffect(() => {
    initProfile();
  }, [initProfile]);

  const alegePozaProfil = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      if (Platform.OS === 'ios') {
        const permisiune = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permisiune.granted) {
          Alert.alert(t('alerts.titluri.permisiuneNecesara'), t('alerts.mesaje.permisiuneGaleriaProfil'));
          return;
        }
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
        title: t('profile.incompleteGoalsTitle'),
        message: t('profile.incompleteGoalsMessage'),
        type: 'warning'
      });
      return;
    }
    
    // Persistare locală, folosită atât pe succes cât și pe eșec backend. Fără
    // ea, o eroare Supabase sărea scrierile locale și afișa fals „Salvat local".
    const salveazaLocal = async () => {
      await AsyncStorage.setItem('greutate', greutate);
      await AsyncStorage.setItem('greutateTinta', greutateTinta);
      await AsyncStorage.setItem('caloriiTinta', caloriiTinta);
      await AsyncStorage.setItem('proteineTinta', proteineTinta);
      await AsyncStorage.setItem('carbiTinta', carbiTinta);
      await AsyncStorage.setItem('grasimiTinta', grasimiTinta);
      await AsyncStorage.setItem('nume_profil', nume);
      if (avatarUrl) await AsyncStorage.setItem('avatar_url', avatarUrl);
    };

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
      await salveazaLocal();
      // REV-003: Serverul a confirmat -> curățăm payload-ul pending pentru acest utilizator
      if (session?.user?.id) {
        await stergeTargeturiPending(session.user.id);
      }

      notify.success(t('profile.profileUpdatedTitle'), t('profile.profileUpdatedDesc'));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowSuccessAnim(true);
      setTimeout(() => setShowSuccessAnim(false), 2600);
    } catch {
      // Backend indisponibil: persistăm totuși local, ca mesajul să fie adevărat
      // (FIT-002). Dacă nici salvarea locală nu reușește, raportăm eșec.
      let salvatLocal = true;
      try {
        await salveazaLocal();
        // REV-003: serverul e indisponibil -> marcăm țintele pending exclusiv în cheia
        // utilizatorului curent autentificat, ca useMeseAzi să le citească corect.
        if (session?.user?.id) {
          await salveazaTargeturiPending(session.user.id, {
            greutate: parseFloat(greutate) || 75,
            greutateTinta: parseFloat(greutateTinta) || 70,
            caloriiTinta: parseInt(caloriiTinta, 10) || 2000,
            proteineTinta: parseInt(proteineTinta, 10) || 150,
            carbiTinta: parseInt(carbiTinta, 10) || 250,
            grasimiTinta: parseInt(grasimiTinta, 10) || 70,
            nume: nume.trim() || undefined,
            avatar_url: avatarUrl || undefined,
          });
        }
      } catch {
        salvatLocal = false;
      }
      showBanner({
        title: salvatLocal ? t('profile.savedLocalTitle') : t('profile.saveFailedTitle'),
        message: salvatLocal
          ? t('profile.savedLocalMessage')
          : t('profile.saveFailedMessage'),
        type: salvatLocal ? 'info' : 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  const deconectare = async () => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
    setShowLogoutConfirm(true);
  };

  const confirmDeconectare = async () => {
    setIsLoggingOut(true);
    try {
      // Ștergem toate datele utilizatorului din AsyncStorage
      const allKeys = await AsyncStorage.getAllKeys();
      const userKeys = allKeys.filter(k =>
        k.startsWith('chat_history_') ||
        ['greutate', 'greutateTinta', 'caloriiTinta', 'proteineTinta',
         'carbiTinta', 'grasimiTinta', 'targeturi_pending_sync',
         'nume_profil', 'greutate_istoric',
         'sex', 'varsta', 'inaltime', 'nivel_activitate', 'obiectiv',
         'current_workout_session', 'nutriai_workouts', 'gamificare_v1',
         'notificari_v1', 'nutriai_theme', 'favorite_foods',
         'health_sync_enabled', 'health_step_goal', 'health_sync_provider',
         'nutriai_tip_closed_date', 'avatar_url', 'onboarding_done',
         'chat_history'].includes(k)
      );
      if (userKeys.length > 0) {
        await AsyncStorage.multiRemove(userKeys);
      }
      // TASK-16: la logout anulăm reminderele contului anterior, ca să nu
      // se mai declanșeze sub contul următor. Consimțământul rămâne persistat
      // la nivel de dispozitiv (nu e legat de cont).
      await cancelManagedReminders();
      // BUG-067: coada offline e globală (nu scoped pe cont) — dacă rămâne
      // după logout, payload-urile contului A s-ar procesa sub sesiunea B
      // (payload invalid / date private expuse). O golim explicit la logout.
      await clearOfflineQueue();
      await supabase.auth.signOut();
    } finally {
      setIsLoggingOut(false);
      setShowLogoutConfirm(false);
    }
  };

  // TASK-16: comutarea reminderelor e un consimțământ explicit. Prima activare
  // solicită confirmarea înainte de a programa notificări; togeurile ulterioare
  // (după un accept cu grantedAt setat) doar comută starea, fără re-prompt OS.
  const schimbaRemindere = async (val: boolean) => {
    if (val) {
      const stare = await getConsent();
      if (!stare.grantedAt) {
        Alert.alert(
          t('notifications.consentTitle'),
          t('notifications.consentBody'),
          [
            { text: t('common.cancel'), style: 'cancel' },
            {
              text: t('notifications.consentAccept'),
              onPress: async () => {
                await toggleReminders(true);
              },
            },
          ]
        );
        return;
      }
    }
    await toggleReminders(val);
  };

  const abreSuport = async () => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
    if (!EMAIL_SUPORT) {
      showBanner({
        title: t('alerts.titluri.contacteazaNe'),
        message: t('alerts.mesaje.suportNeconfigurat'),
        type: 'warning',
      });
      return;
    }
    await Linking.openURL(`mailto:${EMAIL_SUPORT}`);
  };

  // Deschide un document legal oficial (Termeni / Confidențialitate) în
  // browser extern. Dacă URL-ul nu e configurat sau e invalid, afișăm fallback.
  const openLegalUrl = async (tip: 'terms' | 'privacy') => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
    try {
      const { termsUrl, privacyUrl } = getLegalUrls();
      await Linking.openURL(tip === 'terms' ? termsUrl : privacyUrl);
    } catch {
      showBanner({
        title: 'Document indisponibil',
        message: tip === 'terms'
          ? 'Termenii și Condițiile nu sunt momentan disponibile.'
          : 'Politica de Confidențialitate nu este momentan disponibilă.',
        type: 'warning',
      });
    }
  };

  const deschideAbonamenteGooglePlay = async () => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
    try {
      await Linking.openURL('https://play.google.com/store/account/subscriptions');
    } catch {
      Alert.alert(t('common.error'), t('alerts.mesaje.conexiuneServerEsueaza'));
    }
  };

  if (checkingSession) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>{t('profile.loading')}</Text>
      </View>
    );
  }

  if (!session) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>{t('profile.notAuthenticated')}</Text>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            router.push('/auth' as never);
          }}
          accessibilityRole="button"
          accessibilityLabel={t('profile.signIn')}
          style={[styles.loginButton, { backgroundColor: colors.accent }]}
        >
          <Text style={[styles.loginButtonText, { color: colors.textOnAccent }]}>{t('profile.signIn')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const initials = session.user.email?.slice(0, 2).toUpperCase() || 'NU';

  return (
    <KeyboardAwareScreen style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.glowTop, { backgroundColor: colors.accent }]} />
      <View style={[styles.glowBottom, { backgroundColor: colors.accentSecondary }]} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.scroll, { paddingTop: scrollPaddingTop, paddingBottom: scrollPaddingBottom, width: '100%', maxWidth: 680, alignSelf: 'center', paddingHorizontal: horizontalPadding }]}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={initProfile} tintColor={colors.accent} colors={[colors.accent]} />
        }
      >

        {/* Avatar header */}
        <Animated.View entering={FadeInDown.duration(500)} style={styles.avatarSection}>
          <TouchableOpacity activeOpacity={0.85} onPress={alegePozaProfil} accessibilityRole="button" accessibilityLabel={t('profile.chooseProfilePhotoA11y')}>
            <LinearGradient colors={colors.accentGradient} style={[styles.avatarRing, { shadowColor: colors.accent }]}>
              <View style={[styles.avatarInner, { backgroundColor: colors.background, overflow: 'hidden' }]}>
                {avatarUrl ? (
                  <Image
                    source={{ uri: avatarUrl }}
                    style={{ width: '100%', height: '100%', borderRadius: 29 }}
                    // FIX UI: fara resizeMode imaginea era intinsa/deformata.
                    resizeMode="cover"
                    accessibilityLabel={t('profile.profilePhotoA11y')}
                  />
                ) : (
                  <Text style={[styles.avatarText, { color: colors.accent }]}>{initials}</Text>
                )}
              </View>
            </LinearGradient>
            <View style={[styles.cameraBadge, { backgroundColor: colors.accent, borderColor: colors.background }]}>
              <Camera size={14} color={colors.textOnAccent} />
            </View>
          </TouchableOpacity>
          <Text maxFontSizeMultiplier={1.3} style={[styles.displayName, { color: colors.textPrimary }]}>{nume || session.user.email?.split('@')[0]}</Text>
          <Text style={[styles.emailText, { color: colors.textSecondary }]}>{session.user.email}</Text>

          <View style={[styles.planBadge, { borderColor: colors.accent + '33' }]}>
            <LinearGradient colors={[colors.accent + '25', 'rgba(0,0,0,0)']} style={styles.planBadgeGrad}>
              <Zap size={14} color={colors.accent} />
              <Text style={[styles.planBadgeText, { color: colors.accent }]}>{t('profile.premiumTitle')}</Text>
            </LinearGradient>
          </View>
        </Animated.View>

        {/* Personal Details: Name / Display Name */}
        <Animated.View>
          <View style={styles.sectionHeaderRow}>
            <User size={16} color={colors.accent} />
            <Text maxFontSizeMultiplier={1.3} style={[styles.sectionLabel, { color: colors.textSecondary, marginBottom: 0 }]}>{t('profile.personal_details')}</Text>
          </View>
          <BlurView intensity={20} tint="dark" style={[styles.card, { borderColor: colors.cardBorder, marginBottom: 24, marginTop: 12 }]}>
            <LinearGradient colors={[colors.cardBg, 'rgba(0,0,0,0)']} style={styles.cardGrad}>
              <View style={styles.inputRow}>
                <View style={[styles.inputIcon, { backgroundColor: colors.accent + '1F' }]}>
                  <Pencil size={18} color={colors.accent} />
                </View>
                <View style={styles.inputContent}>
                  <Text style={[styles.inputLabel, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.3}>{t('profile.displayNameLabel')}</Text>
                  <TextInput
                    style={[styles.inputField, { color: colors.textPrimary, fontSize: 18 }]}
                    value={nume}
                    onChangeText={setNume}
                    placeholder={t('profile.displayNamePlaceholder')}
                    placeholderTextColor={colors.textSecondary}
                    selectionColor={colors.accent}
                  />
                </View>
              </View>
            </LinearGradient>
          </BlurView>
        </Animated.View>

        <Animated.View testID="profile-preferences-section">
          <View style={styles.sectionHeaderRow}>
            <Palette size={16} color={colors.accent} />
            <Text maxFontSizeMultiplier={1.3} style={[styles.sectionLabel, { color: colors.textSecondary }]}>{t('profile.preferencesSection')}</Text>
          </View>
        </Animated.View>

        {/* Visual Theme Section */}
        <Animated.View>
          <View style={styles.sectionHeaderRow}>
            <Palette size={16} color={colors.accent} />
            <Text maxFontSizeMultiplier={1.3} style={[styles.sectionLabel, { color: colors.textSecondary }]}>{t('profile.themeSection')}</Text>
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
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  accessibilityLabel={t('profile.themeA11y', { name: themeDisplayNames[tName] })}
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

        {/* Language Selector Section */}
        <Animated.View>
          <View style={styles.sectionHeaderRow}>
            <Globe size={16} color={colors.accent} />
            <Text maxFontSizeMultiplier={1.3} style={[styles.sectionLabel, { color: colors.textSecondary }]}>
              {t('profile.languageSection')}
            </Text>
          </View>
          <TouchableOpacity
            testID="profile-language-trigger"
            style={[styles.inputRow, { marginBottom: 28, backgroundColor: colors.surfaceBg, borderColor: colors.cardBorder, borderWidth: 1, borderRadius: 16, padding: 14 }]}
            onPress={() => { setLanguageQuery(''); setLanguageModalVisible(true); }}
            accessibilityRole="button"
            accessibilityLabel={t('profile.languageTitle')}
          >
            <Text style={{ fontSize: 22 }}>{LANGUAGE_NAMES[(i18n.language || 'en').split('-')[0] as keyof typeof LANGUAGE_NAMES]?.flag || '🌐'}</Text>
            <Text style={[styles.inputLabel, { flex: 1, color: colors.textPrimary }]}>{LANGUAGE_NAMES[(i18n.language || 'en').split('-')[0] as keyof typeof LANGUAGE_NAMES]?.label || t('profile.languageTitle')}</Text>
            <ChevronRight size={18} color={colors.textSecondary} />
          </TouchableOpacity>

          <Modal visible={languageModalVisible} transparent animationType="slide" onRequestClose={() => setLanguageModalVisible(false)}>
            <View style={styles.modalBackdrop}>
              <View style={[styles.selectionSheet, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}>
                <View style={styles.modalTitleRow}><Text style={[styles.modalTitle, { color: colors.textPrimary }]}>{t('profile.languageTitle')}</Text><TouchableOpacity onPress={() => setLanguageModalVisible(false)} accessibilityLabel={t('common.close')}><Text style={{ color: colors.textSecondary, fontSize: 24 }}>×</Text></TouchableOpacity></View>
                <TextInput value={languageQuery} onChangeText={setLanguageQuery} placeholder={t('profile.searchLanguages')} placeholderTextColor={colors.textTertiary} style={[styles.modalSearch, { color: colors.textPrimary, borderColor: colors.cardBorder }]} autoCorrect={false} />
                <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8 }}>
                  {filteredLanguages.length === 0 ? <Text style={{ color: colors.textSecondary, paddingVertical: 16 }}>{t('profile.noLanguagesFound')}</Text> : filteredLanguages.map((langKey) => {
                    const selected = (i18n.language || 'en').startsWith(langKey);
                    return <TouchableOpacity key={langKey} style={[styles.languageOption, { borderColor: selected ? colors.accent : colors.cardBorder, backgroundColor: selected ? colors.accent + '18' : colors.surfaceBg }]} onPress={() => { void changeLanguage(langKey); setLanguageModalVisible(false); }}><Text style={{ fontSize: 22 }}>{LANGUAGE_NAMES[langKey].flag}</Text><Text style={{ color: colors.textPrimary, fontWeight: '700', flex: 1 }}>{LANGUAGE_NAMES[langKey].label}</Text>{selected && <CheckCircle2 size={18} color={colors.accent} />}</TouchableOpacity>;
                  })}
                </ScrollView>
              </View>
            </View>
          </Modal>
        </Animated.View>

        {/* Notifications section */}
        <Animated.View>
          <Text maxFontSizeMultiplier={1.3} style={[styles.sectionLabel, { color: colors.textSecondary }]}>{t('profile.notificationsSection')}</Text>
          <BlurView intensity={20} tint="dark" style={[styles.card, { borderColor: colors.cardBorder, marginBottom: 16, borderRadius: 22 }]}>
            <LinearGradient colors={[colors.cardBg, 'rgba(0,0,0,0)']} style={{ paddingVertical: 4 }}>
              <View style={[styles.inputRow, { alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, gap: 10 }]}>
                <View style={[styles.inputIcon, { backgroundColor: colors.accent + '1F', width: 36, height: 36, borderRadius: 12 }]}>
                  <Bell size={16} color={colors.accent} />
                </View>
                <View style={[styles.inputContent, { flex: 1 }]}>
                  <Text style={[styles.inputLabel, { color: colors.textPrimary, fontSize: 14, marginBottom: 2 }]}>{t('profile.notificationsTitle')}</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 11 }}>{t('profile.notificationsDesc')}</Text>
                </View>
                <Switch
                  testID="profile-notifications-toggle"
                  value={notificationsEnabled}
                  onValueChange={(val) => { schimbaRemindere(val); }}
                  trackColor={{ false: '#3f3f3f', true: colors.accent + '80' }}
                  thumbColor={notificationsEnabled ? colors.accent : '#f4f3f4'}
                  accessibilityLabel={t('profile.notificationsTitle')}
                />
              </View>
              <View testID="profile-meal-reminder-times" style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 14, paddingBottom: 10 }}>
                {DEFAULT_MEAL_REMINDERS.map((reminder) => (
                  <View
                    key={reminder.id}
                    testID={`profile-meal-reminder-${reminder.id}`}
                    style={{ flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 12, paddingHorizontal: 4, paddingVertical: 7, backgroundColor: colors.surfaceBg, borderWidth: 1, borderColor: colors.cardBorder }}
                  >
                    <Text numberOfLines={2} style={{ color: colors.textSecondary, fontSize: 10, textAlign: 'center' }}>
                      {t(MEAL_REMINDER_LABEL_KEYS[reminder.id])}
                    </Text>
                    <Text style={{ color: colors.textPrimary, fontSize: 12, fontWeight: '700', marginTop: 2 }}>
                      {`${String(reminder.hour).padStart(2, '0')}:${String(reminder.minute).padStart(2, '0')}`}
                    </Text>
                  </View>
                ))}
              </View>
              {isExpoGo && (
                <View style={{ paddingHorizontal: 14, paddingBottom: 8 }}>
                  <Text style={{ color: colors.textSecondary, fontSize: 11, fontStyle: 'italic' }}>
                    {t('notifications.expoGoNote')}
                  </Text>
                </View>
              )}
            </LinearGradient>
          </BlurView>
        </Animated.View>

        {/* Security / Biometric section */}
        {isSupported && (
          <Animated.View>
            <View style={styles.sectionHeaderRow}>
              <ShieldCheck size={16} color={colors.accent} />
              <Text maxFontSizeMultiplier={1.3} style={[styles.sectionLabel, { color: colors.textSecondary, marginBottom: 0 }]}>{t('profile.securitySection')}</Text>
            </View>
            <BlurView intensity={20} tint="dark" style={[styles.card, { borderColor: colors.cardBorder, marginBottom: 16, marginTop: 10, borderRadius: 22 }]}>
              <LinearGradient colors={[colors.cardBg, 'rgba(0,0,0,0)']} style={{ paddingVertical: 4 }}>
                <View testID="profile-biometric-row" style={[styles.inputRow, { alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, gap: 10 }]}>
                  <View style={[styles.inputIcon, { backgroundColor: colors.accent + '1F', width: 36, height: 36, borderRadius: 12 }]}>
                    <Lock size={16} color={colors.accent} />
                  </View>
                  <View style={[styles.inputContent, { flex: 1 }]}>
                    <Text style={[styles.inputLabel, { color: colors.textPrimary, fontSize: 14, marginBottom: 2 }]}>{t('profile.securityTitle', { type: biometricType })}</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 11 }}>{t('profile.securityDesc')}</Text>
                  </View>
                  <Switch
                    testID="profile-biometric-toggle"
                    value={isEnabled}
                    onValueChange={(val) => { toggleBiometric(val); }}
                    trackColor={{ false: colors.surfaceElevated, true: colors.accent }}
                    thumbColor={Platform.OS === 'ios' ? '#FFFFFF' : (isEnabled ? colors.background : '#f4f3f4')}
                    accessibilityLabel={t('profile.securityTitle', { type: biometricType })}
                  />
                </View>
              </LinearGradient>
            </BlurView>
          </Animated.View>
        )}

        {/* Apple HealthKit / Google Fit section */}
        <Animated.View>
          <View style={styles.sectionHeaderRow}>
            <Activity size={16} color={colors.accent} />
            <Text maxFontSizeMultiplier={1.3} style={[styles.sectionLabel, { color: colors.textSecondary, marginBottom: 0 }]}>{t('profile.fitnessSection')}</Text>
          </View>
          <BlurView intensity={20} tint="dark" style={[styles.card, { borderColor: colors.cardBorder, marginBottom: 20, marginTop: 12 }]}>
            <LinearGradient colors={[colors.cardBg, 'rgba(0,0,0,0)']} style={styles.cardGrad}>
              <View style={[styles.inputRow, { alignItems: 'center' }]}>
                <View style={[styles.inputIcon, { backgroundColor: colors.accent + '1F' }]}>
                  <Footprints size={18} color={colors.accent} />
                </View>
                <View style={[styles.inputContent, { flex: 1 }]}>
                  <Text style={[styles.inputLabel, { color: colors.textPrimary, fontSize: 16, marginBottom: 2 }]}>{t('profile.fitnessSyncTitle', { platform: platformName })}</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{t('profile.fitnessSyncDesc')}</Text>
                </View>
                <Switch
                  value={healthSyncEnabled}
                  onValueChange={(val) => {
                    toggleHealthSync(val);
                    if (val) AsyncStorage.removeItem('ascundeCardHealth');
                  }}
                  trackColor={{ false: colors.surfaceElevated, true: colors.accent }}
                  thumbColor={Platform.OS === 'ios' ? '#FFFFFF' : (healthSyncEnabled ? colors.background : '#f4f3f4')}
                  accessibilityLabel={t('profile.fitnessSyncTitle', { platform: platformName })}
                />
              </View>

              <View style={{ marginTop: 14, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)', paddingTop: 14, paddingHorizontal: 20, paddingBottom: 16 }}>
                <TouchableOpacity
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingHorizontal: 16,
                    paddingVertical: 14,
                    borderRadius: 18,
                    backgroundColor: colors.surfaceBg,
                    borderWidth: 1,
                    borderColor: colors.cardBorder,
                    gap: 12,
                  }}
                  onPress={() => watchSheetRef.current?.open()}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityLabel={t('profile.changeDeviceA11y')}
                  testID="watch_selector_trigger"
                >
                  {providerInfo?.icon ? (
                    <FlowIcon name={providerInfo.icon} size={24} color={colors.accent} />
                  ) : (
                    <Watch size={24} color={colors.accent} />
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      {t('profile.connectedDevice')}
                    </Text>
                    <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '800', marginTop: 2 }}>
                      {providerInfo?.name || t('profile.notConnected')}
                    </Text>
                  </View>
                  <ChevronRight size={18} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
            </LinearGradient>
          </BlurView>
        </Animated.View>

        {/* GetFlow Premium */}
        <Animated.View>
          <TouchableOpacity
            onPress={() => router.push('/paywall' as never)}
            activeOpacity={0.85}
            style={{
              backgroundColor: colors.accent + '12',
              borderColor: colors.gold + '44',
              borderWidth: 1,
              borderRadius: 18,
              padding: 16,
              marginBottom: 24,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 14,
            }}
            accessibilityRole="button"
            accessibilityLabel={t('profile.premiumA11y')}
          >
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: colors.gold + '22',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Crown size={22} color={colors.gold} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: '900', color: colors.textPrimary }}>
                {t('profile.premiumTitle')}
              </Text>
              <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
                {t('profile.premiumDesc')}
              </Text>
            </View>
            <ChevronRight size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        </Animated.View>

        {/* Flow Credits */}
        <Animated.View>
          <TouchableOpacity
            testID="profile-flow-credits-card"
            onPress={() => flowCredits.open()}
            activeOpacity={0.85}
            style={{
              backgroundColor: '#CCFF0012',
              borderColor: '#CCFF0044',
              borderWidth: 1,
              borderRadius: 18,
              padding: 16,
              marginBottom: 24,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 14,
            }}
            accessibilityRole="button"
            accessibilityLabel={t('profile.flowCreditsA11y')}
          >
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: 'rgba(204, 255, 0, 0.15)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Sparkles size={22} color="#CCFF00" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: '900', color: colors.textPrimary }}>
                {t('profile.flowCreditsTitle')}
              </Text>
              <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
                {flowCredits?.unlimited
                  ? t('flowCredits.premiumAccess')
                  : `${(typeof flowCredits?.balance === 'object' && flowCredits?.balance !== null ? flowCredits.balance.total : (typeof flowCredits?.balance === 'number' ? flowCredits.balance : 0)) ?? 0} ${t('flowCredits.available')}`}
              </Text>
            </View>
            <ChevronRight size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        </Animated.View>

        {/* Secțiune Insigne & Gamificare */}
        <Animated.View>
          <Text maxFontSizeMultiplier={1.3} style={[styles.sectionLabel, { color: colors.textSecondary }]}>
            {t('profile.badgesSection', { unlocked: insigne.length, total: INSIGNE_LIST.length })}
          </Text>

          <View
            onLayout={(event) => setAchievementGridWidth(event.nativeEvent.layout.width)}
            style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 }}
          >
            {INSIGNE_LIST.map((insign) => {
              const unlocked = insigne.includes(insign.id);
              const name = t(insign.numeI18n, { defaultValue: insign.nume });
              const requirement = t(insign.conditieI18n, { defaultValue: insign.conditie });
              return (
                <AchievementCard
                  key={insign.id}
                  id={insign.id}
                  name={name}
                  requirement={requirement}
                  unlocked={unlocked}
                  width={achievementCardWidth}
                />
              );
            })}
          </View>
          <TouchableOpacity
            testID="profile-view-all-achievements"
            style={[styles.secondaryAction, { borderColor: colors.cardBorder, marginBottom: 24 }]}
            onPress={() => setAchievementsModalVisible(true)}
            accessibilityRole="button"
          >
            <Text style={{ color: colors.accent, fontWeight: '800' }}>{t('profile.viewAllAchievements')}</Text>
            <ChevronRight size={18} color={colors.accent} />
          </TouchableOpacity>
          <Modal visible={achievementsModalVisible} transparent animationType="slide" onRequestClose={() => setAchievementsModalVisible(false)}>
            <View style={styles.modalBackdrop}><View style={[styles.selectionSheet, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}>
              <View style={styles.modalTitleRow}><Text style={[styles.modalTitle, { color: colors.textPrimary }]}>{t('profile.viewAllAchievements')}</Text><TouchableOpacity onPress={() => setAchievementsModalVisible(false)} accessibilityLabel={t('common.close')}><Text style={{ color: colors.textSecondary, fontSize: 24 }}>×</Text></TouchableOpacity></View>
              <ScrollView contentContainerStyle={{ gap: 10 }}>{sortedAchievements.map((insign) => <AchievementCard key={insign.id} id={insign.id} name={t(insign.numeI18n, { defaultValue: insign.nume })} requirement={t(insign.conditieI18n, { defaultValue: insign.conditie })} unlocked={insigne.includes(insign.id)} width="100%" />)}</ScrollView>
            </View></View>
          </Modal>
        </Animated.View>

        {/* Targets section */}
        <Animated.View>
          <Text maxFontSizeMultiplier={1.3} style={[styles.sectionLabel, { color: colors.textSecondary }]}>{t('profile.goalsSection')}</Text>

          <TouchableOpacity
            testID="profile-recalculate-goals"
            style={[styles.aiSetupBtn, { borderColor: colors.accent + '33' }]}
            onPress={() => router.push('/calculator-ai')}
            accessibilityRole="button"
            accessibilityLabel={t('profile.recalculateGoals')}
          >
            <LinearGradient colors={[colors.accent + '25', 'rgba(0,0,0,0)']} style={styles.aiSetupGrad}>
              <Sparkles size={22} color={colors.accent} />
              <View style={styles.aiSetupTextWrap}>
                <Text style={[styles.aiSetupTitle, { color: colors.textPrimary }]}>{t('profile.recalculateGoals')}</Text>
                <Text style={[styles.aiSetupSub, { color: colors.textTertiary }]}>{t('profile.recalculateGoalsDesc')}</Text>
              </View>
              <ChevronRight size={20} color={colors.textSecondary} />
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>

        {/* Save button */}
        <Animated.View entering={FadeInDown.duration(600).delay(200)}>
          <TouchableOpacity style={[styles.saveBtn, { shadowColor: colors.accent }]} onPress={salveaza} disabled={loading} accessibilityRole="button" accessibilityLabel={t('profile.save')}>
            <LinearGradient colors={colors.accentGradient} style={styles.saveBtnGrad}>
              {loading ? (
                <ActivityIndicator color={colors.background} />
              ) : (
                <>
                  <Save size={20} color={colors.background} strokeWidth={2.5} />
                  <Text maxFontSizeMultiplier={1.3} style={[styles.saveBtnText, { color: colors.background }]}>{t('profile.save')}</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>

        {/* Contact */}
        <Animated.View testID="profile-contact-section">
          <View style={styles.sectionHeaderRow}>
            <Mail size={16} color={colors.accent} />
            <Text maxFontSizeMultiplier={1.3} style={[styles.sectionLabel, { color: colors.textSecondary, marginBottom: 0 }]}>{t('profile.contactSection')}</Text>
          </View>
          <BlurView intensity={20} tint="dark" style={[styles.card, { borderColor: colors.cardBorder, marginBottom: 24, marginTop: 12 }]}>
            <LinearGradient colors={[colors.cardBg, 'rgba(0,0,0,0)']} style={styles.cardGrad}>
              <TouchableOpacity
                style={[styles.inputRow, { alignItems: 'center' }]}
                onPress={abreSuport}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={t('profile.contactUsA11y')}
              >
                <View style={[styles.inputIcon, { backgroundColor: colors.accent + '1F' }]}>
                  <Mail size={18} color={colors.accent} />
                </View>
                <View style={[styles.inputContent, { flex: 1 }]}>
                  <Text style={[styles.inputLabel, { color: colors.textPrimary, fontSize: 16, marginBottom: 2 }]}>{t('profile.contactUs')}</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                    {EMAIL_SUPORT ? t('profile.contactUsDescEmail', { email: EMAIL_SUPORT }) : t('profile.contactUsDescGeneric')}
                  </Text>
                </View>
                <ChevronRight size={18} color={colors.textSecondary} />
              </TouchableOpacity>
              <View style={styles.separator} />
              <TouchableOpacity
                style={[styles.inputRow, { alignItems: 'center' }]}
                onPress={() => setFeedbackVisible(true)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={t('profile.sendFeedbackA11y')}
              >
                <View style={[styles.inputIcon, { backgroundColor: colors.accent + '1F' }]}>
                  <Sparkles size={18} color={colors.accent} />
                </View>
                <View style={[styles.inputContent, { flex: 1 }]}>
                  <Text style={[styles.inputLabel, { color: colors.textPrimary, fontSize: 16, marginBottom: 2 }]}>{t('profile.sendFeedback')}</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{t('profile.sendFeedbackDesc')}</Text>
                </View>
                <ChevronRight size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            </LinearGradient>
          </BlurView>
        </Animated.View>

        {/* Data & Privacy */}
        <Animated.View testID="profile-data-privacy-section">
          <View style={styles.sectionHeaderRow}>
            <ShieldCheck size={16} color={colors.accent} />
            <Text maxFontSizeMultiplier={1.3} style={[styles.sectionLabel, { color: colors.textSecondary, marginBottom: 0 }]}>{t('profile.dataPrivacySection')}</Text>
          </View>
          <BlurView intensity={20} tint="dark" style={[styles.card, { borderColor: colors.cardBorder, marginBottom: 24 }]}>
            <LinearGradient colors={[colors.cardBg, 'rgba(0,0,0,0)']} style={styles.cardGrad}>
              {/* Gestionează / Anulează abonamentul în Google Play */}
              <TouchableOpacity
                style={[styles.inputRow, { alignItems: 'center' }]}
                onPress={deschideAbonamenteGooglePlay}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={t('profile.manageSubscriptionA11y')}
              >
                <View style={[styles.inputIcon, { backgroundColor: colors.accent + '1F' }]}>
                  <Crown size={18} color={colors.accent} />
                </View>
                <View style={[styles.inputContent, { flex: 1 }]}>
                  <Text style={[styles.inputLabel, { color: colors.textPrimary, fontSize: 16, marginBottom: 2 }]}>{t('profile.manageSubscription')}</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{t('profile.manageSubscriptionDesc')}</Text>
                </View>
                <ChevronRight size={18} color={colors.textSecondary} />
              </TouchableOpacity>

              <View style={styles.separator} />

              <TouchableOpacity
                style={[styles.inputRow, { alignItems: 'center' }]}
                onPress={() => router.push('/legal' as never)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={t('profile.termsAndPrivacyA11y')}
              >
                <View style={[styles.inputIcon, { backgroundColor: colors.accent + '1F' }]}>
                  <FileText size={18} color={colors.accent} />
                </View>
                <View style={[styles.inputContent, { flex: 1 }]}>
                  <Text style={[styles.inputLabel, { color: colors.textPrimary, fontSize: 16, marginBottom: 2 }]}>{t('profile.termsAndPrivacy')}</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{t('profile.termsAndPrivacyDesc')}</Text>
                </View>
                <ChevronRight size={18} color={colors.textSecondary} />
              </TouchableOpacity>

              <View style={styles.separator} />

              {/* Butoane directe către documentele legale oficiale (browser extern) */}
              <TouchableOpacity
                style={[styles.inputRow, { alignItems: 'center' }]}
                onPress={() => openLegalUrl('terms')}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={t('profile.termsA11y')}
              >
                <View style={[styles.inputIcon, { backgroundColor: colors.accent + '1F' }]}>
                  <FileText size={18} color={colors.accent} />
                </View>
                <View style={[styles.inputContent, { flex: 1 }]}>
                  <Text style={[styles.inputLabel, { color: colors.textPrimary, fontSize: 16, marginBottom: 2 }]}>{t('profile.termsTitle')}</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{t('profile.termsDesc')}</Text>
                </View>
                <ChevronRight size={18} color={colors.textSecondary} />
              </TouchableOpacity>

              <View style={styles.separator} />

              <TouchableOpacity
                style={[styles.inputRow, { alignItems: 'center' }]}
                onPress={() => openLegalUrl('privacy')}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={t('profile.privacyA11y')}
              >
                <View style={[styles.inputIcon, { backgroundColor: colors.accent + '1F' }]}>
                  <ShieldCheck size={18} color={colors.accent} />
                </View>
                <View style={[styles.inputContent, { flex: 1 }]}>
                  <Text style={[styles.inputLabel, { color: colors.textPrimary, fontSize: 16, marginBottom: 2 }]}>{t('profile.privacyTitle')}</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{t('profile.privacyDesc')}</Text>
                </View>
                <ChevronRight size={18} color={colors.textSecondary} />
              </TouchableOpacity>

              {privacyOptionsRequired && (
                <>
                  <View style={styles.separator} />
                  <TouchableOpacity
                    style={[styles.inputRow, { alignItems: 'center' }]}
                    onPress={() => {
                      void showPrivacyOptions();
                    }}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={t('profile.adsPrivacyA11y')}
                    testID="btn-ads-privacy-options"
                  >
                    <View style={[styles.inputIcon, { backgroundColor: colors.accent + '1F' }]}>
                      <ShieldCheck size={18} color={colors.accent} />
                    </View>
                    <View style={[styles.inputContent, { flex: 1 }]}>
                      <Text style={[styles.inputLabel, { color: colors.textPrimary, fontSize: 16, marginBottom: 2 }]}>
                        {t('profile.adsPrivacyTitle')}
                      </Text>
                      <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                        {t('profile.adsPrivacyDesc')}
                      </Text>
                    </View>
                    <ChevronRight size={18} color={colors.textSecondary} />
                  </TouchableOpacity>
                </>
              )}
            </LinearGradient>
          </BlurView>
          <View style={{ gap: 12, marginBottom: 24 }}>
            <TouchableOpacity
              testID="profile-export-data"
              style={[styles.logoutBtn, { borderColor: colors.accent + '55', backgroundColor: colors.accent + '0A' }]}
              onPress={exportaDateleMele}
              accessibilityRole="button"
              accessibilityLabel={t('profile.exportDataA11y')}
            >
              <Download size={18} color={colors.accent} />
              <Text style={[styles.logoutText, { color: colors.accent }]}>{t('profile.exportData')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="profile-delete-account"
              style={[styles.logoutBtn, { borderColor: colors.danger + '55', backgroundColor: 'transparent' }]}
              onPress={stergereContDefinitiva}
              accessibilityRole="button"
              accessibilityLabel={t('profile.deleteAccountA11y')}
            >
              <Text style={[styles.logoutText, { color: colors.danger, fontSize: 14 }]}>{t('profile.deleteAccount')}</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* Account */}
        <Animated.View style={{ marginBottom: 24 }}>
          <Text maxFontSizeMultiplier={1.3} style={[styles.sectionLabel, { color: colors.textSecondary }]}>{t('profile.accountSection')}</Text>
          <TouchableOpacity testID="profile-logout" style={[styles.logoutBtn, { borderColor: colors.danger + '33', backgroundColor: colors.danger + '0A' }]} onPress={deconectare} accessibilityRole="button" accessibilityLabel={t('profile.logoutA11y')}>
            <LogOut size={18} color={colors.danger} />
            <Text style={[styles.logoutText, { color: colors.danger }]}>{t('profile.logout')}</Text>
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>

      <FeedbackModal visible={feedbackVisible} onClose={() => setFeedbackVisible(false)} />
      <DeleteAccountModal
        visible={deleteAccountModalVisible}
        onClose={() => setDeleteAccountModalVisible(false)}
        onConfirmDelete={executaStergereaContului}
        loading={loading}
      />
      <ConfirmSheet
        visible={showLogoutConfirm}
        title={t('alerts.titluri.deconectare')}
        message={t('alerts.mesaje.confirmareDeconectare')}
        icon={<LogOut size={24} color={colors.warning} />}
        iconBg={`${colors.warning}18`}
        destructive
        loading={isLoggingOut}
        buttonLayout="horizontal"
        confirmLabel={t('alerts.butoane.deconecteaza')}
        cancelLabel={t('alerts.butoane.anuleaza')}
        onCancel={() => {
          if (!isLoggingOut) setShowLogoutConfirm(false);
        }}
        onConfirm={confirmDeconectare}
      />
      <WatchSelectorSheet ref={watchSheetRef} />

      {/* Success Animation Modal Overlay */}
      {showSuccessAnim && (
        <Animated.View entering={reduceMotion ? undefined : FadeInDown.duration(350).springify()} style={styles.successOverlay}>
          <BlurView intensity={85} tint="dark" style={[styles.successCard, { borderColor: colors.accent }]}>
            <LinearGradient colors={[colors.accent + '25', 'rgba(0,0,0,0.85)']} style={styles.successGrad}>
              <Animated.View entering={reduceMotion ? undefined : FadeInUp.duration(400).delay(100).springify()} style={[styles.successIconCircle, { backgroundColor: colors.accent }]}>
                <CheckCircle2 size={44} color={colors.textOnAccent} />
              </Animated.View>
              <Text maxFontSizeMultiplier={1.3} style={[styles.successTitle, { color: colors.textPrimary }]}>{t('profile.profileUpdatedTitle')}</Text>
              <Text style={[styles.successSub, { color: colors.textSecondary }]}>{t('profile.profileUpdatedDesc')}</Text>
            </LinearGradient>
          </BlurView>
        </Animated.View>
      )}
    </KeyboardAwareScreen>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.55)' },
  selectionSheet: { maxHeight: '82%', width: '100%', maxWidth: 540, alignSelf: 'center', borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, padding: 20, gap: 14 },
  modalTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { fontSize: 20, fontWeight: '800' },
  modalSearch: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11, fontSize: 16 },
  languageOption: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1 },
  secondaryAction: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 13, borderWidth: 1, borderRadius: 14 },
  container: { flex: 1 },
  glowTop: { position: 'absolute', top: -100, left: -80, width: 300, height: 300, borderRadius: 150, opacity: 0.04 },
  glowBottom: { position: 'absolute', bottom: 50, right: -80, width: 280, height: 280, borderRadius: 140, opacity: 0.05 },

  scroll: { paddingHorizontal: 20 },

  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, fontSize: 15, fontWeight: '500' },
  loginButton: { marginTop: 24, paddingHorizontal: 32, paddingVertical: 12, borderRadius: 999 },
  // loginButtonText: culoarea e setată inline (colors.textOnAccent) în render, pe accent.
  loginButtonText: { fontSize: 15, fontWeight: '900' },

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

  aiSetupBtn: { borderRadius: 18, overflow: 'hidden', borderWidth: 1, marginBottom: 20 },
  aiSetupGrad: { paddingVertical: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
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
  infoCardTitle: { fontSize: 15, fontWeight: '800', marginBottom: 8 },
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
