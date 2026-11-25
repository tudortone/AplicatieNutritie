
import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, Platform
} from 'react-native';
import KeyboardAwareScreen from '../components/ui/KeyboardAwareScreen';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabase';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import { Scan, ArrowRight, Mail, Lock, AlertCircle, CheckCircle2, Circle, Eye, EyeOff, Sparkles, ShieldCheck, FileText, RefreshCw } from 'lucide-react-native';
import Svg, { Path } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { PressableScale } from '../components/ui/PressableScale';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { useTheme } from '../context/ThemeContext';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';
import { useAppStore } from '../hooks/useAppStore';
import {
  incarcaDateOnboarding,
  calculeazaPlan,
  construiesteMetadataOnboarding,
  sincronizeazaOnboardingLaProfil,
  type PlanNutritional,
} from '../lib/onboarding';
import { OAUTH_REDIRECT_URI, oauthFlow } from '../lib/oauthFlow';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { openLegalDocumentWithFallback } from '../constants/legal';

// Contul de admin se logheaza cu username-ul „admin" (nu email). Supabase cere
// email la autentificare, deci identificatorul se mapeaza intern la adresa contului.
const ADMIN_USERNAME = 'admin';
const ADMIN_EMAIL = 'admin@nutriai.app';

const getFriendlyErrorMessage = (rawMsg: string, t?: (k: string) => string): string => {
  const m = rawMsg.toLowerCase();
  if (m.includes('invalid login credentials') || m.includes('invalid credentials')) {
    return t ? t('auth.errInvalidCredentials') : 'Email sau parolă incorectă. Verifică datele introduse.';
  }
  if (m.includes('email not confirmed')) {
    return t ? t('auth.errEmailNotConfirmed') : 'Adresa de email nu a fost confirmată încă. Verifică inbox-ul.';
  }
  if (m.includes('user already registered') || m.includes('already exists')) {
    return t ? t('auth.errUserAlreadyRegistered') : 'Există deja un cont înregistrat cu această adresă de email.';
  }
  if (m.includes('password should be at least')) {
    return t ? t('auth.errPasswordLength') : 'Parola trebuie să aibă minimum 8 caractere.';
  }
  if (m.includes('rate limit')) {
    return t ? t('auth.errRateLimit') : 'Prea multe încercări. Te rugăm să aștepți câteva minute.';
  }
  return t ? t('auth.errGeneral') : 'A apărut o problemă la autentificare.';
};

// Logo-urile brand OAuth nu există în lucide-react-native; SVG inline cu path-urile
// oficiale. Culorile Google „G" sunt identitatea vizuală a brandului (fixe); Apple
// folosește culoarea textului din temă pentru a rămâne vizibil pe fundal închis.
function GoogleLogo({ size = 20 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <Path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </Svg>
  );
}

function AppleLogo({ size = 20, color }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path fill={color} d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.53 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </Svg>
  );
}

