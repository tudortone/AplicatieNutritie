
import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator
} from 'react-native';
import KeyboardAwareScreen from '../components/ui/KeyboardAwareScreen';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabase';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import * as WebBrowser from 'expo-web-browser';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import { Scan, ArrowRight, Mail, Lock, AlertCircle, CheckCircle2, Circle, Eye, EyeOff, Sparkles } from 'lucide-react-native';
import Svg, { Path } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { PressableScale } from '../components/ui/PressableScale';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { useTheme } from '../context/ThemeContext';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';
import { useAppStore } from '../hooks/useAppStore';
import { incarcaDateOnboarding, calculeazaPlan, type PlanNutritional } from '../lib/onboarding';
import { extrageCodDinUrl } from '../lib/oauth';

// Contul de admin se logheaza cu username-ul „admin" (nu email). Supabase cere
// email la autentificare, deci identificatorul se mapeaza intern la adresa contului.
const ADMIN_USERNAME = 'admin';
const ADMIN_EMAIL = 'admin@nutriai.app';

const getFriendlyErrorMessage = (rawMsg: string): string => {
  const m = rawMsg.toLowerCase();
  if (m.includes('invalid login credentials') || m.includes('invalid credentials')) {
    return 'Email sau parolă incorectă. Verifică datele introduse.';
  }
  if (m.includes('email not confirmed')) {
    return 'Adresa de email nu a fost confirmată încă. Verifică inbox-ul.';
  }
  if (m.includes('user already registered') || m.includes('already exists')) {
    return 'Există deja un cont înregistrat cu această adresă de email.';
  }
  if (m.includes('password should be at least')) {
    return 'Parola trebuie să aibă minimum 8 caractere.';
  }
  if (m.includes('rate limit')) {
    return 'Prea multe încercări. Te rugăm să aștepți câteva minute.';
  }
  return rawMsg || 'A apărut o problemă la autentificare.';
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
  const { t } = useTranslation();
  const { contentMaxWidth } = useResponsiveLayout();
  const router = useRouter();
  const { setOnboardingDone } = useAppStore();
  const [planCalculat, setPlanCalculat] = useState<PlanNutritional | null>(null);
  const [email, setEmail] = useState('');
  const [parola, setParola] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingOAuth, setLoadingOAuth] = useState<'google' | 'apple' | null>(null);
  const [isSignUp, setIsSignUp] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  React.useEffect(() => {
    incarcaDateOnboarding().then((d) => {
      if (d) {
        const p = calculeazaPlan(d);
        if (p) setPlanCalculat(p);
      }
    });
  }, []);

  const isMinLength = parola.length >= 8;
  const hasUpperCase = /[A-Z]/.test(parola);
  const hasNumber = /[0-9]/.test(parola);
  const isPasswordValid = isMinLength && hasUpperCase && hasNumber;

  const isValidEmail = (str: string) => /\S+@\S+\.\S+/.test(str.trim());

  const submit = async () => {
    setAuthError(null);
    const identificator = email.trim();
    const esteAdminLogin = !isSignUp && identificator.toLowerCase() === ADMIN_USERNAME;
    if (!identificator || !parola) {
      setAuthError(t('authValidation.requiredFields'));
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch {}
      return;
    }
    if (!isValidEmail(identificator) && !esteAdminLogin) {
      setAuthError(t('authValidation.invalidEmail'));
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch {}
      return;
    }
    if (isSignUp && !isPasswordValid) {
      setAuthError(t('authValidation.passwordRequirements'));
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch {}
      return;
    }

    setLoading(true);
    try {
      if (isSignUp) {
        // Datele din setup-ul de dinainte de cont (onboarding) ajung în metadata contului,
        // ca profilul să fie deja completat la prima autentificare.
        const setupKeys = ['greutate', 'caloriiTinta', 'sex', 'varsta', 'inaltime', 'nivel_activitate', 'obiectiv'];
        const setupRaw = await AsyncStorage.multiGet(setupKeys);
        const setupData: Record<string, unknown> = {};
        for (const [key, value] of setupRaw) {
          if (!value) continue;
          if (key === 'greutate') setupData[key] = parseFloat(value) || undefined;
          else if (key === 'caloriiTinta' || key === 'varsta' || key === 'inaltime') setupData[key] = parseInt(value, 10) || undefined;
          else setupData[key] = value;
          if (setupData[key] === undefined) delete setupData[key];
        }
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password: parola,
          options: { data: setupData },
        });
        if (error) {
          const msg = getFriendlyErrorMessage(error.message);
          setAuthError(msg);
          try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch {}
        } else {
          try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
          Alert.alert(t('alerts.titluri.contCreat'), t('alerts.mesaje.verificaEmailConfirmare'));
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: esteAdminLogin ? ADMIN_EMAIL : identificator, password: parola });
        if (error) {
          const msg = getFriendlyErrorMessage(error.message);
          setAuthError(msg);
          try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch {}
        }
      }
    } catch (e: any) {
      console.error("Auth submit error:", e);
      const msg = getFriendlyErrorMessage(e?.message || "Nu s-a putut realiza conexiunea la server.");
      setAuthError(msg);
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch {}
    } finally {
      setLoading(false);
    }
  };

  const resetParola = async () => {
    if (!email) {
      Alert.alert(t('alerts.titluri.emailNecesar'), t('alerts.mesaje.emailNecesarResetare'));
      return;
    }
    if (!isValidEmail(email)) {
      Alert.alert(t('alerts.titluri.emailInvalid'), t('alerts.mesaje.emailInvalidDetalii'));
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: 'nutriai://auth/callback',
      });
      if (error) {
        Alert.alert(t('alerts.titluri.eroare'), t('alerts.mesaje.eroareDinamica', { eroare: error.message }));
      } else {
        Alert.alert(t('alerts.titluri.emailTrimis'), t('alerts.mesaje.emailTrimisResetare'));
      }
    } catch (e: any) {
      console.error("Reset password error:", e);
      Alert.alert(t('alerts.titluri.eroareNeasteptata'), e?.message || t('alerts.mesaje.conexiuneServerEsueaza'));
    } finally {
      setLoading(false);
    }
  };

  const signInWithOAuth = async (provider: 'google' | 'apple') => {
    if (loadingOAuth) return;
    setAuthError(null);
    setLoadingOAuth(provider);
    try {
      // Pe React Native SDK-ul Supabase NU navigheaza singur: returneaza URL-ul
      // in `data.url`, pe care trebuie sa-l deschidem noi (expo-web-browser).
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: 'nutriai://auth/callback',
        },
      });
      if (error) {
        Alert.alert(t('alerts.titluri.eroareOAuth'), t('alerts.mesaje.eroareDinamica', { eroare: error.message }));
        return;
      }
      if (!data.url) {
        Alert.alert(t('alerts.titluri.eroareOAuth'), t('alerts.mesaje.problemaConexiuneOAuth'));
        return;
      }
      const rezultat = await WebBrowser.openAuthSessionAsync(data.url, 'nutriai://auth/callback');
      if (rezultat.type === 'success' && rezultat.url) {
        const cod = extrageCodDinUrl(rezultat.url);
        if (!cod) {
          Alert.alert(t('alerts.titluri.eroareOAuth'), t('alerts.mesaje.problemaConexiuneOAuth'));
          return;
        }
        const { error: eroareSchimb } = await supabase.auth.exchangeCodeForSession(cod);
        if (eroareSchimb) {
          // G1: pe Android callback.tsx poate fi declanșat în paralel cu acest
          // handler și poate schimba deja codul. Dacă sesiunea există, login-ul
          // chiar a reușit — nu arătăm o alertă falsă de „code already used".
          const { data: sesiuneExistenta } = await supabase.auth.getSession();
          if (sesiuneExistenta.session) {
            router.replace('/(tabs)');
            return;
          }
          Alert.alert(t('alerts.titluri.eroareOAuth'), t('alerts.mesaje.eroareDinamica', { eroare: eroareSchimb.message }));
        }
      }
      // rezultat.type 'cancel'/'dismiss' → utilizatorul a renuntat; fara eroare.
    } catch (e: any) {
      console.error("OAuth error:", e);
      Alert.alert(t('alerts.titluri.eroareOAuth'), e?.message || t('alerts.mesaje.problemaConexiuneOAuth'));
    } finally {
      setLoadingOAuth(null);
    }
  };

  return (
    <KeyboardAwareScreen style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Background glows */}
      <View style={[styles.glowTop, { backgroundColor: colors.accent }]} />
      <View style={[styles.glowBottom, { backgroundColor: colors.accentSecondary }]} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Logo */}
        <Animated.View entering={ZoomIn.duration(700).springify()} style={[styles.logoWrap, { shadowColor: colors.accent }]}>
          <LinearGradient colors={colors.accentGradient} style={styles.logoGrad}>
            <Scan size={42} color={colors.background} strokeWidth={2.5} />
          </LinearGradient>
        </Animated.View>

        {/* Calculated Plan Banner */}
        {planCalculat ? (
          <>
          <Animated.View style={[styles.planCard, { maxWidth: contentMaxWidth }]}>
            <LinearGradient colors={colors.accentGradient} style={styles.planGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
              <View style={styles.planHeaderRow}>
                <Sparkles size={20} color={colors.background} />
                <Text style={[styles.planBadgeText, { color: colors.background }]} maxFontSizeMultiplier={1.3}>Planul tău zilnic calculat AI</Text>
              </View>
              <Text style={[styles.planKcalText, { color: colors.background }]} maxFontSizeMultiplier={1.3}>{planCalculat.calorii} kcal/zi</Text>
              <View style={styles.planMacroRow}>
                <View style={[styles.planMacroPill, { backgroundColor: 'rgba(0,0,0,0.15)' }]}>
                  <Text style={[styles.planMacroText, { color: colors.background }]} maxFontSizeMultiplier={1.3}>{planCalculat.proteineG}g Proteine</Text>
                </View>
                <View style={[styles.planMacroPill, { backgroundColor: 'rgba(0,0,0,0.15)' }]}>
                  <Text style={[styles.planMacroText, { color: colors.background }]} maxFontSizeMultiplier={1.3}>{planCalculat.carbohidratiG}g Carbi</Text>
                </View>
                <View style={[styles.planMacroPill, { backgroundColor: 'rgba(0,0,0,0.15)' }]}>
                  <Text style={[styles.planMacroText, { color: colors.background }]} maxFontSizeMultiplier={1.3}>{planCalculat.grasimiG}g Grăsimi</Text>
                </View>
              </View>
              <Text style={[styles.planSubtext, { color: colors.background }]} maxFontSizeMultiplier={1.3}>
                Creează-ți contul sau conectează-te pentru a-ți activa planul în aplicație.
              </Text>
            </LinearGradient>
          </Animated.View>
          {/* Refă testele: chiar și cu un plan deja calculat, utilizatorul poate
              relua chestionarul de la început — aceeași acțiune ca la cardul fără
              plan (setOnboardingDone(false) + revenire la /onboarding). */}
          <Animated.View style={{ width: '100%', maxWidth: contentMaxWidth, marginBottom: 20, marginTop: 14 }}>
            <TouchableOpacity
              style={[styles.noPlanCard, { borderColor: colors.accent + '44', backgroundColor: colors.cardBg }]}
              onPress={() => {
                setOnboardingDone(false);
                router.replace('/onboarding');
              }}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Refă testele de calorié din chestionarul NutriAI"
            >
              <Sparkles size={20} color={colors.accent} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.noPlanTitle, { color: colors.textPrimary }]} maxFontSizeMultiplier={1.3}>Vrei să recalculezi planul?</Text>
                <Text style={[styles.noPlanSub, { color: colors.accent }]} maxFontSizeMultiplier={1.3}>Refă testele de calorié ➔</Text>
              </View>
            </TouchableOpacity>
          </Animated.View>
          </>
        ) : (
          <Animated.View style={{ width: '100%', maxWidth: contentMaxWidth, marginBottom: 20 }}>
            <TouchableOpacity
              style={[styles.noPlanCard, { borderColor: colors.accent + '44', backgroundColor: colors.cardBg }]}
              onPress={() => {
                setOnboardingDone(false);
                router.replace('/onboarding');
              }}
              activeOpacity={0.8}
            >
              <Sparkles size={20} color={colors.accent} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.noPlanTitle, { color: colors.textPrimary }]} maxFontSizeMultiplier={1.3}>Vrei să-ți calculezi planul mai întâi?</Text>
                <Text style={[styles.noPlanSub, { color: colors.accent }]} maxFontSizeMultiplier={1.3}>Parcurge chestionarul NutriAI ➔</Text>
              </View>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* Form card */}
        <Animated.View entering={FadeInDown.duration(700).delay(400).springify()} style={[styles.formCard, { borderColor: colors.cardBorder, maxWidth: contentMaxWidth }]}>
          <BlurView intensity={25} tint="dark" style={styles.formBlur}>
            <LinearGradient colors={[colors.cardBg, 'rgba(0,0,0,0)']} style={styles.formGrad}>

              <Text style={[styles.formTitle, { color: colors.textPrimary }]} maxFontSizeMultiplier={1.3}>{isSignUp ? 'Creare cont nou' : 'Bun venit înapoi'}</Text>

              {/* Email */}
              <View style={[styles.inputWrap, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}>
                <View style={styles.inputIconWrap}>
                  <Mail size={18} color={colors.textSecondary} />
                </View>
                <TextInput
                  style={[styles.input, { color: colors.textPrimary }]}
                  accessibilityLabel="Email sau utilizator"
                  placeholder="Email sau utilizator"
                  placeholderTextColor={colors.textSecondary}
                  value={email}
                  onChangeText={(t) => {
                    setEmail(t);
                    if (authError) setAuthError(null);
                  }}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  // FIX UI: autocorectul transforma adresele de email, iar autofill-ul nu functiona.
                  autoCorrect={false}
                  autoComplete="email"
                  textContentType="emailAddress"
                  returnKeyType="next"
                  selectionColor={colors.accent}
                />
              </View>

              {/* Password */}
              <View style={[styles.inputWrap, { backgroundColor: colors.inputBg, borderColor: authError ? colors.danger : colors.inputBorder }]}>
                <View style={styles.inputIconWrap}>
                  <Lock size={18} color={colors.textSecondary} />
                </View>
                <TextInput
                  style={[styles.input, { color: colors.textPrimary }]}
                  accessibilityLabel="Parolă"
                  placeholder="Parolă"
                  placeholderTextColor={colors.textSecondary}
                  value={parola}
                  onChangeText={(t) => {
                    setParola(t);
                    if (authError) setAuthError(null);
                  }}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="password"
                  textContentType="password"
                  returnKeyType="done"
                  selectionColor={colors.accent}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  style={{ padding: 14, marginRight: 2 }}
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? 'Ascunde parola' : 'Arată parola'}
                  accessibilityState={{ selected: showPassword }}
                >
                  {showPassword ? (
                    <EyeOff size={18} color={colors.textSecondary} />
                  ) : (
                    <Eye size={18} color={colors.textSecondary} />
                  )}
                </TouchableOpacity>
              </View>

              {/* Password Requirements (doar la înregistrare) */}
              {isSignUp && (
                <Animated.View style={[styles.passwordRulesBox, { backgroundColor: colors.overlayLight, borderColor: colors.overlayStrong }]}>
                  <Text style={[styles.passwordRulesHeader, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.3}>
                    Cerințe parolă:
                  </Text>
                  <View style={styles.ruleRow}>
                    {isMinLength ? (
                      <CheckCircle2 size={16} color={colors.success} />
                    ) : (
                      <Circle size={16} color={colors.danger} />
                    )}
                    <Text style={[styles.ruleText, { color: isMinLength ? colors.success : colors.danger }]} maxFontSizeMultiplier={1.3}>
                      Minim 8 caractere
                    </Text>
                  </View>

                  <View style={styles.ruleRow}>
                    {hasUpperCase ? (
                      <CheckCircle2 size={16} color={colors.success} />
                    ) : (
                      <Circle size={16} color={colors.danger} />
                    )}
                    <Text style={[styles.ruleText, { color: hasUpperCase ? colors.success : colors.danger }]} maxFontSizeMultiplier={1.3}>
                      O literă mare (A-Z)
                    </Text>
                  </View>

                  <View style={styles.ruleRow}>
                    {hasNumber ? (
                      <CheckCircle2 size={16} color={colors.success} />
                    ) : (
                      <Circle size={16} color={colors.danger} />
                    )}
                    <Text style={[styles.ruleText, { color: hasNumber ? colors.success : colors.danger }]} maxFontSizeMultiplier={1.3}>
                      O cifră (0-9)
                    </Text>
                  </View>
                </Animated.View>
              )}

              {/* Error Banner */}
              {authError && (
                <Animated.View style={[styles.errorBanner, { backgroundColor: colors.dangerBg, borderColor: colors.dangerBorder }]}>
                  <AlertCircle size={18} color={colors.danger} style={{ marginRight: 8 }} />
                  <Text style={[styles.errorText, { color: colors.danger }]} maxFontSizeMultiplier={1.3}>{authError}</Text>
                </Animated.View>
              )}

              {!isSignUp && (
                <TouchableOpacity
                  style={styles.forgotBtn}
                  onPress={resetParola}
                  accessibilityRole="button"
                  accessibilityLabel="Ai uitat parola? Recuperează parola"
                >
                  <Text style={[styles.forgotText, { color: colors.accent }]} maxFontSizeMultiplier={1.3}>Ai uitat parola?</Text>
                </TouchableOpacity>
              )}

              {/* Submit */}
              <PressableScale
                style={[
                  styles.submitBtn,
                  { shadowColor: colors.accent },
                  (isSignUp && !isPasswordValid) ? { opacity: 0.6 } : {}
                ]}
                onPress={submit}
                disabled={loading}
                accessibilityLabel={isSignUp ? 'Creează cont' : 'Conectare'}
                accessibilityState={{ disabled: loading }}
              >
                <LinearGradient colors={colors.accentGradient} style={styles.submitGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                  {loading ? (
                    <ActivityIndicator color={colors.background} />
                  ) : (
                    <>
                      <Text style={[styles.submitText, { color: colors.background }]} maxFontSizeMultiplier={1.3}>{isSignUp ? 'Creează cont' : 'Conectare'}</Text>
                      <ArrowRight size={20} color={colors.background} strokeWidth={2.5} />
                    </>
                  )}
                </LinearGradient>
              </PressableScale>

              {/* Toggle */}
              <TouchableOpacity
                style={styles.toggleBtn}
                onPress={() => {
                  setAuthError(null);
                  setIsSignUp(!isSignUp);
                }}
                accessibilityRole="button"
                accessibilityLabel={isSignUp ? 'Ai deja un cont? Conectează-te' : 'Nu ai cont? Înregistrează-te'}
              >
                <Text style={[styles.toggleText, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.3}>
                  {isSignUp ? 'Ai deja un cont? ' : 'Nu ai cont? '}
                  <Text style={[styles.toggleAccent, { color: colors.accent }]} maxFontSizeMultiplier={1.3}>{isSignUp ? 'Conectează-te' : 'Înregistrează-te'}</Text>
                </Text>
              </TouchableOpacity>

              <View style={styles.dividerWrap}>
                <View style={[styles.dividerLine, { backgroundColor: colors.overlayStrong }]} />
                <Text style={[styles.dividerText, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.3}>sau</Text>
                <View style={[styles.dividerLine, { backgroundColor: colors.overlayStrong }]} />
              </View>

              <View style={styles.oauthWrap}>
                <TouchableOpacity
                  style={[styles.oauthBtn, { backgroundColor: colors.surfaceBg, borderColor: colors.cardBorder }]}
                  onPress={() => signInWithOAuth('google')}
                  disabled={loadingOAuth !== null}
                  accessibilityRole="button"
                  accessibilityLabel="Continuă cu Google"
                  accessibilityState={{ disabled: loadingOAuth !== null }}
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
                <TouchableOpacity
                  style={[styles.oauthBtn, { backgroundColor: colors.surfaceBg, borderColor: colors.cardBorder }]}
                  onPress={() => signInWithOAuth('apple')}
                  disabled={loadingOAuth !== null}
                  accessibilityRole="button"
                  accessibilityLabel="Continuă cu Apple"
                  accessibilityState={{ disabled: loadingOAuth !== null }}
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
              </View>

            </LinearGradient>
          </BlurView>
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
  content: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 24, paddingBottom: 48 },

  logoWrap: { marginBottom: 28, shadowOffset: { width: 0, height: 16 }, shadowOpacity: 0.5, shadowRadius: 32, elevation: 20 },
  logoGrad: { width: 88, height: 88, borderRadius: 28, justifyContent: 'center', alignItems: 'center' },

  titleWrap: { alignItems: 'center', marginBottom: 44 },
  title: { fontSize: 48, fontWeight: '900', letterSpacing: -2, marginBottom: 8 },
  subtitle: { fontSize: 16, textAlign: 'center', fontWeight: '400', maxWidth: '80%', lineHeight: 24 },

  formCard: { width: '100%', borderRadius: 32, overflow: 'hidden', borderWidth: 1 },
  formBlur: { overflow: 'hidden' },
  formGrad: { padding: 28 },
  formTitle: { fontSize: 20, fontWeight: '800', marginBottom: 24, letterSpacing: -0.3 },

  inputWrap: { flexDirection: 'row', alignItems: 'center', borderRadius: 18, borderWidth: 1, marginBottom: 14, paddingHorizontal: 16 },
  inputIconWrap: { marginRight: 12 },
  input: { flex: 1, paddingVertical: 18, fontSize: 16, fontWeight: '500' },

  submitBtn: { borderRadius: 18, overflow: 'hidden', marginTop: 8, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 20, elevation: 12 },
  submitGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 20, gap: 10 },
  submitText: { fontSize: 18, fontWeight: '900', letterSpacing: 0.3 },

  toggleBtn: { padding: 16, alignItems: 'center', marginTop: 8 },
  toggleText: { fontSize: 15, fontWeight: '500' },
  toggleAccent: { fontWeight: '700' },
  forgotBtn: { alignSelf: 'flex-end', marginBottom: 14, paddingVertical: 8 },
  forgotText: { fontSize: 13, fontWeight: '700' },
  dividerWrap: { flexDirection: 'row', alignItems: 'center', marginVertical: 18, gap: 12 },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { fontSize: 13, fontWeight: '600' },
  oauthWrap: { flexDirection: 'row', gap: 12 },
  oauthBtn: { flex: 1, height: 50, borderRadius: 16, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  oauthBtnText: { fontSize: 15, fontWeight: '700' },
  oauthBtnContent: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  passwordRulesBox: { borderRadius: 14, padding: 14, marginBottom: 14, borderWidth: 1, gap: 8 },
  passwordRulesHeader: { fontSize: 13, fontWeight: '700', marginBottom: 2 },
  ruleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ruleText: { fontSize: 13, fontWeight: '600' },
  errorBanner: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, padding: 12, marginBottom: 14 },
  errorText: { flex: 1, fontSize: 13, fontWeight: '600', lineHeight: 18 },

  planCard: { width: '100%', borderRadius: 24, overflow: 'hidden', marginBottom: 20 },
  planGrad: { padding: 20, alignItems: 'center' },
  planHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  planBadgeText: { fontSize: 13, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
  planKcalText: { fontSize: 36, fontWeight: '900', letterSpacing: -1, marginVertical: 2 },
  planMacroRow: { flexDirection: 'row', gap: 8, marginVertical: 8 },
  planMacroPill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  planMacroText: { fontSize: 12, fontWeight: '800' },
  planSubtext: { fontSize: 12, textAlign: 'center', opacity: 0.9, marginTop: 4 },

  noPlanCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 20, borderWidth: 1, padding: 16, gap: 14 },
  noPlanTitle: { fontSize: 14, fontWeight: '700' },
  noPlanSub: { fontSize: 13, fontWeight: '800', marginTop: 2 },
});