export default function AuthScreen() {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const { t } = useTranslation();
  const { contentMaxWidth, topInset, bottomInset } = useResponsiveLayout();
  const router = useRouter();
  const setOnboardingDone = useAppStore((s) => s.setOnboardingDone);
  const setSkipOnboardingToAuth = useAppStore((s) => s.setSkipOnboardingToAuth);
  const [planCalculat, setPlanCalculat] = useState<PlanNutritional | null>(null);
  const [email, setEmail] = useState('');
  const [parola, setParola] = useState('');
  const [confirmParola, setConfirmParola] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingOAuth, setLoadingOAuth] = useState<'google' | 'apple' | null>(null);
  const submitInFlightRef = useRef(false);
  const oauthInFlightRef = useRef(false);
  const hasUserToggledModeRef = useRef(false);
  const emailInputRef = useRef<TextInput>(null);
  const passwordInputRef = useRef<TextInput>(null);
  const confirmPasswordInputRef = useRef<TextInput>(null);
  const [isSignUp, setIsSignUp] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<'email' | 'password' | 'confirm' | null>(null);
  const [existingAccountHint, setExistingAccountHint] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [confirmTouched, setConfirmTouched] = useState(false);
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  const [signUpSuccessEmail, setSignUpSuccessEmail] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resending, setResending] = useState(false);
  const [resendFeedback, setResendFeedback] = useState<string | null>(null);

  useEffect(() => {
    incarcaDateOnboarding().then((d) => {
      if (d) {
        const p = calculeazaPlan(d);
        if (p) {
          setPlanCalculat(p);
          if (!hasUserToggledModeRef.current) {
            setIsSignUp(true);
          }
        }
      }
    });
  }, []);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const intervalId = setInterval(() => {
      setResendCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(intervalId);
  }, [resendCooldown]);

  const onAccentColor = colors.textOnAccent ?? colors.background;
  const cardBg = colors.cardBg ?? colors.surfaceBg;
  const inputBg = colors.inputBg ?? colors.surfaceBg;
  const inputBorder = colors.inputBorder ?? colors.cardBorder;
  const overlayLight = colors.overlayLight ?? 'rgba(255,255,255,0.06)';
  const overlayStrong = colors.overlayStrong ?? colors.cardBorder;
  const dangerColor = colors.danger ?? '#FF5C5C';
  const dangerBg = colors.dangerBg ?? 'rgba(255,92,92,0.12)';
  const dangerBorder = colors.dangerBorder ?? 'rgba(255,92,92,0.35)';
  const successColor = colors.success ?? '#34D399';

  const isMinLength = parola.length >= 8;
  const hasUpperCase = /[A-Z]/.test(parola);
  const hasNumber = /[0-9]/.test(parola);
  const isPasswordValid = isMinLength && hasUpperCase && hasNumber;
  const passwordsMatch = parola.length > 0 && parola === confirmParola;
  const showPasswordValidation = passwordTouched || attemptedSubmit;
  const showConfirmFeedback = confirmParola.length > 0 || confirmTouched || attemptedSubmit;

  const getRuleColor = (passed: boolean) => {
    if (passed) return successColor;
    return showPasswordValidation ? dangerColor : colors.textSecondary;
  };

  const switchMode = (nextSignUp: boolean) => {
    hasUserToggledModeRef.current = true;
    setIsSignUp(nextSignUp);
    setAuthError(null);
    setErrorField(null);
    setExistingAccountHint(false);
    setAttemptedSubmit(false);
    setPasswordTouched(false);
    setConfirmTouched(false);
    setConfirmParola('');
    setShowConfirmPassword(false);
    setSignUpSuccessEmail(null);
    setResendFeedback(null);
  };

  const openLegal = (key: 'termsUrl' | 'privacyUrl') => {
    try { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    const docType = key === 'termsUrl' ? 'terms' : 'privacy';
    void openLegalDocumentWithFallback(
      docType,
      (route) => router.push(route as never),
      {
        title: t('authLegal.unavailableTitle'),
        message: t('authLegal.unavailableMessage'),
      },
    );
  };

  const isValidEmail = (str: string) => /\S+@\S+\.\S+/.test(str.trim());

  const submit = async () => {
    if (submitInFlightRef.current || oauthInFlightRef.current || loading || loadingOAuth !== null) return;
    setAuthError(null);
    setErrorField(null);
    setExistingAccountHint(false);
    setAttemptedSubmit(true);

    const identificator = email.trim();
    const esteAdminLogin = !isSignUp && identificator.toLowerCase() === ADMIN_USERNAME;
    if (!identificator || !parola || (isSignUp && !confirmParola)) {
      if (!identificator) setErrorField('email');
      else if (!parola) setErrorField('password');
      else setErrorField('confirm');
      setAuthError(t('authValidation.requiredFields'));
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch {}
      return;
    }
    if (!isValidEmail(identificator) && !esteAdminLogin) {
      setErrorField('email');
      setAuthError(t('authValidation.invalidEmail'));
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch {}
      return;
    }
    if (isSignUp && !isPasswordValid) {
      setErrorField('password');
      setAuthError(t('authValidation.passwordRequirements'));
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch {}
      return;
    }
    if (isSignUp && !passwordsMatch) {
      setErrorField('confirm');
      setAuthError(t('authValidation.passwordMismatch'));
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch {}
      return;
    }

    submitInFlightRef.current = true;
    setLoading(true);
    try {
      if (isSignUp) {
        // Datele din setup-ul de dinainte de cont (onboarding) ajung în metadata contului,
        // ca profilul să fie deja completat la prima autentificare.
        const onboardingDate = await incarcaDateOnboarding();
        const setupData: Record<string, unknown> = construiesteMetadataOnboarding(onboardingDate);
        if (Object.keys(setupData).length === 0) {
          const setupKeys = ['greutate', 'caloriiTinta', 'sex', 'varsta', 'inaltime', 'nivel_activitate', 'obiectiv'];
          const setupRaw = await AsyncStorage.multiGet(setupKeys);
          for (const [key, value] of setupRaw) {
            if (!value) continue;
            if (key === 'greutate') setupData[key] = parseFloat(value) || undefined;
            else if (key === 'caloriiTinta' || key === 'varsta' || key === 'inaltime') setupData[key] = parseInt(value, 10) || undefined;
            else setupData[key] = value;
            if (setupData[key] === undefined) delete setupData[key];
          }
        }
        const { data: signUpData, error } = await supabase.auth.signUp({
          email: identificator,
          password: parola,
          options: { data: setupData, emailRedirectTo: OAUTH_REDIRECT_URI },
        });
        if (error) {
          const msg = getFriendlyErrorMessage(error.message, t);
          const lower = error.message.toLowerCase();
          if (lower.includes('already registered') || lower.includes('already exists')) {
            setErrorField('email');
            setExistingAccountHint(true);
          }
          setAuthError(msg);
          try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch {}
        } else if (signUpData?.session?.user?.id) {
          await sincronizeazaOnboardingLaProfil(signUpData.session.user.id, supabase);
          try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
        } else if (Array.isArray(signUpData?.user?.identities) && signUpData.user.identities.length === 0) {
          // Supabase anti-enumeration: returnează user fără identities pentru adrese deja înregistrate.
          setErrorField('email');
          setExistingAccountHint(true);
          setAuthError(t('auth.errUserAlreadyRegistered'));
          try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch {}
        } else {
          try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
          setParola('');
          setConfirmParola('');
          setAttemptedSubmit(false);
          setPasswordTouched(false);
          setConfirmTouched(false);
          setResendFeedback(null);
          setSignUpSuccessEmail(identificator);
          setResendCooldown(60);
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: esteAdminLogin ? ADMIN_EMAIL : identificator, password: parola });
        if (error) {
          const msg = getFriendlyErrorMessage(error.message, t);
          setErrorField('password');
          setAuthError(msg);
          try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch {}
        }
      }
    } catch (e: any) {
      const msg = getFriendlyErrorMessage(e?.message || t('auth.errConnection'), t);
      setAuthError(msg);
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch {}
    } finally {
      submitInFlightRef.current = false;
      setLoading(false);
    }
  };

  const handleResendConfirmation = async () => {
    if (!signUpSuccessEmail || resending || resendCooldown > 0) return;
    setResending(true);
    setResendFeedback(null);
    setAuthError(null);
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: signUpSuccessEmail,
        options: { emailRedirectTo: OAUTH_REDIRECT_URI },
      });
      if (error) {
        setAuthError(getFriendlyErrorMessage(error.message, t));
        try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch {}
        return;
      }
      setResendFeedback(t('auth.signUpResendSuccess'));
      setResendCooldown(60);
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
    } catch (e: any) {
      setAuthError(getFriendlyErrorMessage(e?.message || t('auth.errConnection'), t));
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch {}
    } finally {
      setResending(false);
    }
  };

  const goToForgotPassword = () => {
    const clean = email.trim();
    const prefill = clean && clean.toLowerCase() !== ADMIN_USERNAME ? clean : undefined;
    router.push(
      (prefill
        ? { pathname: '/auth/forgot-password', params: { email: prefill } }
        : '/auth/forgot-password') as never,
    );
  };

  const signInWithOAuth = async (provider: 'google' | 'apple') => {
    if (oauthInFlightRef.current || submitInFlightRef.current || loading || loadingOAuth !== null) return;
    if (process.env.EXPO_PUBLIC_APP_ENV === 'qa') {
      setAuthError(t('auth.qaOAuthUnavailable', 'Google and Apple sign-in are unavailable in isolated QA. Use the synthetic email account.'));
      return;
    }
    if (Platform.OS === 'android' && provider === 'apple') {
      return;
    }
    oauthInFlightRef.current = true;
    setAuthError(null);
    setLoadingOAuth(provider);
    try {
      const rezultat = await oauthFlow.signIn(provider);
      if (rezultat === 'cancelled') {
        setAuthError(t('oauth.cancelled'));
        return;
      }
      // Sesiunea a fost schimbată și verificată de autoritatea PKCE comună.
      // Gate-ul central decide apoi tabs vs onboarding.
      router.replace('/auth/complete');
    } catch {
      Alert.alert(t('alerts.titluri.eroareOAuth'), t('alerts.mesaje.problemaConexiuneOAuth'));
    } finally {
      oauthInFlightRef.current = false;
      setLoadingOAuth(null);
    }
  };

  return (
    <KeyboardAwareScreen style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Background glows */}
      <View style={[styles.glowTop, { backgroundColor: colors.accent }]} />
      <View style={[styles.glowBottom, { backgroundColor: colors.accentSecondary ?? colors.accent }]} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Math.max((topInset ?? 0) + 12, 20),
            paddingBottom: Math.max((bottomInset ?? 0) + 24, 44),
          },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Logo */}
        <Animated.View entering={reduceMotion ? undefined : ZoomIn.duration(700).springify()} style={[styles.logoWrap, { shadowColor: colors.accent }]}>
          <LinearGradient colors={colors.accentGradient} style={styles.logoGrad}>
            <Scan size={36} color={onAccentColor} strokeWidth={2.5} />
          </LinearGradient>
        </Animated.View>

        {/* Calculated Plan Banner */}
        {planCalculat ? (
          <Animated.View style={[styles.planCard, { maxWidth: contentMaxWidth }]}>
            <LinearGradient colors={colors.accentGradient} style={styles.planGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
              <View style={styles.planHeaderRow}>
                <Sparkles size={18} color={onAccentColor} />
                <Text style={[styles.planBadgeText, { color: onAccentColor }]} maxFontSizeMultiplier={1.3}>{t('auth.planBadge')}</Text>
              </View>
              <Text style={[styles.planKcalText, { color: onAccentColor }]} maxFontSizeMultiplier={1.3}>{planCalculat.calorii} {t('auth.kcalPerDay')}</Text>
              <View style={styles.planMacroRow}>
                <View style={[styles.planMacroPill, { backgroundColor: 'rgba(0,0,0,0.15)' }]}>
                  <Text style={[styles.planMacroText, { color: onAccentColor }]} maxFontSizeMultiplier={1.3}>{planCalculat.proteineG}g {t('nutrition.protein')}</Text>
                </View>
                <View style={[styles.planMacroPill, { backgroundColor: 'rgba(0,0,0,0.15)' }]}>
                  <Text style={[styles.planMacroText, { color: onAccentColor }]} maxFontSizeMultiplier={1.3}>{planCalculat.carbohidratiG}g {t('nutrition.carbs')}</Text>
                </View>
                <View style={[styles.planMacroPill, { backgroundColor: 'rgba(0,0,0,0.15)' }]}>
                  <Text style={[styles.planMacroText, { color: onAccentColor }]} maxFontSizeMultiplier={1.3}>{planCalculat.grasimiG}g {t('nutrition.fats')}</Text>
                </View>
              </View>
              <Text style={[styles.planSubtext, { color: onAccentColor }]} maxFontSizeMultiplier={1.3}>
                {t('auth.planActivateCta')}
              </Text>
              <TouchableOpacity
                style={styles.planRecalculateChip}
                onPress={() => {
                  setSkipOnboardingToAuth?.(false);
                  setOnboardingDone(false);
                  router.replace('/onboarding');
                }}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={t('auth.recalculatePlanA11y')}
              >
                <Text style={[styles.planRecalculateText, { color: onAccentColor }]} maxFontSizeMultiplier={1.3}>
                  {t('auth.recalculatePlanCta')}
                </Text>
              </TouchableOpacity>
            </LinearGradient>
          </Animated.View>
        ) : (
          <Animated.View style={{ width: '100%', maxWidth: contentMaxWidth, marginBottom: 16 }}>
            <TouchableOpacity
              style={[styles.noPlanCard, { borderColor: colors.accent + '44', backgroundColor: cardBg }]}
              onPress={() => {
                setSkipOnboardingToAuth?.(false);
                setOnboardingDone(false);
                router.replace('/onboarding');
              }}
              activeOpacity={0.8}
            >
              <Sparkles size={20} color={colors.accent} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.noPlanTitle, { color: colors.textPrimary }]} maxFontSizeMultiplier={1.3}>{t('auth.calculateFirstTitle')}</Text>
                <Text style={[styles.noPlanSub, { color: colors.accent }]} maxFontSizeMultiplier={1.3}>{t('auth.calculateFirstCta')}</Text>
              </View>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* Form card */}
        <Animated.View
          entering={reduceMotion ? undefined : FadeInDown.duration(700).delay(250).springify()}
          style={[styles.formCard, { backgroundColor: cardBg, borderColor: colors.cardBorder, maxWidth: contentMaxWidth }]}
        >
          {signUpSuccessEmail ? (
            <View testID="auth-signup-success-card" style={styles.successCard}>
              <View style={[styles.successIconWrap, { backgroundColor: overlayLight, borderColor: colors.cardBorder }]}>
                <CheckCircle2 size={32} color={successColor} />
              </View>
              <Text style={[styles.formTitle, styles.centeredText, { color: colors.textPrimary, marginBottom: 8 }]} maxFontSizeMultiplier={1.3}>
                {t('auth.signUpSuccessTitle')}
              </Text>
              <Text style={[styles.successSubtitle, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.3}>
                {t('auth.signUpSuccessSubtitle', { email: signUpSuccessEmail })}
              </Text>

              {authError ? (
                <View style={[styles.errorBanner, { backgroundColor: dangerBg, borderColor: dangerBorder, width: '100%', marginTop: 12 }]}>
                  <AlertCircle size={18} color={dangerColor} style={{ marginRight: 8 }} />
                  <Text style={[styles.errorText, { color: dangerColor }]} maxFontSizeMultiplier={1.3}>{authError}</Text>
                </View>
              ) : null}

              {resendFeedback ? (
                <View style={[styles.successBanner, { backgroundColor: overlayLight, borderColor: successColor }]}>
                  <CheckCircle2 size={16} color={successColor} style={{ marginRight: 8 }} />
                  <Text style={[styles.errorText, { color: successColor }]} maxFontSizeMultiplier={1.3}>{resendFeedback}</Text>
                </View>
              ) : null}

              <PressableScale
                testID="auth-signup-goto-signin"
                style={[styles.submitBtn, { shadowColor: colors.accent, width: '100%', marginTop: 16 }]}
                onPress={() => {
                  const createdEmail = signUpSuccessEmail;
                  switchMode(false);
                  if (createdEmail) setEmail(createdEmail);
                }}
                accessibilityLabel={t('auth.signUpGoToSignIn')}
              >
                <LinearGradient colors={colors.accentGradient} style={styles.submitGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                  <Text
                    style={[styles.submitText, { color: onAccentColor }]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.78}
                    maxFontSizeMultiplier={1.3}
                  >
                    {t('auth.signUpGoToSignIn')}
                  </Text>
                  <ArrowRight size={20} color={onAccentColor} strokeWidth={2.5} />
                </LinearGradient>
              </PressableScale>

              <TouchableOpacity
                testID="auth-signup-resend-btn"
                style={[
                  styles.secondaryActionBtn,
                  { backgroundColor: colors.surfaceBg, borderColor: colors.cardBorder },
                  (resending || resendCooldown > 0) ? { opacity: 0.6 } : null,
                ]}
                onPress={handleResendConfirmation}
                disabled={resending || resendCooldown > 0}
                accessibilityRole="button"
                accessibilityLabel={
                  resendCooldown > 0
                    ? t('auth.signUpResendCooldown', { seconds: resendCooldown })
                    : t('auth.signUpResendCta')
                }
              >
                {resending ? (
                  <ActivityIndicator color={colors.accent} size="small" />
                ) : (
                  <View style={styles.secondaryActionInner}>
                    <RefreshCw size={16} color={colors.accent} />
                    <Text style={[styles.secondaryActionText, { color: colors.textPrimary }]} maxFontSizeMultiplier={1.3}>
                      {resendCooldown > 0
                        ? t('auth.signUpResendCooldown', { seconds: resendCooldown })
                        : t('auth.signUpResendCta')}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                testID="auth-signup-different-email-btn"
                style={styles.differentEmailBtn}
                onPress={() => {
                  switchMode(true);
                  setEmail('');
                }}
                accessibilityRole="button"
                accessibilityLabel={t('auth.signUpUseDifferentEmail')}
              >
                <Text style={[styles.differentEmailText, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.3}>
                  {t('auth.signUpUseDifferentEmail')}
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {/* Segmented mode selector */}
              <View
                testID="auth-mode-segmented"
                accessibilityRole="tablist"
                style={[styles.modeSegmentWrap, { backgroundColor: inputBg, borderColor: inputBorder }]}
              >
                <TouchableOpacity
                  testID="auth-mode-signup-tab"
                  accessibilityRole="tab"
                  accessibilityState={{ selected: isSignUp }}
                  onPress={() => switchMode(true)}
                  style={[
                    styles.modeSegmentBtn,
                    isSignUp ? { backgroundColor: colors.accent } : null,
                  ]}
                  activeOpacity={0.85}
                >
                  <Text
                    style={[
                      styles.modeSegmentText,
                      { color: isSignUp ? onAccentColor : colors.textSecondary },
                    ]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.8}
                    maxFontSizeMultiplier={1.3}
                  >
                    {t('auth.modeSignUp')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  testID="auth-mode-signin-tab"
                  accessibilityRole="tab"
                  accessibilityState={{ selected: !isSignUp }}
                  onPress={() => switchMode(false)}
                  style={[
                    styles.modeSegmentBtn,
                    !isSignUp ? { backgroundColor: colors.accent } : null,
                  ]}
                  activeOpacity={0.85}
                >
                  <Text
                    style={[
                      styles.modeSegmentText,
                      { color: !isSignUp ? onAccentColor : colors.textSecondary },
                    ]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.8}
                    maxFontSizeMultiplier={1.3}
                  >
                    {t('auth.modeSignIn')}
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={[styles.formTitle, { color: colors.textPrimary }]} maxFontSizeMultiplier={1.3}>
                {isSignUp ? t('auth.signUpTitle') : t('auth.signInTitle')}
              </Text>

              {/* Email */}
              <View style={[
                styles.inputWrap,
                { backgroundColor: inputBg, borderColor: errorField === 'email' ? dangerColor : inputBorder },
              ]}>
                <View style={styles.inputIconWrap}>
                  <Mail size={18} color={errorField === 'email' ? dangerColor : colors.textSecondary} />
                </View>
                <TextInput
                  ref={emailInputRef}
                  style={[styles.input, { color: colors.textPrimary }]}
                  accessibilityLabel={isSignUp ? t('auth.signUpEmailPlaceholder') : t('auth.emailPlaceholder')}
                  placeholder={isSignUp ? t('auth.signUpEmailPlaceholder') : t('auth.emailPlaceholder')}
                  placeholderTextColor={colors.textSecondary}
                  value={email}
                  onChangeText={(val) => {
                    setEmail(val);
                    if (authError) setAuthError(null);
                    if (errorField === 'email') setErrorField(null);
                    if (existingAccountHint) setExistingAccountHint(false);
                  }}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  // FIX UI: autocorectul transforma adresele de email, iar autofill-ul nu functiona.
                  autoCorrect={false}
                  autoComplete="email"
                  textContentType="emailAddress"
                  returnKeyType="next"
                  onSubmitEditing={() => passwordInputRef.current?.focus()}
                  selectionColor={colors.accent}
                />
              </View>

              {/* Password */}
              <View style={[
                styles.inputWrap,
                { backgroundColor: inputBg, borderColor: errorField === 'password' ? dangerColor : inputBorder },
              ]}>
                <View style={styles.inputIconWrap}>
                  <Lock size={18} color={errorField === 'password' ? dangerColor : colors.textSecondary} />
                </View>
                <TextInput
                  ref={passwordInputRef}
                  style={[styles.input, { color: colors.textPrimary }]}
                  accessibilityLabel={t('auth.passwordPlaceholder')}
                  placeholder={t('auth.passwordPlaceholder')}
                  placeholderTextColor={colors.textSecondary}
                  value={parola}
                  onChangeText={(val) => {
                    setParola(val);
                    if (!passwordTouched && val.length > 0) setPasswordTouched(true);
                    if (authError) setAuthError(null);
                    if (errorField === 'password' || errorField === 'confirm') setErrorField(null);
                  }}
                  onBlur={() => {
                    if (parola.length > 0) setPasswordTouched(true);
                  }}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete={isSignUp ? 'password-new' : 'password'}
                  textContentType={isSignUp ? 'newPassword' : 'password'}
                  returnKeyType={isSignUp ? 'next' : 'done'}
                  onSubmitEditing={() => (isSignUp ? confirmPasswordInputRef.current?.focus() : void submit())}
                  selectionColor={colors.accent}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  style={styles.eyeBtn}
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? t('auth.hidePasswordA11y') : t('auth.showPasswordA11y')}
                  accessibilityState={{ selected: showPassword }}
                >
                  {showPassword ? (
                    <EyeOff size={18} color={colors.textSecondary} />
                  ) : (
                    <Eye size={18} color={colors.textSecondary} />
                  )}
                </TouchableOpacity>
              </View>

              {/* Confirm Password (doar la înregistrare) */}
              {isSignUp && (
                <>
                  <View style={[
                    styles.inputWrap,
                    {
                      backgroundColor: inputBg,
                      borderColor: errorField === 'confirm' || (showConfirmFeedback && !passwordsMatch && confirmParola.length > 0)
                        ? dangerColor
                        : passwordsMatch
                          ? successColor
                          : inputBorder,
                    },
                  ]}>
                    <View style={styles.inputIconWrap}>
                      <Lock
                        size={18}
                        color={errorField === 'confirm' || (showConfirmFeedback && !passwordsMatch && confirmParola.length > 0)
                          ? dangerColor
                          : passwordsMatch
                            ? successColor
                            : colors.textSecondary}
                      />
                    </View>
                    <TextInput
                      ref={confirmPasswordInputRef}
                      testID="auth-confirm-password-input"
                      style={[styles.input, { color: colors.textPrimary }]}
                      accessibilityLabel={t('auth.confirmPasswordPlaceholder')}
                      placeholder={t('auth.confirmPasswordPlaceholder')}
                      placeholderTextColor={colors.textSecondary}
                      value={confirmParola}
                      onChangeText={(val) => {
                        setConfirmParola(val);
                        if (!confirmTouched && val.length > 0) setConfirmTouched(true);
                        if (authError) setAuthError(null);
                        if (errorField === 'confirm') setErrorField(null);
                      }}
                      onBlur={() => {
                        if (confirmParola.length > 0) setConfirmTouched(true);
                      }}
                      secureTextEntry={!showConfirmPassword}
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="password-new"
                      textContentType="newPassword"
                      returnKeyType="done"
                      onSubmitEditing={() => void submit()}
                      selectionColor={colors.accent}
                    />
                    <TouchableOpacity
                      onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                      style={styles.eyeBtn}
                      accessibilityRole="button"
                      accessibilityLabel={showConfirmPassword ? t('auth.hidePasswordA11y') : t('auth.showPasswordA11y')}
                      accessibilityState={{ selected: showConfirmPassword }}
                    >
                      {showConfirmPassword ? (
                        <EyeOff size={18} color={colors.textSecondary} />
                      ) : (
                        <Eye size={18} color={colors.textSecondary} />
                      )}
                    </TouchableOpacity>
                  </View>

                  {showConfirmFeedback && confirmParola.length > 0 ? (
                    <View style={styles.confirmFeedbackRow}>
                      {passwordsMatch ? (
                        <CheckCircle2 size={14} color={successColor} />
                      ) : (
                        <AlertCircle size={14} color={dangerColor} />
                      )}
                      <Text
                        style={[styles.confirmFeedbackText, { color: passwordsMatch ? successColor : dangerColor }]}
                        maxFontSizeMultiplier={1.3}
                      >
                        {passwordsMatch ? t('auth.passwordsMatch') : t('auth.passwordsMismatch')}
                      </Text>
                    </View>
                  ) : null}

                  {/* Password Requirements (neutru inițial, verde când e valid, roșu doar după interacțiune/submit) */}
                  <Animated.View style={[styles.passwordRulesBox, { backgroundColor: overlayLight, borderColor: overlayStrong }]}>
                    <Text style={[styles.passwordRulesHeader, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.3}>
                      {t('auth.passwordRequirementsHeader')}
                    </Text>
                    <View style={styles.ruleRow}>
                      {isMinLength ? (
                        <CheckCircle2 size={16} color={successColor} />
                      ) : (
                        <Circle size={16} color={getRuleColor(false)} />
                      )}
                      <Text style={[styles.ruleText, { color: getRuleColor(isMinLength) }]} maxFontSizeMultiplier={1.3}>
                        {t('auth.ruleMinLength')}
                      </Text>
                    </View>

                    <View style={styles.ruleRow}>
                      {hasUpperCase ? (
                        <CheckCircle2 size={16} color={successColor} />
                      ) : (
                        <Circle size={16} color={getRuleColor(false)} />
                      )}
                      <Text style={[styles.ruleText, { color: getRuleColor(hasUpperCase) }]} maxFontSizeMultiplier={1.3}>
                        {t('auth.ruleUpperCase')}
                      </Text>
                    </View>

                    <View style={styles.ruleRow}>
                      {hasNumber ? (
                        <CheckCircle2 size={16} color={successColor} />
                      ) : (
                        <Circle size={16} color={getRuleColor(false)} />
                      )}
                      <Text style={[styles.ruleText, { color: getRuleColor(hasNumber) }]} maxFontSizeMultiplier={1.3}>
                        {t('auth.ruleNumber')}
                      </Text>
                    </View>
                  </Animated.View>
                </>
              )}

              {/* Error Banner */}
              {authError && (
                <Animated.View style={[styles.errorBanner, { backgroundColor: dangerBg, borderColor: dangerBorder }]}>
                  <View style={styles.errorBannerRow}>
                    <AlertCircle size={18} color={dangerColor} style={{ marginRight: 8 }} />
                    <Text style={[styles.errorText, { color: dangerColor }]} maxFontSizeMultiplier={1.3}>{authError}</Text>
                  </View>
                  {existingAccountHint ? (
                    <TouchableOpacity
                      testID="auth-existing-account-signin-btn"
                      onPress={() => switchMode(false)}
                      style={[styles.existingAccountBtn, { borderColor: dangerBorder, backgroundColor: colors.surfaceBg }]}
                      accessibilityRole="button"
                      accessibilityLabel={t('auth.existingAccountCta')}
                    >
                      <Text style={[styles.existingAccountText, { color: colors.textPrimary }]} maxFontSizeMultiplier={1.3}>
                        {t('auth.existingAccountCta')}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </Animated.View>
              )}

              {!isSignUp && (
                <TouchableOpacity
                  style={styles.forgotBtn}
                  onPress={goToForgotPassword}
                  disabled={loading || Boolean(loadingOAuth)}
                  accessibilityRole="button"
                  accessibilityLabel={t('auth.forgotPasswordA11y')}
                >
                  <Text style={[styles.forgotText, { color: colors.accent }]} maxFontSizeMultiplier={1.3}>{t('auth.forgotPassword')}</Text>
                </TouchableOpacity>
              )}

              {/* Submit */}
              <PressableScale
                style={[
                  styles.submitBtn,
                  { shadowColor: colors.accent },
                  (isSignUp && (!isPasswordValid || !passwordsMatch)) ? { opacity: 0.65 } : {},
                ]}
                onPress={submit}
                disabled={loading || loadingOAuth !== null}
                accessibilityLabel={isSignUp ? t('auth.signUpButton') : t('auth.signInButton')}
                accessibilityState={{ disabled: loading || loadingOAuth !== null }}
              >
                <LinearGradient colors={colors.accentGradient} style={styles.submitGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                  {loading ? (
                    <ActivityIndicator color={onAccentColor} />
                  ) : (
                    <>
                      <Text
                        style={[styles.submitText, { color: onAccentColor }]}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.78}
                        maxFontSizeMultiplier={1.3}
                      >
                        {isSignUp ? t('auth.signUpButton') : t('auth.signInButton')}
                      </Text>
                      <ArrowRight size={20} color={onAccentColor} strokeWidth={2.5} />
                    </>
                  )}
                </LinearGradient>
              </PressableScale>

              {/* Toggle */}
              <TouchableOpacity
                style={styles.toggleBtn}
                onPress={() => switchMode(!isSignUp)}
                accessibilityRole="button"
                accessibilityLabel={isSignUp ? t('auth.alreadyHaveAccountA11y') : t('auth.dontHaveAccountA11y')}
              >
                <Text style={[styles.toggleText, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.3}>
                  {isSignUp ? t('auth.alreadyHaveAccount') : t('auth.dontHaveAccount')}{' '}
                  <Text style={[styles.toggleAccent, { color: colors.accent }]} maxFontSizeMultiplier={1.3}>{isSignUp ? t('auth.signInLink') : t('auth.signUpLink')}</Text>
                </Text>
              </TouchableOpacity>

              <View style={styles.dividerWrap}>
                <View style={[styles.dividerLine, { backgroundColor: overlayStrong }]} />
                <Text style={[styles.dividerText, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.3}>{t('auth.orDivider')}</Text>
                <View style={[styles.dividerLine, { backgroundColor: overlayStrong }]} />
              </View>

              <View style={styles.oauthWrap}>
                <TouchableOpacity
                  style={[styles.oauthBtn, { backgroundColor: colors.surfaceBg, borderColor: colors.cardBorder }]}
                  onPress={() => signInWithOAuth('google')}
                  disabled={loading || loadingOAuth !== null}
                  accessibilityRole="button"
                  accessibilityLabel={t('auth.continueWithGoogle') === 'auth.continueWithGoogle' ? 'Continuă cu Google' : t('auth.continueWithGoogle')}
                  accessibilityState={{ disabled: loading || loadingOAuth !== null }}
                >
                  {loadingOAuth === 'google' ? (
                    <ActivityIndicator color={colors.accent} />
                  ) : (
                    <View style={styles.oauthBtnContent}>
                      <GoogleLogo size={20} />
                      <Text style={[styles.oauthBtnText, { color: colors.textPrimary }]} maxFontSizeMultiplier={1.3}>Google</Text>
                    </View>
                  )}
                </TouchableOpacity>
                {Platform.OS !== 'android' ? (
                  <TouchableOpacity
                    style={[styles.oauthBtn, { backgroundColor: colors.surfaceBg, borderColor: colors.cardBorder }]}
                    onPress={() => signInWithOAuth('apple')}
                    disabled={loading || loadingOAuth !== null}
                    accessibilityRole="button"
                    accessibilityLabel={t('auth.continueWithApple') === 'auth.continueWithApple' ? 'Continuă cu Apple' : t('auth.continueWithApple')}
                    accessibilityState={{ disabled: loading || loadingOAuth !== null }}
                  >
                    {loadingOAuth === 'apple' ? (
                      <ActivityIndicator color={colors.accent} />
                    ) : (
                      <View style={styles.oauthBtnContent}>
                        <AppleLogo size={20} color={colors.textPrimary} />
                        <Text style={[styles.oauthBtnText, { color: colors.textPrimary }]} maxFontSizeMultiplier={1.3}>Apple</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                ) : null}
              </View>

              {/* OAuth Security Notice */}
              <View style={styles.oauthSecurityRow}>
                <ShieldCheck size={14} color={colors.accent} />
                <Text style={[styles.oauthSecurityText, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.3}>
                  {t('auth.secureOAuthNotice', 'Autentificarea Google/Apple este securizată criptografic prin infrastructura cloud Supabase a GetFlow.')}
                </Text>
              </View>

              {/* Legal Consent Notice */}
              <View
                style={[styles.legalConsentWrap, { borderTopColor: colors.cardBorder }]}
                testID="auth-legal-consent"
              >
                <View style={styles.legalHeaderRow}>
                  <ShieldCheck size={13} color={colors.accent} />
                  <Text
                    style={[styles.legalConsentText, { color: colors.textSecondary }]}
                    maxFontSizeMultiplier={1.3}
                  >
                    {t('authLegal.disclosure')}
                  </Text>
                </View>
                <View style={styles.legalLinksRow}>
                  <TouchableOpacity
                    onPress={() => openLegal('termsUrl')}
                    style={[
                      styles.legalChip,
                      { backgroundColor: colors.surfaceBg, borderColor: colors.cardBorder },
                    ]}
                    accessibilityRole="link"
                    accessibilityLabel={t('authLegal.termsA11y')}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    activeOpacity={0.7}
                  >
                    <FileText size={12} color={colors.accent} />
                    <Text
                      style={[styles.legalChipText, { color: colors.textPrimary }]}
                      maxFontSizeMultiplier={1.3}
                    >
                      {t('authLegal.terms')}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => openLegal('privacyUrl')}
                    style={[
                      styles.legalChip,
                      { backgroundColor: colors.surfaceBg, borderColor: colors.cardBorder },
                    ]}
                    accessibilityRole="link"
                    accessibilityLabel={t('authLegal.privacyA11y')}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    activeOpacity={0.7}
                  >
                    <ShieldCheck size={12} color={colors.accent} />
                    <Text
                      style={[styles.legalChipText, { color: colors.textPrimary }]}
                      maxFontSizeMultiplier={1.3}
                    >
                      {t('authLegal.privacy')}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </>
          )}
        </Animated.View>

      </ScrollView>
    </KeyboardAwareScreen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  glowTop: { position: 'absolute', top: -150, right: -100, width: 400, height: 400, borderRadius: 200, opacity: 0.06 },
  glowBottom: { position: 'absolute', bottom: -100, left: -80, width: 350, height: 350, borderRadius: 175, opacity: 0.07 },

  scroll: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 20, paddingBottom: 44 },

  logoWrap: { marginBottom: 20, shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.45, shadowRadius: 24, elevation: 16 },
  logoGrad: { width: 76, height: 76, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },

  formCard: { width: '100%', borderRadius: 24, borderWidth: 1, padding: 22 },
  formTitle: { fontSize: 20, fontWeight: '800', marginBottom: 18, letterSpacing: -0.3 },
  centeredText: { textAlign: 'center' },

  modeSegmentWrap: {
    flexDirection: 'row',
    borderRadius: 14,
    borderWidth: 1,
    padding: 4,
    gap: 4,
    marginBottom: 18,
  },
  modeSegmentBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  modeSegmentText: { fontSize: 14, fontWeight: '800' },

  inputWrap: { flexDirection: 'row', alignItems: 'center', borderRadius: 16, borderWidth: 1, marginBottom: 12, paddingLeft: 14, paddingRight: 4, minHeight: 54 },
  inputIconWrap: { marginRight: 10 },
  input: { flex: 1, paddingVertical: 14, fontSize: 16, fontWeight: '500' },
  eyeBtn: { minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' },

  confirmFeedbackRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: -4, marginBottom: 10, paddingHorizontal: 4 },
  confirmFeedbackText: { flex: 1, flexShrink: 1, fontSize: 12.5, fontWeight: '600' },

  submitBtn: { borderRadius: 16, overflow: 'hidden', marginTop: 6, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.35, shadowRadius: 18, elevation: 10 },
  submitGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', minHeight: 54, paddingVertical: 14, paddingHorizontal: 16, gap: 10 },
  submitText: { flexShrink: 1, textAlign: 'center', fontSize: 17, fontWeight: '900', letterSpacing: 0.2 },

  toggleBtn: { minHeight: 44, paddingVertical: 10, paddingHorizontal: 12, justifyContent: 'center', alignItems: 'center', marginTop: 8 },
  toggleText: { fontSize: 14.5, fontWeight: '500', textAlign: 'center' },
  toggleAccent: { fontWeight: '700' },
  forgotBtn: { alignSelf: 'flex-end', minHeight: 44, justifyContent: 'center', marginBottom: 10, paddingHorizontal: 4 },
  forgotText: { fontSize: 13, fontWeight: '700' },
  dividerWrap: { flexDirection: 'row', alignItems: 'center', marginVertical: 14, gap: 12 },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { fontSize: 13, fontWeight: '600' },
  oauthWrap: { flexDirection: 'row', gap: 12 },
  oauthBtn: { flex: 1, minHeight: 50, borderRadius: 16, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  oauthBtnText: { fontSize: 15, fontWeight: '700' },
  oauthBtnContent: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  oauthSecurityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    gap: 6,
    paddingHorizontal: 12,
  },
  oauthSecurityText: {
    flex: 1,
    flexShrink: 1,
    fontSize: 11.5,
    lineHeight: 16,
    textAlign: 'center',
    fontWeight: '500',
  },
  legalConsentWrap: {
    marginTop: 18,
    paddingTop: 14,
    borderTopWidth: 1,
    alignItems: 'center',
  },
  legalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 10,
    paddingHorizontal: 8,
  },
  legalConsentText: {
    flex: 1,
    flexShrink: 1,
    fontSize: 11.5,
    textAlign: 'center',
    lineHeight: 16,
    fontWeight: '500',
  },
  legalLinksRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  legalChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  legalChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  passwordRulesBox: { borderRadius: 14, padding: 12, marginBottom: 12, borderWidth: 1, gap: 7 },
  passwordRulesHeader: { fontSize: 12.5, fontWeight: '700', marginBottom: 2 },
  ruleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ruleText: { flex: 1, flexShrink: 1, fontSize: 13, fontWeight: '600' },
  errorBanner: { borderRadius: 14, borderWidth: 1, padding: 12, marginBottom: 12, gap: 10 },
  errorBannerRow: { flexDirection: 'row', alignItems: 'center' },
  errorText: { flex: 1, fontSize: 13, fontWeight: '600', lineHeight: 18 },
  existingAccountBtn: {
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  existingAccountText: { fontSize: 13, fontWeight: '700' },

  successCard: { alignItems: 'center', paddingVertical: 6 },
  successIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  successSubtitle: { fontSize: 14, lineHeight: 20, textAlign: 'center', paddingHorizontal: 4 },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    borderRadius: 12,
    borderWidth: 1,
    padding: 10,
    marginTop: 12,
  },
  secondaryActionBtn: {
    width: '100%',
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
    paddingHorizontal: 14,
  },
  secondaryActionInner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  secondaryActionText: { fontSize: 14, fontWeight: '700' },
  differentEmailBtn: { minHeight: 44, justifyContent: 'center', alignItems: 'center', marginTop: 8, paddingHorizontal: 12 },
  differentEmailText: { fontSize: 13, fontWeight: '600' },

  planCard: { width: '100%', borderRadius: 22, overflow: 'hidden', marginBottom: 16 },
  planGrad: { padding: 18, alignItems: 'center' },
  planHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  planBadgeText: { fontSize: 12.5, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
  planKcalText: { fontSize: 34, fontWeight: '900', letterSpacing: -1, marginVertical: 2 },
  planMacroRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginVertical: 8 },
  planMacroPill: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 12 },
  planMacroText: { fontSize: 12, fontWeight: '800' },
  planSubtext: { fontSize: 12, textAlign: 'center', opacity: 0.9, marginTop: 2 },
  planRecalculateChip: {
    marginTop: 10,
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.14)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  planRecalculateText: { fontSize: 12.5, fontWeight: '800' },

  noPlanCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 18, borderWidth: 1, minHeight: 56, padding: 14, gap: 12 },
  noPlanTitle: { fontSize: 14, fontWeight: '700' },
  noPlanSub: { fontSize: 13, fontWeight: '800', marginTop: 2 },
});
